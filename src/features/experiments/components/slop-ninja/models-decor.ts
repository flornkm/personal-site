import * as THREE from "three";
import {
  MeshBuilder,
  bevelBox,
  bevelSlab,
  lathe,
  mergeShells,
  placed,
  roundedRect,
} from "./geometry";
import type { V2 } from "./geometry";
import { CHAT_CORNER, CHAT_CORNER_SEGMENTS, CHAT_TAIL } from "./shapes";

// The decor props: the gilded frame (image), the inflated chat bubble (chat) and the AI sparkle gem
// (sparkle). Each is a few closed parts merged into one sliceable mesh. The numbers that place
// painted detail (profile rings, facets, dots, atlas cells) are exported so paint-decor.ts draws
// onto exactly the faces built here.

type V3 = THREE.Vector3;
type UV = [number, number];

const v2 = (x: number, y: number) => new THREE.Vector2(x, y);
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const PLUS_Z = v3(0, 0, 1);
const MINUS_Z = v3(0, 0, -1);

// A rectangle of an atlas canvas in pixels, canvas top = v 1.
export interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

// Maps local (x, y) inside `bounds` onto `cell` of a `size` canvas.
export function cellUV(cell: Cell, size: [number, number], bounds: Bounds) {
  const [cw, ch] = size;
  return (x: number, y: number): UV => [
    (cell.x + ((x - bounds.minX) / (bounds.maxX - bounds.minX)) * cell.w) / cw,
    1 - (cell.y + ((bounds.maxY - y) / (bounds.maxY - bounds.minY)) * cell.h) / ch,
  ];
}

// Overwrites every uv from its vertex position: for small parts that only carry a planar decal.
// Welds go by position alone, so this never opens a seam.
function projectUV(geometry: THREE.BufferGeometry, map: (x: number, y: number) => UV) {
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < position.count; i++) {
    const [u, v] = map(position.getX(i), position.getY(i));
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
  return geometry;
}

