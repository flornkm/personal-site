import { GeometryBuilder, type GeometryData } from "../engine/geometry";
import { mat4, quat, type Mat4 } from "../engine/math";
import type { BoneName } from "../core/types";
import { ARM, JOINT, bone } from "./rig";
import { COLOR, GLOSS } from "./palette";
import { ellipsoid, mix, range, shell, surface, sweep, tube, type V3 } from "./shapes";

// Where a carried item sits relative to the bone that carries it, in that bone's bind-aligned axes
// (+Y up, +Z forward, +X the character's left). Rotation is Euler YXZ like quat.fromEulerYXZ: roll
// about Z first, then pitch about X, then yaw about Y.
export interface Mount {
  bone: BoneName;
  offset: readonly [number, number, number];
  pitch: number;
  yaw: number;
  roll: number;
  scale?: number;
}

export function mountMatrix(out: Mat4, m: Mount): Mat4 {
  const q = quat.fromEulerYXZ(quat.create(), m.pitch, m.yaw, m.roll);
  const s = m.scale ?? 1;
  return mat4.fromRotationTranslationScale(out, q, m.offset, [s, s, s]);
}

// The sword is modelled along +Y from the middle of its grip, the blade's width along X. In the
// right fist the grip runs front to back through the curled fingers, blade forward and a little
// up, edges up and down. Stowed, it sits in the scabbard across the back with the hilt over the
// right shoulder, ready for the right hand.
export const SWORD_GRIP: Mount = {
  bone: "handR",
  offset: [-0.002, -0.06, 0.004],
  pitch: 0,
  yaw: Math.PI / 2,
  // A hammer grip runs diagonally across the palm, so the blade leans ~25 deg toward the fingers;
  // leaning it back toward the elbow forces impossible wrist bends in extended slashes.
  roll: Math.PI / 2 + 0.44,
};
// The scabbard lies on the back plate (its front face a few millimetres off it) from the right
// shoulder to the left hip, its tip level with the tunic's hem.
export const SWORD_BACK: Mount = {
  bone: "chest",
  offset: [-0.14, 0.275, -0.122],
  pitch: 0.05,
  yaw: 0,
  roll: Math.PI + 0.44,
};

// The shield faces +Z with its centre at the origin. On the left forearm it is strapped on like a
// knight's: the forearm runs across its back above the centre (through the elbow strap, the fist on
// the grip), the face on the forearm's outer side, so with the forearm held across the body the
// shield stands upright, point down. The forearm rises toward the fist by SHIELD_CANT across it.
// Stowed, it hangs a little smaller behind the broad upper back, where the torso hides it from the
// front, its guige against the gorget. The gap behind it is left for the quiver (bow.ts QUIVER),
// which hangs between the back plate and the shield.
const SHIELD_CANT = 0.25;
export const SHIELD_ARM: Mount = {
  bone: "foreArmL",
  offset: [0.055, -0.14, -0.05],
  pitch: 0,
  yaw: Math.PI / 2,
  roll: Math.PI / 2 + SHIELD_CANT,
};
export const SHIELD_BACK: Mount = {
  bone: "chest",
  offset: [0, -0.05, -0.2],
  pitch: -0.08,
  yaw: Math.PI,
  roll: 0,
  scale: 0.9,
};
// Swinging between the two (animation/mounts.ts createMountBlend): seconds, lift (m) and the bow
// out over the left shoulder in SHIELD_BACK's axes (its -X is the knight's left), so the shield
// never passes through the pauldron or the helm on the way.
export const SHIELD_SWAP = { time: 0.18, lift: 0.12, arc: [-0.3, 0, 0.04] as const };

const SWORD = {
  edge: 0xf2f5f9,
  flat: 0xc9d1db,
  fuller: 0x8e99a8,
  guard: 0x3a404b,
  gold: 0xd6aa4c,
  grip: 0x3a2820,
  wrap: 0x523a2b,
  gem: 0x3f86e0,
};

