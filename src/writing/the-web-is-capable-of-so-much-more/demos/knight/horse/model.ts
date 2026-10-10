import { GeometryBuilder, VERTEX_STRIDE, type GeometryData } from "../engine/geometry";
import {
  add,
  cross,
  disc,
  dot,
  ellipsoid,
  lerp,
  mix,
  mul,
  norm,
  range,
  slab,
  smooth,
  sub,
  surface,
  sweep,
  tube,
  type Paint,
  type V3,
} from "../character/shapes";
import { BIT, JOINT, LEG_CHAIN, LEG_NAMES, STIRRUP, hb, legBones, type LegName } from "./rig";

// A dark bay riding horse in the game's rounded toon style: a deep barrel, a crested neck with a
// chunky mane falling to the right, a wedge head with a white blaze, black points (lower legs,
// mane, tail), white hind socks; tacked up in the knight's colours: an oxblood saddle blanket with
// a pewter trim, a dark leather saddle with a horn and cantle, steel stirrups, bridle and reins.
// Built procedurally into one skinned buffer (one draw). Body parts are modelled with placeholder
// "regions" that are turned into two-bone blends from each vertex's bind position afterwards, so
// the neck, legs and tail bend smoothly instead of opening seams.

export const HORSE_COLOR = {
  coat: 0x6b3f27,
  coatLight: 0x84532f,
  points: 0x211a17,
  muzzle: 0x3a2a24,
  white: 0xe2d7c4,
  hoof: 0x2c2522,
  hoofPale: 0x8a7a65,
  eye: 0x100c0c,
  inner: 0x2a1d18,
  mane: 0x1d1614,
  maneLight: 0x2c221e,
  blanket: 0x4f1b22,
  trim: 0x8b929d,
  leather: 0x3b2c24,
  leatherDark: 0x261e1a,
  leatherLight: 0x5b4335,
  steel: 0x5a6271,
  buckle: 0x939ca8,
};
const C = HORSE_COLOR;
const GLOSS = { coat: 0.0, hair: 0.04, leather: 0.05, steel: 0.35, eye: 0.7, hoof: 0.15 };

// --- Region skinning -------------------------------------------------------------------------------

interface Chain {
  pts: V3[];
  bones: number[];
  // Half-width (m) of the blend across each interior joint.
  blend: number[];
}

const REGION_BASE = 64;
const chains: Chain[] = [];
function region(pts: V3[], boneNames: string[], blend: number | number[]): number {
  const n = pts.length - 1;
  chains.push({
    pts,
    bones: boneNames.map(hb),
    blend: typeof blend === "number" ? Array(n + 1).fill(blend) : blend,
  });
  return REGION_BASE + chains.length - 1;
}

const smoothW = (a: number, b: number, v: number) => smooth(a, b, v);

function resolveChain(c: Chain, p: V3): [number, number, number] {
  let best = 0,
    bestD = Infinity,
    bestS = 0,
    bestL = 1;
  for (let k = 0; k < c.pts.length - 1; k++) {
    const a = c.pts[k],
      d = sub(c.pts[k + 1], a);
    const L = Math.hypot(d[0], d[1], d[2]);
    const t = Math.max(0, Math.min(1, dot(sub(p, a), d) / (L * L)));
    const q = add(a, mul(d, t));
    const dist = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    if (dist < bestD - 1e-6) {
      bestD = dist;
      best = k;
      bestS = t * L;
      bestL = L;
    }
  }
  const n = c.bones.length;
  const bk = c.bones[best];
  if (best > 0 && bestS < c.blend[best]) {
    const w = smoothW(-c.blend[best], c.blend[best], bestS);
    return [bk, c.bones[best - 1], w];
  }
  if (best < n - 1 && bestL - bestS < c.blend[best + 1]) {
    const w = smoothW(-c.blend[best + 1], c.blend[best + 1], bestL - bestS);
    return [bk, c.bones[best + 1], w];
  }
  return [bk, bk, 1];
}

function resolveRegions(g: GeometryData) {
  const f32 = new Float32Array(g.data);
  const u8 = new Uint8Array(g.data);
  for (let i = 0; i < g.vertexCount; i++) {
    const o = i * VERTEX_STRIDE;
    const r = u8[o + 20];
    if (r < REGION_BASE) continue;
    const [a, c, w] = resolveChain(chains[r - REGION_BASE], [
      f32[i * 6],
      f32[i * 6 + 1],
      f32[i * 6 + 2],
    ]);
    u8[o + 20] = a;
    u8[o + 21] = c;
    u8[o + 22] = Math.round(w * 255);
  }
}

// --- Lofts -----------------------------------------------------------------------------------------

const spow = (v: number, e: number) => Math.sign(v) * Math.abs(v) ** e;

