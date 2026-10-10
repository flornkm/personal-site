import type { GeometryBuilder } from "../engine/geometry";

// Modelling helpers for the character, built on GeometryBuilder.tri so they inherit its matrix
// stack, colour and bone binding. Everything here runs once at load, so it allocates freely.

export type V3 = [number, number, number];

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
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
export const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const range = (a: number, b: number, n: number) => {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(a + ((b - a) * i) / n);
  return out;
};

const triArea2 = (a: V3, b: V3, c: V3) => {
  const n = cross(sub(b, a), sub(c, a));
  return Math.hypot(n[0], n[1], n[2]);
};

// A colour, or a colour with its own gloss (or self-lit amount, see palette.ts).
export type Paint = number | readonly [color: number, gloss: number];

export interface SurfaceOptions {
  // `us` wraps around: its last sample is the first one again, so the seam shares normals.
  closedU?: boolean;
  flip?: boolean;
  gloss?: number;
  // Colour of each quad from its centre parameters; null leaves a hole.
  paint?: (u: number, v: number) => Paint | null;
  // Colour of each grid point, blended across the quads (for soft gradients).
  tint?: (u: number, v: number) => V3;
}

// A smooth-shaded parametric patch whose front face is the side du × dv points to. Normals are the
// area-weighted average of the quads around each grid point, merged across the seam and at
// collapsed rows (poles), so caps shade cleanly.
export function surface(
  b: GeometryBuilder,
  us: number[],
  vs: number[],
  at: (u: number, v: number) => V3,
  opts: SurfaceOptions = {},
) {
  const nu = us.length;
  const nv = vs.length;
  const P = vs.map((v) => us.map((u) => at(u, v)));
  const N = P.map((row) => row.map((): V3 => [0, 0, 0]));
  for (let j = 0; j < nv - 1; j++) {
    for (let i = 0; i < nu - 1; i++) {
      const n = cross(sub(P[j + 1][i + 1], P[j][i]), sub(P[j + 1][i], P[j][i + 1]));
      for (const [jj, ii] of [
        [j, i],
        [j, i + 1],
        [j + 1, i + 1],
        [j + 1, i],
      ]) {
        const t = N[jj][ii];
        t[0] += n[0];
        t[1] += n[1];
        t[2] += n[2];
      }
    }
  }
  if (opts.closedU) {
    for (let j = 0; j < nv; j++) {
      const s = add(N[j][0], N[j][nu - 1]);
      N[j][0] = s;
      N[j][nu - 1] = [...s];
    }
  }
  for (let j = 0; j < nv; j++) {
    const row = P[j];
    const pole = row.every(
      (p) => Math.hypot(p[0] - row[0][0], p[1] - row[0][1], p[2] - row[0][2]) < 1e-7,
    );
    if (!pole) continue;
    const s: V3 = [0, 0, 0];
    for (const n of N[j]) {
      s[0] += n[0];
      s[1] += n[1];
      s[2] += n[2];
    }
    for (let i = 0; i < nu; i++) N[j][i] = [...s];
  }
  const sign = opts.flip ? -1 : 1;
  const Nn = N.map((row) => row.map((n) => mul(norm(n), sign)));
  const gloss = opts.gloss;
  const C = opts.tint ? vs.map((v) => us.map((u) => opts.tint!(u, v))) : null;
  for (let j = 0; j < nv - 1; j++) {
    for (let i = 0; i < nu - 1; i++) {
      if (opts.paint) {
        const c = opts.paint((us[i] + us[i + 1]) / 2, (vs[j] + vs[j + 1]) / 2);
        if (c === null) continue;
        if (typeof c === "number") b.color(c, gloss);
        else b.color(c[0], c[1]);
      }
      const q: [number, number][] = [
        [j, i],
        [j, i + 1],
        [j + 1, i + 1],
        [j + 1, i],
      ];
      if (opts.flip) q.reverse();
      const [p0, p1, p2, p3] = q.map(([jj, ii]) => P[jj][ii]);
      const [n0, n1, n2, n3] = q.map(([jj, ii]) => Nn[jj][ii]);
      const c = C ? q.map(([jj, ii]) => C[jj][ii]) : null;
      if (triArea2(p0, p1, p2) > 1e-12)
        b.tri(p0, p1, p2, n0, n1, n2, c ? [c[0], c[1], c[2]] : undefined);
      if (triArea2(p0, p2, p3) > 1e-12)
        b.tri(p0, p2, p3, n0, n2, n3, c ? [c[0], c[2], c[3]] : undefined);
    }
  }
}

