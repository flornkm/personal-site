import * as THREE from "three";

// Procedural low-poly props. Every builder returns one closed, consistently wound, non-indexed
// mesh whose shared vertices are bit-identical (each position is computed once and reused),
// because the slicer welds cut edges by exact position. Triangles are grouped by material slot.

export type V2 = THREE.Vector2;
type V3 = THREE.Vector3;
type UV = [number, number];

// For hand-built parts: every shared corner must be the same Vector3 (or bit-identical values).
export class MeshBuilder {
  private tris: { group: number; p: [V3, V3, V3]; uv: [UV, UV, UV] }[] = [];

  // Stores the triangle wound to face along `facing`; pass null to keep the given order.
  tri(group: number, p: [V3, V3, V3], uv: [UV, UV, UV], facing: V3 | null = null) {
    if (facing) {
      const n = new THREE.Vector3()
        .subVectors(p[1], p[0])
        .cross(new THREE.Vector3().subVectors(p[2], p[0]));
      if (n.dot(facing) < 0) {
        this.tris.push({ group, p: [p[0], p[2], p[1]], uv: [uv[0], uv[2], uv[1]] });
        return;
      }
    }
    this.tris.push({ group, p, uv });
  }

  quad(group: number, p: [V3, V3, V3, V3], uv: [UV, UV, UV, UV], facing: V3 | null = null) {
    this.tri(group, [p[0], p[1], p[2]], [uv[0], uv[1], uv[2]], facing);
    this.tri(group, [p[0], p[2], p[3]], [uv[0], uv[2], uv[3]], facing);
  }

  // Normals are smoothed across edges flatter than `crease` degrees and kept hard beyond it,
  // the way a modeller would set smoothing groups on a PS2 asset.
  build(crease: number) {
    const faces = this.tris.map(({ p }) =>
      new THREE.Vector3().subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[2], p[0])),
    );
    const units = faces.map((f) => f.clone().normalize());
    const shared = new Map<string, number[]>();
    this.tris.forEach(({ p }, t) => {
      for (const v of p) {
        const key = `${v.x},${v.y},${v.z}`;
        const list = shared.get(key);
        if (list) list.push(t);
        else shared.set(key, [t]);
      }
    });
    const cos = Math.cos(THREE.MathUtils.degToRad(crease));

    const order = this.tris
      .map((_, i) => i)
      .sort((a, b) => this.tris[a].group - this.tris[b].group);
    const pos: number[] = [];
    const nrm: number[] = [];
    const uvs: number[] = [];
    const geometry = new THREE.BufferGeometry();
    let groupStart = 0;
    let current = -1;
    const n = new THREE.Vector3();
    for (const t of order) {
      const { group, p, uv } = this.tris[t];
      if (group !== current) {
        if (current >= 0) geometry.addGroup(groupStart, pos.length / 3 - groupStart, current);
        current = group;
        groupStart = pos.length / 3;
      }
      for (let k = 0; k < 3; k++) {
        const v = p[k];
        n.set(0, 0, 0);
        for (const other of shared.get(`${v.x},${v.y},${v.z}`) ?? []) {
          if (units[other].dot(units[t]) >= cos) n.add(faces[other]);
        }
        if (n.lengthSq() === 0) n.copy(units[t]);
        n.normalize();
        pos.push(v.x, v.y, v.z);
        nrm.push(n.x, n.y, n.z);
        uvs.push(uv[k][0], uv[k][1]);
      }
    }
    if (current >= 0) geometry.addGroup(groupStart, pos.length / 3 - groupStart, current);
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const v2 = (x: number, y: number) => new THREE.Vector2(x, y);
const scaled = (outline: V2[], s: number) => outline.map((p) => p.clone().multiplyScalar(s));
const PLUS_Z = v3(0, 0, 1);
const MINUS_Z = v3(0, 0, -1);

