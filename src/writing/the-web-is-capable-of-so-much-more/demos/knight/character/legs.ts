import type { GeometryBuilder } from "../engine/geometry";
import { JOINT, REGION, bone } from "./rig";
import { COLOR, GLOSS } from "./palette";
import {
  ellipsoid,
  inset,
  lerp,
  range,
  sectionPoint,
  slab,
  sweep,
  tube,
  type Section,
} from "./shapes";

type Side = 1 | -1;
const SIDES: Side[] = [1, -1];
const sideName = (s: Side) => (s === 1 ? "L" : "R");

// Thigh sections of the trousers, bottom to top. Full through the thigh so the legs carry the
// armoured upper body, leaning out a little toward the knee and staying inside the skirt and belt
// up top, so a planted leg never pokes through the tunic.
function thighRows(s: Side): Section[] {
  const x = JOINT[`thigh${sideName(s)}`][0];
  return [
    { y: 0.34, rx: 0.052, zf: 0.056, zb: 0.056, x },
    { y: 0.44, rx: 0.062, zf: 0.066, zb: 0.064, x },
    { y: 0.52, rx: 0.07, zf: 0.074, zb: 0.074, x },
    { y: 0.62, rx: 0.083, zf: 0.087, zb: 0.088, x: x + s * 0.003 },
    { y: 0.72, rx: 0.089, zf: 0.094, zb: 0.1, x: x + s * 0.004 },
    { y: 0.8, rx: 0.088, zf: 0.096, zb: 0.104, x },
    { y: 0.86, rx: 0.081, zf: 0.092, zb: 0.102, x: x - s * 0.008 },
    { y: 0.92, rx: 0.07, zf: 0.085, zb: 0.095, x: x - s * 0.022 },
  ];
}

function sectionAt(rows: Section[], y: number): Section {
  let i = 0;
  while (i < rows.length - 2 && rows[i + 1].y < y) i++;
  const a = rows[i],
    c = rows[i + 1];
  const k = Math.max(0, Math.min(1, (y - a.y) / (c.y - a.y)));
  return {
    ...a,
    y,
    rx: lerp(a.rx, c.rx, k),
    zf: lerp(a.zf, c.zf, k),
    zb: lerp(a.zb ?? a.zf, c.zb ?? c.zf, k),
    x: lerp(a.x ?? 0, c.x ?? 0, k),
    z: lerp(a.z ?? 0, c.z ?? 0, k),
  };
}

// Fitted dark trousers from under the tunic into the boots, bending smoothly at hip and knee.
function trousers(b: GeometryBuilder) {
  // The seat fills the crotch between the legs, seen through the tunic's front slit.
  b.bone(bone("pelvis")).color(COLOR.trousers);
  tube(
    b,
    [
      { y: 0.8, rx: 0.135, zf: 0.09, zb: 0.1, z: -0.005 },
      { y: 0.97, rx: 0.15, zf: 0.105, zb: 0.112, z: -0.005 },
    ],
    { capBottom: 0.05, capTop: 0.02, segments: 20 },
  );
  for (const s of SIDES) {
    b.bone(REGION[`leg${sideName(s)}`]).color(COLOR.trousers);
    tube(b, thighRows(s), { capTop: 0.025, segments: 18 });
  }
}

// Rounded riding boot: a chunky soft toe and heel on a dark sole, and a shaft that swells over the
// calf, tapers into the ankle and ends under the knee in a rolled edge. Below the ankle it follows the foot, above it the
// shin.
function bootSections(x: number): Section[] {
  const at = (y: number, rx: number, zf: number, zb: number, z: number): Section => ({
    y,
    rx,
    zf,
    zb,
    x,
    z,
    n: 2.3,
  });
  return [
    at(0.026, 0.058, 0.186, 0.124, 0.032),
    at(0.06, 0.06, 0.18, 0.122, 0.03),
    at(0.095, 0.058, 0.15, 0.112, 0.026),
    at(0.122, 0.056, 0.104, 0.098, 0.018),
    at(0.16, 0.052, 0.066, 0.072, 0.006),
    at(0.22, 0.053, 0.062, 0.07, 0.002),
    at(0.28, 0.062, 0.067, 0.08, 0),
    at(0.33, 0.067, 0.07, 0.087, 0),
    at(0.385, 0.064, 0.069, 0.08, 0),
    at(0.42, 0.064, 0.068, 0.074, 0),
  ];
}
const SHAFT_FROM = 4;

// The boot shaft's section at height y (held at the top row above the boot).
const shaftAt = (rows: Section[], y: number) => sectionAt(rows.slice(SHAFT_FROM), y);

