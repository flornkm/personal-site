import { mat4, type Mat4 } from "./math";

// Every mesh in the engine shares one interleaved 24-byte vertex, so any geometry can be drawn by
// any pipeline (static, skinned, instanced) without re-uploading:
//   0  position   3 × f32
//   12 normal     4 × snorm8 (w unused)
//   16 color      4 × unorm8 (sRGB rgb; a = gloss for solid meshes, wind weight for instanced)
//   20 bones      2 × u8, weight of the first bone as unorm8, then a spare byte
export const VERTEX_STRIDE = 24;

export interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
  center: [number, number, number];
  radius: number;
}

export interface GeometryData {
  data: ArrayBuffer;
  vertexCount: number;
  bounds: Bounds;
}

type P3 = [number, number, number];
// 0xRRGGBB, or sRGB components as 0–255 or as 0–1 (an array with nothing above 1 is read as 0–1;
// as bytes it would be black anyway).
export type Color = number | [number, number, number];

const toRgb = (c: Color): P3 => {
  if (typeof c === "number") return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  const k = c[0] <= 1 && c[1] <= 1 && c[2] <= 1 ? 255 : 1;
  return [Math.round(c[0] * k), Math.round(c[1] * k), Math.round(c[2] * k)];
};

// Records triangles in model space through a matrix stack, like an immediate-mode modeller. Each
// primitive takes the current colour, gloss and bone binding, so a whole character or a whole
// world chunk becomes a single buffer and a single draw call.
export class GeometryBuilder {
  private pos: number[] = [];
  private nrm: number[] = [];
  private col: number[] = [];
  private bon: number[] = [];
  private stack: Mat4[] = [];
  private m = mat4.create();
  private nm = new Float32Array(9);
  private nmDirty = true;
  private rgb: P3 = [255, 255, 255];
  private gloss = 0;
  private bone0 = 0;
  private bone1 = 0;
  private weight0 = 1;

  get vertexCount() {
    return this.pos.length / 3;
  }

  color(c: Color, gloss = 0) {
    this.rgb = toRgb(c);
    this.gloss = gloss;
    return this;
  }

  // Binds following vertices to one bone, or blends two (weight is bone a's share).
  bone(a: number, b = a, weight = 1) {
    this.bone0 = a;
    this.bone1 = b;
    this.weight0 = weight;
    return this;
  }

  push() {
    this.stack.push(mat4.copy(new Float32Array(16), this.m));
    return this;
  }

  pop() {
    const top = this.stack.pop();
    if (top) this.m.set(top);
    this.nmDirty = true;
    return this;
  }

  transform(t: Mat4) {
    mat4.multiply(this.m, this.m, t);
    this.nmDirty = true;
    return this;
  }

  translate(x: number, y: number, z: number) {
    const t = mat4.create();
    t[12] = x;
    t[13] = y;
    t[14] = z;
    return this.transform(t);
  }

  scale(x: number, y = x, z = x) {
    const t = mat4.create();
    t[0] = x;
    t[5] = y;
    t[10] = z;
    return this.transform(t);
  }

  rotateX(a: number) {
    const t = mat4.create();
    const c = Math.cos(a),
      s = Math.sin(a);
    t[5] = c;
    t[6] = s;
    t[9] = -s;
    t[10] = c;
    return this.transform(t);
  }

  rotateY(a: number) {
    const t = mat4.create();
    const c = Math.cos(a),
      s = Math.sin(a);
    t[0] = c;
    t[2] = -s;
    t[8] = s;
    t[10] = c;
    return this.transform(t);
  }

  rotateZ(a: number) {
    const t = mat4.create();
    const c = Math.cos(a),
      s = Math.sin(a);
    t[0] = c;
    t[1] = s;
    t[4] = -s;
    t[5] = c;
    return this.transform(t);
  }

  private normalMatrix() {
    if (!this.nmDirty) return this.nm;
    const m = this.m;
    // Inverse-transpose of the upper 3×3, so non-uniform scale keeps normals perpendicular.
    const a00 = m[0],
      a01 = m[1],
      a02 = m[2];
    const a10 = m[4],
      a11 = m[5],
      a12 = m[6];
    const a20 = m[8],
      a21 = m[9],
      a22 = m[10];
    const b01 = a22 * a11 - a12 * a21;
    const b11 = -a22 * a10 + a12 * a20;
    const b21 = a21 * a10 - a11 * a20;
    const det = a00 * b01 + a01 * b11 + a02 * b21 || 1;
    const id = 1 / det;
    const nm = this.nm;
    nm[0] = b01 * id;
    nm[3] = (-a22 * a01 + a02 * a21) * id;
    nm[6] = (a12 * a01 - a02 * a11) * id;
    nm[1] = b11 * id;
    nm[4] = (a22 * a00 - a02 * a20) * id;
    nm[7] = (-a12 * a00 + a02 * a10) * id;
    nm[2] = b21 * id;
    nm[5] = (-a21 * a00 + a01 * a20) * id;
    nm[8] = (a11 * a00 - a01 * a10) * id;
    this.nmDirty = false;
    return nm;
  }

