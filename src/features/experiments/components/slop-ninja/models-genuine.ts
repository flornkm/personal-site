import * as THREE from "three";
import { MeshBuilder, bevelSlab, loft, mergeShells, transformed, type V2 } from "./geometry";

// The genuine props (the bombs): a child's drawing held by a letter magnet, Grandma's letter with
// a wax seal, and a warped record with a real spindle hole. Everything here is built for the
// slicer: closed parts, bit-identical shared corners, slots 0-5.

type V3 = THREE.Vector3;
type UV = [number, number];

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const v2 = (x: number, y: number) => new THREE.Vector2(x, y);
const PLUS_Z = v3(0, 0, 1);
const MINUS_Z = v3(0, 0, -1);

const deg = (degrees: number) => (degrees * Math.PI) / 180;

const PAPER = { w: 2.15, thickness: 0.05 };
// World length of one repeat of the paper edge strip along the sheet's perimeter.
const EDGE_TILE = 1.2;

interface Sheet {
  geometry: THREE.BufferGeometry;
  // The front surface's height at (x, y) exactly as triangulated, NaN off the sheet: parts are
  // seated against this, not against the smooth bend, which the flat triangles cut across.
  frontZ: (x: number, y: number) => number;
  xs: number[];
  ys: number[];
}

// A corner of the sheet folded toward the front by `angle` radians about the diagonal through its
// two grid neighbours. The corner cell's diagonal must be that crease (see `flip`).
interface DogEar {
  r: number;
  c: number;
  angle: number;
}

// A sheet of paper on an uneven grid: front 0, back 1 (u mirrored), edge 2. `flip(c, r)` turns a
// cell's diagonal so a dog-eared corner sits alone in its triangle and folds along a straight crease.
function sheet(
  xs: number[],
  ys: number[],
  thickness: number,
  bend: (x: number, y: number) => number,
  flip: (c: number, r: number) => boolean,
  crease: number,
  dogEar?: DogEar,
): Sheet {
  const b = new MeshBuilder();
  const t = thickness / 2;
  const cols = xs.length - 1;
  const rows = ys.length - 1;
  const x0 = xs[0];
  const w = xs[cols] - x0;
  const y0 = ys[0];
  const h = ys[rows] - y0;
  const mid = ys.map((y) => xs.map((x) => v3(x, y, bend(x, y))));
  if (dogEar) {
    // Rotated, not lifted: the flap keeps its length, so it reads as a folded corner and its
    // texture isn't stretched along it.
    const { r, c, angle } = dogEar;
    const a = mid[r][c + (c === 0 ? 1 : -1)];
    const e = mid[r + (r === 0 ? 1 : -1)][c];
    const axis = e.clone().sub(a).normalize();
    const arm = mid[r][c].clone().sub(a);
    const toFront = arm.clone().cross(axis);
    if (toFront.z < 0) toFront.negate();
    const folded = arm.clone().applyAxisAngle(axis, angle);
    if (folded.dot(toFront) < 0) folded.copy(arm).applyAxisAngle(axis, -angle);
    mid[r][c] = folded.add(a);
  }
  const front = mid.map((row) => row.map((p) => v3(p.x, p.y, p.z + t)));
  const back = mid.map((row) => row.map((p) => v3(p.x, p.y, p.z - t)));
  // From the grid, not the vertex: the folded corner keeps its place in the picture.
  const uv = (r: number, c: number, mirror: boolean): UV => {
    const u = (xs[c] - x0) / w;
    return [mirror ? 1 - u : u, (ys[r] - y0) / h];
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell: [number, number][] = flip(c, r)
        ? [
            [r, c + 1],
            [r + 1, c + 1],
            [r + 1, c],
            [r, c],
          ]
        : [
            [r, c],
            [r, c + 1],
            [r + 1, c + 1],
            [r + 1, c],
          ];
      for (const [grid, mirror, facing, group] of [
        [front, false, PLUS_Z, 0],
        [back, true, MINUS_Z, 1],
      ] as const) {
        const quad = cell.map(([i, j]) => grid[i][j]) as [V3, V3, V3, V3];
        const uvs = cell.map(([i, j]) => uv(i, j, mirror)) as [UV, UV, UV, UV];
        b.quad(group, quad, uvs, facing);
      }
    }
  }

  // The rim, walked once round so the strip's u runs on without a seam mid-side.
  const rim: [number, number][] = [];
  for (let c = 0; c < cols; c++) rim.push([0, c]);
  for (let r = 0; r < rows; r++) rim.push([r, cols]);
  for (let c = cols; c > 0; c--) rim.push([rows, c]);
  for (let r = rows; r > 0; r--) rim.push([r, 0]);
  let run = 0;
  for (let k = 0; k < rim.length; k++) {
    const [ra, ca] = rim[k];
    const [rb, cb] = rim[(k + 1) % rim.length];
    const fa = front[ra][ca];
    const fb = front[rb][cb];
    const u0 = run / EDGE_TILE;
    run += fa.distanceTo(fb);
    const u1 = run / EDGE_TILE;
    const outward = v3(fb.y - fa.y, fa.x - fb.x, 0);
    b.quad(
      2,
      [fa, fb, back[rb][cb], back[ra][ca]],
      [
        [u0, 0],
        [u1, 0],
        [u1, 1],
        [u0, 1],
      ],
      outward,
    );
  }

  const frontZ = (x: number, y: number) => {
    const c = xs.findIndex((_, i) => i < cols && x >= xs[i] && x <= xs[i + 1]);
    const r = ys.findIndex((_, i) => i < rows && y >= ys[i] && y <= ys[i + 1]);
    if (c < 0 || r < 0) return Number.NaN;
    const s = (x - xs[c]) / (xs[c + 1] - xs[c]);
    const q = (y - ys[r]) / (ys[r + 1] - ys[r]);
    const z00 = front[r][c].z;
    const z10 = front[r][c + 1].z;
    const z01 = front[r + 1][c].z;
    const z11 = front[r + 1][c + 1].z;
    if (flip(c, r)) {
      if (s + q <= 1) return z00 + s * (z10 - z00) + q * (z01 - z00);
      return z11 + (1 - s) * (z01 - z11) + (1 - q) * (z10 - z11);
    }
    if (s >= q) return z00 + s * (z10 - z00) + q * (z11 - z10);
    return z00 + q * (z01 - z00) + s * (z11 - z01);
  };

  return { geometry: b.build(crease), frontZ, xs, ys };
}