// Catmull-Rom through keyed values (keys sorted by t), clamped at the ends.
function curve(keys: [number, ...number[]][], col: number) {
  return (t: number) => {
    const n = keys.length;
    if (t <= keys[0][0]) return keys[0][col];
    if (t >= keys[n - 1][0]) return keys[n - 1][col];
    let i = 0;
    while (i < n - 2 && keys[i + 1][0] < t) i++;
    const k0 = keys[Math.max(0, i - 1)],
      k1 = keys[i],
      k2 = keys[i + 1],
      k3 = keys[Math.min(n - 1, i + 2)];
    const u = (t - k1[0]) / (k2[0] - k1[0]);
    const p0 = k0[col],
      p1 = k1[col],
      p2 = k2[col],
      p3 = k3[col];
    // Tangents scaled to the uneven key spacing.
    const m1 = ((p2 - p0) / (k2[0] - k0[0] || 1)) * (k2[0] - k1[0]);
    const m2 = ((p3 - p1) / (k3[0] - k1[0] || 1)) * (k2[0] - k1[0]);
    const u2 = u * u,
      u3 = u2 * u;
    return (
      (2 * u3 - 3 * u2 + 1) * p1 + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2 + (u3 - u2) * m2
    );
  };
}

interface Frame {
  c: V3;
  side: V3;
  up: V3;
}

// A closed tube around a spine of frames: at angle a (0 = `up`, growing toward `side`) and along v,
// a superellipse with half-width rx, and top/bottom half-heights. Picks its winding from the centre.
function loft(
  b: GeometryBuilder,
  us: number[],
  vs: number[],
  point: (a: number, v: number) => V3,
  centre: (v: number) => V3,
  opts: {
    paint?: (a: number, v: number) => Paint | null;
    tint?: (a: number, v: number) => V3;
    gloss?: number;
  } = {},
) {
  const i = Math.floor(us.length / 4),
    j = Math.floor(vs.length / 2);
  const p = point(us[i], vs[j]);
  const n = cross(sub(point(us[i + 1], vs[j]), p), sub(point(us[i], vs[j + 1]), p));
  const flip = dot(n, sub(p, centre(vs[j]))) < 0;
  surface(b, us, vs, point, {
    closedU: true,
    flip,
    paint: opts.paint,
    tint: opts.tint,
    gloss: opts.gloss,
  });
}

function sectionPoint(f: Frame, a: number, rx: number, top: number, bot: number, n: number): V3 {
  const e = 2 / n;
  const s = Math.sin(a),
    c = Math.cos(a);
  const x = rx * spow(s, e);
  const y = (c >= 0 ? top : bot) * spow(c, e);
  return add(f.c, add(mul(f.side, x), mul(f.up, y)));
}

// --- Trunk -----------------------------------------------------------------------------------------

// z, centre y, half-width, top, bottom, squareness. Rear (buttocks) to front (breast).
const TRUNK: [number, number, number, number, number, number][] = [
  [-0.965, 1.3, 0, 0, 0, 2.2],
  [-0.94, 1.3, 0.125, 0.12, 0.15, 2.2],
  [-0.87, 1.3, 0.22, 0.2, 0.25, 2.3],
  [-0.74, 1.3, 0.285, 0.25, 0.32, 2.4],
  [-0.58, 1.29, 0.31, 0.27, 0.35, 2.45],
  [-0.4, 1.26, 0.31, 0.265, 0.37, 2.45],
  [-0.2, 1.235, 0.31, 0.275, 0.38, 2.45],
  [0.0, 1.225, 0.32, 0.285, 0.39, 2.45],
  [0.2, 1.235, 0.315, 0.305, 0.39, 2.45],
  [0.38, 1.25, 0.29, 0.345, 0.37, 2.4],
  [0.53, 1.25, 0.26, 0.3, 0.345, 2.35],
  [0.66, 1.235, 0.235, 0.235, 0.31, 2.3],
  [0.76, 1.215, 0.2, 0.17, 0.25, 2.2],
  [0.83, 1.205, 0.13, 0.1, 0.165, 2.2],
  [0.86, 1.2, 0, 0, 0, 2.2],
];
const tY = curve(TRUNK, 1),
  tRx = curve(TRUNK, 2),
  tTop = curve(TRUNK, 3),
  tBot = curve(TRUNK, 4),
  tN = curve(TRUNK, 5);
const X: V3 = [1, 0, 0],
  Y: V3 = [0, 1, 0];

// A point on the trunk's skin at angle a (0 on top, + toward the horse's left) and z, pushed out
// by `off` metres.
export function trunkPoint(a: number, z: number, off = 0): V3 {
  const rx = tRx(z),
    top = tTop(z),
    bot = tBot(z);
  const grow = (r: number) => (r > 1e-4 ? r + off : 0);
  return sectionPoint(
    { c: [0, tY(z), z], side: X, up: Y },
    a,
    grow(rx),
    grow(top),
    grow(bot),
    tN(z),
  );
}

