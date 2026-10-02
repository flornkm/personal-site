import * as THREE from "three";
import {
  MeshBuilder,
  bevelBox,
  bevelCylinder,
  lathe,
  mergeShells,
  placed,
  roundedRect,
  transformed,
  type V2,
} from "./geometry";

// The slop electronics: a CRT TV, a phone in a chunky case and an open laptop, each a body plus
// bolted-on parts (knobs, plinth, rabbit ears; camera bump, PopSocket, buttons; hinge, feet).
// The layout constants are exported so the skins in paint-electronics.ts line up with the models.

type V3 = THREE.Vector3;
type UV = [number, number];
// x0, y0, x1, y1
export type Rect = [number, number, number, number];

const v2 = (x: number, y: number) => new THREE.Vector2(x, y);
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const PLUS_Z = v3(0, 0, 1);
const MINUS_Z = v3(0, 0, -1);

function rr(w: number, h: number, r: number, segments: number, y = 0): V2[] {
  return roundedRect(w, h, r, segments).map((p) => v2(p.x, p.y + y));
}

// Cumulative run around a closed outline, normalised to 0..1, with the closing point as 1.
export function outlineRuns(outline: V2[]) {
  const runs = [0];
  for (let k = 0; k < outline.length; k++) {
    runs.push(runs[k] + outline[k].distanceTo(outline[(k + 1) % outline.length]));
  }
  const total = runs[runs.length - 1];
  return runs.map((r) => r / total);
}

// planar: projected from the front, `rect` (world x/y) onto `to` (uv); strip: u around the outline
// (each ring's own run, so u stays put on a tapering shell), v from strip[0] to strip[1] across.
export type Planar = { planar: Rect; to?: Rect; mirror?: boolean };
export type Mapping = Planar | { strip: [number, number]; u?: [number, number] };

interface ShellRing {
  outline: V2[];
  z: number;
}

interface ShellBand {
  slot: number;
  uv: Mapping;
}

interface ShellCap {
  slot: number;
  uv: Planar;
  apex?: number;
}

function planarUV({ planar: [x0, y0, x1, y1], to = [0, 0, 1, 1], mirror = false }: Planar) {
  return (p: V3): UV => {
    const u = (p.x - x0) / (x1 - x0);
    const v = (p.y - y0) / (y1 - y0);
    return [to[0] + (mirror ? 1 - u : u) * (to[2] - to[0]), to[1] + v * (to[3] - to[1])];
  };
}

// geometry.ts's loft with per-band uv control, so one skin can be laid out like a trim sheet:
// each band gets its own rows of the texture instead of all of it. Rings run from the front cap
// outward and back in to the back cap; outlines are CCW from +z with one point count.
function shell(
  rings: ShellRing[],
  bands: ShellBand[],
  front: ShellCap,
  back: ShellCap,
  crease = 40,
) {
  const b = new MeshBuilder();
  const loops = rings.map((r) => r.outline.map((p) => v3(p.x, p.y, r.z)));
  const runs = rings.map((r) => outlineRuns(r.outline));
  for (let i = 0; i < loops.length - 1; i++) {
    const a = loops[i];
    const c = loops[i + 1];
    const { slot, uv } = bands[i];
    const project = "planar" in uv ? planarUV(uv) : null;
    const at = (ring: number, k: number, p: V3): UV => {
      if (project) return project(p);
      const strip = uv as Extract<Mapping, { strip: unknown }>;
      const [u0, u1] = strip.u ?? [0, 1];
      return [u0 + runs[ring][k] * (u1 - u0), ring === i ? strip.strip[0] : strip.strip[1]];
    };
    for (let k = 0; k < a.length; k++) {
      const k1 = (k + 1) % a.length;
      b.quad(
        slot,
        [a[k], c[k], c[k1], a[k1]],
        [at(i, k, a[k]), at(i + 1, k, c[k]), at(i + 1, k + 1, c[k1]), at(i, k + 1, a[k1])],
      );
    }
  }
  const cap = (pts: V3[], spec: ShellCap, facing: V3) => {
    const uv = planarUV(spec.uv);
    if (spec.apex !== undefined) {
      const centre = pts.reduce((s, p) => s.add(p), v3(0, 0, 0)).multiplyScalar(1 / pts.length);
      const tip = v3(centre.x, centre.y, spec.apex);
      for (let k = 0; k < pts.length; k++) {
        const p = pts[k];
        const q = pts[(k + 1) % pts.length];
        b.tri(spec.slot, [tip, p, q], [uv(tip), uv(p), uv(q)], facing);
      }
      return;
    }
    const flat = pts.map((p) => v2(p.x, p.y));
    for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(flat, [])) {
      const p = [pts[i], pts[j], pts[k]] as [V3, V3, V3];
      b.tri(spec.slot, p, [uv(p[0]), uv(p[1]), uv(p[2])], facing);
    }
  };
  cap(loops[0], front, PLUS_Z);
  cap(loops[loops.length - 1], back, MINUS_Z);
  return b.build(crease);
}