// A horizontal cross-section: a superellipse around (x, z) at height y, with separate depths in
// front of and behind the centre. `t` runs once around from the front centre (+Z) toward +X.
export interface Section {
  y: number;
  rx: number;
  zf: number;
  zb?: number;
  x?: number;
  z?: number;
  // 2 is an ellipse; larger is squarer.
  n?: number;
  // A soft ridge down the front, added to the front depth (a breastplate's keel).
  keel?: number;
}

const spow = (v: number, e: number) => Math.sign(v) * Math.abs(v) ** e;

export function sectionPoint(s: Section, t: number): V3 {
  const a = t * Math.PI * 2;
  const e = 2 / (s.n ?? 2);
  const sa = Math.sin(a),
    ca = Math.cos(a);
  let d = ca >= 0 ? s.zf : (s.zb ?? s.zf);
  if (s.keel && ca > 0) d += s.keel * Math.exp(-((Math.atan2(sa, ca) / 0.32) ** 2));
  return [(s.x ?? 0) + s.rx * spow(sa, e), s.y, (s.z ?? 0) + d * spow(ca, e)];
}

export const inset = (s: Section, by: number): Section => ({
  ...s,
  rx: Math.max(0, s.rx - by),
  zf: Math.max(0, s.zf - by),
  zb: Math.max(0, (s.zb ?? s.zf) - by),
});

const scaled = (s: Section, k: number, y: number): Section => ({
  ...s,
  y,
  rx: s.rx * k,
  zf: s.zf * k,
  zb: (s.zb ?? s.zf) * k,
  keel: (s.keel ?? 0) * k,
});

export interface TubeOptions {
  segments?: number;
  // Closes the end with an elliptical dome of this height.
  capBottom?: number;
  capTop?: number;
  capSteps?: number;
  // Builds only t in [from, to] (an open shell); closed all round otherwise.
  from?: number;
  to?: number;
  flip?: boolean;
  gloss?: number;
  // Paint by around-parameter t, the quad's mean height and its row (counting cap rows).
  paint?: (t: number, y: number, row: number) => Paint | null;
}

// The sections plus their dome rows, bottom to top.
export function tubeRows(sections: Section[], opts: TubeOptions = {}): Section[] {
  const steps = opts.capSteps ?? 4;
  const rows: Section[] = [];
  const dome = (s: Section, h: number, dir: 1 | -1) =>
    range(0, Math.PI / 2, steps)
      .slice(1)
      .map((beta) => scaled(s, Math.cos(beta), s.y + dir * h * Math.sin(beta)));
  if (opts.capBottom) rows.push(...dome(sections[0], opts.capBottom, -1).reverse());
  rows.push(...sections);
  if (opts.capTop) rows.push(...dome(sections[sections.length - 1], opts.capTop, 1));
  return rows;
}

const aroundSamples = (opts: TubeOptions) => {
  const from = opts.from ?? 0;
  const to = opts.to ?? 1;
  const n = Math.max(2, Math.round((opts.segments ?? 20) * (to - from)));
  return range(from, to, n);
};

// Stacks sections bottom to top into one smooth tube with optional rounded ends.
export function tube(b: GeometryBuilder, sections: Section[], opts: TubeOptions = {}) {
  const rows = tubeRows(sections, opts);
  const closed = opts.from === undefined && opts.to === undefined;
  const paint = opts.paint;
  surface(
    b,
    aroundSamples(opts),
    rows.map((_, i) => i),
    (t, v) => sectionPoint(rows[v], t),
    {
      closedU: closed,
      flip: opts.flip,
      gloss: opts.gloss,
      paint: paint
        ? (t, v) => {
            const j = Math.floor(v);
            return paint(((t % 1) + 1) % 1, (rows[j].y + rows[j + 1].y) / 2, j);
          }
        : undefined,
    },
  );
  return rows;
}

export interface ShellOptions extends TubeOptions {
  thick: number;
  // Colour of the inner face and of the cut edges.
  inside: number;
  edge?: number;
  // Which cut edges to close.
  rimBottom?: boolean;
  rimTop?: boolean;
}

