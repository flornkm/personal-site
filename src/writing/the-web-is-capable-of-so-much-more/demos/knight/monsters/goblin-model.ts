import { GeometryBuilder, type GeometryData } from "../engine/geometry";
import type { BoneDef } from "../engine/skeleton";
import { BONE_NAMES, type BoneName, type CharacterDims } from "../core/types";
import { aim, blendByHeight, capsule, ellipsoid, horn, norm, smoothLathe, type V3 } from "./shapes";

// A Bokoblin-style grunt (and, scaled up and fattened, the brute): big round head with long
// floppy ears, a pig snout with two little tusks, angry brows over round eyes, a pot belly,
// skinny limbs, a loincloth, and a wooden club. Rigidly skinned rounded parts that overlap at the
// joints, on the humanoid skeleton the shared animator drives, plus a bone per ear.

export interface GoblinLook {
  // Everything (joints, mesh, club) scales by this.
  scale: number;
  // Extra girth of the belly and torso.
  girth: number;
  skin: number;
  belly: number;
  snout: number;
  eye: number;
  pupil: number;
  brow: number;
  horn: number;
  horns: 1 | 2;
  cloth: number;
  belt: number;
  club: { length: number; head: number; wood: number; band: number; studs?: number };
}

export const EXTRA_BONES = ["earL", "earR"] as const;
type Bone = BoneName | (typeof EXTRA_BONES)[number];
const ALL_BONES: readonly Bone[] = [...BONE_NAMES, ...EXTRA_BONES];
const idx = (n: Bone) => ALL_BONES.indexOf(n);

// Unit-scale joints (metres for a 1.3 m grunt), bind pose: arms hanging, legs straight.
const SHOULDER: V3 = [0.2, 0.9, 0];
const HIP: V3 = [0.1, 0.53, 0];
const ARM = { upper: 0.22, fore: 0.2 };
const LEG = { thigh: 0.24, shin: 0.22 };
const side = (p: V3, s: number): V3 => [p[0] * s, p[1], p[2]];
const down = (p: V3, d: number): V3 => [p[0], p[1] - d, p[2]];
const EAR: V3 = [0.175, 1.14, -0.01];

const JOINT: Record<Bone, V3> = {
  root: [0, 0, 0],
  pelvis: [0, 0.56, 0],
  spine: [0, 0.66, 0],
  chest: [0, 0.8, 0],
  neck: [0, 0.92, 0.02],
  head: [0, 0.98, 0.03],
  upperArmL: side(SHOULDER, 1),
  foreArmL: down(side(SHOULDER, 1), ARM.upper),
  handL: down(side(SHOULDER, 1), ARM.upper + ARM.fore),
  upperArmR: side(SHOULDER, -1),
  foreArmR: down(side(SHOULDER, -1), ARM.upper),
  handR: down(side(SHOULDER, -1), ARM.upper + ARM.fore),
  thighL: side(HIP, 1),
  shinL: down(side(HIP, 1), LEG.thigh),
  footL: down(side(HIP, 1), LEG.thigh + LEG.shin),
  thighR: side(HIP, -1),
  shinR: down(side(HIP, -1), LEG.thigh),
  footR: down(side(HIP, -1), LEG.thigh + LEG.shin),
  accessory: [0, 1.4, 0.06],
  earL: side(EAR, 1),
  earR: side(EAR, -1),
};

const PARENT: Record<Bone, Bone | null> = {
  root: null,
  pelvis: "root",
  spine: "pelvis",
  chest: "spine",
  neck: "chest",
  head: "neck",
  upperArmL: "chest",
  foreArmL: "upperArmL",
  handL: "foreArmL",
  upperArmR: "chest",
  foreArmR: "upperArmR",
  handR: "foreArmR",
  thighL: "pelvis",
  shinL: "thighL",
  footL: "shinL",
  thighR: "pelvis",
  shinR: "thighR",
  footR: "shinR",
  accessory: "head",
  earL: "head",
  earR: "head",
};

export const GOBLIN_BONE = {
  earL: idx("earL"),
  earR: idx("earR"),
  head: idx("head"),
  handR: idx("handR"),
};

export function goblinBones(scale: number): BoneDef[] {
  return ALL_BONES.map((name) => {
    const parent = PARENT[name];
    const p = parent ? JOINT[parent] : [0, 0, 0];
    const j = JOINT[name];
    return {
      name,
      parent: parent ? idx(parent) : -1,
      offset: [(j[0] - p[0]) * scale, (j[1] - p[1]) * scale, (j[2] - p[2]) * scale],
    };
  });
}