// Lays `part` (built with its flat base on z = 0, facing +z) onto the sheet at (x, y): tilted to the
// sheet's local slope, spun by `spin`, and lifted until its base clears the front by `gap`
// everywhere under it, the sheet's own vertices included.
function seat(
  part: THREE.BufferGeometry,
  paper: Sheet,
  x: number,
  y: number,
  gap: number,
  spin = 0,
) {
  const e = 0.12;
  const slope = (dx: number, dy: number) =>
    (paper.frontZ(x + dx, y + dy) - paper.frontZ(x - dx, y - dy)) / (2 * e);
  const normal = v3(-slope(e, 0), -slope(0, e), 1).normalize();
  const tilt = new THREE.Quaternion().setFromUnitVectors(PLUS_Z, normal);
  tilt.multiply(new THREE.Quaternion().setFromAxisAngle(PLUS_Z, spin));
  const rotated = transformed(part, new THREE.Matrix4().makeRotationFromQuaternion(tilt));
  rotated.computeBoundingBox();
  const box = rotated.boundingBox!;
  // Height of the tilted base plane (through the origin) above (dx, dy).
  const base = (dx: number, dy: number) => -(normal.x * dx + normal.y * dy) / normal.z;
  const samples: [number, number][] = [];
  const position = rotated.getAttribute("position");
  for (let i = 0; i < position.count; i++) samples.push([position.getX(i), position.getY(i)]);
  for (let i = 0; i <= 24; i++) {
    for (let j = 0; j <= 24; j++) {
      samples.push([
        box.min.x + ((box.max.x - box.min.x) * i) / 24,
        box.min.y + ((box.max.y - box.min.y) * j) / 24,
      ]);
    }
  }
  for (const sx of paper.xs) {
    for (const sy of paper.ys) {
      const dx = sx - x;
      const dy = sy - y;
      if (dx >= box.min.x && dx <= box.max.x && dy >= box.min.y && dy <= box.max.y) {
        samples.push([dx, dy]);
      }
    }
  }
  let lift = -Infinity;
  for (const [dx, dy] of samples) {
    const z = paper.frontZ(x + dx, y + dy);
    if (!Number.isNaN(z)) lift = Math.max(lift, z + gap - base(dx, dy));
  }
  return transformed(rotated, new THREE.Matrix4().makeTranslation(x, y, lift));
}