// A tube with real thickness: an outer face, an inset inner face and the cut edges between them,
// so open garments (skirts, plates, cuffs) never show through from below or inside.
export function shell(b: GeometryBuilder, sections: Section[], opts: ShellOptions) {
  const outer = tube(b, sections, opts);
  const inner = outer.map((s) => inset(s, opts.thick));
  const ts = aroundSamples(opts);
  b.color(opts.inside);
  surface(
    b,
    ts,
    inner.map((_, i) => i),
    (t, v) => sectionPoint(inner[v], t),
    { closedU: opts.from === undefined, flip: true },
  );
  b.color(opts.edge ?? opts.inside, opts.gloss);
  const rim = (row: number, flip: boolean) =>
    surface(
      b,
      ts,
      [0, 1],
      (t, k) => mix(sectionPoint(outer[row], t), sectionPoint(inner[row], t), k),
      { flip },
    );
  if (opts.rimBottom !== false) rim(0, true);
  if (opts.rimTop) rim(outer.length - 1, false);
  if (opts.from !== undefined || opts.to !== undefined) {
    const rows = outer.map((_, i) => i);
    for (const [t, flip] of [
      [ts[0], false],
      [ts[ts.length - 1], true],
    ] as const) {
      surface(
        b,
        rows,
        [0, 1],
        (v, k) => mix(sectionPoint(outer[v], t), sectionPoint(inner[v], t), k),
        { flip },
      );
    }
  }
  return outer;
}

// An ellipsoid centred at c with radii r, θ around Y from +Z toward +X and φ from -π/2 (bottom)
// to π/2 (top); `paint` gets the quad's centre (θ, φ).
export function ellipsoid(
  b: GeometryBuilder,
  c: V3,
  r: V3,
  opts: {
    segments?: number;
    rings?: number;
    phi0?: number;
    phi1?: number;
    flip?: boolean;
    gloss?: number;
    paint?: (theta: number, phi: number) => Paint | null;
  } = {},
) {
  const seg = opts.segments ?? 16;
  const rings = opts.rings ?? 10;
  surface(
    b,
    range(-Math.PI, Math.PI, seg),
    range(opts.phi0 ?? -Math.PI / 2, opts.phi1 ?? Math.PI / 2, rings),
    (th, ph) => [
      c[0] + r[0] * Math.cos(ph) * Math.sin(th),
      c[1] + r[1] * Math.sin(ph),
      c[2] + r[2] * Math.cos(ph) * Math.cos(th),
    ],
    { closedU: true, flip: opts.flip, gloss: opts.gloss, paint: opts.paint },
  );
}

// A capsule-ish limb between two points: circular sections of radius r0 at a and r1 at b, with
// domed ends. Built along +Y and rotated onto a→b.
export function capsule(b: GeometryBuilder, a: V3, c: V3, r0: number, r1: number, segments = 12) {
  const d = sub(c, a);
  const len = Math.hypot(d[0], d[1], d[2]);
  const dir = norm(d);
  b.push().translate(a[0], a[1], a[2]);
  // Rotation taking +Y onto dir: pitch about X then yaw about Y.
  const yaw = Math.atan2(dir[0], dir[2]);
  const pitch = Math.acos(Math.max(-1, Math.min(1, dir[1])));
  b.rotateY(yaw).rotateX(pitch);
  tube(
    b,
    [
      { y: 0, rx: r0, zf: r0 },
      { y: len, rx: r1, zf: r1 },
    ],
    { capBottom: r0, capTop: r1, segments, capSteps: 3 },
  );
  b.pop();
}