function buildTrunk(b: GeometryBuilder) {
  const reg = region(
    [
      [0, 1.3, -1.1],
      [0, 1.3, -0.34],
      [0, 1.25, 0.26],
      [0, 1.3, 1.0],
    ],
    ["hips", "spine", "chest"],
    0.16,
  );
  b.bone(reg).color(C.coat, GLOSS.coat);
  const zs = range(-0.965, 0.86, 44);
  loft(
    b,
    range(0, Math.PI * 2, 34),
    zs,
    (a, z) => trunkPoint(a, z),
    (z) => [0, tY(z), z],
    {
      gloss: GLOSS.coat,
      // A slightly lighter belly and flank under a darker topline, like a real bay's dapple of
      // light.
      tint: (a) => mixColor(C.coat, C.coatLight, smooth(0.4, 0.9, -Math.cos(a)) * 0.33),
    },
  );
}

const rgbOf = (c: number): V3 => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
function mixColor(a: number, c: number, t: number): V3 {
  return mix(rgbOf(a), rgbOf(c), Math.max(0, Math.min(1, t)));
}

// --- Neck, mane, head ------------------------------------------------------------------------------

// Neck centre line (y, z) from inside the chest to the throatlatch, and the half-sizes along it.
const NECK_PATH: [number, number, number][] = [
  [0, 1.28, 0.52],
  [0.25, 1.47, 0.74],
  [0.5, 1.68, 0.9],
  [0.75, 1.86, 1.02],
  [1, 1.97, 1.09],
];
// s, half-width, crest side, throat side.
const NECK_SIZE: [number, number, number, number][] = [
  [0, 0.215, 0.27, 0.31],
  [0.22, 0.19, 0.21, 0.24],
  [0.5, 0.158, 0.17, 0.165],
  [0.75, 0.133, 0.14, 0.122],
  [1, 0.118, 0.115, 0.125],
];
const nY = curve(NECK_PATH, 1),
  nZ = curve(NECK_PATH, 2);
const nRx = curve(NECK_SIZE, 1),
  nTop = curve(NECK_SIZE, 2),
  nBot = curve(NECK_SIZE, 3);

function neckFrame(s: number): Frame {
  const e = 0.01;
  const dy = nY(s + e) - nY(s - e),
    dz = nZ(s + e) - nZ(s - e);
  const l = Math.hypot(dy, dz) || 1;
  // Crest side: the path's direction turned back and up.
  return { c: [0, nY(s), nZ(s)], side: X, up: [0, dz / l, -dy / l] };
}

export function neckPoint(s: number, a: number, off = 0): V3 {
  return sectionPoint(neckFrame(s), a, nRx(s) + off, nTop(s) + off, nBot(s) + off, 2.3);
}

// Head axis from behind the poll to the muzzle tip; `up` is the face (forehead) side.
const HEAD_A: V3 = [0, 2.01, 1.05];
const HEAD_B: V3 = [0, 1.48, 1.5];
const HEAD_AXIS = norm(sub(HEAD_B, HEAD_A));
const HEAD_LEN = Math.hypot(...sub(HEAD_B, HEAD_A));
const HEAD_UP: V3 = [0, HEAD_AXIS[2], -HEAD_AXIS[1]];
// s, half-width, face side, jaw side, squareness.
const HEAD_SIZE: [number, number, number, number, number][] = [
  [0, 0.03, 0.03, 0.03, 2.2],
  [0.03, 0.092, 0.08, 0.097, 2.3],
  [0.1, 0.128, 0.105, 0.145, 2.4],
  [0.22, 0.14, 0.108, 0.172, 2.5],
  [0.36, 0.127, 0.098, 0.13, 2.6],
  [0.55, 0.106, 0.087, 0.093, 2.6],
  [0.74, 0.098, 0.082, 0.085, 2.6],
  [0.88, 0.107, 0.085, 0.097, 2.5],
  [0.96, 0.09, 0.07, 0.083, 2.3],
  [1, 0.0, 0.0, 0.0, 2.2],
];
const hRx = curve(HEAD_SIZE, 1),
  hTop = curve(HEAD_SIZE, 2),
  hBot = curve(HEAD_SIZE, 3),
  hN = curve(HEAD_SIZE, 4);

const headCentre = (s: number): V3 => add(HEAD_A, mul(HEAD_AXIS, s * HEAD_LEN));
// A point on the head at s (0 poll .. 1 muzzle tip) and angle a (0 = face, π/2 = left cheek).
export function headPoint(s: number, a: number, off = 0): V3 {
  const r = (v: number) => (v > 1e-4 ? v + off : 0);
  return sectionPoint(
    { c: headCentre(s), side: X, up: HEAD_UP },
    a,
    r(hRx(s)),
    r(hTop(s)),
    r(hBot(s)),
    hN(s),
  );
}