// Blade rings along +Y: [y, half width, half thickness]; the last one is the point.
// Broad enough that the blade reads as a shape, not a needle, at the gameplay camera distance.
const BLADE: [number, number, number][] = [
  [0.1, 0.039, 0.0068],
  [0.125, 0.0378, 0.0068],
  [0.6, 0.034, 0.0064],
  [0.76, 0.031, 0.006],
  [0.828, 0.019, 0.0044],
  [0.872, 0, 0],
];
const FULLER_END = 0.6;

// Where the blade starts (just above the guard) and ends, along the sword's +Y in metres.
export const SWORD_BLADE = { base: BLADE[0][0], tip: BLADE[BLADE.length - 1][0] } as const;

// A flat-ground blade: bright bevels along both edges, steel flats and a dark fuller down the
// middle of each face, every facet lit flat so it glints like steel.
function blade(b: GeometryBuilder) {
  const ring = ([y, w, h]: [number, number, number]): V3[] =>
    [
      [w, 0],
      [0.45 * w, h],
      [0.13 * w, h],
      [-0.13 * w, h],
      [-0.45 * w, h],
      [-w, 0],
      [-0.45 * w, -h],
      [-0.13 * w, -h],
      [0.13 * w, -h],
      [0.45 * w, -h],
    ].map(([x, z]): V3 => [x, y, z]);
  const kind = [
    "edge",
    "flat",
    "fuller",
    "flat",
    "edge",
    "edge",
    "flat",
    "fuller",
    "flat",
    "edge",
  ] as const;
  const area = (a: V3, c: V3, d: V3) => {
    const u = [c[0] - a[0], c[1] - a[1], c[2] - a[2]],
      v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    return Math.hypot(
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    );
  };
  for (let r = 0; r < BLADE.length - 1; r++) {
    const lo = ring(BLADE[r]),
      hi = ring(BLADE[r + 1]);
    for (let f = 0; f < 10; f++) {
      const g = (f + 1) % 10;
      const k = kind[f];
      const c =
        k === "edge"
          ? SWORD.edge
          : k === "fuller" && BLADE[r][0] >= 0.12 && BLADE[r + 1][0] <= FULLER_END
            ? SWORD.fuller
            : SWORD.flat;
      b.color(c, 0.85);
      if (area(lo[f], hi[g], lo[g]) > 1e-10) b.tri(lo[f], hi[g], lo[g]);
      if (area(lo[f], hi[f], hi[g]) > 1e-10) b.tri(lo[f], hi[f], hi[g]);
    }
  }
}

// Blackened cross-guard whose arms sweep gently toward the blade and end in gold balls, with a
// sapphire set in its centre on both faces.
function guard(b: GeometryBuilder) {
  b.color(SWORD.guard, GLOSS.steel);
  ellipsoid(b, [0, 0.09, 0], [0.042, 0.024, 0.022], { segments: 16, rings: 8 });
  for (const s of [1, -1]) {
    const path = range(0, 1, 10).map((k): V3 => [s * 0.118 * k, 0.09 + 0.024 * k * k, 0]);
    sweep(b, path, (k) => 0.012 - 0.003 * k, { segments: 10, gloss: GLOSS.steel });
    b.color(SWORD.gold, GLOSS.silver);
    ellipsoid(b, [s * 0.121, 0.115, 0], [0.017, 0.017, 0.017], { segments: 12, rings: 7 });
    b.color(SWORD.guard, GLOSS.steel);
  }
  for (const z of [1, -1]) {
    b.color(SWORD.gold, GLOSS.silver);
    ellipsoid(b, [0, 0.09, z * 0.019], [0.016, 0.016, 0.006], { segments: 12, rings: 6 });
    b.color(SWORD.gem, 0.9);
    ellipsoid(b, [0, 0.09, z * 0.023], [0.0105, 0.0105, 0.005], { segments: 10, rings: 6 });
  }
}