// A round tube swept along a path, open-ended or closed into a loop. Frames are parallel-transported
// so the tube never twists.
export function sweep(
  b: GeometryBuilder,
  path: V3[],
  radius: (k: number) => number,
  // `paint` gets the outward direction of the quad's centre and how far along the path it is.
  opts: {
    segments?: number;
    closed?: boolean;
    gloss?: number;
    paint?: (out: V3, k: number) => Paint | null;
  } = {},
) {
  const n = path.length;
  const closed = opts.closed ?? false;
  const tangent = (i: number) => {
    const a = closed ? path[(i - 1 + n) % n] : path[Math.max(0, i - 1)];
    const c = closed ? path[(i + 1) % n] : path[Math.min(n - 1, i + 1)];
    return norm(sub(c, a));
  };
  const t0 = tangent(0);
  let side = norm(cross(t0, Math.abs(t0[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  const frames: { side: V3; up: V3 }[] = [];
  for (let i = 0; i < n; i++) {
    const t = tangent(i);
    side = norm(sub(side, mul(t, dot(side, t))));
    frames.push({ side, up: cross(t, side) });
  }
  const count = closed ? n + 1 : n;
  const idx = (j: number) => j % n;
  surface(
    b,
    range(0, Math.PI * 2, opts.segments ?? 10),
    range(0, count - 1, count - 1),
    (a, j) => {
      const i = idx(j);
      const k = closed ? j / n : j / (n - 1);
      const r = radius(k);
      const f = frames[i];
      return add(path[i], add(mul(f.side, Math.cos(a) * r), mul(f.up, Math.sin(a) * r)));
    },
    {
      closedU: true,
      gloss: opts.gloss,
      paint: opts.paint
        ? (a, j) => {
            const f = frames[idx(Math.floor(j))];
            return opts.paint!(
              add(mul(f.side, Math.cos(a)), mul(f.up, Math.sin(a))),
              closed ? j / n : j / (n - 1),
            );
          }
        : undefined,
    },
  );
}

// A surface whose front face is chosen to point along `out` (a rough outward direction at the
// patch's middle), whatever way its parameters run.
export function surfaceToward(
  b: GeometryBuilder,
  us: number[],
  vs: number[],
  at: (u: number, v: number) => V3,
  out: V3,
  opts: SurfaceOptions = {},
) {
  const i = Math.floor((us.length - 1) / 2),
    j = Math.floor((vs.length - 1) / 2);
  const du = sub(at(us[i + 1], vs[j]), at(us[i], vs[j]));
  const dv = sub(at(us[i], vs[j + 1]), at(us[i], vs[j]));
  surface(b, us, vs, at, { ...opts, flip: dot(cross(du, dv), out) < 0 });
}

export type SlabEdge = "u0" | "u1" | "v0" | "v1";

// A curved plate with real thickness between an outer and an inner face over the same (u, v)
// rectangle, closed along all four cut edges: greaves, straps, patches. `edges` overrides the
// colour of single cut edges (u0 = the first u sample, v1 = the last v sample, ...).
export function slab(
  b: GeometryBuilder,
  us: number[],
  vs: number[],
  outer: (u: number, v: number) => V3,
  inner: (u: number, v: number) => V3,
  opts: {
    inside: number;
    edge?: number;
    edges?: Partial<Record<SlabEdge, Paint>>;
    gloss?: number;
    paint?: (u: number, v: number) => Paint | null;
  },
) {
  const um = us[Math.floor((us.length - 1) / 2)],
    vm = vs[Math.floor((vs.length - 1) / 2)];
  const out = sub(outer(um, vm), inner(um, vm));
  surfaceToward(b, us, vs, outer, out, { gloss: opts.gloss, paint: opts.paint });
  b.color(opts.inside);
  surfaceToward(b, us, vs, inner, mul(out, -1));
  const edgeColor = (e: SlabEdge) => {
    const c = opts.edges?.[e] ?? opts.edge ?? opts.inside;
    if (typeof c === "number") b.color(c, opts.gloss);
    else b.color(c[0], c[1]);
  };
  const k01 = [0, 1];
  for (const [u0, u1, e] of [
    [us[0], us[1], "u0"],
    [us[us.length - 1], us[us.length - 2], "u1"],
  ] as const) {
    edgeColor(e);
    const away = sub(outer(u0, vm), outer(u1, vm));
    surfaceToward(b, k01, vs, (k, v) => mix(outer(u0, v), inner(u0, v), k), away);
  }
  for (const [v0, v1, e] of [
    [vs[0], vs[1], "v0"],
    [vs[vs.length - 1], vs[vs.length - 2], "v1"],
  ] as const) {
    edgeColor(e);
    const away = sub(outer(um, v0), outer(um, v1));
    surfaceToward(b, us, k01, (u, k) => mix(outer(u, v0), inner(u, v0), k), away);
  }
}

// A flat disc (or an ellipse r across, r2 up) at c facing along n: rivets, vents, painted spots.
export function disc(b: GeometryBuilder, c: V3, n: V3, r: number, segments = 10, r2 = r) {
  const nn = norm(n);
  const u = norm(cross(nn, Math.abs(nn[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  const w = cross(nn, u);
  // Rim first: surfaceToward reads the facing from its first row, which must not be the centre.
  surfaceToward(
    b,
    range(0, Math.PI * 2, segments),
    [1, 0],
    (a, k) => add(c, add(mul(u, Math.cos(a) * r * k), mul(w, Math.sin(a) * r2 * k))),
    nn,
  );
}