function buildNeck(b: GeometryBuilder) {
  const reg = region(
    [[0, 1.24, 0.42], JOINT.neck1, JOINT.neck2, JOINT.head, [0, 2.05, 1.2]],
    ["chest", "neck1", "neck2", "head"],
    [0.1, 0.14, 0.12, 0.08, 0.08],
  );
  b.bone(reg).color(C.coat, GLOSS.coat);
  loft(
    b,
    range(0, Math.PI * 2, 26),
    range(0, 1.04, 16),
    (a, s) => neckPoint(s, a),
    (s) => neckFrame(s).c,
    {
      gloss: GLOSS.coat,
      tint: (a) => mixColor(C.coat, C.coatLight, smooth(0.3, 0.9, -Math.cos(a)) * 0.35),
    },
  );
  return reg;
}

function buildHead(b: GeometryBuilder) {
  b.bone(hb("head"));
  const blaze = (a: number, s: number) => {
    // A white blaze down the face from a star between the eyes, widening over the nose.
    const half = s < 0.16 ? 0 : s < 0.3 ? 0.22 : lerp(0.2, 0.42, smooth(0.5, 0.95, s));
    return Math.abs(a) < half && s < 0.97;
  };
  loft(b, range(-Math.PI, Math.PI, 30), range(0, 1, 22), (a, s) => headPoint(s, a), headCentre, {
    gloss: GLOSS.coat,
    paint: (a, s) => {
      if (blaze(a, s)) return C.white;
      if (s > 0.8) return C.muzzle;
      return C.coat;
    },
  });
  // Eyes: dark and glossy, under a soft brow.
  for (const side of [1, -1]) {
    const s = 0.22;
    const p = headPoint(s, side * 1.0, -0.008);
    b.color(C.eye, GLOSS.eye);
    b.push().translate(p[0], p[1], p[2]);
    orientTo(b, HEAD_AXIS, [side, 0, 0]);
    ellipsoid(b, [0, 0, 0], [0.026, 0.034, 0.04], { segments: 12, rings: 8 });
    b.pop();
    const brow = headPoint(s - 0.04, side * 0.82, -0.016);
    b.color(C.coat, GLOSS.coat);
    b.push().translate(brow[0], brow[1], brow[2]);
    orientTo(b, HEAD_AXIS, [side, 0, 0]);
    ellipsoid(b, [0, 0, 0], [0.028, 0.026, 0.05], { segments: 10, rings: 6 });
    b.pop();
    // Nostril.
    const n = headPoint(0.93, side * 0.62, -0.004);
    b.color(C.points);
    disc(b, n, sub(n, headCentre(0.93)), 0.022, 10, 0.013);
  }
  // Mouth line along each side of the lower lip.
  b.color(C.points);
  for (const side of [1, -1]) {
    sweep(
      b,
      range(0.84, 0.985, 6).map((s) => headPoint(s, side * Math.PI * 0.8, -0.006)),
      () => 0.008,
      { segments: 6 },
    );
  }
}

// Rotates the builder so local +Z runs along `fwd` and +X toward `side` (made orthogonal).
function orientTo(b: GeometryBuilder, fwd: V3, side: V3) {
  const z = norm(fwd);
  const y = norm(cross(z, side));
  const x = cross(y, z);
  const m = new Float32Array(16);
  m[0] = x[0];
  m[1] = x[1];
  m[2] = x[2];
  m[4] = y[0];
  m[5] = y[1];
  m[6] = y[2];
  m[8] = z[0];
  m[9] = z[1];
  m[10] = z[2];
  m[15] = 1;
  b.transform(m);
}

function buildEars(b: GeometryBuilder) {
  for (const side of [1, -1]) {
    const name = side > 0 ? "earL" : "earR";
    const j = JOINT[name];
    b.bone(hb(name));
    b.push().translate(j[0], j[1] - 0.01, j[2]);
    // Pricked: up, a little out and forward, the opening facing forward and out.
    b.rotateZ(-side * 0.22)
      .rotateX(0.12)
      .rotateY(side * 0.5);
    b.color(C.coat, GLOSS.coat);
    tube(
      b,
      [
        { y: 0, rx: 0.034, zf: 0.026, zb: 0.03 },
        { y: 0.05, rx: 0.041, zf: 0.028, zb: 0.032 },
        { y: 0.1, rx: 0.033, zf: 0.022, zb: 0.026 },
        { y: 0.145, rx: 0.016, zf: 0.012, zb: 0.014 },
      ],
      {
        capTop: 0.03,
        segments: 14,
        paint: (_t, y) => (y > 0.135 ? C.points : C.coat),
      },
    );
    b.color(C.inner);
    disc(b, [0, 0.07, 0.02], [0, 0.05, 1], 0.026, 10, 0.05);
    b.pop();
  }
}