// The inset of an axis-aligned CCW outline: each corner moves along both edges' inward normals.
export function insetOrthogonal(outline: [number, number][], inset: number): V2[] {
  const n = outline.length;
  return outline.map(([x, y], i) => {
    const [px, py] = outline[(i + n - 1) % n];
    const [qx, qy] = outline[(i + 1) % n];
    const a = Math.hypot(x - px, y - py);
    const c = Math.hypot(qx - x, qy - y);
    const nx = -(y - py) / a - (qy - y) / c;
    const ny = (x - px) / a + (qx - x) / c;
    return v2(x + nx * inset, y + ny * inset);
  });
}

// A chunky fridge-alphabet "E", CCW, centred on the origin.
export const LETTER_E: [number, number][] = [
  [-0.24, -0.29],
  [0.24, -0.29],
  [0.24, -0.15],
  [-0.08, -0.15],
  [-0.08, -0.06],
  [0.16, -0.06],
  [0.16, 0.06],
  [-0.08, 0.06],
  [-0.08, 0.15],
  [0.24, 0.15],
  [0.24, 0.29],
  [-0.24, 0.29],
];
export const MAGNET = { depth: 0.12, bevel: 0.03, bounds: [0.48, 0.58] as const };

// Glossy plastic letter magnet: the face and its chamfer in slot 3, the sides and back in slot 4.
function letterMagnet() {
  const part = bevelSlab((inset) => insetOrthogonal(LETTER_E, inset), MAGNET.depth, MAGNET.bevel, {
    front: 3,
    side: 4,
    back: 4,
    crease: 30,
  });
  return transformed(part, new THREE.Matrix4().makeTranslation(0, 0, MAGNET.depth / 2));
}

// A child's drawing: curled toward the viewer at its sides, a wave down its length, the
// bottom-right corner dog-eared up, and held at the top by a letter magnet that pokes over the edge.
export function curledSheet(aspect: number) {
  const w = PAPER.w;
  const h = w / aspect;
  const corner = 0.34;
  const xs = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5].map((f) => (f * w) / 2);
  xs.push(w / 2 - corner, w / 2);
  const ys = [-h / 2, -h / 2 + corner, -h / 4, 0, h / 4, h / 2];
  const bend = (x: number, y: number) => {
    const xn = x / (w / 2);
    const yn = y / (h / 2);
    return 0.34 * xn * xn + 0.02 * Math.sin(yn * Math.PI);
  };
  // The corner cell's own diagonal is the crease; 40 degrees lifts the tip about 0.15.
  const dogEar = { r: 0, c: xs.length - 1, angle: deg(40) };
  const paper = sheet(xs, ys, PAPER.thickness, bend, () => false, 24, dogEar);
  const magnet = seat(letterMagnet(), paper, 0.08, h / 2 - 0.13, 0.006, -0.05);
  return mergeShells(paper.geometry, magnet);
}

// Grandma's letter, folded in thirds and half opened: the panels zig-zag, each bowed a little like
// real paper, the top-right corner dog-eared, and a wax seal pressed on the bottom panel.
export function foldedSheet(aspect: number) {
  const w = PAPER.w;
  const h = w / aspect;
  const corner = h / 9;
  const xs = [-1, -0.45, 0.15].map((f) => (f * w) / 2);
  xs.push(w / 2 - corner, w / 2);
  const ys = Array.from({ length: 10 }, (_, i) => -h / 2 + (i * h) / 9);
  const bend = (x: number, y: number) => {
    const t = Math.min(2.999999, (y + h / 2) / (h / 3));
    const panel = Math.floor(t);
    const f = t - panel;
    const xn = x / (w / 2);
    const zig = 0.3 * (panel % 2 === 0 ? f : 1 - f);
    const bow = 0.025 * Math.sin(Math.PI * f);
    return zig + bow + 0.03 * xn * xn;
  };
  const cols = xs.length - 1;
  const rows = ys.length - 1;
  const paper = sheet(
    xs,
    ys,
    PAPER.thickness,
    bend,
    (c, r) => c === cols - 1 && r === rows - 1,
    24,
    { r: rows, c: cols, angle: deg(40) },
  );
  const seal = seat(waxSeal(), paper, -0.52, -h / 2 + h / 6 + 0.02, 0.006, 0.4);
  return mergeShells(paper.geometry, seal);
}