function signedArea(loop: V2[]) {
  let a = 0;
  for (let i = 0; i < loop.length; i++) {
    const p = loop[i];
    const q = loop[(i + 1) % loop.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

// Mitred offset of a CCW loop: positive moves every edge inward by `inset`, negative outward.
export function insetLoop(loop: V2[], inset: number): V2[] {
  const n = loop.length;
  return loop.map((p, i) => {
    const e1 = p
      .clone()
      .sub(loop[(i - 1 + n) % n])
      .normalize();
    const e2 = loop[(i + 1) % n].clone().sub(p).normalize();
    const n1 = v2(-e1.y, e1.x);
    const n2 = v2(-e2.y, e2.x);
    const miter = n1.add(n2).multiplyScalar(1 / (1 + n1.dot(n2)));
    return p.clone().addScaledVector(miter, inset);
  });
}

// ---------------------------------------------------------------------------------------------
// Frame: a deep baroque moulding with true mitred corners, the picture sunk inside it, four corner
// rosettes, a shell crest on top and a brass sawtooth hanger on the rabbeted back.

export const FRAME = {
  // Picture height; its width follows the image aspect.
  picture: 1.8,
  band: 0.46,
  // The gold strip repeats along the moulding every 120 texels, at 64 texels per unit.
  goldTile: 120 / 64,
  rosette: { inset: 0.23, radius: 0.2, base: 0.266, segments: 6 },
  crest: { width: 0.95, height: 0.36, gap: 0.006, depth: 0.18, z: 0.05, bevel: 0.035 },
  hanger: { w: 0.42, h: 0.07, d: 0.05, drop: 0.41 },
  // Brass turn buttons holding the backing board in, each [side, offset along it, tilt]. Deep
  // enough to stand proud of the rabbet lip, so they still read with the frame edge-on.
  clip: { w: 0.2, h: 0.07, d: 0.05, bevel: 0.012, gap: 0.008 },
  clips: [
    [0, 0.22, 0.2],
    [1, -0.55, -0.15],
    [2, -0.32, 0.12],
    [3, 0.45, -0.2],
  ] as [number, number, number][],
};

// [inset from the outer edge, z]: from the picture's edge up over the liner, the crest, the
// egg-and-dart ogee, the cove and the outer bead, down the outside wall and in over the back.
export const FRAME_PROFILE: [number, number][] = [
  [0.46, 0.0],
  [0.43, 0.1],
  [0.4, 0.12],
  [0.38, 0.13],
  [0.33, 0.22],
  [0.27, 0.26],
  [0.2, 0.17],
  [0.14, 0.07],
  [0.1, 0.09],
  [0.08, 0.105],
  [0.06, 0.112],
  [0.04, 0.105],
  [0.02, 0.09],
  [0, 0.04],
  [0, -0.12],
  [0.12, -0.12],
  [0.12, -0.08],
];
// Rings up to this one carry the gold strip; past it is the raw wood back.
export const FRAME_GOLD = 14;

// Strip v of each gold ring: the cumulative profile length, 0 at the sight edge, 1 at the back edge.
export function frameProfileV() {
  const lengths = [0];
  for (let i = 1; i <= FRAME_GOLD; i++) {
    const [d0, z0] = FRAME_PROFILE[i - 1];
    const [d1, z1] = FRAME_PROFILE[i];
    lengths.push(lengths[i - 1] + Math.hypot(d1 - d0, z1 - z0));
  }
  const total = lengths[FRAME_GOLD];
  return lengths.map((l) => l / total);
}

export function frameSize(aspect: number) {
  const ch = FRAME.picture;
  const cw = ch * aspect;
  return { cw, ch, w: cw + 2 * FRAME.band, h: ch + 2 * FRAME.band };
}

// The ornament atlas (rosette and crest, slot 3) and the trim atlas (brass and the care tag, slot 4).
export const ORNAMENT_SIZE: [number, number] = [136, 48];
export const ORNAMENT_ROSETTE: Cell = { x: 0, y: 0, w: 48, h: 48 };
export const ORNAMENT_CREST: Cell = { x: 50, y: 8, w: 84, h: 32 };
export const TRIM_SIZE: [number, number] = [64, 64];
export const TRIM_BRASS: Cell = { x: 0, y: 0, w: 64, h: 12 };
export const TRIM_TAG: Cell = { x: 0, y: 16, w: 32, h: 40 };
export const TRIM_CLIP: Cell = { x: 34, y: 30, w: 16, h: 6 };

// A scalloped shell fan standing on its flat base (local y = 0), CCW.
export function crestOutline(): V2[] {
  const { width, height } = FRAME.crest;
  const rx = width / 2;
  const pts: V2[] = [v2(rx * 0.8, 0)];
  const lobes = 6;
  for (let i = 0; i <= lobes * 2; i++) {
    const t = (i / (lobes * 2)) * Math.PI;
    const peak = i % 2 === 0;
    const r = peak ? 1 : 0.8;
    // The end lobes curl down past the base like volutes.
    const lift = i === 0 || i === lobes * 2 ? 0.1 : 0;
    pts.push(v2(Math.cos(t) * rx * r, (Math.sin(t) * (height - 0.03) + 0.03) * r + lift * height));
  }
  pts.push(v2(-rx * 0.8, 0));
  return signedArea(pts) > 0 ? pts : pts.reverse();
}

function moulding(w: number, h: number, cw: number, ch: number) {
  const b = new MeshBuilder();
  const rings = FRAME_PROFILE.map(([d, z]) => {
    const hw = w / 2 - d;
    const hh = h / 2 - d;
    return [v3(hw, -hh, z), v3(hw, hh, z), v3(-hw, hh, z), v3(-hw, -hh, z)];
  });
  const vs = frameProfileV();
  // Each side runs CCW from its own middle, so the four corners mirror into proper mitres.
  const along = (p: V3, side: number) => [p.y, -p.x, -p.y, p.x][side];
  const goldU = (p: V3, side: number) => along(p, side) / FRAME.goldTile + 0.5;
  const backUV = (p: V3): UV => [1 - (p.x + w / 2) / w, (p.y + h / 2) / h];
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i];
    const c = rings[i + 1];
    for (let s = 0; s < 4; s++) {
      const k1 = (s + 1) % 4;
      const quad: [V3, V3, V3, V3] = [a[s], c[s], c[k1], a[k1]];
      if (i < FRAME_GOLD) {
        b.quad(1, quad, [
          [goldU(a[s], s), vs[i]],
          [goldU(c[s], s), vs[i + 1]],
          [goldU(c[k1], s), vs[i + 1]],
          [goldU(a[k1], s), vs[i]],
        ]);
      } else {
        b.quad(2, quad, [backUV(a[s]), backUV(c[s]), backUV(c[k1]), backUV(a[k1])]);
      }
    }
  }
  const picture = rings[0];
  const pictureUV = (p: V3): UV => [(p.x + cw / 2) / cw, (p.y + ch / 2) / ch];
  b.quad(
    0,
    [picture[0], picture[1], picture[2], picture[3]],
    [pictureUV(picture[0]), pictureUV(picture[1]), pictureUV(picture[2]), pictureUV(picture[3])],
    PLUS_Z,
  );
  const board = rings[rings.length - 1];
  b.quad(
    2,
    [board[0], board[1], board[2], board[3]],
    [backUV(board[0]), backUV(board[1]), backUV(board[2]), backUV(board[3])],
    MINUS_Z,
  );
  return b.build(45);
}

export function frame(aspect: number) {
  const { cw, ch, w, h } = frameSize(aspect);
  const parts = [moulding(w, h, cw, ch)];

  const { inset, radius, base, segments } = FRAME.rosette;
  const rosetteUV = cellUV(ORNAMENT_ROSETTE, ORNAMENT_SIZE, {
    minX: -radius,
    maxX: radius,
    minY: -radius,
    maxY: radius,
  });
  // A flattened hexagonal dome seated a hair above the crest ridge, so it never pierces the
  // moulding. Six facets, one painted petal on each.
  const rosette = projectUV(
    lathe(
      [
        [0, base + 0.1],
        [0.12, base + 0.072],
        [radius, base + 0.024],
        [radius * 0.9, base],
      ],
      segments,
      { front: 3, side: 3, back: 3, crease: 50 },
    ),
    rosetteUV,
  );
  for (const [sx, sy] of [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ]) {
    parts.push(
      placed(rosette, {
        position: [sx * (w / 2 - inset), sy * (h / 2 - inset), 0],
        rotation: [0, 0, Math.PI / segments],
      }),
    );
  }

  const crest = FRAME.crest;
  const outline = crestOutline();
  const crestUV = cellUV(ORNAMENT_CREST, ORNAMENT_SIZE, {
    minX: -crest.width / 2,
    maxX: crest.width / 2,
    minY: 0,
    maxY: crest.height,
  });
  const shell = projectUV(
    bevelSlab((d) => insetLoop(outline, d), crest.depth, crest.bevel, {
      front: 3,
      side: 3,
      back: 3,
      crease: 35,
    }),
    crestUV,
  );
  parts.push(placed(shell, { position: [0, h / 2 + crest.gap, crest.z] }));

  const hanger = FRAME.hanger;
  const brassUV = cellUV(TRIM_BRASS, TRIM_SIZE, {
    minX: -hanger.w / 2,
    maxX: hanger.w / 2,
    minY: -hanger.h / 2,
    maxY: hanger.h / 2,
  });
  const board = FRAME_PROFILE[FRAME_PROFILE.length - 1][1];
  parts.push(
    placed(
      projectUV(
        bevelBox(hanger.w, hanger.h, hanger.d, { bevel: 0.012, front: 4, side: 4, back: 4 }),
        brassUV,
      ),
      { position: [0, h / 2 - hanger.drop, board - 0.005 - hanger.d / 2] },
    ),
  );

  // Turn buttons lie on the recessed board, clear of the rabbet's step wall by `gap`.
  const clip = FRAME.clip;
  const button = projectUV(
    bevelBox(clip.w, clip.h, clip.d, { bevel: clip.bevel, front: 4, side: 4, back: 4 }),
    cellUV(TRIM_CLIP, TRIM_SIZE, {
      minX: -clip.w / 2,
      maxX: clip.w / 2,
      minY: -clip.h / 2,
      maxY: clip.h / 2,
    }),
  );
  const lip = FRAME_PROFILE[FRAME_PROFILE.length - 1][0];
  for (const [side, along, tilt] of FRAME.clips) {
    // Sides CCW from the right; each button lies along its edge, tilted a little.
    const angle = (side * Math.PI) / 2 + Math.PI / 2 + tilt;
    const reach = Math.abs(Math.sin(tilt)) * (clip.w / 2) + Math.cos(tilt) * (clip.h / 2);
    const inward = lip + clip.gap + reach;
    const [nx, ny] = [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ][side];
    const edge = side % 2 === 0 ? w / 2 : h / 2;
    parts.push(
      placed(button, {
        position: [
          nx * (edge - inward) + -ny * along,
          ny * (edge - inward) + nx * along,
          board - 0.004 - clip.d / 2,
        ],
        rotation: [0, 0, angle],
      }),
    );
  }

  const geometry = mergeShells(...parts);
  // Centre the crest-topped silhouette, so the frame tumbles about its middle.
  const box = geometry.boundingBox!;
  geometry.translate(0, -(box.max.y + box.min.y) / 2, 0);
  return geometry;
}

// ---------------------------------------------------------------------------------------------
// Chat bubble: an inflated pillow, two puffed halves pinched into a piped seam, three typing-dot
// buttons on the back and a care tag hanging off the seam.

export const CHAT = {
  w: 2.6,
  h: 1.625,
  // The seam band repeats every half unit around the bubble.
  seamTile: 0.5,
  // How much thinner the tail tip is than the body, front to back.
  tipThickness: 0.55,
  // The tail's walls move in by this fraction of each ring's inset.
  tailInset: 0.22,
  dots: { r: 0.15, h: 0.07, gap: 0.004, spacing: 0.46, y: 0.02 },
  // Hung square off the flat of the bottom seam, between the tail and the corner arc, so its top
  // edge runs flush along the bead instead of dangling from one corner.
  tag: { w: 0.34, h: 0.42, d: 0.024, x: 0.44, tilt: 0, gap: 0.004 },
};

// [inset, z] of the front half, face first; the back half mirrors it. The last ring is the seam
// bead (a negative inset sticks out), meeting the pinch at a hard crease.
export const CHAT_PROFILE: [number, number][] = [
  [0.3, 0.3],
  [0.15, 0.28],
  [0.05, 0.225],
  [0.008, 0.14],
  [0.02, 0.035],
  [-0.025, 0],
];

// The bubble outline shrunk by `inset` (or grown, when negative). The body is an exact inset rounded
// rect. The tail's walls only move in by a fraction of the inset, so its sharp tip doesn't collapse
// and it stays plump toward the face; each ring still nests inside the one before, so no band folds.
export function chatRing(inset: number, w = CHAT.w, h = CHAT.h): V2[] {
  const r = h * CHAT_CORNER;
  const x0 = -w / 2 + r + w * CHAT_TAIL.x;
  const base0 = v2(x0, -h / 2);
  const base1 = v2(x0 + w * CHAT_TAIL.forward, -h / 2);
  const tip = v2(x0 - w * CHAT_TAIL.back, -h / 2 - h * CHAT_TAIL.drop);
  if (inset < 0) return insetLoop(chatRing(0, w, h), inset);
  const body = roundedRect(w - 2 * inset, h - 2 * inset, r - inset, CHAT_CORNER_SEGMENTS);
  const wall = (from: V2, to: V2) => {
    const dir = to.clone().sub(from).normalize();
    return { at: from.clone().addScaledVector(v2(-dir.y, dir.x), inset * CHAT.tailInset), dir };
  };
  const left = wall(base0, tip);
  const right = wall(tip, base1);
  // The tail's root sits a hair above the bottom edge, so the seam faces either side of it are
  // never coplanar (a cut exactly along one would otherwise graze the other).
  const y = -h / 2 + inset + 0.006;
  const onBottom = ({ at, dir }: { at: V2; dir: V2 }) =>
    at.clone().addScaledVector(dir, (y - at.y) / dir.y);
  const cross = (a: V2, b: V2) => a.x * b.y - a.y * b.x;
  const t = cross(right.at.clone().sub(left.at), right.dir) / cross(left.dir, right.dir);
  return [...body, onBottom(left), left.at.clone().addScaledVector(left.dir, t), onBottom(right)];
}

// Index of the tail tip in every chat ring: after the body's four corner arcs and the tail's first base.
export const CHAT_TIP = CHAT_CORNER_SEGMENTS * 4 + 5;

export function chatBounds(w = CHAT.w, h = CHAT.h): Bounds {
  const bead = chatRing(CHAT_PROFILE[CHAT_PROFILE.length - 1][0], w, h);
  const box = new THREE.Box2().setFromPoints(bead);
  return { minX: box.min.x, maxX: box.max.x, minY: box.min.y, maxY: box.max.y };
}

export function chatDots() {
  const { spacing, y, r } = CHAT.dots;
  return [-1, 0, 1].map((i) => ({ x: i * spacing, y, r }));
}

export function pillow(w: number, h: number) {
  const bounds = chatBounds(w, h);
  const bw = bounds.maxX - bounds.minX;
  const bh = bounds.maxY - bounds.minY;
  const frontUV = (p: V3): UV => [(p.x - bounds.minX) / bw, (p.y - bounds.minY) / bh];
  const backUV = (p: V3): UV => [1 - (p.x - bounds.minX) / bw, (p.y - bounds.minY) / bh];

  const half = CHAT_PROFILE;
  const profile = [
    ...half,
    ...half
      .slice(0, -1)
      .reverse()
      .map(([d, z]) => [d, -z] as const),
  ];
  const rings = profile.map(([d, z]) =>
    chatRing(d, w, h).map((p, k) => v3(p.x, p.y, k === CHAT_TIP ? z * CHAT.tipThickness : z)),
  );
  const seam = half.length - 1;
  // Seam stitches run on from one corner of the crest ring all the way round.
  const crest = rings[seam];
  const run = [0];
  for (let k = 1; k <= crest.length; k++) {
    run.push(run[k - 1] + crest[k - 1].distanceTo(crest[k % crest.length]));
  }

  const b = new MeshBuilder();
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i];
    const c = rings[i + 1];
    const n = a.length;
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n;
      const quad: [V3, V3, V3, V3] = [a[k], c[k], c[k1], a[k1]];
      if (i === seam - 1 || i === seam) {
        const v0 = i === seam ? 0.5 : 0;
        const u0 = run[k] / CHAT.seamTile;
        const u1 = run[k + 1] / CHAT.seamTile;
        b.quad(2, quad, [
          [u0, v0],
          [u0, v0 + 0.5],
          [u1, v0 + 0.5],
          [u1, v0],
        ]);
      } else {
        const uv = i < seam ? frontUV : backUV;
        b.quad(i < seam ? 0 : 1, quad, [uv(a[k]), uv(c[k]), uv(c[k1]), uv(a[k1])]);
      }
    }
  }
  // Each face: a fan over the body from its centre, plus the tail's own triangle.
  const face = (ring: V3[], group: number, facing: V3, uv: (p: V3) => UV) => {
    const centre = v3(0, 0, ring[0].z);
    const t = CHAT_TIP;
    const loop = [...ring.slice(0, t), ring[t + 1]];
    for (let k = 0; k < loop.length; k++) {
      const p = loop[k];
      const q = loop[(k + 1) % loop.length];
      b.tri(group, [centre, p, q], [uv(centre), uv(p), uv(q)], facing);
    }
    const tail: [V3, V3, V3] = [ring[t - 1], ring[t], ring[t + 1]];
    b.tri(group, tail, [uv(tail[0]), uv(tail[1]), uv(tail[2])], facing);
  };
  face(rings[0], 0, PLUS_Z, frontUV);
  face(rings[rings.length - 1], 1, MINUS_Z, backUV);
  const parts = [b.build(55)];

  const back = -half[0][1];
  const dot = lathe(
    [
      [0, CHAT.dots.h],
      [CHAT.dots.r * 0.72, CHAT.dots.h * 0.68],
      [CHAT.dots.r, 0],
    ],
    8,
    { front: 1, side: 1, back: 1, crease: 50 },
  );
  for (const { x, y } of chatDots()) {
    const button = placed(dot, {
      position: [x, y, back - CHAT.dots.gap],
      rotation: [0, 0, Math.PI / 8],
      scale: [1, 1, -1],
    });
    parts.push(projectUV(button, (px, py) => backUV(v3(px, py, 0))));
  }

  const { tag } = CHAT;
  const tagUV = cellUV(TRIM_TAG, TRIM_SIZE, {
    minX: -tag.w / 2,
    maxX: tag.w / 2,
    minY: -tag.h / 2,
    maxY: tag.h / 2,
  });
  const card = projectUV(bevelBox(tag.w, tag.h, tag.d, { front: 3, side: 3, back: 3 }), tagUV);
  // Hang it off the bead's bottom edge: its highest corner a hair below the seam.
  const c = Math.cos(tag.tilt);
  const s = Math.sin(tag.tilt);
  const top = Math.max(
    ...[
      [-1, 1],
      [1, 1],
    ].map(([sx, sy]) => (sx * tag.w * s) / 2 + (sy * tag.h * c) / 2),
  );
  const seamBottom = -h / 2 + half[seam][0];
  parts.push(
    placed(card, {
      position: [tag.x, seamBottom - tag.gap - top, 0],
      rotation: [0, 0, tag.tilt],
    }),
  );
  return mergeShells(...parts);
}