// The mane: a thick curtain from the crest down the horse's right side with a scalloped hem of
// chunky locks, a rolled ridge along the top, and a forelock between the ears.
function buildMane(b: GeometryBuilder, neckRegion: number) {
  b.bone(neckRegion);
  const crest = (s: number) => neckPoint(s, 0, -0.01);
  const ridge = range(0.04, 1.02, 18).map(crest);
  b.color(C.mane, GLOSS.hair);
  sweep(b, ridge, (k) => lerp(0.04, 0.032, k), { segments: 10 });
  // Hem: each lock hangs to its own length, rounded at the tip.
  const locks = 9;
  const hem = (u: number) => {
    const x = u * locks;
    const f = x - Math.floor(x);
    const tip = Math.sqrt(Math.max(0, 1 - (2 * f - 1) ** 2));
    const k = Math.floor(x) % 3;
    return lerp(0.55, 1, tip) * (k === 1 ? 0.88 : k === 2 ? 1.06 : 1);
  };
  const s0 = 0.05,
    s1 = 1.0;
  const angle = (u: number, v: number) => lerp(0.3, -lerp(1.15, 0.95, u) * hem(u), v);
  const off = (v: number, t: number) => 0.012 + 0.03 * v * (1 - v) + t;
  slab(
    b,
    range(0, 1, locks * 6),
    range(0, 1, 6),
    (u, v) => neckPoint(lerp(s0, s1, u), angle(u, v), off(v, 0.028)),
    (u, v) => neckPoint(lerp(s0, s1, u), angle(u, v), off(v, 0.004)),
    {
      inside: C.mane,
      edge: C.mane,
      gloss: GLOSS.hair,
      paint: (u, v) => (Math.floor(u * locks * 2) % 2 === 0 && v > 0.3 ? C.maneLight : C.mane),
    },
  );
  // Forelock on the head.
  b.bone(hb("head"));
  for (const k of [-1, 1]) {
    const top = headPoint(0.07, k * 0.25, 0.01);
    const tip = headPoint(0.2, k * 0.12, 0.012);
    const mid = mix(top, tip, 0.5);
    b.color(k > 0 ? C.mane : C.maneLight, GLOSS.hair);
    b.push().translate(mid[0], mid[1], mid[2]);
    orientTo(b, sub(tip, top), [1, 0, 0]);
    ellipsoid(b, [0, 0, 0], [0.04, 0.02, Math.hypot(...sub(tip, top)) * 0.62], {
      segments: 10,
      rings: 6,
    });
    b.pop();
  }
}

// --- Legs ------------------------------------------------------------------------------------------

// Points along a joint chain: [joint index, fraction to the next joint, radius].
type LegKey = [number, number, number];
const FRONT_KEYS: LegKey[] = [
  [1, 0, 0.12],
  [1, 0.5, 0.122],
  [2, 0, 0.112],
  [2, 0.2, 0.1],
  [2, 0.55, 0.078],
  [2, 0.85, 0.064],
  [3, 0, 0.068],
  [3, 0.12, 0.058],
  [3, 0.4, 0.049],
  [3, 0.75, 0.05],
  [4, 0, 0.063],
  [4, 0.25, 0.056],
  [4, 0.55, 0.047],
  [4, 0.78, 0.054],
];
const HIND_KEYS: LegKey[] = [
  [0, 0, 0.14],
  [0, 0.5, 0.14],
  [1, 0, 0.13],
  [1, 0.2, 0.118],
  [1, 0.5, 0.094],
  [1, 0.8, 0.07],
  [2, 0, 0.066],
  [2, 0.12, 0.058],
  [2, 0.4, 0.05],
  [2, 0.75, 0.051],
  [3, 0, 0.064],
  [3, 0.25, 0.056],
  [3, 0.55, 0.047],
  [3, 0.78, 0.054],
];

function legPoint(chain: V3[], j: number, f: number): V3 {
  return mix(chain[j], chain[Math.min(chain.length - 1, j + 1)], f);
}