function signedArea(loop: V2[]) {
  let a = 0;
  for (let i = 0; i < loop.length; i++) {
    const p = loop[i];
    const q = loop[(i + 1) % loop.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

const ccw = (loop: V2[]) => (signedArea(loop) > 0 ? loop : [...loop].reverse());

function bounds(points: V2[]) {
  const box = new THREE.Box2().setFromPoints(points);
  const size = box.getSize(new THREE.Vector2());
  return {
    u: (x: number) => (x - box.min.x) / size.x,
    v: (y: number) => (y - box.min.y) / size.y,
  };
}

// Corners get few segments on purpose: silhouettes should step like a PS2 model's.
export function roundedRect(w: number, h: number, r: number, segments: number): V2[] {
  const pts: V2[] = [];
  const corners: [number, number, number][] = [
    [w / 2 - r, -h / 2 + r, -Math.PI / 2],
    [w / 2 - r, h / 2 - r, 0],
    [-w / 2 + r, h / 2 - r, Math.PI / 2],
    [-w / 2 + r, -h / 2 + r, Math.PI],
  ];
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= segments; i++) {
      const t = start + (i / segments) * (Math.PI / 2);
      pts.push(new THREE.Vector2(cx + Math.cos(t) * r, cy + Math.sin(t) * r));
    }
  }
  return pts;
}

export function circle(r: number, segments: number): V2[] {
  return Array.from({ length: segments }, (_, i) => {
    const t = (i / segments) * Math.PI * 2;
    return new THREE.Vector2(Math.cos(t) * r, Math.sin(t) * r);
  });
}

export interface Ring {
  outline: V2[];
  z: number;
}

export interface LoftBand {
  group: number;
  // front/back: projected from the front over the outer bounds (back mirrored); wrap: u around
  // the perimeter, v across the band.
  uv: "front" | "back" | "wrap";
}

export interface LoftCap {
  group: number;
  // own: the cap's own bounds (a screen); outer: the whole prop's front bounds.
  uv: "own" | "outer";
  // A fan up to an apex at this z instead of a flat cap (a CRT's domed glass, a gem's point).
  apex?: number;
}

// Rings run from the front cap outward, down the side and back in to the back cap. Every outline
// is CCW seen from +z with the same point count, so bands are plain quad strips and the profile
// order alone fixes their winding.
export function loft(
  rings: Ring[],
  bands: LoftBand[],
  front: LoftCap,
  back: LoftCap,
  crease: number,
) {
  const b = new MeshBuilder();
  const loops = rings.map((r) => ({ z: r.z, pts: ccw(r.outline).map((p) => v3(p.x, p.y, r.z)) }));
  const outer = bounds(rings.flatMap((r) => r.outline));
  const frontUV = (p: V3): UV => [outer.u(p.x), outer.v(p.y)];
  const backUV = (p: V3): UV => [1 - outer.u(p.x), outer.v(p.y)];

  for (let i = 0; i < loops.length - 1; i++) {
    const a = loops[i].pts;
    const c = loops[i + 1].pts;
    const band = bands[i];
    const n = a.length;
    let perimeter = 0;
    for (let k = 0; k < n; k++) perimeter += a[k].distanceTo(a[(k + 1) % n]);
    let run = 0;
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n;
      const u0 = run / perimeter;
      run += a[k].distanceTo(a[k1]);
      const u1 = run / perimeter;
      const uv = (p: V3, u: number, v: number): UV => {
        if (band.uv === "front") return frontUV(p);
        if (band.uv === "back") return backUV(p);
        return [u, v];
      };
      b.quad(
        band.group,
        [a[k], c[k], c[k1], a[k1]],
        [uv(a[k], u0, 0), uv(c[k], u0, 1), uv(c[k1], u1, 1), uv(a[k1], u1, 0)],
      );
    }
  }

  const cap = (loop: { z: number; pts: V3[] }, spec: LoftCap, facing: V3) => {
    const flat = loop.pts.map((p) => new THREE.Vector2(p.x, p.y));
    const own = bounds(flat);
    const mirror = facing.z < 0;
    const uv = (p: V3): UV => {
      const u = spec.uv === "own" ? own.u(p.x) : outer.u(p.x);
      const v = spec.uv === "own" ? own.v(p.y) : outer.v(p.y);
      return [mirror ? 1 - u : u, v];
    };
    if (spec.apex !== undefined) {
      const tip = v3(0, 0, spec.apex);
      const tipUV = uv(tip);
      for (let k = 0; k < loop.pts.length; k++) {
        const p = loop.pts[k];
        const q = loop.pts[(k + 1) % loop.pts.length];
        b.tri(spec.group, [tip, p, q], [tipUV, uv(p), uv(q)], facing);
      }
      return;
    }
    for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(flat, [])) {
      const p = [loop.pts[i], loop.pts[j], loop.pts[k]] as [V3, V3, V3];
      b.tri(spec.group, p, [uv(p[0]), uv(p[1]), uv(p[2])], facing);
    }
  };
  cap(loops[0], front, PLUS_Z);
  cap(loops[loops.length - 1], back, MINUS_Z);
  return b.build(crease);
}