function boots(b: GeometryBuilder) {
  for (const s of SIDES) {
    const n = sideName(s);
    const x = JOINT[`foot${n}`][0] + s * 0.004;
    b.bone(bone(`foot${n}`)).color(COLOR.sole);
    // The sole, a little proud of the upper all round.
    tube(
      b,
      [
        { y: 0.0, rx: 0.062, zf: 0.19, zb: 0.13, x, z: 0.032, n: 2.3 },
        { y: 0.028, rx: 0.064, zf: 0.194, zb: 0.132, x, z: 0.032, n: 2.3 },
      ],
      { capBottom: 0.004, capSteps: 1, capTop: 0.004, segments: 24 },
    );
    const rows = bootSections(x);
    b.bone(REGION[`boot${n}`]).color(COLOR.leatherDark, GLOSS.leather);
    tube(b, rows, { segments: 24, capTop: 0.02, capSteps: 2 });
    // Rolled top edge, a step lighter.
    b.bone(bone(`shin${n}`)).color(COLOR.leather, GLOSS.leather);
    const top = rows[rows.length - 1];
    sweep(
      b,
      range(0, 1, 32)
        .slice(0, -1)
        .map((t) => sectionPoint({ ...top, y: top.y - 0.002 }, t)),
      () => 0.0065,
      { closed: true, segments: 8 },
    );
  }
}

// Blackened steel greave hugging the front of each shin, following the calf's swell and tapering
// into the ankle, its top edge arching up under a rounded knee cop. Only the greave's top edge is
// silver; the rest steps down so the leg is not piped like sportswear.
function greaves(b: GeometryBuilder) {
  for (const s of SIDES) {
    const n = sideName(s);
    const x = JOINT[`foot${n}`][0] + s * 0.004;
    const rows = bootSections(x);
    b.bone(bone(`shin${n}`)).color(COLOR.steel);
    const bottom = (u: number) => 0.178 + 0.014 * u ** 4;
    const top = (u: number) => 0.398 + 0.042 * Math.max(0, 1 - u * u) ** 0.7;
    // A soft ridge down the middle of the shin catches the light like a keel, and the plate swells
    // a little more over the calf.
    const point = (u: number, v: number, lift: number) => {
      const y = lerp(bottom(u), top(u), v);
      const wrap =
        0.19 +
        0.09 * Math.min(1, (y - 0.178) / 0.26) +
        0.02 * Math.exp(-(((y - 0.31) / 0.06) ** 2));
      const swell = 0.003 * Math.exp(-(((y - 0.31) / 0.07) ** 2));
      return sectionPoint(
        inset(shaftAt(rows, y), -lift - swell - 0.006 * Math.exp(-((u / 0.3) ** 2))),
        u * wrap,
      );
    };
    slab(
      b,
      range(-1, 1, 16),
      [...range(0, 0.95, 11), 1],
      (u, v) => point(u, v, 0.005),
      (u, v) => point(u, v, -0.001),
      {
        inside: COLOR.steelInside,
        edge: COLOR.steelDark,
        edges: { v1: [COLOR.silver, GLOSS.silver] },
        gloss: GLOSS.steel,
        paint: (_u, v) => (v > 0.95 ? [COLOR.silver, GLOSS.silver] : COLOR.steel),
      },
    );
  }
}

// Cuisses: a steel plate over the front of each thigh, from under the tunic down to just above the
// knee cop, dipping a little at the middle of its lower edge, which is a step lighter. Rigid on
// the thigh, like the knee cop.
function cuisses(b: GeometryBuilder) {
  for (const s of SIDES) {
    const n = sideName(s);
    const rows = thighRows(s);
    b.bone(bone(`thigh${n}`)).color(COLOR.steel);
    const bottom = (u: number) => 0.532 - 0.012 * Math.max(0, 1 - u * u);
    const top = 0.78;
    const point = (u: number, v: number, lift: number) => {
      const y = lerp(bottom(u), top, v);
      const wrap = 0.16 - 0.025 * v;
      return sectionPoint(
        inset(sectionAt(rows, y), -lift - 0.004 * Math.exp(-((u / 0.35) ** 2))),
        u * wrap,
      );
    };
    slab(
      b,
      range(-1, 1, 14),
      [0, 0.07, ...range(0.15, 1, 7)],
      (u, v) => point(u, v, 0.009),
      (u, v) => point(u, v, 0.001),
      {
        inside: COLOR.steelInside,
        edge: COLOR.steelDark,
        edges: { v0: COLOR.steelLight },
        gloss: GLOSS.steel,
        paint: (_u, v) => (v < 0.07 ? COLOR.steelLight : COLOR.steel),
      },
    );
  }
}

// The knee cop rides the thigh so it stays over the kneecap however far the shin swings: one
// smooth dome, matte, with a painted crescent glint along its top edge.
function kneeCops(b: GeometryBuilder) {
  for (const s of SIDES) {
    const n = sideName(s);
    const k = JOINT[`shin${n}`];
    b.bone(bone(`thigh${n}`));
    ellipsoid(b, [k[0], k[1] - 0.008, k[2] + 0.036], [0.072, 0.062, 0.05], {
      segments: 20,
      rings: 12,
      paint: (th, ph) =>
        ph > 0.5 && ph < 0.92 && Math.abs(th) < 1.0 ? COLOR.steelGlint : COLOR.steel,
    });
  }
}

export function buildLegs(b: GeometryBuilder) {
  trousers(b);
  boots(b);
  greaves(b);
  cuisses(b);
  kneeCops(b);
}
