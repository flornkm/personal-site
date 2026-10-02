import rough from "roughjs";
import type { RoughCanvas } from "roughjs/bin/canvas";
import type { Options as RoughOptions } from "roughjs/bin/core";
import { LETTER_E, MAGNET, RECORD, insetOrthogonal } from "./models-genuine";

// Skins for the genuine props (models-genuine.ts), painted at the size the game draws them: about
// 64-72 texels per world unit, so one texel lands near one game pixel. Line art is drawn at its
// final size, alpha-thresholded so every stroke has a hard pixel edge, and each canvas is reduced
// to a small palette at the end, so shading reads as flat bands like a PS2 CLUT texture.

type Ctx = CanvasRenderingContext2D;
type RGB = [number, number, number];
type Point = [number, number];

const HAND = '"Cedarville Cursive", "Segoe Script", cursive';

// Paper faces, about 67 texels per unit across the 2.15-wide sheet; their aspect sets its height.
const SHEET_W = 144;
const SHEET_H = 188;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D canvas unavailable");
  return [canvas, ctx];
}

const hex = (c: string): RGB => [
  Number.parseInt(c.slice(1, 3), 16),
  Number.parseInt(c.slice(3, 5), 16),
  Number.parseInt(c.slice(5, 7), 16),
];
const css = ([r, g, b]: RGB) => `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
const shade = ([r, g, b]: RGB, k: number): RGB => [r * k, g * k, b * k];

// Anti-aliased canvas strokes become hard pixels: opaque past half coverage, gone below.
function crisp(ctx: Ctx, cut = 128) {
  const { width: W, height: H } = ctx.canvas;
  const image = ctx.getImageData(0, 0, W, H);
  const d = image.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= cut ? 255 : 0;
  ctx.putImageData(image, 0, 0);
}

// Median cut to `colors` entries, no dither: gradients become hard bands. The cut runs over the
// distinct colours (weighted by use), so one big fill can't eat the boxes a rare colour needs, and
// each box keeps its most used colour, never a mean: every output colour is one that was painted
// (averaging light-grey vinyl wear with a brown label nick came out orange). Pixels then take the
// nearest palette colour.
function quantize(ctx: Ctx, colors: number) {
  const { width: W, height: H } = ctx.canvas;
  const image = ctx.getImageData(0, 0, W, H);
  const d = image.data;
  const rgb = (k: number) => [k >> 16, (k >> 8) & 255, k & 255];
  const use = new Map<number, number>();
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    use.set(k, (use.get(k) ?? 0) + 1);
  }
  if (use.size <= colors) return;
  const spread = (box: number[]) => {
    let best = -1;
    let channel = 0;
    for (let c = 0; c < 3; c++) {
      let lo = 255;
      let hi = 0;
      for (const k of box) {
        const v = rgb(k)[c];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (hi - lo > best) {
        best = hi - lo;
        channel = c;
      }
    }
    return { best, channel };
  };
  const boxes = [[...use.keys()]];
  while (boxes.length < colors) {
    let pick = -1;
    let widest = 0;
    let channel = 0;
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      const s = spread(box);
      if (s.best > widest) {
        widest = s.best;
        pick = i;
        channel = s.channel;
      }
    });
    if (pick < 0) break;
    const box = boxes[pick].sort((a, b) => rgb(a)[channel] - rgb(b)[channel]);
    const total = box.reduce((sum, k) => sum + use.get(k)!, 0);
    let cut = 1;
    let run = use.get(box[0])!;
    while (cut < box.length - 1 && run + use.get(box[cut])! <= total / 2)
      run += use.get(box[cut++])!;
    boxes.splice(pick, 1, box.slice(0, cut), box.slice(cut));
  }
  const palette = boxes.map((box) =>
    box.reduce((best, k) => (use.get(k)! > use.get(best)! ? k : best), box[0]),
  );
  const nearest = new Map<number, number[]>();
  for (const k of use.keys()) {
    const [r, g, b] = rgb(k);
    let pick = palette[0];
    let closest = Infinity;
    for (const q of palette) {
      const [qr, qg, qb] = rgb(q);
      const distance = (r - qr) ** 2 + (g - qg) ** 2 + (b - qb) ** 2;
      if (distance < closest) {
        closest = distance;
        pick = q;
      }
    }
    nearest.set(k, rgb(pick));
  }
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const [r, g, b] = nearest.get((d[i] << 16) | (d[i + 1] << 8) | d[i + 2])!;
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }
  ctx.putImageData(image, 0, 0);
}

// Flat paper with a 1-texel tooth, sparse grime and a 2-texel band of handling wear round the
// border, which keeps a white sheet's outline against a white background.
function paperBase(ctx: Ctx, base: RGB, seed: number, wear: RGB) {
  const { width: W, height: H } = ctx.canvas;
  const rand = rng(seed);
  const image = ctx.createImageData(W, H);
  const d = image.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
      let c = edge < 2 ? wear : base;
      const n = rand();
      if (n < 0.07) c = shade(c, 0.95);
      const i = (y * W + x) * 4;
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  // Grime gathers toward the edges: warm 1-2 texel specks.
  for (let i = 0; i < 26; i++) {
    const side = Math.floor(rand() * 4);
    const along = rand();
    const depth = 2 + rand() ** 2 * 14;
    const x = side === 0 ? depth : side === 1 ? W - depth : along * W;
    const y = side === 2 ? depth : side === 3 ? H - depth : along * H;
    ctx.fillStyle = rand() < 0.6 ? "rgba(150,112,62,0.45)" : "rgba(120,88,50,0.6)";
    ctx.fillRect(Math.round(x), Math.round(y), rand() < 0.3 ? 2 : 1, 1);
  }
}

// Crayon on a separate layer: rough.js strokes, then hard edges and 1-texel lighter wax streaks
// running across the hatching.
function crayonLayer(
  W: number,
  H: number,
  seed: number,
  paint: (rc: RoughCanvas, crayon: Crayon) => void,
) {
  const [layer, ctx] = makeCanvas(W, H);
  const rc = rough.canvas(layer);
  let n = seed;
  const crayon: Crayon = (stroke, extra = {}) => ({
    stroke,
    strokeWidth: 2.8,
    roughness: 1.8,
    bowing: 1.4,
    fillWeight: 2.6,
    hachureGap: 3.6,
    hachureAngle: -30,
    seed: n++,
    ...extra,
  });
  paint(rc, crayon);
  crisp(ctx);
  const rand = rng(seed + 99);
  const image = ctx.getImageData(0, 0, W, H);
  const d = image.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (!d[i + 3]) continue;
      if ((x + 2 * y + (rand() < 0.5 ? 0 : 1)) % 9 === 0) {
        for (let c = 0; c < 3; c++) d[i + c] = Math.min(255, d[i + c] * 1.14 + 10);
      }
    }
  }
  ctx.putImageData(image, 0, 0);
  return layer;
}

type Crayon = (stroke: string, extra?: RoughOptions) => RoughOptions;

const CRAYON = {
  red: "#d8382c",
  redDark: "#8f1c14",
  blue: "#2f5fd0",
  blueDark: "#1c3a8e",
  sky: "#86c0f2",
  green: "#3aa03a",
  greenDark: "#21701f",
  yellow: "#f3c22b",
  orange: "#e8811a",
  brown: "#8b4b1d",
  brownDark: "#4f2609",
  roof: "#c9611f",
  pink: "#e7489c",
  pinkDark: "#9c1767",
  skin: "#ffd3a8",
  skinLine: "#6a3b1a",
  purple: "#7b2fc4",
  grey: "#45454d",
};

function kidsDrawing(W: number, H: number) {
  return crayonLayer(W, H, 11, (rc, crayon) => {
    // Sky scribbled along the top, the magnet sits on it.
    rc.rectangle(
      -6,
      -6,
      W + 12,
      22,
      crayon("none", {
        fill: CRAYON.blue,
        fillStyle: "zigzag",
        hachureGap: 3.4,
        fillWeight: 3,
        roughness: 2.4,
      }),
    );
    rc.ellipse(
      28,
      34,
      32,
      13,
      crayon(CRAYON.blue, {
        strokeWidth: 2.2,
        fill: CRAYON.sky,
        fillStyle: "hachure",
        hachureGap: 4.4,
        fillWeight: 1.6,
      }),
    );

    const [sx, sy] = [118, 32];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      rc.line(
        sx + Math.cos(a) * 15,
        sy + Math.sin(a) * 15,
        sx + Math.cos(a) * 24,
        sy + Math.sin(a) * 24,
        crayon(CRAYON.orange, { strokeWidth: 3, roughness: 1.2 }),
      );
    }
    rc.circle(
      sx,
      sy,
      23,
      crayon(CRAYON.orange, {
        strokeWidth: 3,
        fill: CRAYON.yellow,
        fillStyle: "zigzag",
        hachureGap: 3,
        roughness: 1.4,
      }),
    );
    rc.circle(
      sx - 4,
      sy - 2,
      3,
      crayon(CRAYON.brownDark, {
        fill: CRAYON.brownDark,
        fillStyle: "solid",
        roughness: 0.4,
        strokeWidth: 1,
      }),
    );
    rc.circle(
      sx + 4,
      sy - 2,
      3,
      crayon(CRAYON.brownDark, {
        fill: CRAYON.brownDark,
        fillStyle: "solid",
        roughness: 0.4,
        strokeWidth: 1,
      }),
    );
    rc.arc(
      sx,
      sy + 1,
      11,
      9,
      0.35,
      Math.PI - 0.35,
      false,
      crayon(CRAYON.brownDark, { strokeWidth: 2, roughness: 0.6 }),
    );

    for (const [bx, by] of [
      [36, 54],
      [56, 47],
    ] as Point[]) {
      rc.linearPath(
        [
          [bx - 6, by + 2],
          [bx - 3, by - 2],
          [bx, by + 1],
          [bx + 3, by - 2],
          [bx + 6, by + 2],
        ],
        crayon(CRAYON.grey, { strokeWidth: 2, roughness: 0.8 }),
      );
    }

    // Grass, overshooting the edges and poking up in tufts.
    rc.rectangle(
      -6,
      152,
      W + 12,
      44,
      crayon("none", {
        fill: CRAYON.green,
        fillStyle: "zigzag",
        hachureAngle: 60,
        hachureGap: 3.2,
        fillWeight: 3,
        roughness: 2.2,
      }),
    );
    const tufts: Point[] = [];
    for (let x = -4; x <= W + 4; x += 6) tufts.push([x, 154], [x + 3, 146 + ((x * 7) % 5)]);
    rc.linearPath(tufts, crayon(CRAYON.greenDark, { strokeWidth: 2.2, roughness: 1.2 }));

    // The house.
    rc.rectangle(
      52,
      70,
      9,
      18,
      crayon(CRAYON.brownDark, { fill: CRAYON.brown, fillStyle: "hachure", hachureAngle: 80 }),
    );
    rc.rectangle(
      10,
      96,
      58,
      57,
      crayon(CRAYON.redDark, {
        strokeWidth: 3,
        fill: CRAYON.red,
        fillStyle: "hachure",
        hachureGap: 3.4,
        fillWeight: 2.8,
      }),
    );
    rc.polygon(
      [
        [3, 99],
        [39, 63],
        [75, 99],
      ],
      crayon(CRAYON.brownDark, {
        strokeWidth: 3,
        fill: CRAYON.roof,
        fillStyle: "zigzag",
        hachureAngle: 60,
        hachureGap: 3.2,
      }),
    );
    rc.rectangle(
      32,
      124,
      14,
      29,
      crayon(CRAYON.brownDark, {
        strokeWidth: 2.6,
        fill: CRAYON.brown,
        fillStyle: "zigzag",
        hachureAngle: 85,
        hachureGap: 3,
      }),
    );
    rc.circle(
      43,
      139,
      3,
      crayon(CRAYON.yellow, {
        fill: CRAYON.yellow,
        fillStyle: "solid",
        roughness: 0.4,
        strokeWidth: 1,
      }),
    );
    for (const wx of [16, 50]) {
      rc.rectangle(
        wx,
        105,
        13,
        13,
        crayon(CRAYON.blueDark, {
          strokeWidth: 2.4,
          fill: CRAYON.sky,
          fillStyle: "hachure",
          hachureAngle: 45,
          hachureGap: 3.4,
          fillWeight: 2,
        }),
      );
      rc.line(wx + 6.5, 105, wx + 6.5, 118, crayon(CRAYON.blueDark, { strokeWidth: 2 }));
      rc.line(wx, 111.5, wx + 13, 111.5, crayon(CRAYON.blueDark, { strokeWidth: 2 }));
    }

    // A round face, two dot eyes and a smile: thin lines so they survive at this size.
    const face = (x: number, y: number, d: number) => {
      const thin = { strokeWidth: 1.4, roughness: 0.5, disableMultiStroke: true };
      rc.circle(
        x,
        y,
        d,
        crayon(CRAYON.skinLine, { ...thin, fill: CRAYON.skin, fillStyle: "solid" }),
      );
      const eye = crayon(CRAYON.brownDark, {
        fill: CRAYON.brownDark,
        fillStyle: "solid",
        strokeWidth: 0.5,
        roughness: 0,
      });
      rc.rectangle(x - d * 0.22 - 1, y - d * 0.12 - 1, 2, 2, eye);
      rc.rectangle(x + d * 0.22 - 1, y - d * 0.12 - 1, 2, 2, { ...eye, seed: (eye.seed ?? 0) + 1 });
      rc.arc(
        x,
        y + d * 0.08,
        d * 0.5,
        d * 0.36,
        0.35,
        Math.PI - 0.35,
        false,
        crayon(CRAYON.red, thin),
      );
    };

    // Mom.
    const line = crayon(CRAYON.skinLine, { strokeWidth: 2.6, roughness: 1 });
    rc.line(96, 146, 94, 162, line);
    rc.line(104, 146, 106, 162, crayon(CRAYON.skinLine, { strokeWidth: 2.6, roughness: 1 }));
    rc.line(97, 119, 84, 128, crayon(CRAYON.skinLine, { strokeWidth: 2.6, roughness: 1 }));
    rc.line(103, 119, 116, 132, crayon(CRAYON.skinLine, { strokeWidth: 2.6, roughness: 1 }));
    rc.polygon(
      [
        [100, 112],
        [86, 148],
        [114, 148],
      ],
      crayon(CRAYON.pinkDark, {
        strokeWidth: 2.8,
        fill: CRAYON.pink,
        fillStyle: "zigzag",
        hachureAngle: 20,
        hachureGap: 3,
      }),
    );
    rc.curve(
      [
        [91, 101],
        [93, 93],
        [100, 91],
        [108, 94],
        [110, 103],
        [111, 114],
      ],
      crayon(CRAYON.yellow, { strokeWidth: 3.4 }),
    );
    face(100, 103, 16);
    rc.curve(
      [
        [92, 99],
        [90, 107],
        [89, 115],
      ],
      crayon(CRAYON.yellow, { strokeWidth: 3.2 }),
    );

    // The kid, holding Mom's hand.
    rc.line(124, 149, 122, 162, crayon(CRAYON.skinLine, { strokeWidth: 2.4, roughness: 1 }));
    rc.line(129, 149, 131, 162, crayon(CRAYON.skinLine, { strokeWidth: 2.4, roughness: 1 }));
    rc.line(124, 136, 116, 133, crayon(CRAYON.skinLine, { strokeWidth: 2.4, roughness: 1 }));
    rc.line(129, 136, 138, 143, crayon(CRAYON.skinLine, { strokeWidth: 2.4, roughness: 1 }));
    rc.polygon(
      [
        [126, 129],
        [118, 150],
        [134, 150],
      ],
      crayon(CRAYON.blueDark, {
        strokeWidth: 2.6,
        fill: "#3b82f0",
        fillStyle: "zigzag",
        hachureAngle: -20,
        hachureGap: 3,
      }),
    );
    face(126, 122, 13);
    rc.curve(
      [
        [119, 119],
        [122, 113],
        [130, 113],
        [133, 119],
      ],
      crayon(CRAYON.brownDark, { strokeWidth: 3 }),
    );

    // MOM in big purple letters, and a lopsided heart in her hand.
    const purple = () => crayon(CRAYON.purple, { strokeWidth: 3.2, roughness: 1.1 });
    rc.linearPath(
      [
        [82, 81],
        [84, 63],
        [90, 74],
        [96, 62],
        [98, 81],
      ],
      purple(),
    );
    rc.ellipse(108, 72, 12, 18, purple());
    rc.linearPath(
      [
        [118, 81],
        [120, 63],
        [126, 74],
        [132, 62],
        [134, 81],
      ],
      purple(),
    );
    rc.path(
      "M83 125 C79 116 69 119 81 135 C91 120 89 112 83 125 Z",
      crayon(CRAYON.redDark, {
        strokeWidth: 2.2,
        fill: CRAYON.red,
        fillStyle: "solid",
        roughness: 0.9,
      }),
    );
  });
}

function sheetCanvas(base: string, seed: number, wear: string): [HTMLCanvasElement, Ctx] {
  const [canvas, ctx] = makeCanvas(SHEET_W, SHEET_H);
  paperBase(ctx, hex(base), seed, hex(wear));
  return [canvas, ctx];
}

// The bleed of a crayon layer as seen from the back of the sheet: mirrored, one solid tone where
// `keep` allows and the wax is coloured, grown by a texel so hachure gaps close into a flat shape.
function showThrough(
  art: HTMLCanvasElement,
  keep: (x: number, y: number) => boolean,
  tone: string,
) {
  const { width: W, height: H } = art;
  const src = art.getContext("2d")!.getImageData(0, 0, W, H).data;
  const wax = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const chroma =
        Math.max(src[i], src[i + 1], src[i + 2]) - Math.min(src[i], src[i + 1], src[i + 2]);
      if (src[i + 3] > 127 && chroma > 40 && keep(x, y)) wax[y * W + x] = 1;
    }
  }
  const [layer, ctx] = makeCanvas(W, H);
  const out = ctx.createImageData(W, H);
  const [r, g, b] = hex(tone);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let hit = false;
      for (let dy = -1; dy <= 1 && !hit; dy++) {
        for (let dx = -1; dx <= 1 && !hit; dx++) {
          const sx = x + dx;
          const sy = y + dy;
          hit = sx >= 0 && sy >= 0 && sx < W && sy < H && wax[sy * W + sx] === 1;
        }
      }
      if (!hit) continue;
      const o = (y * W + (W - 1 - x)) * 4;
      out.data[o] = r;
      out.data[o + 1] = g;
      out.data[o + 2] = b;
      out.data[o + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return layer;
}

function mirrored(ctx: Ctx, layer: HTMLCanvasElement, alpha: number) {
  ctx.save();
  ctx.translate(ctx.canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.globalAlpha = alpha;
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}

interface Lettering {
  text: string;
  x: number;
  y: number;
  size: number;
  angle?: number;
  weight?: number;
  align?: CanvasTextAlign;
  // Shrinks the type until the line fits.
  maxWidth?: number;
}

// Hand lettering at its final size, thickened by a stroke and thresholded to hard pixels.
function lettering(W: number, H: number, lines: Lettering[], color: string) {
  const [layer, ctx] = makeCanvas(W, H);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineJoin = "round";
  ctx.textBaseline = "alphabetic";
  for (const { text, x, y, size, angle = 0, weight = 0.9, align = "left", maxWidth } of lines) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    let fitted = size;
    ctx.font = `${fitted}px ${HAND}`;
    while (maxWidth && fitted > 8 && ctx.measureText(text).width + weight > maxWidth) {
      fitted -= 0.5;
      ctx.font = `${fitted}px ${HAND}`;
    }
    ctx.textAlign = align;
    ctx.lineWidth = weight;
    ctx.fillText(text, 0, 0);
    ctx.strokeText(text, 0, 0);
    ctx.restore();
  }
  crisp(ctx, 110);
  return layer;
}

export function paintDrawing() {
  const art = kidsDrawing(SHEET_W, SHEET_H);
  const [front, fctx] = sheetCanvas("#f6ecd3", 600, "#e2cfa4");
  fctx.drawImage(art, 0, 0);
  quantize(fctx, 40);

  const [back, bctx] = sheetCanvas("#f1e3c3", 601, "#dcc699");
  // Only the heaviest wax shows through the paper, as one flat tone: the sky band, the grass and
  // the house. Figures, faces and lettering are too light to bleed.
  const heavy = (x: number, y: number) => y < 18 || y > 144 || (x < 78 && y > 60);
  bctx.globalAlpha = 0.5;
  bctx.drawImage(showThrough(art, heavy, "#d8c8a0"), 0, 0);
  bctx.globalAlpha = 1;
  // Sun-faded where the top of the sheet stuck out past whatever covered the rest on the fridge.
  bctx.fillStyle = "rgba(255,252,238,0.38)";
  bctx.fillRect(2, 2, SHEET_W - 4, 70);
  bctx.drawImage(
    lettering(
      SHEET_W,
      SHEET_H,
      [
        { text: "Emma, age 5", x: 10, y: 30, size: 24, angle: -0.06, weight: 1.1, maxWidth: 124 },
        { text: "for Mommy", x: 20, y: 51, size: 19, angle: -0.05, weight: 0.95 },
      ],
      "#34343a",
    ),
    0,
    0,
  );
  quantize(bctx, 32);
  return { front, back };
}

const LETTER_LINES = [
  "Dear Rosie,",
  "the roses are out",
  "again, so I made",
  "your jam and hid",
  "three jars for you.",
  "Come soon, petal!",
];
const RULE = 14;
const FIRST_RULE = 28;

function linedSheet(base: string, seed: number, wear: string, marginX: number) {
  const [canvas, ctx] = sheetCanvas(base, seed, wear);
  ctx.fillStyle = "#a9bde0";
  for (let y = FIRST_RULE; y < SHEET_H - 3; y += RULE) ctx.fillRect(2, y, SHEET_W - 4, 2);
  ctx.fillStyle = "#e08a8a";
  ctx.fillRect(marginX, 2, 2, SHEET_H - 4);
  return [canvas, ctx] as const;
}

// The folds as the geometry has them: a valley across the top third, a ridge across the bottom
// third (swapped on the back), with hard nicks of wear where each crosses the edges.
function folds(ctx: Ctx, valleyY: number, ridgeY: number) {
  const W = ctx.canvas.width;
  ctx.fillStyle = "rgba(120,92,52,0.32)";
  ctx.fillRect(0, valleyY - 1, W, 2);
  ctx.fillStyle = "rgba(255,252,240,0.75)";
  ctx.fillRect(0, ridgeY, W, 1);
  ctx.fillStyle = "rgba(120,92,52,0.18)";
  ctx.fillRect(0, ridgeY + 1, W, 1);
  ctx.fillStyle = "#b39a6a";
  for (const y of [valleyY, ridgeY]) {
    ctx.fillRect(0, y - 1, 3, 2);
    ctx.fillRect(W - 3, y - 1, 3, 2);
  }
}

function coffeeRing(ctx: Ctx, x: number, y: number, r: number, seed: number) {
  const rand = rng(seed);
  ctx.save();
  ctx.lineCap = "butt";
  ctx.lineWidth = 2;
  for (let a = 0.5; a < Math.PI * 2 - 0.3; a += 0.3) {
    ctx.strokeStyle = rand() < 0.7 ? "rgba(140,86,34,0.5)" : "rgba(120,70,24,0.7)";
    ctx.beginPath();
    ctx.arc(x, y, r + (rand() - 0.5) * 1.2, a, a + 0.3);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(170,120,60,0.1)";
  ctx.beginPath();
  ctx.arc(x, y, r - 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function heart(ctx: Ctx, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.3);
  ctx.bezierCurveTo(x, y, x - s * 0.55, y - s * 0.05, x - s * 0.5, y + s * 0.35);
  ctx.bezierCurveTo(x - s * 0.45, y + s * 0.65, x - s * 0.05, y + s * 0.8, x, y + s);
  ctx.bezierCurveTo(
    x + s * 0.05,
    y + s * 0.8,
    x + s * 0.45,
    y + s * 0.65,
    x + s * 0.5,
    y + s * 0.35,
  );
  ctx.bezierCurveTo(x + s * 0.55, y - s * 0.05, x, y, x, y + s * 0.3);
  ctx.closePath();
}

function letterInk() {
  const rand = rng(77);
  const lines: Lettering[] = LETTER_LINES.map((text, i) => ({
    text,
    x: (i === 0 ? 20 : 24) + (rand() - 0.5) * 2,
    y: FIRST_RULE + RULE * (i + 1) - 2,
    size: i === 0 ? 19 : 17,
    angle: (rand() - 0.5) * 0.03,
    weight: 0.9,
    maxWidth: SHEET_W - 30,
  }));
  lines.push(
    { text: "Love,", x: 66, y: FIRST_RULE + RULE * 8 - 3, size: 18, angle: -0.03, weight: 0.9 },
    {
      text: "Grandma",
      x: 60,
      y: FIRST_RULE + RULE * 9 + 1,
      size: 22,
      angle: -0.06,
      weight: 1.1,
      maxWidth: 72,
    },
  );
  const layer = lettering(SHEET_W, SHEET_H, lines, "#22307a");
  const ctx = layer.getContext("2d")!;
  heart(ctx, 106, FIRST_RULE + RULE * 8 - 13, 11);
  ctx.fillStyle = "#d8382c";
  ctx.fill();
  ctx.strokeStyle = "#22307a";
  ctx.lineWidth = 1.6;
  ctx.stroke();
  crisp(ctx);
  return layer;
}

export function paintLetter() {
  const valley = Math.round(SHEET_H / 3);
  const ridge = Math.round((SHEET_H * 2) / 3);
  const ink = letterInk();

  const [front, fctx] = linedSheet("#f8efda", 700, "#e3cfa6", 16);
  coffeeRing(fctx, 112, 44, 15, 705);
  fctx.drawImage(ink, 0, 0);
  folds(fctx, valley, ridge);
  quantize(fctx, 40);

  const [back, bctx] = linedSheet("#f3e6c4", 701, "#dcc596", SHEET_W - 18);
  mirrored(bctx, ink, 0.15);
  bctx.drawImage(
    lettering(
      SHEET_W,
      SHEET_H,
      [
        { text: "for my", x: 30, y: 96, size: 22, angle: -0.08, weight: 1 },
        { text: "Rosie", x: 40, y: 120, size: 32, angle: -0.08, weight: 1.3 },
      ],
      "#22307a",
    ),
    0,
    0,
  );
  folds(bctx, ridge, valley);
  quantize(bctx, 32);
  return { front, back };
}

const deg = (degrees: number) => (degrees * Math.PI) / 180;

// Vinyl face, 192 texels across the 2.68-unit disc. Radii below are in world units.
const VINYL = 192;

function vinylFace(side: "A" | "B", seed: number) {
  const S = VINYL;
  const C = S / 2;
  const toWorld = RECORD.radius / C;
  const [canvas, ctx] = makeCanvas(S, S);
  const rand = rng(seed);
  const sheenAxis = side === "A" ? -0.7 : 0.9;
  const gaps = side === "A" ? [0.68, 0.86, 1.04] : [0.72, 0.95];
  const wear = Array.from({ length: 4 }, () => ({
    r: 0.56 + rand() * 0.66,
    a: rand() * Math.PI * 2,
    span: 0.35 + rand() * 0.5,
  }));
  const base = hex("#1d1d21");
  const glossGap = hex("#3a3c43");
  const sheenOuter = hex("#34363d");
  const sheenCore = hex("#4b4e57");
  const scuff = hex("#4a4c54");
  const label = hex(side === "A" ? "#e9a23b" : "#d9573a");
  const image = ctx.createImageData(S, S);
  const d = image.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - C;
      const dy = C - (y + 0.5);
      const r = Math.hypot(dx, dy) * toWorld;
      const a = Math.atan2(dy, dx);
      let c: RGB = base;
      if (r > RECORD.radius - toWorld) c = hex("#141417");
      else if (r > 1.3 && r < 1.32) c = hex("#6a6d76");
      else if (r >= 1.28) c = hex("#2a2b30");
      else if (r > 1.235) c = hex("#2e3036");
      else if (r > RECORD.label + 0.05) {
        const ring = Math.floor(r / toWorld);
        c = shade(base, ring % 2 ? 1.08 : 0.94);
        const gap = gaps.some((g) => Math.abs(r - g) < toWorld);
        if (gap) c = glossGap;
        // Bow-tie sheen: two opposite wedges in two hard steps.
        const off = Math.abs(((a - sheenAxis + Math.PI * 2.5) % Math.PI) - Math.PI / 2);
        const wedge = deg(12.5);
        if (off < deg(5)) c = gap ? hex("#5c606a") : shade(sheenCore, ring % 2 ? 1.04 : 0.96);
        else if (off < wedge) c = gap ? hex("#474a52") : shade(sheenOuter, ring % 2 ? 1.05 : 0.95);
        for (const w of wear) {
          const da = Math.abs(((a - w.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          if (Math.abs(r - w.r) < toWorld * 0.5 && da < w.span) {
            const lifted = shade(c, 1.45);
            c = [0, 1, 2].map((k) => Math.max(lifted[k], scuff[k])) as RGB;
          }
        }
      } else if (r > RECORD.label + 0.025) c = hex("#26272c");
      else if (r > RECORD.label) c = hex("#55575e");
      else if (r > RECORD.label - toWorld) c = shade(label, 0.62);
      else {
        c = label;
        if (Math.abs(r - RECORD.label * 0.86) < toWorld * 0.5) c = shade(label, 0.78);
        if (r < 0.125) c = shade(label, 0.7);
      }
      const i = (y * S + x) * 4;
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  // Spindle wear: radial nicks out of the hole.
  ctx.strokeStyle = css(shade(label, 0.5));
  ctx.lineWidth = 1;
  for (let i = 0; i < 7; i++) {
    const t = rand() * Math.PI * 2;
    const r0 = RECORD.hole / toWorld;
    const r1 = r0 + 3 + rand() * 4;
    ctx.beginPath();
    ctx.moveTo(C + Math.cos(t) * r0, C + Math.sin(t) * r0);
    ctx.lineTo(C + Math.cos(t) * r1, C + Math.sin(t) * r1);
    ctx.stroke();
  }
  ctx.fillStyle = "#0b0b0c";
  ctx.beginPath();
  ctx.arc(C, C, RECORD.hole / toWorld, 0, Math.PI * 2);
  ctx.fill();

  // A round date sticker beside the hole.
  const [stx, sty] = [C + 21, C + 1];
  ctx.fillStyle = "#2f5a8e";
  ctx.beginPath();
  ctx.arc(stx, sty, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8cc2ec";
  ctx.beginPath();
  ctx.arc(stx, sty, 6, 0, Math.PI * 2);
  ctx.fill();
  crisp(ctx);

  const ink = lettering(
    S,
    S,
    side === "A"
      ? [
          {
            text: "Side A",
            x: C - 1,
            y: C - 10,
            size: 17,
            angle: -0.08,
            weight: 1.2,
            align: "center",
            maxWidth: 42,
          },
          {
            text: "for Rosie",
            x: C - 2,
            y: C + 22,
            size: 14,
            angle: -0.05,
            weight: 1,
            align: "center",
            maxWidth: 42,
          },
        ]
      : [
          {
            text: "Side B",
            x: C,
            y: C - 10,
            size: 17,
            angle: 0.06,
            weight: 1.2,
            align: "center",
            maxWidth: 42,
          },
          {
            text: "the waltz",
            x: C - 2,
            y: C + 22,
            size: 14,
            angle: 0.04,
            weight: 1,
            align: "center",
            maxWidth: 42,
          },
        ],
    "#2a1608",
  );
  ctx.drawImage(ink, 0, 0);
  ctx.drawImage(
    lettering(
      S,
      S,
      [{ text: "78", x: stx, y: sty + 3, size: 9, weight: 0.6, align: "center" }],
      "#1c3a8e",
    ),
    0,
    0,
  );
  quantize(ctx, 48);
  return canvas;
}

export function paintVinyl() {
  return { front: vinylFace("A", 800), back: vinylFace("B", 801) };
}

// Edge bands: u runs along the rim (uniform, so clamping is harmless), v from front (0, the canvas
// bottom) to back.
function band(rows: string[]) {
  const [canvas, ctx] = makeCanvas(16, rows.length);
  rows.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, rows.length - 1 - i, 16, 1);
  });
  return canvas;
}

export function paintGenuineEdges() {
  return {
    paper: band(["#f1e5c6", "#d3bf92", "#cdb98b", "#c7b285", "#c0aa7c", "#b49d70"]),
    vinyl: band(["#4d5059", "#2e2f35", "#232428", "#202125", "#232428", "#2e2f35", "#4d5059"]),
    magnet: band(["#e0503d", "#b3291d", "#a7231a", "#9a1f17", "#8c1b14"]),
  };
}

// The letter magnet's face, projected over the letter's bounds: glossy red, the chamfer a lighter
// band with a bright crest line, a dark outline and two hard glints.
export function paintMagnetFace() {
  const [bw, bh] = MAGNET.bounds;
  const k = 100;
  const W = Math.round(bw * k);
  const H = Math.round(bh * k);
  const [canvas, ctx] = makeCanvas(W, H);
  const path = (pts: { x: number; y: number }[]) => {
    const p = new Path2D();
    pts.forEach(({ x, y }, i) => {
      const cx = (x + bw / 2) * k;
      const cy = (bh / 2 - y) * k;
      if (i === 0) p.moveTo(cx, cy);
      else p.lineTo(cx, cy);
    });
    p.closePath();
    return p;
  };
  const outer = path(LETTER_E.map(([x, y]) => ({ x, y })));
  const crest = path(insetOrthogonal(LETTER_E, MAGNET.bevel));
  const face = path(insetOrthogonal(LETTER_E, MAGNET.bevel + 0.012));
  ctx.fillStyle = "#8e1a12";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#ee5a44";
  ctx.fill(outer);
  ctx.fillStyle = "#ff9478";
  ctx.fill(crest);
  ctx.fillStyle = "#d42f22";
  ctx.fill(face);
  ctx.save();
  ctx.clip(face);
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.beginPath();
  ctx.moveTo(4, H);
  ctx.lineTo(13, H);
  ctx.lineTo(13 + H * 0.6, 0);
  ctx.lineTo(4 + H * 0.6, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "#8e1a12";
  ctx.lineWidth = 1;
  ctx.stroke(outer);
  crisp(ctx);
  quantize(ctx, 12);
  return canvas;
}

// Sealing wax from above (the seal's outer bounds): a dark foot, a lighter crest with a bright
// lip, a hard-stepped shadow into the pressed disc and a raised heart in it.
export function paintWax() {
  const S = 64;
  const C = S / 2;
  const [canvas, ctx] = makeCanvas(S, S);
  // The seal's front UVs span its wobbly blob's bounding box, so the foot points near the
  // diagonals sample the corners: paint them as foot wax, not empty canvas.
  ctx.fillStyle = "#5e0d15";
  ctx.fillRect(0, 0, S, S);
  const rings: [number, string][] = [
    [1, "#5e0d15"],
    [0.94, "#7d1520"],
    [0.82, "#a3242f"],
    [0.74, "#b9343e"],
    [0.68, "#d65660"],
    [0.64, "#5c0c14"],
    [0.58, "#8a1a24"],
  ];
  for (const [f, color] of rings) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(C, C, f * C, 0, Math.PI * 2);
    ctx.fill();
  }
  heart(ctx, C, C - 9, 18);
  ctx.fillStyle = "#4e0a11";
  ctx.fill();
  heart(ctx, C, C - 7.5, 15);
  ctx.fillStyle = "#d04a54";
  ctx.fill();
  heart(ctx, C + 0.5, C - 5.5, 12);
  ctx.fillStyle = "#ad2a35";
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.save();
  ctx.beginPath();
  ctx.arc(C, C, C * 0.94, 0, Math.PI * 2);
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(10, S);
  ctx.lineTo(16, S);
  ctx.lineTo(16 + S * 0.55, 0);
  ctx.lineTo(10 + S * 0.55, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  crisp(ctx);
  quantize(ctx, 14);
  return canvas;
}

// Cut faces, tileable. Paper pulp: warm, a few darker fibres; it has to show against a white page.
export function paintCutPaper(seed: number) {
  const S = 128;
  const [canvas, ctx] = makeCanvas(S, S);
  paperBase(ctx, hex("#dccb9f"), seed, hex("#dccb9f"));
  const rand = rng(seed + 1);
  ctx.lineWidth = 1;
  for (let i = 0; i < 22; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const a = rand() * Math.PI;
    const len = 5 + rand() * 9;
    ctx.strokeStyle = rand() < 0.7 ? "#b9a374" : "#eadcb6";
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        ctx.beginPath();
        ctx.moveTo(x + ox, y + oy);
        ctx.quadraticCurveTo(
          x + ox + Math.cos(a) * len * 0.5 + 2,
          y + oy + Math.sin(a) * len * 0.5,
          x + ox + Math.cos(a) * len,
          y + oy + Math.sin(a) * len,
        );
        ctx.stroke();
      }
    }
  }
  crisp(ctx);
  quantize(ctx, 10);
  return canvas;
}

// PVC, lifted off black so the thin cut line separates from the faces, with sparse light streaks.
export function paintCutVinyl(seed: number) {
  const S = 128;
  const [canvas, ctx] = makeCanvas(S, S);
  ctx.fillStyle = "#26262b";
  ctx.fillRect(0, 0, S, S);
  const rand = rng(seed);
  for (let i = 0; i < 18; i++) {
    const x = Math.floor(rand() * S);
    const y = Math.floor(rand() * S);
    const len = 4 + Math.floor(rand() * 14);
    ctx.fillStyle = rand() < 0.75 ? "#3a3b42" : "#50525a";
    for (let k = 0; k < len; k++) ctx.fillRect((x + k) % S, (y + Math.floor(k / 4)) % S, 1, 1);
  }
  quantize(ctx, 6);
  return canvas;
}