export interface ProfileEdge {
  group: number;
  // Edges sharing a run get one continuous v across them (a screen face, a keyboard deck).
  run?: string;
  flipU?: boolean;
  flipV?: boolean;
}

// A closed side profile in (depth, height) extruded across the width: depth maps to z, height to
// y, the extrusion to x. Good for anything that is one shape seen from the side (a laptop).
export function extrudeProfile(
  profile: V2[],
  width: number,
  edgeStyle: (index: number) => ProfileEdge,
  capGroup: number,
  crease: number,
) {
  const b = new MeshBuilder();
  const loop = ccw(profile);
  const hw = width / 2;
  const left = loop.map((p) => v3(-hw, p.y, p.x));
  const right = loop.map((p) => v3(hw, p.y, p.x));
  const side = bounds(loop);

  for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(loop, [])) {
    const uv = (idx: number): UV => [side.u(loop[idx].x), side.v(loop[idx].y)];
    b.tri(capGroup, [right[i], right[j], right[k]], [uv(i), uv(j), uv(k)], v3(1, 0, 0));
    b.tri(capGroup, [left[i], left[j], left[k]], [uv(i), uv(j), uv(k)], v3(-1, 0, 0));
  }

  const n = loop.length;
  const styles = Array.from({ length: n }, (_, i) => edgeStyle(i));
  const length = (i: number) => loop[i].distanceTo(loop[(i + 1) % n]);
  const runLength = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const run = styles[i].run;
    if (run) runLength.set(run, (runLength.get(run) ?? 0) + length(i));
  }
  const runDone = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const style = styles[i];
    const total = style.run ? (runLength.get(style.run) ?? 1) : length(i);
    const start = style.run ? (runDone.get(style.run) ?? 0) : 0;
    if (style.run) runDone.set(style.run, start + length(i));
    let v0 = start / total;
    let v1 = (start + length(i)) / total;
    if (style.flipV) {
      v0 = 1 - v0;
      v1 = 1 - v1;
    }
    const u0 = style.flipU ? 1 : 0;
    const u1 = style.flipU ? 0 : 1;
    // CCW in (depth, height): the outward normal is (dh, -dd) in that plane.
    const d = loop[j].clone().sub(loop[i]);
    const outward = v3(0, -d.x, d.y);
    b.quad(
      style.group,
      [left[i], right[i], right[j], left[j]],
      [
        [u0, v0],
        [u1, v0],
        [u1, v1],
        [u0, v1],
      ],
      outward,
    );
  }
  return b.build(crease);
}