// Canvas rows (from the top) as a strip's v range.
const rows = ([r0, r1]: readonly [number, number], height: number): Mapping => ({
  strip: [1 - r0 / height, 1 - r1 / height],
});

// ---------------------------------------------------------------------------------------------
// The electronics trim sheet: a 4 x 4 grid of material swatches the small parts map into.

export const TRIM_SIZE = 256;
export const TRIM = {
  rubber: 0,
  chrome: 1,
  steel: 2,
  graphite: 3,
  knobFace: 4,
  knurl: 5,
  lens: 6,
  holo: 7,
  lilac: 8,
  violet: 9,
  camPlate: 10,
  hinge: 11,
  antennaBase: 12,
  knobSmall: 13,
  popGrip: 14,
  glass: 15,
} as const;

// The uv rect of a trim cell, inset two texels so bilinear taps stay inside it.
export function trimCell(cell: number): Rect {
  const s = 1 / 4;
  const inset = 2 / TRIM_SIZE;
  const col = cell % 4;
  const row = Math.floor(cell / 4);
  return [col * s + inset, 1 - (row + 1) * s + inset, (col + 1) * s - inset, 1 - row * s - inset];
}

const TRIM_MATTE = 4;
const TRIM_GLOSS = 5;
type Skin = [slot: number, cell: number];

// A part helper's faces (built with temporary slots) moved onto their real slots, their 0..1 uvs
// squeezed into trim cells.
function skinned(geometry: THREE.BufferGeometry, skins: Record<number, Skin>) {
  const uv = geometry.getAttribute("uv");
  for (const group of geometry.groups) {
    const [slot, cell] = skins[group.materialIndex ?? 0];
    group.materialIndex = slot;
    const [u0, v0, u1, v1] = trimCell(cell);
    for (let v = group.start; v < group.start + group.count; v++) {
      uv.setXY(v, u0 + uv.getX(v) * (u1 - u0), v0 + uv.getY(v) * (v1 - v0));
    }
  }
  return geometry;
}

const allIn = (skin: Skin): Record<number, Skin> => ({ 0: skin, 1: skin, 2: skin });

// A part built along z and centred on the origin, laid from `from` to `to`.
function along(geometry: THREE.BufferGeometry, from: V3, to: V3, axis = PLUS_Z) {
  const q = new THREE.Quaternion().setFromUnitVectors(axis, to.clone().sub(from).normalize());
  const m = new THREE.Matrix4().compose(from.clone().add(to).multiplyScalar(0.5), q, v3(1, 1, 1));
  return transformed(geometry, m);
}

