import { VERTEX_STRIDE, type GeometryBuilder, type GeometryData } from "../engine/geometry";
import { mat4 } from "../engine/math";

// Modelling helpers for monsters: smooth, rounded primitives on top of GeometryBuilder (they go
// through its matrix stack, colour and bone binding). Load-time only, so they allocate freely.

export type V3 = [number, number, number];

// Surface of revolution around +Y with smooth normals along the profile too (GeometryBuilder.lathe
// creases at every profile ring, which reads as banding under toon light). `profile` runs bottom to
// top as [radius, y]; radius 0 closes a pole.
// `colors` (sRGB bytes) and `gloss` per profile point blend along the profile.
export function smoothLathe(
  b: GeometryBuilder,
  profile: [number, number][],
  segments: number,
  colors?: V3[],
  gloss?: number[],
) {
  const n = profile.length;
  // Per profile point: outward (radial, vertical) normal, averaged from the segments either side.
  const nr: number[] = [];
  const ny: number[] = [];
  const seg = (k: number) => {
    const dr = profile[k + 1][0] - profile[k][0];
    const dy = profile[k + 1][1] - profile[k][1];
    const l = Math.hypot(dr, dy) || 1;
    return [dy / l, -dr / l];
  };
  for (let k = 0; k < n; k++) {
    let r = 0,
      y = 0;
    if (k > 0) {
      const s = seg(k - 1);
      r += s[0];
      y += s[1];
    }
    if (k < n - 1) {
      const s = seg(k);
      r += s[0];
      y += s[1];
    }
    // Poles point straight along the axis.
    if (profile[k][0] < 1e-6) r = 0;
    const l = Math.hypot(r, y) || 1;
    nr.push(r / l);
    ny.push(y / l);
  }
  for (let k = 0; k < n - 1; k++) {
    const [r0, y0] = profile[k];
    const [r1, y1] = profile[k + 1];
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const c0 = Math.cos(a0),
        s0 = Math.sin(a0),
        c1 = Math.cos(a1),
        s1 = Math.sin(a1);
      const p00: V3 = [r0 * c0, y0, r0 * s0];
      const p01: V3 = [r0 * c1, y0, r0 * s1];
      const p11: V3 = [r1 * c1, y1, r1 * s1];
      const p10: V3 = [r1 * c0, y1, r1 * s0];
      const n00: V3 = [nr[k] * c0, ny[k], nr[k] * s0];
      const n01: V3 = [nr[k] * c1, ny[k], nr[k] * s1];
      const n11: V3 = [nr[k + 1] * c1, ny[k + 1], nr[k + 1] * s1];
      const n10: V3 = [nr[k + 1] * c0, ny[k + 1], nr[k + 1] * s0];
      if (colors) {
        const k0 = colors[k],
          k1 = colors[k + 1];
        const g0 = gloss?.[k] ?? 0,
          g1 = gloss?.[k + 1] ?? 0;
        if (r0 > 1e-6) b.tri(p00, p11, p01, n00, n11, n01, [k0, k1, k0], [g0, g1, g0]);
        if (r1 > 1e-6) b.tri(p00, p10, p11, n00, n10, n11, [k0, k1, k1], [g0, g1, g1]);
        continue;
      }
      if (r0 > 1e-6) b.tri(p00, p11, p01, n00, n11, n01);
      if (r1 > 1e-6) b.tri(p00, p10, p11, n00, n10, n11);
    }
  }
  return b;
}

// Profile of a superellipse-ish blob: `r(t)` gives the radius at height t (0 bottom pole, 1 top).
export function profileOf(height: number, rings: number, r: (t: number) => number, y0 = 0) {
  const out: [number, number][] = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    out.push([i === 0 || i === rings ? 0 : Math.max(0, r(t)), y0 + t * height]);
  }
  return out;
}

export function ellipsoid(
  b: GeometryBuilder,
  c: V3,
  rx: number,
  ry: number,
  rz: number,
  seg = 12,
  rings = 8,
) {
  return b.push().translate(c[0], c[1], c[2]).scale(rx, ry, rz).sphere(1, seg, rings).pop();
}

