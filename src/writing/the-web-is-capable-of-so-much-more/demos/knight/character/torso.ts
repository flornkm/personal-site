import type { GeometryBuilder } from "../engine/geometry";
import { REGION, bone } from "./rig";
import { COLOR, GLOSS } from "./palette";
import {
  add,
  cross,
  ellipsoid,
  lerp,
  mul,
  norm,
  range,
  sectionPoint,
  shell,
  sub,
  surface,
  surfaceToward,
  tube,
  type Section,
  type V3,
} from "./shapes";
import { SCABBARD_STRAP } from "./weapon";

// Blackened steel cuirass: a narrow waist and a full rounded chest with a soft keel down the
// front. It bends with the spine and is pelvis-bound at the lip so it never parts from the belt.
const CUIRASS: Section[] = [
  { y: 0.972, rx: 0.168, zf: 0.126, zb: 0.122 },
  { y: 0.99, rx: 0.164, zf: 0.122, zb: 0.118 },
  { y: 1.0, rx: 0.157, zf: 0.115, zb: 0.111 },
  { y: 1.045, rx: 0.152, zf: 0.112, zb: 0.104 },
  { y: 1.12, rx: 0.168, zf: 0.13, zb: 0.108, keel: 0.01 },
  { y: 1.2, rx: 0.185, zf: 0.142, zb: 0.114, keel: 0.014 },
  { y: 1.28, rx: 0.19, zf: 0.134, zb: 0.114, keel: 0.01 },
  { y: 1.33, rx: 0.18, zf: 0.116, zb: 0.106, keel: 0.006 },
  { y: 1.365, rx: 0.142, zf: 0.094, zb: 0.092 },
  { y: 1.372, rx: 0.13, zf: 0.088, zb: 0.088 },
  { y: 1.384, rx: 0.1, zf: 0.076, zb: 0.078 },
].map((s): Section => Object.assign(s, { n: 2.25 }));

// No gloss on the plate itself: a painted spindle of lighter steel down the keel, widest on the
// upper chest and fading out at the waist and under the gorget, reads as the toon reflection of a
// rounded breastplate. The lip above the belt stays plain steel; the brown belt separates them.
function cuirass(b: GeometryBuilder) {
  b.bone(REGION.torso).color(COLOR.steel);
  tube(b, CUIRASS, { segments: 28, capBottom: 0.01, capSteps: 1 });
}

const GLINT = { lo: 1.02, peak: 1.24, hi: 1.335, half: 0.03, lift: 0.0015 };

function chestGlint(b: GeometryBuilder) {
  const w = (y: number) =>
    y < GLINT.peak
      ? GLINT.half * Math.sin(((Math.PI / 2) * (y - GLINT.lo)) / (GLINT.peak - GLINT.lo)) ** 1.3
      : GLINT.half *
        Math.max(0, Math.sin(((Math.PI / 2) * (GLINT.hi - y)) / (GLINT.hi - GLINT.peak))) ** 0.8;
  b.bone(REGION.torso).color(COLOR.steelLight);
  surface(b, range(-1, 1, 6), range(GLINT.lo, GLINT.hi, 20), (u, y) =>
    onCuirass(u * w(y), y, GLINT.lift),
  );
}

// A steel gorget in two lames. The upper one rides the neck up under the helm's rim and overlaps
// the lower one, which flares over the top of the cuirass like a collar, so the helm sits on a
// believable base instead of a stalk. The upper lame's rolled lower edge is the only light line.
const GORGET_UPPER: Section[] = [
  { y: 1.378, rx: 0.138, zf: 0.118, zb: 0.112 },
  { y: 1.385, rx: 0.133, zf: 0.115, zb: 0.11 },
  { y: 1.405, rx: 0.1, zf: 0.094, zb: 0.094 },
  { y: 1.438, rx: 0.084, zf: 0.08, zb: 0.084 },
].map((s): Section => Object.assign(s, { z: -0.006, n: 2.2 }));
const GORGET_LOWER: Section[] = [
  { y: 1.345, rx: 0.172, zf: 0.128, zb: 0.12 },
  { y: 1.352, rx: 0.168, zf: 0.127, zb: 0.118 },
  { y: 1.372, rx: 0.14, zf: 0.112, zb: 0.106 },
  { y: 1.396, rx: 0.108, zf: 0.092, zb: 0.092 },
].map((s): Section => Object.assign(s, { z: -0.006, n: 2.2 }));

function gorget(b: GeometryBuilder) {
  const lame = (rows: Section[], lit: boolean) =>
    shell(b, rows, {
      thick: 0.006,
      inside: COLOR.steelInside,
      edge: COLOR.steelDark,
      rimTop: true,
      segments: 32,
      paint: (_t, _y, row) => (lit && row === 0 ? COLOR.steelLight : COLOR.steel),
    });
  b.bone(bone("chest")).color(COLOR.steel);
  lame(GORGET_LOWER, false);
  b.bone(REGION.neck).color(COLOR.steel);
  lame(GORGET_UPPER, true);
}