// ---------------------------------------------------------------------------------------------
// Sparkle: the four-point AI sparkle cut as a gem. Concave curved arms, a girdle band, a two-step
// crown up to a diamond table and a pointed pavilion, with a small satellite sparkle in the notch.

export const GEM = {
  radius: 1.28,
  waist: 0.5,
  // How far each arm's curve bows in toward the centre.
  bow: 0.2,
  girdle: 0.07,
  crown: { scale: 0.55, z: 0.24 },
  table: { r: 0.27, z: 0.36 },
  pavilion: -0.46,
  // Upright, its left and bottom tips nesting 0.025 off the notch's two edges.
  satellite: { x: 0.66, y: 0.66, radius: 0.44, waist: 0.15, girdle: 0.04, apex: 0.15 },
};

// Points per arm side between a tip and a waist (the curve's interior samples plus one end).
const GEM_STEPS = 3;

// CCW from the top tip: tip, curve, waist, curve, next tip...
export function gemOutline(): V2[] {
  const { radius, waist, bow } = GEM;
  const pts: V2[] = [];
  for (let i = 0; i < 4; i++) {
    const t = Math.PI / 2 + (i * Math.PI) / 2;
    const tip = v2(Math.cos(t) * radius, Math.sin(t) * radius);
    const w = v2(Math.cos(t + Math.PI / 4) * waist, Math.sin(t + Math.PI / 4) * waist);
    const next = v2(Math.cos(t + Math.PI / 2) * radius, Math.sin(t + Math.PI / 2) * radius);
    const curve = (from: V2, to: V2, j: number) => {
      const control = from
        .clone()
        .add(to)
        .multiplyScalar(0.5 * (1 - bow));
      const s = j / GEM_STEPS;
      return from
        .clone()
        .multiplyScalar((1 - s) ** 2)
        .addScaledVector(control, 2 * (1 - s) * s)
        .addScaledVector(to, s * s);
    };
    pts.push(tip);
    for (let j = 1; j < GEM_STEPS; j++) pts.push(curve(tip, w, j));
    pts.push(w);
    for (let j = 1; j < GEM_STEPS; j++) pts.push(curve(w, next, j));
  }
  return pts;
}