export function goblinDims(scale: number, girth: number): CharacterDims {
  return {
    height: 1.3 * scale,
    hipHeight: JOINT.pelvis[1] * scale,
    hipWidth: (JOINT.thighL[0] - JOINT.thighR[0]) * scale,
    thighLength: LEG.thigh * scale,
    shinLength: LEG.shin * scale,
    ankleHeight: JOINT.footL[1] * scale,
    toeLength: 0.15 * scale,
    heelLength: 0.06 * scale,
    shoulderWidth: (JOINT.upperArmL[0] - JOINT.upperArmR[0]) * scale,
    upperArmLength: ARM.upper * scale,
    foreArmLength: ARM.fore * scale,
    radius: 0.26 * scale * girth,
  };
}

// Placeholder bone for the torso skin, blended by height after the build.
const TORSO = 40;

// A flattened ellipsoid sitting on a sphere (centre `c`, radius `r`) where `dir` points out of it.
function onSphere(
  b: GeometryBuilder,
  c: V3,
  r: number,
  dir: V3,
  rx: number,
  ry: number,
  h: number,
  lift = 0,
) {
  const d = norm(dir);
  const p: V3 = [c[0] + d[0] * (r + lift), c[1] + d[1] * (r + lift), c[2] + d[2] * (r + lift)];
  const { m } = aim(p, [p[0] + d[0], p[1] + d[1], p[2] + d[2]]);
  b.push().transform(m).scale(rx, h, ry).sphere(1, 12, 6).pop();
}

// A long leaf-shaped ear from `root` to `tip`, flat across its width, with a pink inside.
function ear(b: GeometryBuilder, root: V3, tip: V3, width: number, skin: number, inner: number) {
  const { m, length } = aim(root, tip);
  const prof: [number, number][] = [];
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // A leaf: rooted narrow-ish in the head, widest a third of the way out, a soft point.
    const r = width * Math.sin(Math.PI * (0.15 + 0.85 * t)) ** 0.7 * (1 - 0.3 * t);
    prof.push([i === n ? 0 : Math.max(0.006, r), t * length]);
  }
  // Flat front to back, wide top to bottom; the aim's local X runs front-back, its sign differs per
  // side, so the pink inside is pushed toward whichever way faces the front.
  const f = m[2] >= 0 ? 1 : -1;
  b.push().transform(m);
  b.push().scale(0.38, 1, 1).color(skin);
  smoothLathe(b, prof, 12);
  b.pop();
  b.push()
    .translate(f * width * 0.2, length * 0.06, 0)
    .scale(0.25, 0.85, 0.72)
    .color(inner);
  smoothLathe(b, prof, 10);
  b.pop();
  b.pop();
}