const SEAL = { radius: 0.255, points: 10 };

// An irregular blob of sealing wax: a flowed foot, a raised crest and a pressed disc in the middle.
// All of it is slot 3, projected from the top so one texture paints the whole stamp.
function waxSeal() {
  const { radius, points } = SEAL;
  let s = 41;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const wobble = Array.from({ length: points }, () => 1 + (rand() - 0.5) * 0.24);
  const ring = (r: number, amount: number) =>
    wobble.map((k, i) => {
      const a = (i / points) * Math.PI * 2;
      const rr = r * (1 + (k - 1) * amount);
      return v2(Math.cos(a) * rr, Math.sin(a) * rr);
    });
  return loft(
    [
      { outline: ring(radius * 0.56, 0.3), z: 0.036 },
      { outline: ring(radius * 0.64, 0.4), z: 0.06 },
      { outline: ring(radius * 0.8, 0.8), z: 0.056 },
      { outline: ring(radius * 0.96, 1), z: 0.024 },
      { outline: ring(radius, 1), z: 0 },
    ],
    [
      { group: 3, uv: "front" },
      { group: 3, uv: "front" },
      { group: 3, uv: "front" },
      { group: 3, uv: "front" },
    ],
    { group: 3, uv: "outer" },
    { group: 3, uv: "outer" },
    45,
  );
}

export const RECORD = { radius: 1.34, hole: 0.07, label: 0.46, segments: 24 };

// A well-loved LP turned on a lathe with a real spindle hole: raised label, grooved field, a beaded
// rim, then warped into a gentle potato chip. Front 0 and back 1 are projected from the face (the
// bead too, so the face texture paints its crest), the outer edge and the hole wall are slot 2.
export function record() {
  const { radius: R, hole, label, segments } = RECORD;
  // Walked clockwise in (r, z): out along the top, down the edge, in along the bottom, up the hole.
  const profile: [number, number][] = [
    [hole, 0.055],
    [label, 0.055],
    [label + 0.025, 0.03],
    [0.88, 0.03],
    [1.28, 0.03],
    [1.31, 0.048],
    [R, 0.02],
    [R, -0.02],
    [1.31, -0.048],
    [1.28, -0.03],
    [0.88, -0.03],
    [label + 0.025, -0.03],
    [label, -0.055],
    [hole, -0.055],
  ];
  const n = profile.length;
  const angle = (j: number) => (j / segments) * Math.PI * 2;
  const grid = profile.map(([r, z]) =>
    Array.from({ length: segments }, (_, j) => {
      const a = angle(j);
      // The saddle's axes sit off the segment angles: lined up, its symmetry puts other vertices
      // exactly in a face's plane, and a cut along that plane pinches the cap outline.
      const warp = 0.1 * Math.cos(2 * a + 0.2) * (r / R) ** 2;
      return v3(Math.cos(a) * r, Math.sin(a) * r, z + warp);
    }),
  );
  const planar = (p: V3, mirror: boolean): UV => {
    const u = 0.5 + p.x / (2 * R);
    return [mirror ? 1 - u : u, 0.5 + p.y / (2 * R)];
  };
  const b = new MeshBuilder();
  for (let i = 0; i < n; i++) {
    const [r0, z0] = profile[i];
    const [r1, z1] = profile[(i + 1) % n];
    const len = Math.hypot(r1 - r0, z1 - z0);
    const nr = -(z1 - z0) / len;
    const nz = (r1 - r0) / len;
    const group = nz > 0.3 ? 0 : nz < -0.3 ? 1 : 2;
    const a = grid[i];
    const c = grid[(i + 1) % n];
    for (let j = 0; j < segments; j++) {
      const k = (j + 1) % segments;
      const mid = angle(j + 0.5);
      const facing = v3(nr * Math.cos(mid), nr * Math.sin(mid), nz);
      const quad: [V3, V3, V3, V3] = [a[j], a[k], c[k], c[j]];
      const uvs: [UV, UV, UV, UV] =
        group === 2
          ? [
              [j / segments, 0],
              [(j + 1) / segments, 0],
              [(j + 1) / segments, 1],
              [j / segments, 1],
            ]
          : [
              planar(quad[0], group === 1),
              planar(quad[1], group === 1),
              planar(quad[2], group === 1),
              planar(quad[3], group === 1),
            ];
      b.quad(group, quad, uvs, facing);
    }
  }
  return b.build(40);
}