export const GEM_ARM = GEM_STEPS * 2;

// Each outline point pushed onto the diamond table's edge along its own direction.
function onDiamond(p: V2, r: number) {
  const d = p.clone().normalize();
  return d.multiplyScalar(r / (Math.abs(d.x) + Math.abs(d.y)));
}

export function satelliteOutline(): V2[] {
  const { x, y, radius, waist } = GEM.satellite;
  return Array.from({ length: 8 }, (_, i) => {
    const t = (i * Math.PI) / 4;
    const r = i % 2 === 0 ? radius : waist;
    return v2(x + Math.cos(t) * r, y + Math.sin(t) * r);
  });
}

export interface Facet {
  pts: V2[];
  // Which arm (0 top, 1 left, 2 bottom, 3 right) or -1 for the table and the satellite.
  arm: number;
  // Lit side of its arm's keel (left, seen from the centre looking out) or the dark one.
  lit: boolean;
  // 0 outer crown band, 1 inner crown band, 2 table, 3 satellite, 4 pavilion.
  band: number;
}

// Crown facets (front) or pavilion facets (back), as outlines in world (x, y).
export function gemFacets(side: "front" | "back"): Facet[] {
  const outline = gemOutline();
  const n = outline.length;
  const armOf = (k: number) => {
    const local = k % GEM_ARM;
    return local < GEM_STEPS
      ? { arm: Math.floor(k / GEM_ARM), lit: true }
      : { arm: (Math.floor(k / GEM_ARM) + 1) % 4, lit: false };
  };
  const facets: Facet[] = [];
  const sat = satelliteOutline();
  const satCentre = v2(GEM.satellite.x, GEM.satellite.y);
  if (side === "front") {
    const mid = outline.map((p) => p.clone().multiplyScalar(GEM.crown.scale));
    const table = outline.map((p) => onDiamond(p, GEM.table.r));
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n;
      facets.push({ pts: [outline[k], mid[k], mid[k1], outline[k1]], ...armOf(k), band: 0 });
      facets.push({ pts: [mid[k], table[k], table[k1], mid[k1]], ...armOf(k), band: 1 });
    }
    facets.push({ pts: table, arm: -1, lit: true, band: 2 });
  } else {
    for (let k = 0; k < n; k++) {
      facets.push({ pts: [v2(0, 0), outline[k], outline[(k + 1) % n]], ...armOf(k), band: 4 });
    }
  }
  for (let k = 0; k < 8; k++) {
    facets.push({ pts: [satCentre, sat[k], sat[(k + 1) % 8]], arm: -1, lit: k % 2 === 0, band: 3 });
  }
  return facets;
}