function buildLeg(b: GeometryBuilder, leg: LegName) {
  const chain = LEG_CHAIN[leg];
  const names = legBones(leg);
  const front = leg[0] === "F";
  const reg = region(
    chain,
    names,
    front ? [0, 0.06, 0.07, 0.05, 0.04, 0] : [0, 0.08, 0.06, 0.04, 0],
  );
  b.bone(reg);
  const keys = front ? FRONT_KEYS : HIND_KEYS;
  const pts = keys.map(([j, f]) => legPoint(chain, j, f));
  const radii = keys.map(([, , r]) => r);
  // Points: the coat down to the knee or hock, black below, a white sock on the hind pasterns.
  const blackAt = front ? 0.62 : 0.66;
  const sock = !front;
  sweep(
    b,
    pts,
    (k) => {
      const x = k * (radii.length - 1);
      const i = Math.min(radii.length - 2, Math.floor(x));
      return lerp(radii[i], radii[i + 1], x - i);
    },
    {
      segments: 14,
      gloss: GLOSS.coat,
      paint: (_out, k) => {
        const x = k * (pts.length - 1);
        const i = Math.min(pts.length - 2, Math.floor(x));
        const y = lerp(pts[i][1], pts[i + 1][1], x - i);
        if (sock && y < 0.21) return C.white;
        return y < blackAt * (front ? 0.78 : 0.8) ? C.points : C.coat;
      },
    },
  );
  // Bony knee / point of hock, and the elbow's point.
  b.color(front ? C.points : C.coat, GLOSS.coat);
  if (front) {
    const knee = add(chain[3], [0, 0.01, 0.012]);
    ellipsoid(b, knee, [0.06, 0.07, 0.068], { segments: 12, rings: 8 });
    b.color(C.coat, GLOSS.coat);
    const elbow = add(chain[2], [0, 0.03, -0.06]);
    ellipsoid(b, elbow, [0.075, 0.07, 0.07], { segments: 12, rings: 8 });
  } else {
    const hock = add(chain[2], [0, 0.03, -0.028]);
    ellipsoid(b, hock, [0.048, 0.08, 0.05], { segments: 12, rings: 8 });
  }
  // Fetlock tuft (ergot) at the back.
  b.color(sock ? C.white : C.points, GLOSS.hair);
  const fet = add(front ? chain[4] : chain[3], [0, -0.01, -0.04]);
  ellipsoid(b, fet, [0.05, 0.05, 0.05], { segments: 10, rings: 6 });

  // Hoof, rigid on the pastern.
  const last = names[names.length - 1];
  b.bone(hb(last));
  const g = chain[chain.length - 1];
  b.color(sock ? C.hoofPale : C.hoof, GLOSS.hoof);
  tube(
    b,
    [
      { y: 0.0, rx: 0.07, zf: 0.085, zb: 0.066, x: g[0], z: g[2] + 0.006, n: 2.2 },
      { y: 0.03, rx: 0.068, zf: 0.078, zb: 0.064, x: g[0], z: g[2] - 0.002, n: 2.2 },
      { y: 0.088, rx: 0.058, zf: 0.054, zb: 0.058, x: g[0], z: g[2] - 0.024, n: 2.2 },
    ],
    { capBottom: 0.004, capTop: 0.012, segments: 16 },
  );
  // Coronet band: a soft ring of hair over the hoof.
  b.color(sock ? C.white : C.points, GLOSS.hair);
  tube(
    b,
    [
      { y: 0.075, rx: 0.062, zf: 0.06, zb: 0.062, x: g[0], z: g[2] - 0.022 },
      { y: 0.105, rx: 0.056, zf: 0.05, zb: 0.058, x: g[0], z: g[2] - 0.035 },
    ],
    { capTop: 0.01, segments: 14 },
  );
}

// Muscle masses over the tops of the legs: shoulders on the chest, haunches on the hips.
function buildMuscles(b: GeometryBuilder) {
  for (const side of [1, -1]) {
    const leg = side > 0 ? "FL" : "FR";
    const fc = LEG_CHAIN[leg];
    const shoulder = region(
      [add(fc[0], [0, 0.2, -0.05]), fc[0], fc[1], fc[2]],
      ["chest", `scap${leg}`, `upper${leg}`],
      [0, 0.12, 0.1, 0],
    );
    b.bone(shoulder);
    const mid = mix(fc[0], fc[1], 0.55);
    b.push().translate(side * 0.2, mid[1] - 0.03, mid[2] - 0.01);
    b.rotateX(-0.5);
    ellipsoid(b, [0, 0, 0], [0.105, 0.29, 0.17], {
      segments: 16,
      rings: 10,
      gloss: GLOSS.coat,
      paint: () => C.coat,
    });
    b.pop();
    const hind = side > 0 ? "HL" : "HR";
    const hc = LEG_CHAIN[hind];
    const haunch = region(
      [add(hc[0], [0, 0.3, 0]), hc[0], hc[1], hc[2]],
      ["hips", `thigh${hind}`, `gaskin${hind}`],
      [0, 0.16, 0.1, 0],
    );
    b.bone(haunch);
    b.color(C.coat, GLOSS.coat);
    b.push().translate(side * 0.16, 1.06, -0.5);
    b.rotateX(-0.3);
    ellipsoid(b, [0, 0, 0], [0.15, 0.33, 0.27], {
      segments: 18,
      rings: 10,
      gloss: GLOSS.coat,
      paint: () => C.coat,
    });
    b.pop();
  }
}

// --- Tail ------------------------------------------------------------------------------------------