// Leather-wrapped grip between gold ferrules, and a gold wheel pommel.
function hilt(b: GeometryBuilder) {
  const ys = range(-0.072, 0.072, 16);
  tube(
    b,
    ys.map((y) => {
      const r = 0.0168 + 0.0018 * Math.cos((y / 0.072) * (Math.PI / 2));
      return { y, rx: r, zf: r };
    }),
    {
      segments: 12,
      paint: (_t, y) => (Math.floor((y + 0.072) / 0.018) % 2 === 0 ? SWORD.grip : SWORD.wrap),
    },
  );
  b.color(SWORD.gold, GLOSS.silver);
  for (const [y0, y1, r] of [
    [0.064, 0.08, 0.021],
    [-0.08, -0.064, 0.02],
  ]) {
    tube(
      b,
      [
        { y: y0, rx: r, zf: r },
        { y: y1, rx: r, zf: r },
      ],
      { segments: 14, capBottom: 0.004, capTop: 0.004, capSteps: 2 },
    );
  }
  ellipsoid(b, [0, -0.108, 0], [0.033, 0.03, 0.022], { segments: 14, rings: 8 });
  ellipsoid(b, [0, -0.139, 0], [0.011, 0.008, 0.011], { segments: 10, rings: 5 });
}

export function buildSword(): GeometryData {
  const b = new GeometryBuilder();
  blade(b);
  guard(b);
  hilt(b);
  return b.build();
}

// Heater shield: straight sides with rounded top corners curving to a point, a face that bulges
// outward, a rolled silver rim and a raised silver chevron on a dark navy field.
const SHIELD = { w: 0.2, top: 0.25, bottom: -0.29, corner: 0.04, bulge: 0.038, thick: 0.022 };
// The field is the one vertex colour of the face (net/look.ts paints it in a player's colours).
export const SHIELD_COLOR = {
  field: 0x1f2b48,
  back: 0x3a2b22,
  planks: [0x5a4331, 0x4c392a],
  strap: 0x2a201b,
};

function shieldHalf(y: number) {
  if (y >= 0) {
    const c = SHIELD.corner;
    const dy = y - (SHIELD.top - c);
    return dy <= 0 ? SHIELD.w : SHIELD.w - c + Math.sqrt(Math.max(0, c * c - dy * dy));
  }
  return SHIELD.w * Math.cos((Math.min(1, y / SHIELD.bottom) * Math.PI) / 2) ** 0.75;
}
const faceZ = (x: number, y: number) =>
  SHIELD.bulge * (1 - (x / (SHIELD.w + 0.03)) ** 2) - 0.01 * (y / 0.3) ** 2;

function shieldBody(b: GeometryBuilder) {
  const vs = range(0, 1, 22);
  const yOf = (v: number) => SHIELD.bottom + (SHIELD.top - SHIELD.bottom) * v;
  const at = (u: number, v: number, back: number): V3 => {
    const y = yOf(v);
    const x = (u * 2 - 1) * shieldHalf(y);
    return [x, y, faceZ(x, y) - back];
  };
  const us = range(0, 1, 14);
  b.color(SHIELD_COLOR.field, GLOSS.dome);
  surface(b, us, vs, (u, v) => at(u, v, 0));
  // Planked wood behind, a shade lighter than the straps: carried on the arm, the back is what the
  // follow camera sees, and a near-black back read as a hole beside the knight.
  surface(b, us, vs, (u, v) => at(u, v, SHIELD.thick), {
    flip: true,
    paint: (u, v) =>
      SHIELD_COLOR.planks[Math.floor(((u * 2 - 1) * shieldHalf(yOf(v)) + SHIELD.w) / 0.08) % 2],
  });

  // The outline, counter-clockwise from the front: up the right side, across the top, down the left.
  const loop: [number, number][] = [
    ...vs.slice(1).map((v): [number, number] => [shieldHalf(yOf(v)), yOf(v)]),
    ...range(0, 1, 8)
      .slice(1, -1)
      .map((k): [number, number] => [shieldHalf(SHIELD.top) * (1 - 2 * k), SHIELD.top]),
    ...vs
      .slice(1)
      .reverse()
      .map((v): [number, number] => [-shieldHalf(yOf(v)), yOf(v)]),
    [0, SHIELD.bottom],
  ];
  const idx = range(0, loop.length, loop.length);
  const pt = (i: number, back: number): V3 => {
    const [x, y] = loop[i % loop.length];
    return [x, y, faceZ(x, y) - back];
  };
  b.color(COLOR.steelDark);
  surface(b, idx, [0, 1], (i, k) => mix(pt(i, 0), pt(i, SHIELD.thick), k), { flip: true });
  // Only the face side of the rim is silver: stowed, any sliver seen past the torso is dark.
  const silver = [COLOR.silver, GLOSS.silver] as const;
  sweep(
    b,
    loop.map((_, i) => pt(i, SHIELD.thick / 2)),
    () => SHIELD.thick / 2 + 0.006,
    { closed: true, segments: 10, paint: (out) => (out[2] > 0.2 ? silver : COLOR.steelDark) },
  );
}

