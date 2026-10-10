import type { GeometryBuilder } from "../engine/geometry";
import { JOINT, bone } from "./rig";
import { COLOR, GLOSS, rgb } from "./palette";
import {
  add,
  cross,
  disc,
  ellipsoid,
  inset,
  lerp,
  mul,
  norm,
  range,
  sectionPoint,
  slab,
  smooth,
  sub,
  surface,
  sweep,
  tube,
  tubeRows,
  type Section,
  type V3,
} from "./shapes";

// A closed helm in blackened steel, the knight's whole head: a smooth egg (no face, no hair) with a
// visor across the front: a bevor with a keel and breath slots, a brow plate whose lower edge
// overhangs a long thin eye slit, pivot bosses at the temples, a low comb over the crown, a silver
// rim and a short wine-red plume on the accessory bone, which the animator makes trail the head.
// The dome is matte (a round glint on it reads as an eye) and fades up to a lighter steel at the
// crown, the sky reflected in it; the comb and keel carry the glints as streaks. Rigid on the head
// bone; the steel gorget fills the neck underneath.
const HELM: Section[] = [
  { y: 1.432, rx: 0.098, zf: 0.112, zb: 0.118 },
  { y: 1.445, rx: 0.102, zf: 0.118, zb: 0.122, keel: 0.004 },
  { y: 1.49, rx: 0.118, zf: 0.136, zb: 0.134, keel: 0.012 },
  { y: 1.545, rx: 0.13, zf: 0.146, zb: 0.14, keel: 0.012 },
  { y: 1.6, rx: 0.136, zf: 0.147, zb: 0.142, keel: 0.006 },
  { y: 1.65, rx: 0.134, zf: 0.14, zb: 0.139 },
  { y: 1.69, rx: 0.122, zf: 0.126, zb: 0.128 },
  { y: 1.72, rx: 0.1, zf: 0.102, zb: 0.106 },
  { y: 1.74, rx: 0.072, zf: 0.072, zb: 0.076 },
].map((s): Section => Object.assign(s, { n: 2.2 }));
const CAP = 0.018;

// The visor: a bevor up to the eye slit and a brow plate over it, together one rounded
// shield-shaped plate standing proud of the shell. `t` is the around-parameter (0 = straight
// ahead). The slit sits a little above the helm's widest point, long and thin with squared ends,
// and the brow's lower edge juts out over it so it reads as a shadowed groove, not a mouth.
const VISOR = { t: 0.17, lift: 0.008, mid: 1.605, chin: 1.452, brow: 1.652, overhang: 0.008 };
const SLIT = { t: 0.13, half: 0.0085 };
const slitHalf = (t: number) => {
  const s = Math.abs(t) / SLIT.t;
  return s >= 1 ? 0 : SLIT.half * Math.sqrt(1 - s ** 8);
};
// The dark band of shell seen through the slit, between two extra rows.
const SLIT_BAND = { lo: 1.585, hi: 1.625 };

const HELM_INK = { slit: 0x0b0c0f };
const PLUME = { base: 0x6e2129, shade: 0x4a151b };