// A thin sheet whose surface is displaced along z by `bend(x, y)`, sampled on a cols x rows
// grid: a curled drawing, a letter folded in thirds. Front 0, back 1, edges 2.
export function bentSheet(
  w: number,
  h: number,
  thickness: number,
  cols: number,
  rows: number,
  bend: (x: number, y: number) => number,
  crease: number,
) {
  const b = new MeshBuilder();
  const t = thickness / 2;
  const grid = (side: 1 | -1) =>
    Array.from({ length: rows + 1 }, (_, r) =>
      Array.from({ length: cols + 1 }, (_, c) => {
        const x = -w / 2 + (c / cols) * w;
        const y = -h / 2 + (r / rows) * h;
        return v3(x, y, bend(x, y) + side * t);
      }),
    );
  const front = grid(1);
  const back = grid(-1);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const u0 = c / cols;
      const u1 = (c + 1) / cols;
      const v0 = r / rows;
      const v1 = (r + 1) / rows;
      b.quad(
        0,
        [front[r][c], front[r][c + 1], front[r + 1][c + 1], front[r + 1][c]],
        [
          [u0, v0],
          [u1, v0],
          [u1, v1],
          [u0, v1],
        ],
        PLUS_Z,
      );
      b.quad(
        1,
        [back[r][c], back[r][c + 1], back[r + 1][c + 1], back[r + 1][c]],
        [
          [1 - u0, v0],
          [1 - u1, v0],
          [1 - u1, v1],
          [1 - u0, v1],
        ],
        MINUS_Z,
      );
    }
  }
  const edge = (a: V3, c: V3, d: V3, e: V3, facing: V3) =>
    b.quad(
      2,
      [a, c, d, e],
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
      facing,
    );
  for (let c = 0; c < cols; c++) {
    edge(front[0][c], front[0][c + 1], back[0][c + 1], back[0][c], v3(0, -1, 0));
    edge(front[rows][c], front[rows][c + 1], back[rows][c + 1], back[rows][c], v3(0, 1, 0));
  }
  for (let r = 0; r < rows; r++) {
    edge(front[r][0], front[r + 1][0], back[r + 1][0], back[r][0], v3(-1, 0, 0));
    edge(front[r][cols], front[r + 1][cols], back[r + 1][cols], back[r][cols], v3(1, 0, 0));
  }
  return b.build(crease);
}

// Multi-part props: a body plus knobs, feet, a stand, an antenna, a hinge or a camera bump, each
// its own closed part (shell), built along z by the helpers below, moved with `placed` and joined
// with `mergeShells`. Parts must not touch or pierce each other: keep at least ~0.004 between them,
// or the slicer would weld their cut rims into one loop. A part fully inside another is not allowed.

const ATTRIBUTES = ["position", "normal", "uv"] as const;

function triangleMaterials(geometry: THREE.BufferGeometry, triangles: number) {
  const materials = new Int32Array(triangles);
  for (const group of geometry.groups) {
    const end = Math.min(triangles, Math.floor((group.start + group.count) / 3));
    for (let t = Math.floor(group.start / 3); t < end; t++) materials[t] = group.materialIndex ?? 0;
  }
  return materials;
}