// The gambeson's padded coif, filling the neck under the helm: only seen as shadow in the gaps.
function neck(b: GeometryBuilder) {
  b.bone(REGION.neck).color(COLOR.steelInside);
  tube(
    b,
    [
      { y: 1.34, rx: 0.06, zf: 0.058, zb: 0.058, z: -0.008 },
      { y: 1.52, rx: 0.054, zf: 0.052, zb: 0.054, z: -0.008 },
    ],
    { segments: 16 },
  );
}

// Leather belt with a pewter buckle over the cuirass's lip; its lower edge flares out over the
// tunic skirt, which is tucked well up under it.
const BELT: Section[] = [
  { y: 0.918, rx: 0.176, zf: 0.134, zb: 0.132 },
  { y: 0.926, rx: 0.181, zf: 0.138, zb: 0.136 },
  { y: 0.966, rx: 0.177, zf: 0.135, zb: 0.133 },
  { y: 0.976, rx: 0.17, zf: 0.128, zb: 0.126 },
].map((s): Section => Object.assign(s, { n: 2.25 }));

function belt(b: GeometryBuilder) {
  b.bone(bone("pelvis")).color(COLOR.leather, GLOSS.leather);
  tube(b, BELT, { segments: 28 });
  b.color(COLOR.buckle, GLOSS.silver);
  b.push().translate(0, 0.946, 0.14).roundedBox(0.062, 0.05, 0.014, 0.008, 2).pop();
  b.color(COLOR.leatherDark);
  b.push().translate(0, 0.946, 0.147).roundedBox(0.03, 0.022, 0.004, 0.003, 1).pop();
}

// Tunic skirt split front and back, each half carried by its thigh toward the hem, with an oxblood
// hem band. Same section shape and count as the belt, so where it disappears under
// the belt the two never cross.
const SKIRT: Section[] = [
  { y: 0.68, rx: 0.226, zf: 0.17, zb: 0.178 },
  { y: 0.698, rx: 0.224, zf: 0.168, zb: 0.176 },
  { y: 0.716, rx: 0.222, zf: 0.166, zb: 0.174 },
  { y: 0.79, rx: 0.21, zf: 0.156, zb: 0.164 },
  { y: 0.86, rx: 0.194, zf: 0.144, zb: 0.152 },
  { y: 0.9, rx: 0.182, zf: 0.134, zb: 0.14 },
  { y: 0.935, rx: 0.16, zf: 0.118, zb: 0.116 },
].map((s): Section => Object.assign(s, { n: 2.25 }));

function skirt(b: GeometryBuilder) {
  for (const [region, from, to] of [
    [REGION.skirtL, 0.012, 0.488],
    [REGION.skirtR, 0.512, 0.988],
  ] as const) {
    b.bone(region).color(COLOR.cloth);
    shell(b, SKIRT, {
      from,
      to,
      segments: 28,
      thick: 0.01,
      inside: COLOR.clothInside,
      edge: COLOR.clothFold,
      paint: (_t, y) => (y < 0.716 ? COLOR.heraldic : COLOR.cloth),
    });
  }
}

// The cuirass's section at height y, interpolated between its rows.
function cuirassAt(y: number): Section {
  let i = 0;
  while (i < CUIRASS.length - 2 && CUIRASS[i + 1].y < y) i++;
  const a = CUIRASS[i],
    c = CUIRASS[i + 1];
  const k = Math.max(0, Math.min(1, (y - a.y) / (c.y - a.y)));
  return {
    y,
    rx: lerp(a.rx, c.rx, k),
    zf: lerp(a.zf, c.zf, k),
    zb: lerp(a.zb ?? a.zf, c.zb ?? c.zf, k),
    keel: lerp(a.keel ?? 0, c.keel ?? 0, k),
    n: a.n,
  };
}

// A point on the cuirass's front at front-view (x, y), lifted along its normal.
function onCuirass(x: number, y: number, lift: number): V3 {
  const sec = cuirassAt(y);
  // The front half of the section, found by bisecting on x.
  let lo = -0.25,
    hi = 0.25;
  for (let j = 0; j < 30; j++) {
    const m = (lo + hi) / 2;
    if (sectionPoint(sec, m)[0] < x) lo = m;
    else hi = m;
  }
  const t = (lo + hi) / 2;
  const p = sectionPoint(sec, t);
  const side = sub(sectionPoint(sec, t + 0.002), sectionPoint(sec, t - 0.002));
  const n = norm([-side[2], 0, side[0]]);
  return add(p, mul(n, lift));
}