  private vertex(p: ArrayLike<number>, n: ArrayLike<number>, rgb: P3 = this.rgb, a = this.gloss) {
    const m = this.m;
    const x = p[0],
      y = p[1],
      z = p[2];
    this.pos.push(
      m[0] * x + m[4] * y + m[8] * z + m[12],
      m[1] * x + m[5] * y + m[9] * z + m[13],
      m[2] * x + m[6] * y + m[10] * z + m[14],
    );
    const nm = this.normalMatrix();
    const nx = nm[0] * n[0] + nm[3] * n[1] + nm[6] * n[2];
    const ny = nm[1] * n[0] + nm[4] * n[1] + nm[7] * n[2];
    const nz = nm[2] * n[0] + nm[5] * n[1] + nm[8] * n[2];
    const l = Math.hypot(nx, ny, nz) || 1;
    this.nrm.push(nx / l, ny / l, nz / l);
    this.col.push(rgb[0], rgb[1], rgb[2], Math.round(Math.min(1, Math.max(0, a)) * 255));
    this.bon.push(this.bone0, this.bone1, Math.round(this.weight0 * 255));
  }

  // One triangle, counter-clockwise from the front. Without normals it is flat shaded.
  tri(
    a: ArrayLike<number>,
    b: ArrayLike<number>,
    c: ArrayLike<number>,
    na?: ArrayLike<number>,
    nb?: ArrayLike<number>,
    nc?: ArrayLike<number>,
    colors?: [P3, P3, P3],
    alphas?: [number, number, number],
  ) {
    let fa = na,
      fb = nb,
      fc = nc;
    if (!fa || !fb || !fc) {
      const ux = b[0] - a[0],
        uy = b[1] - a[1],
        uz = b[2] - a[2];
      const vx = c[0] - a[0],
        vy = c[1] - a[1],
        vz = c[2] - a[2];
      const f = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      fa = fb = fc = f;
    }
    this.vertex(a, fa, colors?.[0], alphas?.[0]);
    this.vertex(b, fb, colors?.[1], alphas?.[1]);
    this.vertex(c, fc, colors?.[2], alphas?.[2]);
    return this;
  }

  quad(a: P3, b: P3, c: P3, d: P3, na?: P3, nb?: P3, nc?: P3, nd?: P3) {
    this.tri(a, b, c, na, nb, nc);
    this.tri(a, c, d, na, nc, nd);
    return this;
  }