export function buildGoblin(look: GoblinLook): GeometryData {
  const b = new GeometryBuilder();
  const J = JOINT;
  const g = look.girth;
  const bone = (n: Bone) => b.bone(idx(n));

  // Torso: a pot-bellied barrel, then a paler belly bulging out of the front.
  b.bone(TORSO).color(look.skin);
  const torso: [number, number][] = [
    [0, 0.47],
    [0.12, 0.48],
    [0.17, 0.52],
    [0.195, 0.59],
    [0.2, 0.67],
    [0.19, 0.75],
    [0.172, 0.82],
    [0.14, 0.88],
    [0.09, 0.925],
    [0, 0.95],
  ];
  b.push()
    .translate(0, 0, 0.005)
    .scale(g, 1, 0.9 * g);
  smoothLathe(b, torso, 16);
  b.pop();
  b.color(look.belly);
  ellipsoid(b, [0, 0.665, 0.05 * g], 0.15 * g, 0.165, 0.15 * g, 16, 10);

  // Neck stub under the head.
  bone("neck").color(look.skin);
  capsule(b, [0, 0.88, 0.01], [0, 0.99, 0.03], 0.075, 0.07, 10, 2);

  // Head.
  bone("head").color(look.skin);
  const skull: V3 = [0, 1.13, 0];
  ellipsoid(b, skull, 0.2, 0.19, 0.185, 18, 12);
  ellipsoid(b, [0, 1.02, 0.07], 0.155, 0.1, 0.14, 16, 8);
  // Snout with nostrils, and tusks poking up from the jaw.
  b.color(look.snout);
  const snout: V3 = [0, 1.055, 0.2];
  ellipsoid(b, snout, 0.098, 0.074, 0.08, 14, 8);
  b.color(0x4a1c24);
  for (const s of [1, -1])
    onSphere(b, snout, 0.075, [s * 0.42, 0.15, 1], 0.017, 0.022, 0.012, -0.004);
  b.color(0xfff6e2, 0.4);
  for (const s of [1, -1])
    horn(b, [s * 0.09, 0.985, 0.17], [s * 0.112, 1.052, 0.21], [0, 0, 0.012], 0.019, 8, 3);
  // Round yellow eyes looking a touch inward, black pupils, a catch-light up and to the left.
  for (const s of [1, -1]) {
    const eye: V3 = [s * 0.088, 1.165, 0.142];
    b.color(look.eye, 0.5);
    ellipsoid(b, eye, 0.055, 0.058, 0.05, 14, 8);
    b.color(look.pupil, 0.8);
    onSphere(b, eye, 0.05, [-s * 0.18, 0.02, 1], 0.03, 0.036, 0.016, -0.006);
    b.color(0xffffff);
    onSphere(b, eye, 0.05, [-s * 0.18 + 0.28, 0.32, 1], 0.009, 0.01, 0.01, 0.006);
  }
  // Heavy brows slanting down to the middle: grumpy, readable from far off.
  b.color(look.brow);
  for (const s of [1, -1])
    capsule(b, [s * 0.035, 1.215, 0.178], [s * 0.15, 1.245, 0.12], 0.022, 0.018, 8, 2);
  // Horns.
  b.color(look.horn, 0.3);
  if (look.horns === 1) horn(b, [0, 1.29, 0.07], [0, 1.43, 0.13], [0, 0.01, 0.04], 0.042, 10, 5);
  else
    for (const s of [1, -1])
      horn(b, [s * 0.11, 1.27, 0.05], [s * 0.25, 1.4, 0.1], [s * 0.04, 0.05, -0.02], 0.04, 10, 5);

  // Ears on their own bones so they can flop.
  for (const s of [1, -1]) {
    bone(s > 0 ? "earL" : "earR");
    const r = side(EAR, s);
    ear(b, r, [s * 0.46, 1.13, -0.07], 0.095, look.skin, look.snout);
  }

  // Arms: shoulder ball, skinny upper arm, forearm thickening to the wrist, a round mitt.
  for (const s of [1, -1]) {
    const L = s > 0 ? "L" : "R";
    const sh = J[`upperArm${L}`],
      el = J[`foreArm${L}`],
      wr = J[`hand${L}`];
    b.color(look.skin);
    bone(`upperArm${L}`);
    ellipsoid(b, sh, 0.068, 0.068, 0.068, 12, 8);
    capsule(b, sh, el, 0.055, 0.045, 10, 3);
    bone(`foreArm${L}`);
    capsule(b, el, [wr[0], wr[1] + 0.02, wr[2]], 0.046, 0.052, 10, 3);
    bone(`hand${L}`);
    ellipsoid(b, [wr[0], wr[1] - 0.045, wr[2] + 0.012], 0.06, 0.068, 0.064, 12, 8);
    capsule(
      b,
      [wr[0] - s * 0.04, wr[1] - 0.02, wr[2] + 0.04],
      [wr[0] - s * 0.05, wr[1] - 0.06, wr[2] + 0.07],
      0.022,
      0.02,
      8,
      2,
    );
  }

  // Legs and big round feet.
  for (const s of [1, -1]) {
    const L = s > 0 ? "L" : "R";
    const hip = J[`thigh${L}`],
      knee = J[`shin${L}`],
      ankle = J[`foot${L}`];
    b.color(look.skin);
    bone(`thigh${L}`);
    capsule(b, hip, knee, 0.07, 0.056, 10, 3);
    bone(`shin${L}`);
    capsule(b, knee, ankle, 0.056, 0.05, 10, 3);
    bone(`foot${L}`);
    ellipsoid(b, [ankle[0], 0.05, 0.045], 0.072, 0.05, 0.115, 12, 8);
    b.color(0xfff6e2, 0.3);
    for (const k of [-1, 0, 1])
      ellipsoid(b, [ankle[0] + k * 0.035, 0.03, 0.15], 0.016, 0.016, 0.02, 8, 4);
  }

  // Loincloth: a wrap with a belt, and flaps front and back. The wrap tucks in under the hips like
  // shorts (a flared hem left a rigid ring hanging round the thighs as they bend).
  bone("pelvis").color(look.cloth);
  b.push().scale(g, 1, 0.92 * g);
  smoothLathe(
    b,
    [
      [0, 0.485],
      [0.13, 0.488],
      [0.182, 0.51],
      [0.205, 0.56],
      [0.205, 0.62],
      [0, 0.632],
    ],
    16,
  );
  b.color(look.belt);
  const belt: [number, number][] = [];
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    belt.push([0.2 + 0.022 * Math.cos(a), 0.6 + 0.022 * Math.sin(a)]);
  }
  smoothLathe(b, belt, 16);
  b.pop();
  b.color(look.cloth);
  for (const z of [1, -1]) {
    b.push()
      .translate(0, 0.46, z * 0.175 * g)
      .rotateX(z * 0.12)
      .scale(1, 1, 0.22);
    smoothLathe(
      b,
      [
        [0, -0.12],
        [0.055, -0.116],
        [0.082, -0.09],
        [0.09, 0],
        [0.085, 0.08],
        [0, 0.1],
      ],
      12,
    );
    b.pop();
  }
  b.color(look.belt);
  ellipsoid(b, [0, 0.6, 0.2 * g], 0.035, 0.03, 0.02, 10, 6);

  const out = b.build();
  scaleGeometry(out, look.scale);
  blendByHeight(out, TORSO, [
    [0.84 * look.scale, idx("chest")],
    [0.72 * look.scale, idx("spine")],
    [0.58 * look.scale, idx("pelvis")],
  ]);
  return out;
}