// The cuirass straight out from the body's axis toward p (keel ignored, so sides and back only),
// lifted along its normal.
function onTorso(p: V3, lift: number): V3 {
  const s = cuirassAt(p[1]);
  const n = s.n ?? 2;
  const d = p[2] >= 0 ? s.zf : (s.zb ?? s.zf);
  const l = Math.hypot(p[0], p[2]) || 1;
  const dx = p[0] / l,
    dz = p[2] / l;
  const r = (Math.abs(dx / s.rx) ** n + Math.abs(dz / d) ** n) ** (-1 / n);
  const x = dx * r,
    z = dz * r;
  const g = norm([
    (Math.sign(x) * Math.abs(x / s.rx) ** (n - 1)) / s.rx,
    0,
    (Math.sign(z) * Math.abs(z / d) ** (n - 1)) / d,
  ]);
  return add([x, p[1], z], mul(g, lift));
}

const STRAP = { half: 0.022, lift: 0.006 };

// The baldric: from over the right shoulder diagonally across the chest to the left hip, with a
// pewter buckle over the heart.
function baldricFront(b: GeometryBuilder) {
  const from: [number, number] = [-0.118, 1.37],
    to: [number, number] = [0.16, 0.995];
  const dx = to[0] - from[0],
    dy = to[1] - from[1];
  const l = Math.hypot(dx, dy);
  const across: [number, number] = [-dy / l, dx / l];
  const at = (k: number, w: number, lift: number) =>
    onCuirass(
      from[0] + dx * k + across[0] * STRAP.half * w,
      from[1] + dy * k + across[1] * STRAP.half * w,
      lift,
    );
  b.color(COLOR.leather, GLOSS.leather);
  surface(b, range(0, 1, 24), [-1, 1], (k, w) => at(k, w, STRAP.lift));
  b.color(COLOR.leatherLight);
  for (const w of [-1, 1])
    surface(b, range(0, 1, 24), [0, 1], (k, v) => at(k, w, STRAP.lift * v), { flip: w === 1 });
  b.color(COLOR.buckle, GLOSS.silver);
  const c = at(0.42, 0, 0.01);
  ellipsoid(b, c, [0.02, 0.024, 0.008], { segments: 12, rings: 6 });
}

// Uniform Catmull-Rom through 3D points, s from 0 to 1.
function spline(pts: V3[], s: number): V3 {
  const n = pts.length - 1;
  const f = Math.min(n - 1e-9, Math.max(0, s * n));
  const i = Math.floor(f),
    t = f - i;
  const p0 = pts[Math.max(0, i - 1)],
    p1 = pts[i],
    p2 = pts[i + 1],
    p3 = pts[Math.min(n, i + 2)];
  const t2 = t * t,
    t3 = t2 * t;
  return [0, 1, 2].map(
    (k) =>
      0.5 *
      (2 * p1[k] +
        (p2[k] - p0[k]) * t +
        (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
        (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t3),
  ) as V3;
}

// The rest of the baldric: on from the left hip round the side, then up the back under the
// scabbard (whose loops it carries) to the right shoulder.
function baldricBack(b: GeometryBuilder) {
  const [mid, throat] = SCABBARD_STRAP;
  const guide: V3[] = [
    [0.13, 1.035, 0.1],
    [0.16, 1.0, 0.05],
    [0.168, 0.99, -0.03],
    [0.13, 0.997, -0.1],
    [0.1, 1.008, -0.12],
    mid,
    throat,
    [-0.105, 1.345, -0.08],
  ];
  const n = 40;
  const centre: V3[] = [];
  const normal: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const p = onTorso(spline(guide, i / n), 0);
    centre.push(p);
    normal.push(norm(sub(onTorso(p, 0.01), p)));
  }
  const across = centre.map((_, i) => {
    const along = sub(centre[Math.min(n, i + 1)], centre[Math.max(0, i - 1)]);
    return norm(cross(normal[i], along));
  });
  const at = (k: number, w: number, lift: number) =>
    onTorso(add(centre[k], mul(across[k], STRAP.half * w)), lift);
  const ks = range(0, n, n);
  // Slightly lower than the front strap where the two overlap at the hip.
  const lift = STRAP.lift - 0.0008;
  b.color(COLOR.leather, GLOSS.leather);
  surfaceToward(b, ks, [-1, 1], (k, w) => at(k, w, lift), normal[n >> 1]);
  // Dark edges: where the strap bends round the hip, light ones would catch the sun as a wedge.
  b.color(COLOR.leatherDark);
  for (const w of [-1, 1]) {
    surfaceToward(b, ks, [0, 1], (k, v) => at(k, w, lift * v), mul(across[n >> 1], w));
  }
}

export function buildTorso(b: GeometryBuilder) {
  neck(b);
  cuirass(b);
  chestGlint(b);
  gorget(b);
  belt(b);
  skirt(b);
  b.bone(REGION.torso);
  baldricFront(b);
  baldricBack(b);
}