function buildTail(b: GeometryBuilder) {
  const pts: V3[] = [JOINT.tail1, JOINT.tail2, JOINT.tail3, [0, 0.6, -1.0]];
  const reg = region(pts, ["tail1", "tail2", "tail3"], [0, 0.1, 0.12, 0]);
  b.bone(reg);
  // Dock in the coat, then the hair: full in the middle, a point at the end.
  const path: V3[] = [];
  for (let i = 0; i <= 16; i++) {
    const k = i / 16;
    const x = k * 3;
    const s = Math.min(2, Math.floor(x));
    path.push(mix(pts[s], pts[s + 1], x - s));
  }
  b.color(C.mane, GLOSS.hair);
  sweep(
    b,
    path,
    (k) =>
      k < 0.08
        ? lerp(0.05, 0.065, k / 0.08)
        : k < 0.55
          ? lerp(0.065, 0.112, smooth(0.08, 0.55, k))
          : lerp(0.112, 0.012, smooth(0.55, 1, k)),
    {
      segments: 14,
      gloss: GLOSS.hair,
      paint: (out, k) =>
        k < 0.07 ? C.coat : Math.sin(Math.atan2(out[0], out[2]) * 5) > 0.3 ? C.maneLight : C.mane,
    },
  );
}

// --- Tack ------------------------------------------------------------------------------------------

function buildTack(b: GeometryBuilder) {
  b.bone(hb("spine"));
  const us = range(-1.82, 1.82, 30);
  const vs = range(-0.37, 0.34, 12);
  // Saddle blanket: oxblood with a pewter trim band along its edges.
  slab(
    b,
    us,
    vs,
    (a, z) => trunkPoint(a, z, 0.024),
    (a, z) => trunkPoint(a, z, 0.004),
    {
      inside: C.blanket,
      edge: C.trim,
      gloss: 0.02,
      paint: (a, z) => (Math.abs(a) > 1.66 || z < -0.33 || z > 0.3 ? C.trim : C.blanket),
    },
  );
  // Saddle seat: a dished leather shell rising to the pommel and the cantle.
  const seat = (a: number, z: number, base: number) => {
    const rise = 0.075 * smooth(0.14, 0.3, z) + 0.085 * smooth(-0.12, -0.27, z);
    const dish = base + rise * (1 - smooth(0.55, 1.0, Math.abs(a)));
    return trunkPoint(a, z, dish);
  };
  slab(
    b,
    range(-1.02, 1.02, 18),
    range(-0.27, 0.31, 14),
    (a, z) => seat(a, z, 0.068),
    (a, z) => seat(a, z, 0.026),
    { inside: C.leatherDark, edge: C.leatherDark, gloss: GLOSS.leather, paint: () => C.leather },
  );
  // Welt along the seat's edge.
  b.color(C.leatherLight, GLOSS.leather);
  for (const z of [-0.265])
    sweep(
      b,
      range(-0.9, 0.9, 14).map((a) => seat(a, z, 0.062)),
      () => 0.014,
      { segments: 6 },
    );
  // Pommel arch and the horn.
  b.color(C.leatherDark, GLOSS.leather);
  sweep(
    b,
    range(-0.95, 0.95, 14).map((a) => seat(a, 0.3, 0.06)),
    () => 0.022,
    { segments: 8 },
  );
  b.color(C.leather, GLOSS.leather);
  const horn = seat(0, 0.27, 0.07);
  tube(
    b,
    [
      { y: horn[1] - 0.02, rx: 0.026, zf: 0.026, x: 0, z: horn[2] },
      { y: horn[1] + 0.045, rx: 0.02, zf: 0.02, x: 0, z: horn[2] + 0.008 },
      { y: horn[1] + 0.06, rx: 0.036, zf: 0.034, x: 0, z: horn[2] + 0.012 },
    ],
    { capTop: 0.012, segments: 12 },
  );
  // Flaps hanging over the blanket on both sides, rounded at the bottom.
  for (const side of [1, -1]) {
    const flap = (u: number, v: number, off: number) => {
      const a = side * lerp(0.95, 1.72, v);
      const round = 0.06 * smooth(0.6, 1, v);
      const z = lerp(-0.12 + round, 0.25 - round * 0.6, u);
      return trunkPoint(a, z, off);
    };
    slab(
      b,
      range(0, 1, 8),
      range(0, 1, 10),
      (u, v) => flap(u, v, 0.05),
      (u, v) => flap(u, v, 0.036),
      { inside: C.leatherDark, edge: C.leatherDark, gloss: GLOSS.leather, paint: () => C.leather },
    );
    // Girth strap under the belly, with a buckle.
    b.color(C.leatherDark, GLOSS.leather);
    const girth = range(side * 1.62, side * Math.PI, 12).map((a) => trunkPoint(a, 0.2, 0.012));
    sweep(b, girth, () => 0.022, { segments: 6 });
    b.color(C.buckle, GLOSS.steel);
    const bk = trunkPoint(side * 1.72, 0.2, 0.03);
    disc(b, bk, [side, 0, 0], 0.03, 8, 0.024);
    // Stirrup leather and iron.
    const top = trunkPoint(side * 0.98, 0.1, 0.058);
    const st: V3 = [side * STIRRUP[0], STIRRUP[1], STIRRUP[2]];
    const eye: V3 = [st[0], st[1] + 0.12, st[2]];
    b.color(C.leatherDark, GLOSS.leather);
    const mid = trunkPoint(side * 1.45, 0.08, 0.065);
    sweep(b, [top, mix(top, mid, 0.5), mid, mix(mid, eye, 0.5), eye], () => 0.012, { segments: 6 });
    b.color(C.steel, GLOSS.steel);
    const arch: V3[] = range(0, Math.PI, 10).map((t) => [
      st[0] + Math.cos(t) * 0.058,
      st[1] + 0.008 + Math.sin(t) * 0.11,
      st[2],
    ]);
    sweep(b, arch, () => 0.011, { segments: 6 });
    b.push().translate(st[0], st[1], st[2]);
    b.roundedBox(0.13, 0.016, 0.06, 0.006, 1);
    b.pop();
  }
}