// Uniform scale of a built mesh's positions and bounds (normals are unchanged).
function scaleGeometry(g: GeometryData, k: number) {
  if (k === 1) return;
  const f32 = new Float32Array(g.data);
  for (let i = 0; i < g.vertexCount; i++) {
    f32[i * 6] *= k;
    f32[i * 6 + 1] *= k;
    f32[i * 6 + 2] *= k;
  }
  const bd = g.bounds;
  for (let i = 0; i < 3; i++) {
    bd.min[i] *= k;
    bd.max[i] *= k;
    bd.center[i] *= k;
  }
  bd.radius *= k;
}

// The club, along +Y from the middle of the grip: a short handle swelling into a knotty head.
export function buildClub(look: GoblinLook): GeometryData {
  const c = look.club;
  const b = new GeometryBuilder();
  b.color(look.belt);
  capsule(b, [0, -0.11, 0], [0, 0.1, 0], 0.024, 0.026, 8, 2);
  b.color(c.wood, 0.15);
  const L = c.length,
    R = c.head;
  smoothLathe(
    b,
    [
      [0, 0.04],
      [0.03, 0.05],
      [0.034, 0.12],
      [R * 0.7, L * 0.45],
      [R * 0.95, L * 0.72],
      [R, L * 0.86],
      [R * 0.8, L * 0.97],
      [0, L],
    ],
    12,
  );
  b.color(c.band);
  for (const t of [0.5, 0.68]) {
    const r = R * (t < 0.6 ? 0.78 : 0.97) + 0.008;
    const ring: [number, number][] = [];
    for (let i = 0; i <= 8; i++) {
      const a = -Math.PI / 2 + (i / 8) * Math.PI * 2;
      ring.push([r + 0.012 * Math.cos(a), L * t + 0.014 * Math.sin(a)]);
    }
    smoothLathe(b, ring, 12);
  }
  b.color(c.wood, 0.15);
  ellipsoid(b, [R * 0.85, L * 0.8, 0.01], R * 0.28, R * 0.32, R * 0.28, 8, 6);
  ellipsoid(b, [-R * 0.6, L * 0.62, -R * 0.55], R * 0.22, R * 0.26, R * 0.22, 8, 6);
  if (c.studs !== undefined) {
    b.color(c.studs, 0.6);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + (i % 2) * 0.5;
      const y = L * (i % 2 ? 0.78 : 0.88);
      const r = R * 0.95;
      horn(
        b,
        [Math.cos(a) * r * 0.9, y, Math.sin(a) * r * 0.9],
        [Math.cos(a) * (r + 0.07), y + 0.02, Math.sin(a) * (r + 0.07)],
        [0, 0, 0],
        0.03,
        6,
        2,
      );
    }
  }
  const g = b.build();
  scaleGeometry(g, look.scale);
  return g;
}