// One prop mesh from several closed parts: every part's triangles, sorted stably by material slot
// so each slot is one contiguous group, as the slicer and the material array expect.
export function mergeShells(...parts: THREE.BufferGeometry[]) {
  const sources = parts.map((part) => (part.index ? part.toNonIndexed() : part));
  const order: { source: number; triangle: number; material: number }[] = [];
  sources.forEach((source, s) => {
    for (const name of ATTRIBUTES) {
      if (!source.hasAttribute(name)) throw new Error(`mergeShells: part ${s} has no ${name}`);
    }
    const triangles = source.getAttribute("position").count / 3;
    const materials = triangleMaterials(source, triangles);
    for (let t = 0; t < triangles; t++) {
      order.push({ source: s, triangle: t, material: materials[t] });
    }
  });
  order.sort((a, b) => a.material - b.material);

  const geometry = new THREE.BufferGeometry();
  for (const name of ATTRIBUTES) {
    const size = name === "uv" ? 2 : 3;
    const values = new Float32Array(order.length * 3 * size);
    let o = 0;
    for (const { source, triangle } of order) {
      const attribute = sources[source].getAttribute(name);
      for (let v = triangle * 3; v < triangle * 3 + 3; v++) {
        for (let k = 0; k < size; k++) values[o++] = attribute.getComponent(v, k);
      }
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(values, size));
  }
  let start = 0;
  for (let t = 1; t <= order.length; t++) {
    if (t === order.length || order[t].material !== order[start].material) {
      geometry.addGroup(start * 3, (t - start) * 3, order[start].material);
      start = t;
    }
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

// A copy of `geometry` moved by `matrix`. Normals go through the normal matrix and stay unit
// length; a mirroring matrix also reverses every triangle so the surface keeps facing out. One input
// corner always lands on one float32 output, so shared vertices stay bit-identical.
export function transformed(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
  const mirror = matrix.determinant() < 0;
  const corner = (v: number) => (!mirror || v % 3 === 0 ? v : v % 3 === 1 ? v + 1 : v - 1);
  const result = new THREE.BufferGeometry();
  const p = new THREE.Vector3();
  for (const [name, attribute] of Object.entries(source.attributes)) {
    const size = attribute.itemSize;
    const values = new Float32Array(attribute.count * size);
    const vector = name === "position" || name === "normal";
    for (let v = 0; v < attribute.count; v++) {
      const from = corner(v);
      if (vector) {
        p.fromBufferAttribute(attribute, from);
        if (name === "position") p.applyMatrix4(matrix);
        else p.applyNormalMatrix(normalMatrix);
        values[v * 3] = p.x;
        values[v * 3 + 1] = p.y;
        values[v * 3 + 2] = p.z;
      } else {
        for (let k = 0; k < size; k++) values[v * size + k] = attribute.getComponent(from, k);
      }
    }
    result.setAttribute(name, new THREE.BufferAttribute(values, size));
  }
  for (const group of source.groups) result.addGroup(group.start, group.count, group.materialIndex);
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

export interface Placement {
  position?: [number, number, number];
  // Euler angles in radians, XYZ order.
  rotation?: [number, number, number];
  // A negative component mirrors the part; `transformed` flips its winding to match.
  scale?: number | [number, number, number];
}

export function placed(
  geometry: THREE.BufferGeometry,
  { position = [0, 0, 0], rotation = [0, 0, 0], scale = 1 }: Placement,
) {
  const [sx, sy, sz] = typeof scale === "number" ? [scale, scale, scale] : scale;
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(sx, sy, sz),
  );
  return transformed(geometry, matrix);
}

export interface PartStyle {
  // Material slots of the +z face, the side and the -z face; side and back default to front's.
  front?: number;
  side?: number;
  back?: number;
  crease?: number;
}

export interface SlabStyle extends PartStyle {
  // "face": each bevel takes its face's slot and projected uv, so the outer margin of the face
  // texture (bevel / width of it) paints the chamfer. "side": bevels take the side slot, wrapped.
  bevels?: "face" | "side";
  // The back outline is scaled by this about the z axis: below 1 the part tapers toward its back.
  taper?: number;
  // Raises the front face to a point this far above it: a domed button, a stud.
  dome?: number;
}

// A slab along z, centred on z = 0, its front and back edges chamfered by `bevel` (45° when the
// outline is a true inset). `outlineAt(inset)` is the outline shrunk by `inset`, centred on the z
// axis, with the same point count and order at every inset. Faces get projected uv over the outer
// bounds, the side band wraps u around the outline with v running front to back.
export function bevelSlab(
  outlineAt: (inset: number) => V2[],
  depth: number,
  bevel: number,
  {
    front = 0,
    side = front,
    back = front,
    bevels = "face",
    taper = 1,
    dome,
    crease = 40,
  }: SlabStyle = {},
) {
  const half = depth / 2;
  const b = Math.min(Math.max(bevel, 0), depth * 0.45);
  const outer = outlineAt(0);
  const tapered = (outline: V2[]) => (taper === 1 ? outline : scaled(outline, taper));
  const bevelBand = (group: number, uv: "front" | "back"): LoftBand =>
    bevels === "side" ? { group: side, uv: "wrap" } : { group, uv };
  const frontCap: LoftCap = { group: front, uv: "outer" };
  if (dome) frontCap.apex = half + dome;
  const backCap: LoftCap = { group: back, uv: "outer" };
  if (b === 0) {
    const rings = [
      { outline: outer, z: half },
      { outline: tapered(outer), z: -half },
    ];
    return loft(rings, [{ group: side, uv: "wrap" }], frontCap, backCap, crease);
  }
  const inner = outlineAt(b);
  const rings = [
    { outline: inner, z: half },
    { outline: outer, z: half - b },
    { outline: tapered(outer), z: -half + b },
    { outline: tapered(inner), z: -half },
  ];
  const bands: LoftBand[] = [
    bevelBand(front, "front"),
    { group: side, uv: "wrap" },
    bevelBand(back, "back"),
  ];
  return loft(rings, bands, frontCap, backCap, crease);
}

export interface BoxStyle extends SlabStyle {
  bevel?: number;
  // Rounds the four edges along z, in `segments` steps (1 is a plain chamfer); 0 keeps them sharp.
  radius?: number;
  segments?: number;
}

// A w x h x d box centred on the origin, depth along z.
export function bevelBox(
  w: number,
  h: number,
  d: number,
  { bevel = 0, radius = 0, segments = 1, ...style }: BoxStyle = {},
) {
  const outlineAt = (inset: number) => {
    const iw = w - 2 * inset;
    const ih = h - 2 * inset;
    if (radius <= 0) {
      return [v2(iw / 2, -ih / 2), v2(iw / 2, ih / 2), v2(-iw / 2, ih / 2), v2(-iw / 2, -ih / 2)];
    }
    // Past the bevel the true inset corner would vanish to a point; keep a sliver of it instead.
    const r = Math.min(Math.max(radius - inset, radius * 0.4), Math.min(iw, ih) * 0.49);
    return roundedRect(iw, ih, r, segments);
  };
  return bevelSlab(outlineAt, d, bevel, style);
}

export interface CylinderStyle extends SlabStyle {
  bevel?: number;
  segments?: number;
}

// An n-sided prism along z, centred on the origin, a corner on +x: a knob, a foot, a peg, a rod.
export function bevelCylinder(
  radius: number,
  depth: number,
  { bevel = 0, segments = 8, ...style }: CylinderStyle = {},
) {
  const apothem = Math.cos(Math.PI / segments);
  return bevelSlab((inset) => circle(radius - inset / apothem, segments), depth, bevel, style);
}

// A turned part (an antenna ball, a spindle, a crayon tip): `profile` is [radius, z] pairs walking
// the silhouette from the front cap round to the back cap, the way loft rings do, revolved through
// `segments` sides. A radius of 0 at either end closes it with a point instead of a flat cap.
// Sides take the side slot with wrapped uv, flat caps their own bounds.
export function lathe(
  profile: [number, number][],
  segments: number,
  { front = 0, side = front, back = front, crease = 40 }: PartStyle = {},
) {
  let rings = profile.map(([r, z]) => ({ r, z }));
  const frontCap: LoftCap = { group: front, uv: "own" };
  const backCap: LoftCap = { group: back, uv: "own" };
  if (rings[0].r === 0) {
    frontCap.apex = rings[0].z;
    rings = rings.slice(1);
  }
  if (rings[rings.length - 1].r === 0) {
    backCap.apex = rings[rings.length - 1].z;
    rings = rings.slice(0, -1);
  }
  return loft(
    rings.map(({ r, z }) => ({ outline: circle(r, segments), z })),
    rings.slice(1).map(() => ({ group: side, uv: "wrap" as const })),
    frontCap,
    backCap,
    crease,
  );
}