// Centres the x/y bounds on the origin (the game spins props about it); z keeps its middle too.
function centred(geometry: THREE.BufferGeometry) {
  geometry.computeBoundingBox();
  const c = geometry.boundingBox!.getCenter(new THREE.Vector3());
  geometry.translate(-c.x, -c.y, -c.z);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

// ---------------------------------------------------------------------------------------------
// CRT TV: a 4:3 tube in a deep screen well, a bezel with a chin, a stepped cabinet tapering back to
// a flat-bottomed tube housing, knobs, a swivel plinth and rabbit ears.

const TV_SEG = 3;
export const TV_SCREEN = { w: 2.08, h: 1.56, y: 0.1 };
export const TV_WELL = { w: 2.3, h: 1.78 };
export const TV_BEZEL = { w: 2.84, h: 2.34 };
export const TV_BACK: Rect = [-0.86, -1.11, 0.86, 0.33];
export const TV_KNOBS = [
  { x: 0.66, y: -0.95, r: 0.13, segments: 10, cell: TRIM.knobFace },
  { x: 1.0, y: -0.95, r: 0.095, segments: 8, cell: TRIM.knobSmall },
];
// The casing wrap: u once around the cabinet, rows per band (canvas px from the top).
export const TV_CASING = {
  w: 640,
  h: 128,
  wall: [0, 24],
  ledge: [24, 32],
  tube: [32, 116],
  chamfer: [116, 128],
} as const;

function tvCabinetRings() {
  const s = TV_SCREEN;
  const ring = (w: number, h: number, r: number, z: number, y = 0) => ({
    outline: rr(w, h, r, TV_SEG, y),
    z,
  });
  return [
    ring(s.w, s.h, 0.12, 0.5, s.y),
    ring(s.w + 0.1, s.h + 0.1, 0.14, 0.5, s.y),
    ring(TV_WELL.w, TV_WELL.h, 0.17, 0.62, s.y),
    ring(2.72, 2.22, 0.22, 0.62),
    ring(TV_BEZEL.w, TV_BEZEL.h, 0.28, 0.55),
    ring(TV_BEZEL.w, TV_BEZEL.h, 0.28, 0.22),
    // The shoulder steps in, more on top; the bottom stays flat to stand on the plinth.
    ring(2.64, 2.14, 0.18, 0.19, -0.1),
    ring(1.84, 1.56, 0.3, -0.72, -0.39),
    ring(1.72, 1.44, 0.26, -0.8, -0.39),
  ];
}

// Where the cabinet's straight runs sit on the casing's u, for painting vents on the top only.
export function tvCasingZones() {
  const outline = tvCabinetRings()[5].outline;
  const runs = outlineRuns(outline);
  const n = TV_SEG + 1;
  // roundedRect corners run bottom-right, top-right, top-left, bottom-left, n points each.
  const edge = (corner: number) => [runs[corner * n + n - 1], runs[(corner + 1) * n]] as const;
  return { right: edge(0), top: edge(1), left: edge(2), bottom: [runs[4 * n - 1], 1] as const };
}

function tvCabinet() {
  const s = TV_SCREEN;
  const bezel: Mapping = {
    planar: [-TV_BEZEL.w / 2, -TV_BEZEL.h / 2, TV_BEZEL.w / 2, TV_BEZEL.h / 2],
  };
  const casing = (band: readonly [number, number]) => ({ slot: 2, uv: rows(band, TV_CASING.h) });
  return shell(
    tvCabinetRings(),
    [
      { slot: 1, uv: bezel },
      { slot: 1, uv: bezel },
      { slot: 1, uv: bezel },
      { slot: 1, uv: bezel },
      casing(TV_CASING.wall),
      casing(TV_CASING.ledge),
      casing(TV_CASING.tube),
      casing(TV_CASING.chamfer),
    ],
    {
      slot: 0,
      uv: { planar: [-s.w / 2, s.y - s.h / 2, s.w / 2, s.y + s.h / 2] },
      apex: 0.58,
    },
    { slot: 3, uv: { planar: TV_BACK, mirror: true } },
    35,
  );
}

function rabbitEars() {
  // The top of the tube housing, from the shoulder ring's top edge back to the tube ring's.
  const [y0, z0] = [0.97, 0.19];
  const [y1, z1] = [0.39, -0.72];
  const slope = Math.atan2(y0 - y1, z0 - z1);
  const zb = -0.2;
  const surface = v3(0, y0 - (z0 - zb) * Math.tan(slope), zb);
  const up = v3(0, Math.cos(slope), -Math.sin(slope));
  const baseH = 0.12;
  const base = skinned(
    bevelCylinder(0.26, baseH, {
      segments: 8,
      taper: 0.7,
      bevel: 0.02,
      front: 0,
      side: 1,
      back: 2,
    }),
    {
      0: [TRIM_MATTE, TRIM.graphite],
      1: [TRIM_MATTE, TRIM.antennaBase],
      2: [TRIM_MATTE, TRIM.knobSmall],
    },
  );
  const parts = [
    along(
      base,
      surface.clone().addScaledVector(up, 0.004 + baseH),
      surface.clone().addScaledVector(up, 0.004),
    ),
  ];
  const top = surface.clone().addScaledVector(up, 0.004 + baseH);
  const lean = THREE.MathUtils.degToRad(10);
  // Long enough that about half of each rod clears the bezel top face-on: the TV-icon V.
  const splay = THREE.MathUtils.degToRad(42);
  const rodLength = 0.88;
  const tip = 0.075;
  for (const side of [-1, 1]) {
    const dir = v3(
      side * Math.sin(splay) * Math.cos(lean),
      Math.cos(splay) * Math.cos(lean),
      -Math.sin(lean),
    ).normalize();
    // Lifted clear of the base top: the square end dips as the rod splays.
    const start = top
      .clone()
      .addScaledVector(up, 0.05)
      .add(v3(side * 0.085, 0, 0));
    const end = start.clone().addScaledVector(dir, rodLength);
    // Gunmetal rather than bright chrome: a thin light rod disappears against the white board.
    const rod = skinned(
      bevelCylinder(0.065, rodLength, { segments: 4 }),
      allIn([TRIM_GLOSS, TRIM.graphite]),
    );
    parts.push(along(rod, start, end));
    const ball = skinned(
      lathe(
        [
          [0, tip],
          [tip, 0],
          [0, -tip],
        ],
        6,
      ),
      allIn([TRIM_GLOSS, TRIM.chrome]),
    );
    const from = end.clone().addScaledVector(dir, 0.006);
    parts.push(along(ball, from, from.clone().addScaledVector(dir, tip * 2)));
  }
  return parts;
}

export function crtTv() {
  const knobs = TV_KNOBS.map(({ x, y, r, segments, cell }) =>
    placed(
      skinned(bevelCylinder(r, 0.1, { segments, bevel: 0.022, front: 0, side: 1, back: 1 }), {
        0: [TRIM_MATTE, cell],
        1: [TRIM_MATTE, TRIM.knurl],
      }),
      { position: [x, y, 0.62 + 0.004 + 0.05] },
    ),
  );
  const plinth = placed(
    skinned(
      bevelBox(1.9, 0.12, 1.1, { bevel: 0.03, radius: 0.03, segments: 1, front: 0, side: 1 }),
      { 0: [TRIM_MATTE, TRIM.graphite], 1: [TRIM_MATTE, TRIM.antennaBase] },
    ),
    // Its front lines up under the bezel so it shows below the chin face-on.
    { position: [0, -TV_BEZEL.h / 2 - 0.004 - 0.06, -0.05] },
  );
  return centred(mergeShells(tvCabinet(), ...knobs, plinth, ...rabbitEars()));
}

// ---------------------------------------------------------------------------------------------
// Laptop: a base slab with a keyboard well on rubber feet, a hinge barrel, and a lid with real
// thickness leaning back past upright.

export const LAPTOP_LID = { w: 2.4, h: 1.42, screen: { w: 2.2, h: 1.16, y: 0.05 } };
export const LAPTOP_BASE = { w: 2.4, d: 1.56, well: { w: 2.04, d: 0.66, y: 0.28 } };
// The aluminium skin: the underside on top, then one row band per edge band below it.
export const LAPTOP_ALU = {
  w: 192,
  h: 160,
  underside: [0, 125],
  baseChamfer: [125, 130],
  baseWall: [130, 141],
  baseFoot: [141, 146],
  lidRim: [146, 150],
  lidWall: [150, 156],
  lidBack: [156, 160],
} as const;
// Rubber feet (x, z) under the base.
export const LAPTOP_FEET: [number, number][] = [
  [-0.95, -0.6],
  [0.95, -0.6],
  [-0.95, 0.6],
  [0.95, 0.6],
];
const LEAN = THREE.MathUtils.degToRad(16);
const LID_T = 0.095;
const HINGE = { r: 0.065, y: 0.055, z: -LAPTOP_BASE.d / 2 - 0.006 - 0.065 };

function laptopBase() {
  const { w, d, well } = LAPTOP_BASE;
  const ring = (rw: number, rd: number, r: number, z: number, y = 0) => ({
    outline: rr(rw, rd, r, 1, y),
    z,
  });
  const deck: Mapping = { planar: [-w / 2, -d / 2, w / 2, d / 2] };
  const A = LAPTOP_ALU;
  const alu = (band: readonly [number, number]) => ({ slot: 2, uv: rows(band, A.h) });
  // Built with height along z and depth along y (+y the hinge), then stood up.
  const base = shell(
    [
      ring(well.w, well.d, 0.03, 0.095, well.y),
      ring(well.w, well.d, 0.03, 0.11, well.y),
      ring(w - 0.04, d - 0.04, 0.05, 0.11),
      ring(w, d, 0.07, 0.085),
      ring(w, d, 0.07, 0.025),
      ring(w - 0.06, d - 0.06, 0.05, 0),
    ],
    [
      { slot: 1, uv: deck },
      { slot: 1, uv: deck },
      alu(A.baseChamfer),
      alu(A.baseWall),
      alu(A.baseFoot),
    ],
    { slot: 1, uv: deck },
    {
      slot: 2,
      uv: {
        planar: [-w / 2, -d / 2, w / 2, d / 2],
        to: [0, 1 - A.underside[1] / A.h, 1, 1],
        mirror: true,
      },
    },
    30,
  );
  return placed(base, { rotation: [-Math.PI / 2, 0, 0] });
}

function laptopLid() {
  const { w, h, screen: s } = LAPTOP_LID;
  const ring = (rw: number, rh: number, r: number, z: number, y = 0) => ({
    outline: rr(rw, rh, r, 1, y),
    z,
  });
  const face: Mapping = { planar: [-w / 2, -h / 2, w / 2, h / 2] };
  const A = LAPTOP_ALU;
  const alu = (band: readonly [number, number]) => ({ slot: 2, uv: rows(band, A.h) });
  const lid = shell(
    [
      ring(s.w, s.h, 0.03, -0.012, s.y),
      ring(s.w, s.h, 0.03, 0, s.y),
      // A front chamfer wider than a game pixel at grazing angles, or the rim flickers.
      ring(w - 0.09, h - 0.09, 0.04, 0),
      ring(w, h, 0.07, -0.035),
      ring(w, h, 0.07, -LID_T + 0.025),
      ring(w - 0.04, h - 0.04, 0.05, -LID_T),
    ],
    [{ slot: 0, uv: face }, { slot: 0, uv: face }, alu(A.lidRim), alu(A.lidWall), alu(A.lidBack)],
    { slot: 0, uv: face },
    { slot: 3, uv: { planar: [-w / 2, -h / 2, w / 2, h / 2], mirror: true } },
    30,
  );
  // The bottom edge rides just above the hinge barrel.
  const rotation: [number, number, number] = [-LEAN, 0, 0];
  const bottom = v3(0, -h / 2, -LID_T / 2).applyEuler(new THREE.Euler(...rotation));
  const target = v3(0, HINGE.y + HINGE.r + 0.018, HINGE.z);
  return placed(lid, { rotation, position: target.sub(bottom).toArray() });
}

export function laptop() {
  const hinge = placed(
    skinned(bevelCylinder(HINGE.r, 1.9, { segments: 8, bevel: 0.016, front: 0, side: 1 }), {
      0: [TRIM_GLOSS, TRIM.steel],
      1: [TRIM_GLOSS, TRIM.hinge],
    }),
    { position: [0, HINGE.y, HINGE.z], rotation: [0, Math.PI / 2, 0] },
  );
  const feet = LAPTOP_FEET.map(([x, z]) =>
    placed(
      skinned(bevelBox(0.26, 0.14, 0.04, { bevel: 0.012 }), allIn([TRIM_MATTE, TRIM.rubber])),
      {
        position: [x, -0.004 - 0.02, z],
        rotation: [-Math.PI / 2, 0, 0],
      },
    ),
  );
  // A sloppy violet "AI accelerator" stick plugged into the left side, a sparkle sticker on its
  // end. Built along z (end cap toward +z), then turned to stick out along -x.
  const [stickOut, stickH, stickD] = [0.22, 0.09, 0.14];
  const dongle = placed(
    skinned(bevelBox(stickD, stickH, stickOut, { bevel: 0.02, front: 0, side: 1, back: 1 }), {
      0: [TRIM_GLOSS, TRIM.holo],
      1: [TRIM_GLOSS, TRIM.violet],
    }),
    {
      position: [-LAPTOP_BASE.w / 2 - 0.004 - stickOut / 2, 0.055, 0.25],
      rotation: [0, -Math.PI / 2, 0],
    },
  );
  return centred(mergeShells(laptopBase(), hinge, laptopLid(), ...feet, dongle));
}

// ---------------------------------------------------------------------------------------------
// Phone: a screen in a lilac bumper case whose lip stands proud of the glass, a camera bump with
// two lenses, a PopSocket and side buttons.

const PHONE_SEG = 3;
export const PHONE_SCREEN = { w: 1.43, h: 2.86 };
// The post canvas covers the glass including its black border.
export const PHONE_GLASS: Rect = [-0.765, -1.48, 0.765, 1.48];
export const PHONE_BACK: Rect = [-0.855, -1.57, 0.855, 1.57];
export const PHONE_RAIL = {
  w: 512,
  h: 48,
  lip: [0, 4],
  rise: [4, 10],
  crest: [10, 18],
  shoulder: [18, 26],
  wall: [26, 40],
  back: [40, 48],
} as const;
export const PHONE_BUMP = { x: 0.42, y: 1.05, size: 0.66 };
export const PHONE_LENSES = [
  { x: 0.55, y: 1.2 },
  { x: 0.55, y: 0.9 },
];
export const POPSOCKET = { x: 0, y: -0.2, r: 0.36 };
export const PHONE_BUTTONS = [
  { side: 1, y: 0.55, h: 0.42 },
  { side: -1, y: 0.6, h: 0.62 },
];
const PHONE_RAIL_Z = [-0.08, 0.04] as const;

function phoneRings() {
  const { w, h } = PHONE_SCREEN;
  const ring = (grow: number, r: number, z: number) => ({
    outline: rr(w + grow, h + grow, r, PHONE_SEG),
    z,
  });
  return [
    ring(0, 0.16, 0.11),
    ring(0.1, 0.2, 0.11),
    ring(0.16, 0.23, 0.11),
    ring(0.22, 0.26, 0.16),
    ring(0.3, 0.3, 0.13),
    ring(0.34, 0.32, PHONE_RAIL_Z[1]),
    ring(0.34, 0.32, PHONE_RAIL_Z[0]),
    ring(0.28, 0.29, -0.15),
  ];
}

// Where each button, and the charging port mid-bottom, sits on the rail's u (the outline starts at
// the bottom edge's right end).
export function phoneRailZones() {
  const outline = phoneRings()[5].outline;
  const runs = outlineRuns(outline);
  const n = PHONE_SEG + 1;
  const right = [runs[n - 1], runs[n]];
  const left = [runs[3 * n - 1], runs[3 * n]];
  const y0 = outline[n - 1].y;
  const y1 = outline[n].y;
  const port = (runs[4 * n - 1] + 1) / 2;
  const buttons = PHONE_BUTTONS.map(({ side, y, h }) => {
    // The right rail runs up (u grows with y), the left one down.
    const [u0, u1] = side > 0 ? right : left;
    const at = (yy: number) => {
      const t = (yy - y0) / (y1 - y0);
      return side > 0 ? u0 + t * (u1 - u0) : u1 - t * (u1 - u0);
    };
    const [a, b] = [at(y - h / 2), at(y + h / 2)].sort((p, q) => p - q);
    return [a, b] as const;
  });
  return { buttons, port };
}

function phoneCase() {
  const R = PHONE_RAIL;
  const rail = (band: readonly [number, number]) => ({ slot: 1, uv: rows(band, R.h) });
  const glass: Mapping = { planar: PHONE_GLASS };
  return shell(
    phoneRings(),
    [
      { slot: 0, uv: glass },
      rail(R.lip),
      rail(R.rise),
      rail(R.crest),
      rail(R.shoulder),
      rail(R.wall),
      rail(R.back),
    ],
    { slot: 0, uv: glass },
    { slot: 3, uv: { planar: PHONE_BACK, mirror: true } },
    50,
  );
}

export function phone() {
  const back = -0.15;
  const bumpD = 0.06;
  const bump = placed(
    skinned(
      bevelBox(PHONE_BUMP.size, PHONE_BUMP.size, bumpD, {
        bevel: 0.02,
        radius: 0.14,
        segments: 1,
        front: 0,
        side: 1,
      }),
      { 0: [TRIM_MATTE, TRIM.camPlate], 1: [TRIM_MATTE, TRIM.lilac] },
    ),
    { position: [PHONE_BUMP.x, PHONE_BUMP.y, back - 0.004 - bumpD / 2], rotation: [0, Math.PI, 0] },
  );
  const lensD = 0.04;
  const lenses = PHONE_LENSES.map(({ x, y }) =>
    placed(
      skinned(bevelCylinder(0.12, lensD, { segments: 8, front: 0, side: 1 }), {
        0: [TRIM_GLOSS, TRIM.lens],
        1: [TRIM_GLOSS, TRIM.chrome],
      }),
      { position: [x, y, back - 0.004 - bumpD - 0.004 - lensD / 2], rotation: [0, Math.PI, 0] },
    ),
  );
  // Cap, stem and base disc in one turned part, cap toward +z until it is flipped onto the back.
  const pop = placed(
    skinned(
      lathe(
        [
          [0.34, 0.15],
          [0.36, 0.13],
          [0.36, 0.1],
          [0.24, 0.1],
          [0.24, 0.03],
          [0.34, 0.03],
          [0.34, 0],
        ],
        10,
        { front: 0, side: 1, back: 2, crease: 50 },
      ),
      { 0: [TRIM_GLOSS, TRIM.holo], 1: [TRIM_MATTE, TRIM.popGrip], 2: [TRIM_MATTE, TRIM.popGrip] },
    ),
    { position: [POPSOCKET.x, POPSOCKET.y, back - 0.004], rotation: [0, Math.PI, 0] },
  );
  const railX = (PHONE_SCREEN.w + 0.34) / 2;
  const railMid = (PHONE_RAIL_Z[0] + PHONE_RAIL_Z[1]) / 2;
  const buttons = PHONE_BUTTONS.map(({ side, y, h }) =>
    placed(
      skinned(bevelBox(0.05, h, 0.08, { bevel: 0.016, front: 0, side: 1 }), {
        0: [TRIM_MATTE, TRIM.lilac],
        1: [TRIM_MATTE, TRIM.lilac],
      }),
      { position: [side * (railX + 0.004 + 0.025), y, railMid] },
    ),
  );
  return centred(mergeShells(phoneCase(), bump, ...lenses, pop, ...buttons));
}