  // A box with rounded edges: `radius` is the bevel, `segments` the steps around each edge.
  // Smooth by default (toon bands follow the bevel); `flat` gives visibly faceted chamfers.
  roundedBox(w: number, h: number, d: number, radius = 0, segments = 2, flat = false) {
    const hx = w / 2,
      hy = h / 2,
      hz = d / 2;
    const r = Math.min(radius, hx, hy, hz);
    const ex = hx - r,
      ey = hy - r,
      ez = hz - r;
    const seg = r > 0 ? Math.max(1, segments) : 0;
    // Grid stops along a face axis: bevel band, flat middle, bevel band. Angles in the bands are
    // even so each facet of the round spans the same arc.
    const stops = (e: number) => {
      const s: number[] = [];
      for (let k = seg; k >= 1; k--) s.push(-(e + r * Math.tan(((k / seg) * Math.PI) / 4)));
      s.push(-e, e);
      for (let k = 1; k <= seg; k++) s.push(e + r * Math.tan(((k / seg) * Math.PI) / 4));
      return s;
    };
    const project = (q: P3): [P3, P3] => {
      const c: P3 = [
        Math.max(-ex, Math.min(ex, q[0])),
        Math.max(-ey, Math.min(ey, q[1])),
        Math.max(-ez, Math.min(ez, q[2])),
      ];
      let dx = q[0] - c[0],
        dy = q[1] - c[1],
        dz = q[2] - c[2];
      const l = Math.hypot(dx, dy, dz);
      if (l < 1e-9) return [q, [0, 0, 0]];
      dx /= l;
      dy /= l;
      dz /= l;
      return [
        [c[0] + dx * r, c[1] + dy * r, c[2] + dz * r],
        [dx, dy, dz],
      ];
    };
    // Each face: axis a/b in-plane, n the outward axis, sign s.
    const faces: [number, number, number, number][] = [
      [2, 1, 0, 1],
      [2, 1, 0, -1],
      [0, 2, 1, 1],
      [0, 2, 1, -1],
      [0, 1, 2, 1],
      [0, 1, 2, -1],
    ];
    const half = [hx, hy, hz];
    const inner = [ex, ey, ez];
    for (const [ai, bi, ni, s] of faces) {
      const sa = stops(inner[ai]).map((v) => Math.max(-half[ai], Math.min(half[ai], v)));
      const sb = stops(inner[bi]).map((v) => Math.max(-half[bi], Math.min(half[bi], v)));
      if (r === 0) {
        sa.splice(0, sa.length, -half[ai], half[ai]);
        sb.splice(0, sb.length, -half[bi], half[bi]);
      }
      const grid: [P3, P3][][] = [];
      for (let i = 0; i < sa.length; i++) {
        const row: [P3, P3][] = [];
        for (let j = 0; j < sb.length; j++) {
          const q: P3 = [0, 0, 0];
          q[ai] = sa[i];
          q[bi] = sb[j];
          q[ni] = s * half[ni];
          const [p, n] = r > 0 ? project(q) : [q, [0, 0, 0] as P3];
          if (n[0] === 0 && n[1] === 0 && n[2] === 0) n[ni] = s;
          row.push([p, n]);
        }
        grid.push(row);
      }
      // Wind so the face is front-facing outward: (a × b) · n should match s.
      const ab = [0, 0, 0];
      ab[ai] = 1;
      const bb = [0, 0, 0];
      bb[bi] = 1;
      const cr = [
        ab[1] * bb[2] - ab[2] * bb[1],
        ab[2] * bb[0] - ab[0] * bb[2],
        ab[0] * bb[1] - ab[1] * bb[0],
      ];
      const flip = cr[ni] * s < 0;
      for (let i = 0; i < sa.length - 1; i++) {
        for (let j = 0; j < sb.length - 1; j++) {
          const p00 = grid[i][j],
            p10 = grid[i + 1][j],
            p11 = grid[i + 1][j + 1],
            p01 = grid[i][j + 1];
          const quad = flip ? [p00, p01, p11, p10] : [p00, p10, p11, p01];
          if (flat) {
            this.tri(quad[0][0], quad[1][0], quad[2][0]);
            this.tri(quad[0][0], quad[2][0], quad[3][0]);
          } else {
            this.tri(quad[0][0], quad[1][0], quad[2][0], quad[0][1], quad[1][1], quad[2][1]);
            this.tri(quad[0][0], quad[2][0], quad[3][0], quad[0][1], quad[2][1], quad[3][1]);
          }
        }
      }
    }
    return this;
  }

  box(w: number, h: number, d: number) {
    return this.roundedBox(w, h, d, 0, 0, true);
  }

  // Surface of revolution around +Y. `profile` runs bottom to top as [radius, y]; a radius of 0
  // closes a pole. Smooth around, creased along the profile where `flatProfile` is set.
  lathe(profile: [number, number][], segments: number, flat = false, phase = 0) {
    const ring = (i: number) => {
      const a = phase + (i / segments) * Math.PI * 2;
      return [Math.cos(a), Math.sin(a)];
    };
    for (let k = 0; k < profile.length - 1; k++) {
      const [r0, y0] = profile[k];
      const [r1, y1] = profile[k + 1];
      // Profile-tangent slope gives the normal's vertical lean.
      const dr = r1 - r0,
        dy = y1 - y0;
      const len = Math.hypot(dr, dy) || 1;
      const ny = -dr / len,
        nr = dy / len;
      for (let i = 0; i < segments; i++) {
        const [c0, s0] = ring(i);
        const [c1, s1] = ring(i + 1);
        const a: P3 = [r0 * c0, y0, r0 * s0];
        const b: P3 = [r0 * c1, y0, r0 * s1];
        const c: P3 = [r1 * c1, y1, r1 * s1];
        const d: P3 = [r1 * c0, y1, r1 * s0];
        const na: P3 = [nr * c0, ny, nr * s0];
        const nb: P3 = [nr * c1, ny, nr * s1];
        if (flat) {
          if (r0 > 1e-9) this.tri(a, c, b);
          if (r1 > 1e-9) this.tri(a, d, c);
        } else {
          if (r0 > 1e-9) this.tri(a, c, b, na, nb, nb);
          if (r1 > 1e-9) this.tri(a, d, c, na, na, nb);
        }
      }
    }
    return this;
  }