// A raised chevron laid on the bulging face.
function chevron(b: GeometryBuilder) {
  b.color(COLOR.silver, GLOSS.silver);
  const apex: [number, number] = [0, 0.11];
  for (const s of [1, -1]) {
    const foot: [number, number] = [s * 0.165, -0.07];
    const half = 0.026;
    surface(
      b,
      range(0, 1, 8),
      [-1, 1],
      (k, w) => {
        // Mitred at the apex: the inner and outer edges meet on the centre line.
        const x0 = apex[0] + (foot[0] - apex[0]) * k;
        const y0 = apex[1] + (foot[1] - apex[1]) * k;
        const dx = foot[0] - apex[0],
          dy = foot[1] - apex[1];
        const l = Math.hypot(dx, dy);
        let x = x0 + (-dy / l) * half * w * s,
          y = y0 + (dx / l) * half * w * s;
        if (k === 0) {
          x = 0;
          y = apex[1] + (half * w * l) / Math.abs(dx);
        }
        return [x, y, faceZ(x, y) + 0.004];
      },
      { flip: s === -1 },
    );
  }
}

// The enarmes, laid along the forearm wherever SHIELD_ARM straps it on: a leather loop the forearm
// passes through below the elbow, and a grip bar the fist closes on, standing off the back on two
// posts.
function shieldStraps(b: GeometryBuilder) {
  const toShield = mat4.invert(mat4.create(), mountMatrix(mat4.create(), SHIELD_ARM));
  // Forearm axis point `t` metres from the elbow (the bone points down -Y), in shield space.
  const axis = (t: number): V3 => {
    const m = toShield;
    return [m[4] * -t + m[12], m[5] * -t + m[13], m[6] * -t + m[14]];
  };
  const a0 = axis(0),
    a1 = axis(1);
  const along: V3 = [a1[0] - a0[0], a1[1] - a0[1], 0];
  const l = Math.hypot(along[0], along[1]);
  // Across the forearm in the shield's plane.
  const across: V3 = [-along[1] / l, along[0] / l, 0];
  const back = (x: number, y: number) => faceZ(x, y) - SHIELD.thick - 0.002;
  const at = (c: V3, u: number, w: number): V3 => [
    c[0] + across[0] * u,
    c[1] + across[1] * u,
    c[2] - w,
  ];
  const onBack = (p: V3): V3 => [p[0], p[1], back(p[0], p[1])];

  b.color(SHIELD_COLOR.strap, GLOSS.leather);
  const c = axis(0.07);
  const r = 0.068;
  const loop: V3[] = [onBack(at(c, r, 0))];
  for (const th of range(-Math.PI / 2, Math.PI / 2, 11))
    loop.push(at(c, r * -Math.sin(th), r * Math.cos(th)));
  loop.push(onBack(at(c, -r, 0)));
  sweep(b, loop, () => 0.009, { segments: 8 });

  const g = axis(ARM.fore + 0.045);
  b.color(SHIELD_COLOR.back, GLOSS.leather);
  sweep(b, [at(g, -0.055, 0), at(g, 0.055, 0)], () => 0.011, { segments: 8 });
  b.color(COLOR.steelDark, GLOSS.steel);
  for (const u of [-0.05, 0.05]) {
    const p = at(g, u, 0);
    sweep(b, [p, onBack(p)], () => 0.007, { segments: 6 });
  }
}

// The guige, the strap a shield is slung by: a slack rolled-leather loop between the top corners on
// the back, bowing away from it. Stowed, it presses against the gorget, so the shield visibly hangs
// from something; on the arm it tucks in by the elbow. Round, because a flat strap seen edge-on
// reads as a wire.
const GUIGE = { x: 0.15, y: SHIELD.top - 0.05, rise: 0.03, bow: 0.07, r: 0.0085 };