function helmAt(y: number): Section {
  let i = 0;
  while (i < HELM.length - 2 && HELM[i + 1].y < y) i++;
  const a = HELM[i],
    c = HELM[i + 1];
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

const around = (t: number) => Math.min(Math.abs(t), Math.abs(1 - t));

// The helm surface at (t, y) pushed out along the section by `lift`.
const onHelm = (t: number, y: number, lift: number) => sectionPoint(inset(helmAt(y), -lift), t);

// Outward normal of the helm at (t, y), from finite differences.
function helmNormal(t: number, y: number): V3 {
  const du = sub(onHelm(t + 0.002, y, 0), onHelm(t - 0.002, y, 0));
  const dv = sub(onHelm(t, y + 0.002, 0), onHelm(t, y - 0.002, 0));
  return norm(cross(du, dv));
}

function shell(b: GeometryBuilder) {
  const silver = [COLOR.silver, GLOSS.silver] as const;
  const steel = [COLOR.steel, GLOSS.dome] as const;
  const rows = [...HELM, helmAt(SLIT_BAND.lo), helmAt(SLIT_BAND.hi)].sort((p, q) => p.y - q.y);
  tube(b, rows, {
    segments: 40,
    capTop: CAP,
    capSteps: 4,
    paint: (t, y, row) => {
      if (row === 0) return silver;
      if (y > SLIT_BAND.lo && y < SLIT_BAND.hi && around(t) < SLIT.t + 0.005) return HELM_INK.slit;
      return steel;
    },
  });
  // The open bottom, dark inside.
  b.color(COLOR.steelInside);
  tube(b, [inset(HELM[0], 0.006), inset(HELM[1], 0.006)], { segments: 40, flip: true });
}

function visor(b: GeometryBuilder) {
  const us = range(-VISOR.t, VISOR.t, 30);
  const side = (t: number) => (t / VISOR.t) ** 2;
  const helm = [COLOR.steel, GLOSS.dome] as const;
  const plate = (
    bottom: (t: number) => number,
    top: (t: number) => number,
    lift: (v: number) => number,
    edges: { v0: number; v1: number },
  ) => {
    const y = (t: number, v: number) => lerp(bottom(t), top(t), v);
    b.color(helm[0], helm[1]);
    slab(
      b,
      us,
      range(0, 1, 6),
      (t, v) => onHelm(t, y(t, v), lift(v)),
      (t, v) => onHelm(t, y(t, v), -0.003),
      { inside: COLOR.steelInside, edge: COLOR.steelLight, edges: edges, gloss: GLOSS.dome },
    );
  };
  // Bevor: its top edge is the slit's lower lip, in shadow.
  plate(
    (t) => VISOR.chin + 0.045 * side(t),
    (t) => VISOR.mid - slitHalf(t),
    () => VISOR.lift,
    { v0: COLOR.steelDark, v1: COLOR.steelDark },
  );
  // Brow plate, thickening toward its lower edge into a little brim over the slit.
  plate(
    (t) => VISOR.mid + slitHalf(t),
    (t) => VISOR.brow - 0.034 * side(t),
    (v) => VISOR.lift + VISOR.overhang * (1 - v) ** 2,
    { v0: COLOR.steelDark, v1: COLOR.steelLight },
  );

  // A rounded keel down the bevor's middle, from under the slit to the chin.
  const keel = range(VISOR.mid - SLIT.half - 0.01, VISOR.chin + 0.004, 12).map((y) =>
    onHelm(0, y, VISOR.lift),
  );
  b.color(COLOR.steel, GLOSS.ridge);
  sweep(b, keel, (k) => 0.0052 * Math.min(1, k / 0.12, (1 - k) / 0.12) ** 0.5 + 0.0012, {
    segments: 10,
  });

  // Breath slots stacked on the right cheek of the bevor, well round from the middle so they read
  // as vents, not features.
  b.color(HELM_INK.slit);
  for (const y of [1.498, 1.517, 1.536]) {
    const t = -0.118;
    disc(b, onHelm(t, y, VISOR.lift + 0.0006), helmNormal(t, y), 0.0095, 12, 0.0032);
  }
}

// The crown's sky sheen: a thin overlay on the shell from above the visor to the top, its colour
// rising from the shell's own steel (so its lower edge is invisible) to a lighter steel.
const SHEEN = { from: 1.65, to: 1.76, lift: 0.0012 };

function crownSheen(b: GeometryBuilder) {
  const rows = tubeRows(
    HELM.filter((s) => s.y >= SHEEN.from),
    { capTop: CAP, capSteps: 4 },
  ).map((s) => inset(s, -SHEEN.lift));
  const lo = rgb(COLOR.steel),
    hi = rgb(COLOR.steelLight);
  const tint = (_t: number, v: number): V3 => {
    const k = smooth(SHEEN.from, SHEEN.to, rows[v].y);
    return [lo[0] + (hi[0] - lo[0]) * k, lo[1] + (hi[1] - lo[1]) * k, lo[2] + (hi[2] - lo[2]) * k];
  };
  b.color(COLOR.steel, GLOSS.dome);
  surface(
    b,
    range(0, 1, 40),
    rows.map((_, i) => i),
    (t, v) => sectionPoint(rows[v], t),
    { closedU: true, tint },
  );
}

// Visor pivots: a round boss on each temple, level with the slit, which gives the helm's profile a
// feature and says the visor hinges.
function pivots(b: GeometryBuilder) {
  b.color(COLOR.steel, GLOSS.dome);
  for (const t of [0.215, 0.785]) {
    const n = helmNormal(t, VISOR.mid);
    const c = onHelm(t, VISOR.mid, 0.001);
    const u = norm(cross(n, [0, 1, 0]));
    const w = cross(n, u);
    b.push().transform(new Float32Array([...u, 0, ...w, 0, ...n, 0, ...c, 1]));
    ellipsoid(b, [0, 0, 0], [0.017, 0.017, 0.007], { segments: 14, rings: 6 });
    b.pop();
  }
}

// A low rounded comb along the midline, from the top of the visor over the crown to the nape.
function comb(b: GeometryBuilder) {
  const front = (y: number): V3 => sectionPoint(helmAt(y), 0);
  const back = (y: number): V3 => sectionPoint(helmAt(y), 0.5);
  const last = HELM[HELM.length - 1];
  const dome = range(0, Math.PI, 12).map(
    (a): V3 => [
      0,
      last.y + CAP * Math.sin(a),
      Math.cos(a) * (Math.cos(a) > 0 ? last.zf : (last.zb ?? last.zf)),
    ],
  );
  const path: V3[] = [
    ...range(VISOR.brow - 0.004, last.y, 4).map(front),
    ...dome.slice(1, -1),
    ...range(last.y, 1.56, 6).map(back),
  ];
  const centre: V3 = [0, 1.6, 0];
  const lifted = path.map((p) => add(p, mul(norm(sub(p, centre)), 0.003)));
  b.color(COLOR.steel, GLOSS.ridge);
  sweep(b, lifted, (k) => 0.0075 * Math.min(1, k / 0.06, (1 - k) / 0.1) ** 0.5 + 0.001, {
    segments: 10,
  });
}

// Horsehair plume: a few tapering tufts rising from a socket on the crown and streaming back.
function plume(b: GeometryBuilder) {
  const o = JOINT.accessory;
  b.bone(bone("accessory"));
  b.color(COLOR.steelDark, GLOSS.steel);
  tube(
    b,
    [
      { y: o[1] - 0.012, rx: 0.016, zf: 0.016, z: o[2] },
      { y: o[1] + 0.014, rx: 0.014, zf: 0.014, z: o[2] },
    ],
    { segments: 12, capTop: 0.006, capSteps: 2 },
  );
  const tufts: { x: number; rise: number; reach: number; r: number }[] = [
    { x: 0, rise: 0.085, reach: 0.25, r: 0.034 },
    { x: 0.014, rise: 0.07, reach: 0.22, r: 0.03 },
    { x: -0.014, rise: 0.07, reach: 0.22, r: 0.03 },
    { x: 0.024, rise: 0.05, reach: 0.17, r: 0.024 },
    { x: -0.024, rise: 0.05, reach: 0.17, r: 0.024 },
  ];
  for (const f of tufts) {
    const base: V3 = [o[0] + f.x * 0.5, o[1] + 0.01, o[2]];
    const path = range(0, 1, 14).map((k): V3 => {
      // Up out of the socket, then arching back and drooping toward the tip.
      const z = -f.reach * k ** 1.15;
      const y = f.rise * Math.sin(Math.PI * Math.min(1, k * 1.35)) - 0.05 * k * k;
      return [base[0] + f.x * 1.6 * k, base[1] + y, base[2] + z];
    });
    sweep(b, path, (k) => f.r * Math.min(1, 0.45 + k * 3) * (1 - k) ** 0.8 + 0.002, {
      segments: 8,
      paint: (out) => (out[1] < -0.3 ? PLUME.shade : PLUME.base),
    });
  }
}

export function buildHead(b: GeometryBuilder) {
  b.bone(bone("head"));
  shell(b);
  crownSheen(b);
  visor(b);
  pivots(b);
  comb(b);
  plume(b);
}