  cylinder(rTop: number, rBottom: number, h: number, segments: number, caps = true, flat = false) {
    this.lathe(
      [
        [rBottom, -h / 2],
        [rTop, h / 2],
      ],
      segments,
      flat,
    );
    if (caps) {
      for (let i = 0; i < segments; i++) {
        const a0 = (i / segments) * Math.PI * 2,
          a1 = ((i + 1) / segments) * Math.PI * 2;
        if (rTop > 0)
          this.tri(
            [0, h / 2, 0],
            [rTop * Math.cos(a1), h / 2, rTop * Math.sin(a1)],
            [rTop * Math.cos(a0), h / 2, rTop * Math.sin(a0)],
          );
        if (rBottom > 0)
          this.tri(
            [0, -h / 2, 0],
            [rBottom * Math.cos(a0), -h / 2, rBottom * Math.sin(a0)],
            [rBottom * Math.cos(a1), -h / 2, rBottom * Math.sin(a1)],
          );
      }
    }
    return this;
  }

  sphere(r: number, segments = 10, rings = 6, flat = false) {
    const profile: [number, number][] = [];
    for (let i = 0; i <= rings; i++) {
      const t = -Math.PI / 2 + (i / rings) * Math.PI;
      profile.push([Math.cos(t) * r, Math.sin(t) * r]);
    }
    if (flat) return this.lathe(profile, segments, true);
    // Analytic normals: a sphere's normal is its position.
    for (let k = 0; k < rings; k++) {
      const t0 = -Math.PI / 2 + (k / rings) * Math.PI;
      const t1 = -Math.PI / 2 + ((k + 1) / rings) * Math.PI;
      for (let i = 0; i < segments; i++) {
        const p0 = (i / segments) * Math.PI * 2,
          p1 = ((i + 1) / segments) * Math.PI * 2;
        const at = (t: number, p: number): P3 => [
          Math.cos(t) * Math.cos(p),
          Math.sin(t),
          Math.cos(t) * Math.sin(p),
        ];
        const a = at(t0, p0),
          b = at(t0, p1),
          c = at(t1, p1),
          d = at(t1, p0);
        const s = (v: P3): P3 => [v[0] * r, v[1] * r, v[2] * r];
        if (k > 0) this.tri(s(a), s(c), s(b), a, c, b);
        if (k < rings - 1) this.tri(s(a), s(d), s(c), a, d, c);
      }
    }
    return this;
  }