// A matrix whose +Y runs from `a` toward `to` (so lathe-built parts can be aimed), origin at `a`.
export function aim(a: V3, to: V3, roll = 0) {
  const d = norm([to[0] - a[0], to[1] - a[1], to[2] - a[2]]);
  const length = Math.hypot(to[0] - a[0], to[1] - a[1], to[2] - a[2]);
  // X perpendicular to the axis (kept horizontal for anything not pointing straight up), Z = X × Y.
  const ref: V3 = Math.abs(d[1]) < 0.95 ? [0, 1, 0] : [0, 0, 1];
  let x = norm(cross(ref, d));
  let z = cross(x, d);
  if (roll) {
    const c = Math.cos(roll),
      s = Math.sin(roll);
    const x2: V3 = [x[0] * c + z[0] * s, x[1] * c + z[1] * s, x[2] * c + z[2] * s];
    z = [-x[0] * s + z[0] * c, -x[1] * s + z[1] * c, -x[2] * s + z[2] * c];
    x = x2;
  }
  const m = mat4.create();
  m.set([x[0], x[1], x[2], 0, d[0], d[1], d[2], 0, z[0], z[1], z[2], 0, a[0], a[1], a[2], 1]);
  return { m, length };
}

export const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const mix = (a: V3, b: V3, t: number): V3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

// A tapered capsule from `a` (radius ra) to `c` (radius rc): two spherical caps joined by a cone,
// smooth throughout. Limbs, fingers, horns with a round tip.
export function capsule(
  b: GeometryBuilder,
  a: V3,
  c: V3,
  ra: number,
  rc: number,
  seg = 10,
  capRings = 4,
) {
  const { m, length } = aim(a, c);
  const profile: [number, number][] = [];
  for (let i = 0; i <= capRings; i++) {
    const t = -Math.PI / 2 + (i / capRings) * (Math.PI / 2);
    profile.push([Math.cos(t) * ra, Math.sin(t) * ra]);
  }
  for (let i = 0; i <= capRings; i++) {
    const t = (i / capRings) * (Math.PI / 2);
    profile.push([Math.cos(t) * rc, length + Math.sin(t) * rc]);
  }
  profile[0][0] = 0;
  profile[profile.length - 1][0] = 0;
  return smoothLathe(b.push().transform(m), profile, seg).pop();
}

// A horn or ear point: a curved cone from `a` toward `tip`, bending along `bend` (a world-space
// offset applied to the middle), radius `r` at the base tapering to a rounded point.
export function horn(b: GeometryBuilder, a: V3, tip: V3, bend: V3, r: number, seg = 8, steps = 5) {
  const pts: V3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const k = 4 * t * (1 - t);
    pts.push([
      a[0] + (tip[0] - a[0]) * t + bend[0] * k,
      a[1] + (tip[1] - a[1]) * t + bend[1] * k,
      a[2] + (tip[2] - a[2]) * t + bend[2] * k,
    ]);
  }
  for (let i = 0; i < steps; i++) {
    const r0 = r * (1 - i / steps) ** 0.9 + 0.004;
    const r1 = r * (1 - (i + 1) / steps) ** 0.9 + 0.004;
    capsule(b, pts[i], pts[i + 1], r0, r1, seg, 2);
  }
  return b;
}

// Skin weights by height: every vertex bound to the placeholder `region` bone gets a two-bone blend
// from `keys` (top to bottom: [y, bone]), smoothstepped between neighbouring keys.
export function blendByHeight(g: GeometryData, region: number, keys: [number, number][]) {
  const f32 = new Float32Array(g.data);
  const u8 = new Uint8Array(g.data);
  for (let i = 0; i < g.vertexCount; i++) {
    const o = i * VERTEX_STRIDE;
    if (u8[o + 20] !== region) continue;
    const y = f32[i * 6 + 1];
    let a = keys[keys.length - 1][1],
      c = a,
      w = 1;
    if (y >= keys[0][0]) a = c = keys[0][1];
    else {
      for (let k = 0; k < keys.length - 1; k++) {
        const [y0, b0] = keys[k];
        const [y1, b1] = keys[k + 1];
        if (y <= y0 && y >= y1) {
          const t = (y0 - y) / (y0 - y1 || 1);
          a = b0;
          c = b1;
          w = b0 === b1 ? 1 : 1 - t * t * (3 - 2 * t);
          break;
        }
      }
    }
    u8[o + 20] = a;
    u8[o + 21] = c;
    u8[o + 22] = Math.round(w * 255);
  }
}