function guige(b: GeometryBuilder) {
  const back = (x: number, y: number) => faceZ(x, y) - SHIELD.thick;
  const path = range(-1, 1, 20).map((k): V3 => {
    const sag = 1 - k * k;
    const x = GUIGE.x * k;
    const y = GUIGE.y + GUIGE.rise * sag;
    return [x, y, back(x, y) - GUIGE.r * 0.6 - GUIGE.bow * sag ** 0.7];
  });
  b.color(SHIELD_COLOR.strap, GLOSS.leather);
  sweep(b, path, () => GUIGE.r, { segments: 8 });
  b.color(COLOR.buckle, GLOSS.silver);
  for (const s of [1, -1]) {
    const x = s * GUIGE.x;
    ellipsoid(b, [x, GUIGE.y, back(x, GUIGE.y) - 0.002], [0.012, 0.012, 0.006], {
      segments: 10,
      rings: 5,
    });
  }
}

export function buildShield(): GeometryData {
  const b = new GeometryBuilder();
  shieldBody(b);
  chevron(b);
  shieldStraps(b);
  guige(b);
  return b.build();
}

// Model-space point on the stowed scabbard's axis, `along` metres down from the grip.
function scabbardPoint(along: number): V3 {
  const m = mountMatrix(mat4.create(), SWORD_BACK);
  const c = JOINT[SWORD_BACK.bone];
  return [c[0] + m[4] * along + m[12], c[1] + m[5] * along + m[13], c[2] + m[6] * along + m[14]];
}

// Where the baldric's leather loops hold the scabbard (mid, throat), for the strap on the back.
const LOOPS = [0.5, 0.17];
export const SCABBARD_STRAP = LOOPS.map(scabbardPoint) as [V3, V3];

// The scabbard is part of the body mesh, on the chest bone, laid exactly where SWORD_BACK puts the
// blade, so the stowed sword sits in it and drawing the sword leaves it empty on the back.
export function buildScabbard(b: GeometryBuilder) {
  const c = JOINT[SWORD_BACK.bone];
  b.bone(bone(SWORD_BACK.bone));
  b.push().translate(c[0], c[1], c[2]).transform(mountMatrix(mat4.create(), SWORD_BACK));
  const steel = [COLOR.steelLight, GLOSS.steel] as const;
  tube(
    b,
    [
      { y: 0.094, rx: 0.049, zf: 0.017 },
      { y: 0.13, rx: 0.049, zf: 0.017 },
      { y: 0.136, rx: 0.047, zf: 0.016 },
      { y: 0.8, rx: 0.042, zf: 0.0145 },
      { y: 0.808, rx: 0.043, zf: 0.015 },
      { y: 0.85, rx: 0.033, zf: 0.0125 },
    ],
    {
      segments: 16,
      capTop: 0.04,
      capSteps: 4,
      gloss: GLOSS.leather,
      // Dark steel locket and chape: silver here would read as white teeth beside the helm and
      // the left leg.
      paint: (_t, y) => (y < 0.134 ? steel : y > 0.804 ? COLOR.steelDark : COLOR.leatherDark),
    },
  );
  for (const y of LOOPS) {
    b.color(COLOR.leather, GLOSS.leather);
    shell(
      b,
      [
        { y: y - 0.013, rx: 0.051, zf: 0.0195 },
        { y: y + 0.013, rx: 0.051, zf: 0.0195 },
      ],
      {
        thick: 0.004,
        inside: COLOR.leatherDark,
        edge: COLOR.leatherLight,
        rimTop: true,
        segments: 16,
      },
    );
  }
  // The dark mouth the blade slides into.
  b.color(COLOR.steelInside);
  surface(
    b,
    range(0, 1, 16),
    [0, 1],
    (t, k) => {
      const a = t * Math.PI * 2;
      return [Math.sin(a) * 0.049 * (1 - k), 0.094, Math.cos(a) * 0.017 * (1 - k)];
    },
    { flip: true },
  );
  b.pop();
}