function buildBridle(b: GeometryBuilder) {
  b.bone(hb("head"));
  b.color(C.leatherDark, GLOSS.leather);
  const strap = (pts: V3[]) => sweep(b, pts, () => 0.011, { segments: 6 });
  // Noseband all the way round.
  strap(range(-Math.PI, Math.PI, 24).map((a) => headPoint(0.68, a, 0.012)));
  // Browband across the forehead below the ears.
  strap(range(-1.3, 1.3, 10).map((a) => headPoint(0.1, a, 0.012)));
  // Crownpiece behind the ears, down each cheek to the bit; throatlatch round the jowl.
  for (const side of [1, -1]) {
    const cheek = range(0.035, 0.84, 14).map((s) =>
      headPoint(s, side * lerp(1.42, 1.55, smooth(0.5, 0.84, s)), 0.012),
    );
    strap(cheek);
    strap(range(0, 0.6, 6).map((k) => headPoint(0.035, side * k * 2.37, 0.014)));
    strap(
      range(0, 1, 8).map((k) => headPoint(0.05 + 0.05 * k, side * lerp(1.42, Math.PI, k), 0.012)),
    );
    b.color(C.buckle, GLOSS.steel);
    const rosette = headPoint(0.1, side * 1.3, 0.016);
    disc(b, rosette, sub(rosette, headCentre(0.1)), 0.02, 8);
    // Bit ring at the corner of the mouth.
    b.color(C.steel, GLOSS.steel);
    const ring: V3 = [side * BIT[0], BIT[1], BIT[2]];
    const ringPts = range(0, Math.PI * 2, 12).map((t) =>
      add(ring, add(mul(HEAD_AXIS, Math.cos(t) * 0.026), mul(HEAD_UP, Math.sin(t) * 0.026))),
    );
    sweep(b, ringPts, () => 0.006, { segments: 6, closed: true });
    b.color(C.leatherDark, GLOSS.leather);
  }
}

// Reins from the bit rings along the neck to the rider's hands (the reins bone), one loop.
function buildReins(b: GeometryBuilder) {
  for (const side of [1, -1]) {
    const bit: V3 = [side * (BIT[0] + 0.01), BIT[1], BIT[2]];
    const hand: V3 = [side * 0.035, JOINT.reins[1], JOINT.reins[2]];
    const n1 = neckPoint(0.82, side * 1.05, 0.03);
    const n2 = neckPoint(0.5, side * 0.95, 0.035);
    const n3 = neckPoint(0.18, side * 0.7, 0.04);
    const path = [bit, n1, n2, n3, hand];
    const reg = region(path, ["head", "neck2", "neck1", "reins"], [0, 0.12, 0.12, 0.12, 0]);
    b.bone(reg);
    b.color(C.leatherDark, GLOSS.leather);
    const fine: V3[] = [];
    for (let i = 0; i < path.length - 1; i++) {
      for (let k = 0; k < 4; k++) fine.push(mix(path[i], path[i + 1], k / 4));
    }
    fine.push(hand);
    sweep(b, fine, () => 0.0095, { segments: 6 });
  }
  b.bone(hb("reins"));
  b.color(C.leatherDark, GLOSS.leather);
  const hand = JOINT.reins;
  sweep(
    b,
    range(-1, 1, 6).map((k) => [k * 0.035, hand[1] - 0.012 * (1 - k * k), hand[2]] as V3),
    () => 0.0095,
    { segments: 6 },
  );
}

export function buildHorse(): GeometryData {
  chains.length = 0;
  const b = new GeometryBuilder();
  buildTrunk(b);
  const neck = buildNeck(b);
  buildHead(b);
  buildEars(b);
  buildMane(b, neck);
  buildMuscles(b);
  for (const leg of LEG_NAMES) buildLeg(b, leg);
  buildTail(b);
  buildTack(b);
  buildBridle(b);
  buildReins(b);
  const g = b.build();
  resolveRegions(g);
  return g;
}