export function gem() {
  const { radius: R, girdle } = GEM;
  const frontUV = (p: V3): UV => [(p.x + R) / (2 * R), (p.y + R) / (2 * R)];
  const backUV = (p: V3): UV => [1 - (p.x + R) / (2 * R), (p.y + R) / (2 * R)];

  // Rings from the table out and down, as loft does: band quads then always face out.
  const stone = (
    outline: V2[],
    crown: { pts: V2[]; z: number }[],
    tableZ: number | null,
    apexTop: number,
    girdleHalf: number,
    apexBottom: number,
  ) => {
    const b = new MeshBuilder();
    const n = outline.length;
    const rings = [
      ...crown.map(({ pts, z }) => pts.map((p) => v3(p.x, p.y, z))),
      outline.map((p) => v3(p.x, p.y, girdleHalf)),
      outline.map((p) => v3(p.x, p.y, -girdleHalf)),
    ];
    const girdleRing = rings.length - 2;
    let perimeter = 0;
    const run = [0];
    for (let k = 0; k < n; k++) {
      perimeter += outline[k].distanceTo(outline[(k + 1) % n]);
      run.push(perimeter);
    }
    for (let i = 0; i < rings.length - 1; i++) {
      const a = rings[i];
      const c = rings[i + 1];
      for (let k = 0; k < n; k++) {
        const k1 = (k + 1) % n;
        const quad: [V3, V3, V3, V3] = [a[k], c[k], c[k1], a[k1]];
        if (i === girdleRing) {
          const u0 = run[k] / perimeter;
          const u1 = run[k + 1] / perimeter;
          b.quad(2, quad, [
            [u0, 1],
            [u0, 0],
            [u1, 0],
            [u1, 1],
          ]);
        } else {
          b.quad(0, quad, [frontUV(a[k]), frontUV(c[k]), frontUV(c[k1]), frontUV(a[k1])]);
        }
      }
    }
    const centre = outline.reduce((s, p) => s.add(p), v2(0, 0)).multiplyScalar(1 / n);
    const top = rings[0];
    const tip = v3(centre.x, centre.y, tableZ ?? apexTop);
    for (let k = 0; k < n; k++) {
      const p = top[k];
      const q = top[(k + 1) % n];
      b.tri(0, [tip, p, q], [frontUV(tip), frontUV(p), frontUV(q)]);
    }
    const bottom = rings[rings.length - 1];
    const apex = v3(centre.x, centre.y, apexBottom);
    for (let k = 0; k < n; k++) {
      const p = bottom[k];
      const q = bottom[(k + 1) % n];
      b.tri(1, [apex, q, p], [backUV(apex), backUV(q), backUV(p)]);
    }
    return b.build(9);
  };

  const outline = gemOutline();
  const big = stone(
    outline,
    [
      { pts: outline.map((p) => onDiamond(p, GEM.table.r)), z: GEM.table.z },
      { pts: outline.map((p) => p.clone().multiplyScalar(GEM.crown.scale)), z: GEM.crown.z },
    ],
    GEM.table.z,
    0,
    girdle,
    GEM.pavilion,
  );
  const sat = GEM.satellite;
  const small = stone(satelliteOutline(), [], null, sat.apex, sat.girdle, -sat.apex);
  return mergeShells(big, small);
}