  // A flat polygon (any simple outline, CCW in XY) extruded along Z, centred on z = 0. Sides are
  // flat shaded; `bevel` insets the caps for a chunky, pressed-out look.
  extrude(outline: [number, number][], depth: number, bevel = 0) {
    const pts = signedArea(outline) < 0 ? [...outline].reverse() : outline;
    const tris = triangulate(pts);
    const hz = depth / 2;
    const inset = bevel > 0 ? offsetPolygon(pts, -bevel) : pts;
    const capZ = hz;
    const sideZ = hz - bevel;
    for (const [a, b, c] of tris) {
      this.tri(
        [inset[a][0], inset[a][1], capZ],
        [inset[b][0], inset[b][1], capZ],
        [inset[c][0], inset[c][1], capZ],
      );
      this.tri(
        [inset[a][0], inset[a][1], -capZ],
        [inset[c][0], inset[c][1], -capZ],
        [inset[b][0], inset[b][1], -capZ],
      );
    }
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[j];
      this.quad([x0, y0, -sideZ], [x1, y1, -sideZ], [x1, y1, sideZ], [x0, y0, sideZ]);
      if (bevel > 0) {
        const [ix0, iy0] = inset[i];
        const [ix1, iy1] = inset[j];
        this.quad([x0, y0, sideZ], [x1, y1, sideZ], [ix1, iy1, capZ], [ix0, iy0, capZ]);
        this.quad([ix0, iy0, -capZ], [ix1, iy1, -capZ], [x1, y1, -sideZ], [x0, y0, -sideZ]);
      }
    }
    return this;
  }

  // Copies another builder's triangles through the current matrix and binding.
  append(other: GeometryBuilder) {
    for (let i = 0; i < other.pos.length / 3; i++) {
      const p = [other.pos[i * 3], other.pos[i * 3 + 1], other.pos[i * 3 + 2]];
      const n = [other.nrm[i * 3], other.nrm[i * 3 + 1], other.nrm[i * 3 + 2]];
      const c: P3 = [other.col[i * 4], other.col[i * 4 + 1], other.col[i * 4 + 2]];
      this.vertex(p, n, c, other.col[i * 4 + 3] / 255);
    }
    return this;
  }

  build(): GeometryData {
    const count = this.pos.length / 3;
    const data = new ArrayBuffer(count * VERTEX_STRIDE);
    const f32 = new Float32Array(data);
    const i8 = new Int8Array(data);
    const u8 = new Uint8Array(data);
    const min: P3 = [Infinity, Infinity, Infinity];
    const max: P3 = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < count; i++) {
      const fo = i * 6;
      const bo = i * VERTEX_STRIDE;
      for (let k = 0; k < 3; k++) {
        const v = this.pos[i * 3 + k];
        f32[fo + k] = v;
        if (v < min[k]) min[k] = v;
        if (v > max[k]) max[k] = v;
        i8[bo + 12 + k] = Math.round(Math.max(-1, Math.min(1, this.nrm[i * 3 + k])) * 127);
      }
      for (let k = 0; k < 4; k++) u8[bo + 16 + k] = this.col[i * 4 + k];
      u8[bo + 20] = this.bon[i * 3];
      u8[bo + 21] = this.bon[i * 3 + 1];
      u8[bo + 22] = this.bon[i * 3 + 2];
    }
    if (count === 0) {
      min.fill(0);
      max.fill(0);
    }
    const center: P3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    let radius = 0;
    for (let i = 0; i < count; i++) {
      const d = Math.hypot(
        this.pos[i * 3] - center[0],
        this.pos[i * 3 + 1] - center[1],
        this.pos[i * 3 + 2] - center[2],
      );
      if (d > radius) radius = d;
    }
    return { data, vertexCount: count, bounds: { min, max, center, radius } };
  }
}

function signedArea(loop: [number, number][]) {
  let a = 0;
  for (let i = 0; i < loop.length; i++) {
    const [x0, y0] = loop[i];
    const [x1, y1] = loop[(i + 1) % loop.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

// Ear clipping for simple CCW polygons; fine for the handful of outlines a prop needs.
function triangulate(pts: [number, number][]) {
  const idx = pts.map((_, i) => i);
  const out: [number, number, number][] = [];
  const cross = (o: number, a: number, b: number) =>
    (pts[a][0] - pts[o][0]) * (pts[b][1] - pts[o][1]) -
    (pts[a][1] - pts[o][1]) * (pts[b][0] - pts[o][0]);
  const inside = (p: number, a: number, b: number, c: number) =>
    cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const a = idx[(i + idx.length - 1) % idx.length],
        b = idx[i],
        c = idx[(i + 1) % idx.length];
      if (cross(a, b, c) <= 0) continue;
      let ear = true;
      for (const p of idx) {
        if (p !== a && p !== b && p !== c && inside(p, a, b, c)) {
          ear = false;
          break;
        }
      }
      if (!ear) continue;
      out.push([a, b, c]);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return out;
}

// Moves each vertex along its averaged edge normals; negative distance shrinks a CCW outline.
function offsetPolygon(pts: [number, number][], d: number): [number, number][] {
  return pts.map((p, i) => {
    const prev = pts[(i + pts.length - 1) % pts.length];
    const next = pts[(i + 1) % pts.length];
    const e0 = [p[0] - prev[0], p[1] - prev[1]];
    const e1 = [next[0] - p[0], next[1] - p[1]];
    const n0 = [e0[1], -e0[0]];
    const n1 = [e1[1], -e1[0]];
    const l0 = Math.hypot(n0[0], n0[1]) || 1;
    const l1 = Math.hypot(n1[0], n1[1]) || 1;
    let nx = n0[0] / l0 + n1[0] / l1,
      ny = n0[1] / l0 + n1[1] / l1;
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    // Keep corners at constant distance from both edges.
    const cos = (nx * n0[0]) / l0 + (ny * n0[1]) / l0;
    const k = d / Math.max(0.3, cos);
    return [p[0] + nx * k, p[1] + ny * k];
  });
}
