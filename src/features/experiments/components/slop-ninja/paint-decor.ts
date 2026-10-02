import type { Vector2 } from "three";
import {
  CHAT,
  FRAME,
  GEM,
  ORNAMENT_CREST,
  ORNAMENT_ROSETTE,
  ORNAMENT_SIZE,
  TRIM_BRASS,
  TRIM_SIZE,
  TRIM_CLIP,
  TRIM_TAG,
  chatBounds,
  chatDots,
  chatRing,
  crestOutline,
  frameProfileV,
  frameSize,
  gemFacets,
  gemOutline,
  insetLoop,
  satelliteOutline,
  type Facet,
} from "./models-decor";

// Skins for the decor props (frame, chat bubble, sparkle gem), painted for the game's real size:
// about 64-90 texels per world unit, features of 2+ texels, flat colour steps instead of gradients,
// type and line art alpha-thresholded so nothing reaches the screen as fuzz.

type Ctx = CanvasRenderingContext2D;
type RGB = [number, number, number];
type Pt = [number, number];

const SANS = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
const WHITE: RGB = [255, 255, 255];

function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D canvas unavailable");
  return [canvas, ctx];
}

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

const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const clamp8 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const css = ([r, g, b]: RGB) => `rgb(${clamp8(r)},${clamp8(g)},${clamp8(b)})`;
const scale = ([r, g, b]: RGB, f: number): RGB => [clamp8(r * f), clamp8(g * f), clamp8(b * f)];
const mix = (a: RGB, b: RGB, t: number): RGB => [
  clamp8(a[0] + (b[0] - a[0]) * t),
  clamp8(a[1] + (b[1] - a[1]) * t),
  clamp8(a[2] + (b[2] - a[2]) * t),
];
const torus = (d: number, size: number) => d - Math.round(d / size) * size;

function polyPath(points: Pt[]) {
  const path = new Path2D();
  points.forEach(([x, y], i) => (i === 0 ? path.moveTo(x, y) : path.lineTo(x, y)));
  path.closePath();
  return path;
}

// Every pixel to its nearest palette colour: anti-aliased path edges come out as hard steps, the
// way a 4/8-bit CLUT texture had them.
function snap(ctx: Ctx, palette: RGB[]) {
  const { width, height } = ctx.canvas;
  const image = ctx.getImageData(0, 0, width, height);
  const d = image.data;
  const memo = new Map<number, number>();
  for (let i = 0; i < d.length; i += 4) {
    const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    let best = memo.get(key);
    if (best === undefined) {
      let bestDistance = Infinity;
      best = 0;
      for (let k = 0; k < palette.length; k++) {
        const [r, g, b] = palette[k];
        const distance = (r - d[i]) ** 2 + (g - d[i + 1]) ** 2 + (b - d[i + 2]) ** 2;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = k;
        }
      }
      memo.set(key, best);
    }
    [d[i], d[i + 1], d[i + 2]] = palette[best];
    d[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
}

// A canvas that remembers the colours painted with it, then snaps to exactly those.
class Sheet {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: Ctx;
  private palette = new Map<string, RGB>();

  constructor(w: number, h: number) {
    [this.canvas, this.ctx] = makeCanvas(w, h);
  }

  c(colour: RGB | string) {
    const rgb = typeof colour === "string" ? hex(colour) : colour;
    const style = css(rgb);
    this.palette.set(style, rgb);
    return style;
  }

  fill(colour: RGB | string, path?: Path2D) {
    this.ctx.fillStyle = this.c(colour);
    if (path) this.ctx.fill(path);
    else this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  rect(colour: RGB | string, x: number, y: number, w: number, h: number) {
    this.ctx.fillStyle = this.c(colour);
    this.ctx.fillRect(x, y, w, h);
  }

  snap() {
    snap(this.ctx, [...this.palette.values()]);
  }
}

// Draws `paint` into its own layer, thresholds the layer's alpha to fully on or off, then lays it
// down at `alpha`: type and line art land pixel-crisp, like a PS2 bitmap font.
function crisp(ctx: Ctx, paint: (layer: Ctx) => void, alpha = 1, tint?: string) {
  const { width, height } = ctx.canvas;
  const [layer, lctx] = makeCanvas(width, height);
  paint(lctx);
  const image = lctx.getImageData(0, 0, width, height);
  const d = image.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 110 ? 255 : 0;
  lctx.putImageData(image, 0, 0);
  if (tint) {
    lctx.globalCompositeOperation = "source-in";
    lctx.fillStyle = tint;
    lctx.fillRect(0, 0, width, height);
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}

// 2x2 ordered dither down to `levels` steps per channel: photo faces keep their colour without
// any smooth gradient left in them.
function ditherPosterize(ctx: Ctx, levels: number) {
  const { width, height } = ctx.canvas;
  const image = ctx.getImageData(0, 0, width, height);
  const d = image.data;
  const bayer = [0.125, 0.625, 0.875, 0.375];
  const step = 255 / (levels - 1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const t = bayer[(y & 1) * 2 + (x & 1)];
      for (let c = 0; c < 3; c++) d[i + c] = clamp8(Math.floor(d[i + c] / step + t) * step);
    }
  }
  ctx.putImageData(image, 0, 0);
}

// Paints at the nine tile offsets so a shape crossing an edge wraps round.
function wrapped(ctx: Ctx, paint: () => void) {
  const { width: W, height: H } = ctx.canvas;
  for (const dx of [-W, 0, W]) {
    for (const dy of [-H, 0, H]) {
      ctx.save();
      ctx.translate(dx, dy);
      paint();
      ctx.restore();
    }
  }
}

function fitFont(ctx: Ctx, text: string, weight: number, max: number, width: number) {
  let size = max;
  for (; size > 8; size--) {
    ctx.font = `${weight} ${size}px ${SANS}`;
    if (ctx.measureText(text).width <= width) break;
  }
  return size;
}

// ---------------------------------------------------------------------------------------------
// Frame

const GOLD = {
  deep: "#3a2408",
  umber: "#5a3a10",
  cove: "#4a2e0a",
  recess: "#7a5212",
  wall: "#8f6118",
  flank: "#a8741c",
  mid: "#c8922a",
  body: "#d9a531",
  bright: "#f0c34a",
  hi: "#fbe08a",
  crest: "#fff3c0",
  ochre: "#b07d22",
  gesso: "#efe2c0",
  gessoHi: "#fff8e6",
  gessoLo: "#c9b48a",
  plastic: "#f4f1ea",
  plasticEdge: "#b9b2a2",
  dust: "#6b5a40",
};

// The moulding strip: u runs along the moulding (repeats), v follows the profile rings from the
// sight edge (bottom of the canvas) to the back edge (top). Bands match frameProfileV() exactly.
function paintGoldStrip(seed: number) {
  const W = 120;
  const H = 80;
  const s = new Sheet(W, H);
  const { ctx } = s;
  const y = frameProfileV().map((v) => Math.round((1 - v) * H));
  const band = (b: number, colour: string) =>
    s.rect(colour, 0, y[b + 1], W, Math.max(1, y[b] - y[b + 1]));
  const row = (r: number, colour: string, rows = 1) => s.rect(colour, 0, r, W, rows);

  const fills = [
    GOLD.umber,
    GOLD.gesso,
    GOLD.gesso,
    GOLD.ochre,
    GOLD.body,
    GOLD.mid,
    GOLD.mid,
    GOLD.recess,
    GOLD.mid,
    GOLD.bright,
    GOLD.bright,
    GOLD.mid,
    GOLD.flank,
    GOLD.flank,
  ];
  fills.forEach((colour, b) => band(b, colour));
  // Outer wall: full gilt so the frame's edge reads gold edge-on, a bright line where it rolls
  // over out of the bead and a thin umber line only at the very back edge.
  row(y[13] - 2, GOLD.bright, 2);
  row(y[14], GOLD.umber, 3);
  // Outer bead: three tones and a hard crest.
  row(y[10] - 1, GOLD.crest, 2);
  // Cove: a hard two-tone AO step.
  row(y[8], GOLD.umber, Math.max(1, y[7] - y[8] - 3));
  row(y[7] - 3, GOLD.cove, 3);
  // Crest ridge and the bright face below it.
  row(y[5] - 1, GOLD.crest, 2);
  row(y[5] + 1, GOLD.bright, 2);
  // Inner slope falls into AO at the liner.
  row(y[3] - 2, GOLD.umber, 2);
  // Gesso liner: lit lip, shadowed foot.
  row(y[3], GOLD.gessoHi);
  row(y[1] - 1, GOLD.gessoLo);
  // Sight edge: a dark line where the moulding meets the picture.
  row(y[0] - 2, GOLD.deep, 2);

  // Egg-and-dart down the ogee, between the crest and the cove: carved eggs in the moulding's own
  // gold with a dark rim and a lit crescent, never a bright core (that reads as marquee bulbs).
  const top = y[7] + 1;
  const bottom = y[5] - 2;
  const cy = (top + bottom) / 2;
  const ry = Math.min(6.5, (bottom - top) / 2);
  const period = 24;
  const egg = (x: number, rx: number, r: number) => {
    ctx.beginPath();
    ctx.ellipse(x, cy, rx, r, 0, 0, Math.PI * 2);
  };
  wrapped(ctx, () => {
    for (let x = period / 2; x < W; x += period) {
      ctx.fillStyle = s.c(GOLD.deep);
      egg(x, 5, ry);
      ctx.fill();
      ctx.save();
      egg(x, 4, ry - 1);
      ctx.clip();
      ctx.fillStyle = s.c(GOLD.hi);
      ctx.fill();
      ctx.fillStyle = s.c(GOLD.body);
      ctx.beginPath();
      ctx.ellipse(x + 2, cy + 2, 4, ry - 1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // The dart: a dark V between eggs, pointing down the moulding toward the crest.
      const dx = x + period / 2;
      ctx.strokeStyle = s.c(GOLD.umber);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(dx - 3, top);
      ctx.lineTo(dx, bottom - 1);
      ctx.lineTo(dx + 3, top);
      ctx.stroke();
    }
  });

  // Cheap plastic: the gilt rubbed through on the ridges, dust packed into the hollows.
  const rand = rng(seed);
  wrapped(ctx, () => {
    const r = rng(seed + 1);
    for (const ridge of [y[5] - 1, y[10] - 1]) {
      for (let i = 0; i < 3; i++) {
        const x = r() * W;
        const w = 3 + Math.floor(r() * 4);
        ctx.fillStyle = s.c(GOLD.plastic);
        ctx.fillRect(Math.round(x), ridge, w, 2);
        ctx.fillStyle = s.c(GOLD.plasticEdge);
        ctx.fillRect(Math.round(x), ridge + 2, w, 1);
      }
    }
  });
  for (let i = 0; i < 16; i++) {
    const inCove = i < 9;
    const yy = inCove
      ? y[7] - 2 - Math.floor(rand() * 2)
      : top + Math.floor(rand() * (bottom - top));
    const x = inCove
      ? rand() * W
      : Math.floor(rand() * (W / period)) * period + (rand() < 0.5 ? 1 : period - 2);
    s.rect(GOLD.dust, Math.round(x) % W, yy, 1 + Math.floor(rand() * 2), 1);
  }
  s.snap();
  return s.canvas;
}

function paintOrnament() {
  const [W, H] = ORNAMENT_SIZE;
  const s = new Sheet(W, H);
  const { ctx } = s;
  s.fill(GOLD.umber);

  // Rosette, seen from above: a dark skirt and six fat petals, one on each facet of the hexagonal
  // dome (its corners point at 0, 60, 120... degrees in the cell), round a 10-texel boss. Few,
  // big shapes so the flower still reads at 16 px.
  const R = ORNAMENT_ROSETTE;
  const cx = R.x + R.w / 2;
  const cy = R.y + R.h / 2;
  const at = (r: number, a: number): Pt => [cx + Math.cos(a) * r, cy - Math.sin(a) * r];
  ctx.fillStyle = s.c(GOLD.recess);
  ctx.beginPath();
  ctx.arc(cx, cy, 22, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const petal = polyPath([
      at(4, a - 0.5),
      at(13, a - 0.46),
      at(19, a - 0.24),
      at(20.5, a),
      at(19, a + 0.24),
      at(13, a + 0.46),
      at(4, a + 0.5),
    ]);
    ctx.fillStyle = s.c(GOLD.deep);
    ctx.fill(petal);
    ctx.save();
    ctx.clip(petal);
    // Inset body, then a lit lip along the petal's leading edge and its tip.
    ctx.fillStyle = s.c(GOLD.hi);
    ctx.beginPath();
    ctx.arc(...at(1, a + 0.1), 19, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = s.c(GOLD.body);
    ctx.beginPath();
    ctx.arc(...at(2.4, a - 0.25), 18, 0, Math.PI * 2);
    ctx.fill();
    // A carved vein down the middle.
    ctx.strokeStyle = s.c(GOLD.flank);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(...at(9, a));
    ctx.lineTo(...at(16, a));
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = s.c(GOLD.deep);
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = s.c(GOLD.hi);
  ctx.fill();
  ctx.fillStyle = s.c(GOLD.bright);
  ctx.beginPath();
  ctx.arc(cx + 1.5, cy + 1.5, 4.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  s.rect(GOLD.crest, cx - 3, cy - 3, 2, 2);

  // Crest: a gilt shell fan, worn along its chamfer, ribs running out from the base.
  const C = ORNAMENT_CREST;
  const { width, height, bevel } = FRAME.crest;
  const toCell = (p: Vector2): Pt => [
    C.x + ((p.x + width / 2) / width) * C.w,
    C.y + ((height - p.y) / height) * C.h,
  ];
  const outline = crestOutline();
  const shape = polyPath(outline.map(toCell));
  ctx.strokeStyle = s.c(GOLD.deep);
  ctx.lineWidth = 2;
  ctx.stroke(shape);
  ctx.fillStyle = s.c(GOLD.mid);
  ctx.fill(shape);
  ctx.fillStyle = s.c(GOLD.body);
  ctx.fill(polyPath(insetLoop(outline, bevel).map(toCell)));
  ctx.strokeStyle = s.c(GOLD.hi);
  ctx.lineWidth = 1;
  ctx.stroke(polyPath(insetLoop(outline, bevel * 0.4).map(toCell)));
  ctx.save();
  ctx.clip(shape);
  const base = toCell(outline[0].clone().set(0, -0.04));
  outline.forEach((p, i) => {
    if (i < 2 || i > outline.length - 3) return;
    const [x, y] = toCell(p);
    const valley = i % 2 === 0;
    ctx.strokeStyle = s.c(valley ? GOLD.umber : GOLD.hi);
    ctx.lineWidth = 2;
    ctx.beginPath();
    const from = valley ? 0.25 : 0.4;
    const to = valley ? 0.92 : 0.82;
    ctx.moveTo(base[0] + (x - base[0]) * from, base[1] + (y - base[1]) * from);
    ctx.lineTo(base[0] + (x - base[0]) * to, base[1] + (y - base[1]) * to);
    ctx.stroke();
  });
  // A plinth along the base, and the volutes curling at each end.
  const [, baseY] = toCell(outline[0]);
  s.rect(GOLD.recess, C.x, baseY - 4, C.w, 4);
  s.rect(GOLD.bright, C.x, baseY - 5, C.w, 1);
  for (const side of [-1, 1]) {
    const [vx, vy] = toCell(outline[0].clone().set(side * width * 0.4, 0.075));
    ctx.strokeStyle = s.c(GOLD.deep);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(vx, vy, 3, 0, Math.PI * 1.6 * side, side < 0);
    ctx.stroke();
    s.rect(GOLD.hi, vx - 1, vy - 1, 2, 2);
  }
  ctx.restore();
  s.snap();
  return s.canvas;
}

function paintTrim() {
  const [W, H] = TRIM_SIZE;
  const s = new Sheet(W, H);
  const { ctx } = s;
  s.fill("#7a5a1c");

  // Brass sawtooth hanger: lit top/left lip, dark bottom/right, the teeth punched along the bottom.
  const B = TRIM_BRASS;
  s.rect("#c89a3a", B.x, B.y, B.w, B.h);
  s.rect("#f0d27a", B.x, B.y, B.w, 2);
  s.rect("#f0d27a", B.x, B.y, 2, B.h);
  s.rect("#7a5a1c", B.x, B.y + B.h - 2, B.w, 2);
  s.rect("#7a5a1c", B.x + B.w - 2, B.y, 2, B.h);
  ctx.fillStyle = s.c("#3a2a0c");
  for (let x = B.x + 6; x < B.x + B.w - 6; x += 5) {
    ctx.beginPath();
    ctx.moveTo(x, B.y + B.h - 3);
    ctx.lineTo(x + 2.5, B.y + B.h - 7);
    ctx.lineTo(x + 5, B.y + B.h - 3);
    ctx.fill();
  }
  for (const x of [B.x + 8, B.x + B.w - 10]) {
    s.rect("#3a2a0c", x, B.y + 3, 2, 2);
    s.rect("#f0d27a", x, B.y + 5, 2, 1);
  }

  // Turn button: a plain brass bar with a screw in the middle.
  const K = TRIM_CLIP;
  s.rect("#9c7428", K.x, K.y, K.w, K.h);
  s.rect("#d8ad48", K.x + 1, K.y + 1, K.w - 2, K.h - 2);
  s.rect("#f6dc8a", K.x + 1, K.y + 1, K.w - 2, 1);
  s.rect("#3a2a0c", K.x + K.w / 2 - 1, K.y + 2, 2, 2);

  // Care tag, sized to read as a label at 12x14 px: a saturated AI-violet woven band with a big
  // white sparkle over the top 40%, two bold lines of print under it, a grey selvedge round it.
  const T = TRIM_TAG;
  const band = Math.round(T.h * 0.4);
  s.rect("#8a8478", T.x, T.y, T.w, T.h);
  s.rect("#f4f1ea", T.x + 1, T.y + 1, T.w - 2, T.h - 2);
  s.rect("#5a3df0", T.x + 1, T.y + 1, T.w - 2, band);
  s.rect("#9d8cff", T.x + 1, T.y + 1, T.w - 2, 1);
  s.rect("#3a24b8", T.x + 1, T.y + band, T.w - 2, 1);
  const sx = T.x + T.w / 2;
  const sy = T.y + 1 + band / 2;
  const arm = 6.5;
  ctx.fillStyle = s.c("#ffffff");
  ctx.beginPath();
  ctx.moveTo(sx, sy - arm);
  ctx.quadraticCurveTo(sx + 1, sy - 1, sx + arm, sy);
  ctx.quadraticCurveTo(sx + 1, sy + 1, sx, sy + arm);
  ctx.quadraticCurveTo(sx - 1, sy + 1, sx - arm, sy);
  ctx.quadraticCurveTo(sx - 1, sy - 1, sx, sy - arm);
  ctx.fill();
  const ink = "#2e2a3c";
  s.rect(ink, T.x + 5, T.y + band + 5, T.w - 10, 3);
  s.rect(ink, T.x + 5, T.y + band + 12, T.w - 16, 3);
  s.rect("#b9b2a2", T.x + 5, T.y + band + 19, T.w - 12, 1);
  s.snap();
  return s.canvas;
}

// Stock-photo print: crunched like a re-saved JPEG, dithered to a CLUT, watermarked.
function paintPicture(img: HTMLImageElement, W: number, H: number, seed: number) {
  const sw = Math.round(W * 0.75);
  const sh = Math.round(H * 0.75);
  const [small, sctx] = makeCanvas(sw, sh);
  sctx.imageSmoothingQuality = "high";
  sctx.filter = "saturate(1.35) contrast(1.12)";
  sctx.drawImage(img, 0, 0, sw, sh);
  sctx.filter = "none";
  const rand = rng(seed);
  const blocksW = Math.ceil(sw / 8);
  const offsets = Array.from({ length: blocksW * Math.ceil(sh / 8) }, () => [
    (rand() - 0.5) * 14,
    (rand() - 0.5) * 10,
  ]);
  const image = sctx.getImageData(0, 0, sw, sh);
  const d = image.data;
  for (let yy = 0; yy < sh; yy++) {
    for (let xx = 0; xx < sw; xx++) {
      const i = (yy * sw + xx) * 4;
      const [lum, chroma] = offsets[(yy >> 3) * blocksW + (xx >> 3)];
      d[i] = clamp8(d[i] + lum + chroma);
      d[i + 1] = clamp8(d[i + 1] + lum);
      d[i + 2] = clamp8(d[i + 2] + lum - chroma);
    }
  }
  sctx.putImageData(image, 0, 0);

  const [canvas, ctx] = makeCanvas(W, H);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, W, H);
  ditherPosterize(ctx, 7);

  // The stock watermark: the name once, big and level across the middle, with a 1-texel dark
  // outline so it reads on light and dark parts of the photo alike. Level type minifies to
  // letters; a diagonal one, or small print, smears into a slash or a grey band.
  const mark = (text: string, x: number, y: number, size: number, weight: number) => {
    const set = (l: Ctx) => {
      l.font = `${weight} ${size}px ${SANS}`;
      l.textAlign = "center";
      l.textBaseline = "middle";
    };
    crisp(
      ctx,
      (l) => {
        set(l);
        l.lineWidth = 2;
        l.lineJoin = "round";
        l.strokeStyle = "#000";
        l.strokeText(text, x, y);
      },
      0.5,
    );
    crisp(
      ctx,
      (l) => {
        set(l);
        l.fillStyle = "#fff";
        l.fillText(text, x, y);
      },
      0.6,
    );
  };
  mark("slopstock", W / 2, H / 2, fitFont(ctx, "slopstock", 900, 25, W - 12), 900);
  return canvas;
}

// The frame's back, seen from behind: a raw MDF rabbet lip round a fake-transparency checkerboard
// backing board, a price sticker and a strip of masking tape.
function paintFrameBack(aspect: number, id: number, seed: number) {
  const { w, h } = frameSize(aspect);
  const ppu = 192 / h;
  const W = Math.round(w * ppu);
  const H = 192;
  const s = new Sheet(W, H);
  const { ctx } = s;
  const rand = rng(seed);

  s.fill("#c9a777");
  for (let i = 0; i < 18; i++) {
    const yy = Math.floor(rand() * H);
    const xx = Math.floor(rand() * W);
    s.rect(rand() < 0.6 ? "#b08d5c" : "#dcbf8f", xx, yy, 6 + Math.floor(rand() * 24), 1);
  }
  s.rect("#e3c99a", 0, 0, W, 1);
  s.rect("#e3c99a", 0, 0, 1, H);
  s.rect("#9c7a4a", 0, H - 1, W, 1);
  s.rect("#9c7a4a", W - 1, 0, 1, H);

  const lip = Math.round(0.12 * ppu);
  const bx = lip;
  const by = lip;
  const bw = W - lip * 2;
  const bh = H - lip * 2;
  s.rect("#6e5634", bx - 1, by - 1, bw + 2, bh + 2);
  const SQ = 16;
  const ox = bx + ((bw / 2) % SQ) - SQ;
  const oy = by + ((bh / 2) % SQ) - SQ;
  ctx.save();
  ctx.beginPath();
  ctx.rect(bx, by, bw, bh);
  ctx.clip();
  for (let yy = oy, r = 0; yy < by + bh; yy += SQ, r++) {
    for (let xx = ox, c = 0; xx < bx + bw; xx += SQ, c++) {
      s.rect((r + c) % 2 ? "#c9ced8" : "#ffffff", xx, yy, SQ, SQ);
    }
  }
  ctx.restore();
  // AO where the board meets the lip.
  s.rect("#9aa0ad", bx, by, bw, 2);
  s.rect("#9aa0ad", bx, by, 2, bh);
  s.rect("#b4b9c4", bx, by + bh - 1, bw, 1);
  s.rect("#b4b9c4", bx + bw - 1, by, 1, bh);
  // AO under the hanger.
  const hw = FRAME.hanger.w * ppu;
  const hh = FRAME.hanger.h * ppu;
  const hy = (FRAME.hanger.drop - FRAME.hanger.h / 2) * ppu;
  s.rect("#8a909c", W / 2 - hw / 2 - 2, hy - 2, hw + 4, hh + 4);
  s.snap();

  crisp(
    ctx,
    (l) => {
      l.translate(W / 2, H / 2 + 6);
      l.rotate(-0.55);
      l.font = `900 30px ${SANS}`;
      l.textAlign = "center";
      l.textBaseline = "middle";
      l.fillStyle = "#5a6478";
      l.fillText("SlopStock", 0, 0);
    },
    0.22,
  );

  // Masking tape across the lower-left corner.
  crisp(
    ctx,
    (l) => {
      l.translate(lip + 10, H - lip - 10);
      l.rotate(-Math.PI / 4);
      l.fillStyle = "#e6d6a2";
      l.beginPath();
      l.moveTo(-26, -8);
      for (let x = -26; x <= 26; x += 4) l.lineTo(x, -8 + (x % 8 === 0 ? 0 : 1));
      l.lineTo(28, 0);
      l.lineTo(26, 8);
      for (let x = 26; x >= -26; x -= 4) l.lineTo(x, 8 - (x % 8 === 0 ? 0 : 1));
      l.lineTo(-28, 0);
      l.closePath();
      l.fill();
    },
    0.92,
  );

  // Neon price sticker.
  const sw = Math.round(1.0 * ppu);
  const sh = Math.round(0.56 * ppu);
  crisp(ctx, (l) => {
    l.translate(W - lip - sw / 2 - 8, H - lip - sh / 2 - 10);
    l.rotate(-0.08);
    l.fillStyle = "#c2410c";
    l.beginPath();
    l.roundRect(-sw / 2, -sh / 2 + 1, sw, sh, 5);
    l.fill();
    l.fillStyle = "#ff7a1a";
    l.beginPath();
    l.roundRect(-sw / 2, -sh / 2, sw, sh, 5);
    l.fill();
    l.fillStyle = "#1a1208";
    l.textAlign = "center";
    l.textBaseline = "middle";
    l.font = `800 9px ${SANS}`;
    l.fillText("ORIGINAL AI", 0, -sh / 2 + 7);
    l.font = `900 ${fitFont(l, "$4,999", 900, 17, sw - 8)}px ${SANS}`;
    l.fillText("$4,999", 0, -1);
    for (let x = -sw / 2 + 7, k = 0; x < sw / 2 - 18; x += 2, k++) {
      if ((id >> (k % 13)) & 1 || k % 3 === 0) l.fillRect(x, sh / 2 - 11, k % 4 === 0 ? 2 : 1, 7);
    }
    l.font = `800 8px ${SANS}`;
    l.textAlign = "right";
    l.fillText("1/∞", sw / 2 - 4, sh / 2 - 7);
  });
  return s.canvas;
}

export function paintPictureFaces(img: HTMLImageElement, id: number, seed: number) {
  const aspect = img.naturalWidth / img.naturalHeight;
  const H = 128;
  const W = Math.round(H * aspect);
  return {
    front: paintPicture(img, W, H, seed),
    back: paintFrameBack(aspect, id, seed + 1),
    aspect,
  };
}

// ---------------------------------------------------------------------------------------------
// Chat bubble

export const CHAT_LINES = [
  "Great question!",
  "You're absolutely right!",
  "Let's delve into it 🚀",
  "As an AI language model…",
];

// A system emoji is the only anti-aliased thing a face would carry and smears into a colour blob,
// so the rocket is a painted sprite: the line keeps the emoji as a placeholder for layout.
const ROCKET = "🚀";
// The sprite's width, in ems of the line's type.
const ROCKET_EM = 0.92;

const ROCKET_INK = {
  outline: hex("#1d1b33"),
  body: hex("#ffffff"),
  shade: hex("#b8c2d8"),
  fin: hex("#ff2a2a"),
  finShade: hex("#a3161c"),
  glass: hex("#45d4ff"),
  glint: hex("#c4f3ff"),
  steel: hex("#4a5068"),
  flame: hex("#ff8a1f"),
  core: hex("#ffd23f"),
};

// The rocket pointing up-right, n x n texels: each texel centre is tested in the rocket's own frame
// (u along its axis, v across, + toward the lower-right shade side) on a 16-unit grid, so every
// edge lands on whole texels. One dark outline texel round the lot.
function rocketSprite(n: number): (RGB | null)[][] {
  const k = n / 16;
  const fill = (px: number, py: number): RGB | null => {
    const x = (px + 0.5) / k - 8;
    const y = (py + 0.5) / k - 8;
    const u = (x - y) * Math.SQRT1_2;
    const v = (x + y) * Math.SQRT1_2;
    const av = Math.abs(v);
    const half = u < 1.6 ? 2.9 : 2.9 * Math.sqrt(Math.max(0, 1 - ((u - 1.6) / 5.6) ** 2));
    if (u > -5.2 && u < 7.2 && av < half) {
      const w = (u - 1.4) ** 2 + v * v;
      if (w < 1.6 ** 2) return v < -0.4 ? ROCKET_INK.glint : ROCKET_INK.glass;
      if (w < 2.3 ** 2) return ROCKET_INK.steel;
      if (u > 4.6) return v > 0.6 ? ROCKET_INK.finShade : ROCKET_INK.fin;
      return v > 1.1 ? ROCKET_INK.shade : ROCKET_INK.body;
    }
    if (u > -5.2 && u < -1.4 && av < 2.9 + 2.4 * ((-1.4 - u) / 3.8)) {
      return v > 0 ? ROCKET_INK.finShade : ROCKET_INK.fin;
    }
    if (u > -6.1 && u <= -5.2 && av < 1.9) return ROCKET_INK.steel;
    if (u > -9.6 && u <= -6.1 && av < 1.9 * ((u + 9.6) / 3.5)) {
      return av < 0.9 * ((u + 9.6) / 3.5) && u > -8.4 ? ROCKET_INK.core : ROCKET_INK.flame;
    }
    return null;
  };
  const grid = Array.from({ length: n }, (_, py) =>
    Array.from({ length: n }, (_, px) => fill(px, py)),
  );
  const filled = (px: number, py: number) => grid[py]?.[px] != null;
  return grid.map((row, py) =>
    row.map((c, px) => {
      if (c) return c;
      const edge = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => filled(px + dx, py + dy));
      return edge ? ROCKET_INK.outline : null;
    }),
  );
}

function paintRocket(ctx: Ctx, x0: number, y0: number, n: number, shadow: RGB) {
  const sprite = rocketSprite(n);
  const at = (dy: number, colour: (c: RGB) => RGB) =>
    sprite.forEach((row, py) =>
      row.forEach((c, px) => {
        if (!c) return;
        ctx.fillStyle = css(colour(c));
        ctx.fillRect(Math.round(x0) + px, Math.round(y0) + py + dy, 1, 1);
      }),
    );
  at(2, () => shadow);
  at(0, (c) => c);
}

// One saturated base per bubble; the seam piping takes it as its material colour.
export const CHAT_BASES = ["#3d7bff", "#6b4dff", "#2f8fff", "#8a55ff"];

// The cut foam, tinted pale toward each bubble's hue.
export const chatFoamTint = (i: number) =>
  css(mix(hex(CHAT_BASES[i % CHAT_BASES.length]), WHITE, 0.74));

const CHAT_PPU = 72;

function chatSheet(back: boolean) {
  const b = chatBounds();
  const bw = b.maxX - b.minX;
  const bh = b.maxY - b.minY;
  const W = Math.round(bw * CHAT_PPU);
  const H = Math.round(bh * CHAT_PPU);
  const map = (p: Vector2): Pt => {
    const u = (p.x - b.minX) / bw;
    return [(back ? 1 - u : u) * W, ((b.maxY - p.y) / bh) * H];
  };
  const ring = (inset: number) => polyPath(chatRing(inset).map(map));
  return { sheet: new Sheet(W, H), W, H, map, ring };
}

// The puff as posterized rings (core, shoulder, near-seam AO) plus a hard highlight crescent on
// the upper-left shoulder.
function paintPuff(back: boolean, base: RGB) {
  const layout = chatSheet(back);
  const { sheet: s, ring, W, H } = layout;
  const { ctx } = s;
  s.fill(scale(base, 0.6));
  s.fill(scale(base, 0.76), ring(0));
  s.fill(scale(base, 0.88), ring(0.05));
  s.fill(base, ring(0.15));

  const [mask, mctx] = makeCanvas(W, H);
  mctx.fillStyle = "#fff";
  mctx.fill(ring(0.06));
  mctx.globalCompositeOperation = "destination-out";
  mctx.translate(7, 6);
  mctx.fill(ring(0.06));
  mctx.setTransform(1, 0, 0, 1, 0, 0);
  mctx.fillRect(W * 0.36, 0, W, H);
  mctx.fillRect(0, H * 0.42, W, H);
  ctx.save();
  for (const [dx, dy] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ]) {
    crisp(ctx, (l) => l.drawImage(mask, dx, dy), 1, s.c(mix(base, WHITE, 0.4)));
  }
  crisp(ctx, (l) => l.drawImage(mask, 0, 0), 1, s.c(mix(base, WHITE, 0.72)));
  ctx.restore();
  const [hx, hy] = layout.map(chatRing(0.1)[back ? CHAT_HIGHLIGHT.back : CHAT_HIGHLIGHT.front]);
  s.rect(mix(base, WHITE, 0.85), Math.round(hx) + 5, Math.round(hy) + 2, 3, 3);
  s.snap();
  return layout;
}

// A ring point on the corner arc that shows top-left from each side, just past the crescent's tip.
const CHAT_HIGHLIGHT = { front: 12, back: 7 };

function paintChatFront(text: string, base: RGB) {
  const { sheet: s, W, H } = paintPuff(false, base);
  const { ctx } = s;
  const b = chatBounds();
  const bh = b.maxY - b.minY;
  const maxW = (CHAT.w - 0.62) * CHAT_PPU;
  const centreY = ((b.maxY - 0.02) / bh) * H;

  // The biggest type that fits the flat of the face, over one, two or three balanced lines.
  const maxH = (CHAT.h - 0.42) * CHAT_PPU;
  const words = text.split(" ");
  const splits = (n: number): string[][] => {
    if (n === 1) return [[text]];
    const out: string[][] = [];
    for (let a = 1; a < words.length; a++) {
      if (n === 2) out.push([words.slice(0, a).join(" "), words.slice(a).join(" ")]);
      else {
        for (let b = a + 1; b < words.length; b++) {
          out.push([
            words.slice(0, a).join(" "),
            words.slice(a, b).join(" "),
            words.slice(b).join(" "),
          ]);
        }
      }
    }
    return out;
  };
  // A line's width in ems of the current font, the rocket placeholder measured as its sprite.
  const measure = (line: string, em: number) =>
    line.includes(ROCKET)
      ? ctx.measureText(line.replace(ROCKET, "").trimEnd()).width + (0.22 + ROCKET_EM) * em
      : ctx.measureText(line).width;
  let size = 14;
  let lines = [text];
  for (let n = 1; n <= Math.min(3, words.length); n++) {
    for (const option of splits(n)) {
      ctx.font = `900 100px ${SANS}`;
      const widest = Math.max(...option.map((l) => measure(l, 100))) / 100;
      const fit = Math.floor(Math.min(30, maxW / widest, maxH / (n * 1.06)));
      if (fit > size) {
        size = fit;
        lines = option;
      }
    }
  }
  const lead = size * 1.06;
  const y0 = centreY - ((lines.length - 1) * lead) / 2;
  ctx.font = `900 ${size}px ${SANS}`;
  const rocket = Math.round(size * ROCKET_EM);
  const layout = lines.map((line, i) => {
    const y = y0 + i * lead;
    if (!line.includes(ROCKET)) return { text: line, x: W / 2, y, align: "center" as const };
    const words = line.replace(ROCKET, "").trimEnd();
    const x = W / 2 - measure(line, size) / 2;
    return {
      text: words,
      x,
      y,
      align: "left" as const,
      rocket: x + measure(words, size) + 0.22 * size,
    };
  });
  const type = (l: Ctx, dy: number) => {
    l.font = `900 ${size}px ${SANS}`;
    l.textBaseline = "middle";
    l.fillStyle = "#fff";
    for (const { text: line, x, y, align } of layout) {
      l.textAlign = align;
      l.fillText(line, x, y + dy);
    }
  };
  const shadow = scale(base, 0.5);
  crisp(ctx, (l) => type(l, 2), 1, css(shadow));
  crisp(ctx, (l) => type(l, 0));
  for (const line of layout) {
    if ("rocket" in line && line.rocket !== undefined) {
      paintRocket(ctx, line.rocket, line.y - rocket / 2 - 1, rocket, shadow);
    }
  }
  return s.canvas;
}

function paintChatBack(base: RGB) {
  const { sheet: s, map } = paintPuff(true, base);
  const { ctx } = s;
  const px = CHAT_PPU;
  // Typing dots, under the modelled buttons: an AO ring where each meets the pillow, a lit dome.
  chatDots().forEach(({ x, y, r }, i) => {
    const [cx, cy] = map({ x, y } as Vector2);
    const glow = [0.5, 0.72, 0.94][i];
    crisp(
      ctx,
      (l) => {
        l.fillStyle = "#fff";
        l.beginPath();
        l.arc(cx, cy, (r + 0.035) * px, 0, Math.PI * 2);
        l.fill();
      },
      1,
      css(scale(base, 0.55)),
    );
    crisp(
      ctx,
      (l) => {
        l.fillStyle = "#fff";
        l.beginPath();
        l.arc(cx, cy, r * px, 0, Math.PI * 2);
        l.fill();
      },
      1,
      css(mix(base, WHITE, glow * 0.75)),
    );
    crisp(
      ctx,
      (l) => {
        l.fillStyle = "#fff";
        l.beginPath();
        l.arc(cx - 1, cy - 1, r * 0.62 * px, 0, Math.PI * 2);
        l.fill();
      },
      1,
      css(mix(base, WHITE, glow)),
    );
    s.rect(WHITE, Math.round(cx - r * 0.45 * px), Math.round(cy - r * 0.5 * px), 2, 2);
  });
  return s.canvas;
}

export function paintChatFaces() {
  return CHAT_LINES.map((text, i) => {
    const base = hex(CHAT_BASES[i % CHAT_BASES.length]);
    return {
      front: paintChatFront(text, base),
      back: paintChatBack(base),
      aspect: CHAT.w / CHAT.h,
    };
  });
}

// The piped seam, in greys: the material colour tints it per bubble. v 0 is the front pinch, 0.5
// the bead's crest (a dashed stitch line), 1 the back pinch; u repeats along the seam.
function paintChatSeam() {
  const W = 32;
  const H = 16;
  const s = new Sheet(W, H);
  const g = (v: number): RGB => [v, v, v];
  const rows: [number, number][] = [
    [0, 130],
    [1, 160],
    [2, 196],
    [3, 196],
    [4, 196],
    [5, 205],
    [6, 214],
    [7, 236],
    [8, 255],
    [9, 226],
    [10, 216],
    [11, 216],
    [12, 210],
    [13, 200],
    [14, 160],
    [15, 130],
  ];
  for (const [r, v] of rows) s.rect(g(v), 0, r, W, 1);
  for (let x = 0; x < W; x += 8) {
    s.rect(g(176), x + 4, 7, 4, 2);
  }
  s.snap();
  return s.canvas;
}

// ---------------------------------------------------------------------------------------------
// Sparkle gem

// Every arm in one violet-lilac family, so the gem reads as a single AI sparkle rather than a
// pinwheel; the holo shift is only a tint on the lit facets (cyan top and left, magenta bottom
// and right). No facet goes darker than GEM_FLOOR, which keeps it from muddying on white.
const GEM_BASE = hex("#6b4dff");
const GEM_LIT = hex("#9d8cff");
const GEM_CREST = hex("#d9d0ff");
const GEM_FLOOR = hex("#4a36b0");
const ARM_TINT = ["#45d4ff", "#45d4ff", "#ff4fb8", "#ff4fb8"].map(hex);
const GEM_PX = 192;

function gemMap(back: boolean) {
  const R = GEM.radius;
  return (p: Vector2): Pt => {
    const u = (p.x + R) / (2 * R);
    return [(back ? 1 - u : u) * GEM_PX, ((R - p.y) / (2 * R)) * GEM_PX];
  };
}

const gemFloor = (c: RGB): RGB => [
  Math.max(c[0], GEM_FLOOR[0]),
  Math.max(c[1], GEM_FLOOR[1]),
  Math.max(c[2], GEM_FLOOR[2]),
];

function facetTone(f: Facet, index: number): RGB {
  if (f.band === 2) return GEM_CREST;
  if (f.band === 3) return f.lit ? mix(GEM_LIT, GEM_CREST, 0.35) : scale(GEM_BASE, 0.8);
  const step = [1, 0.95, 1.05][index % 3];
  const tint = (c: RGB) => mix(c, ARM_TINT[f.arm], 0.25);
  if (f.band === 4) {
    return gemFloor(scale(f.lit ? tint(GEM_LIT) : GEM_BASE, (f.lit ? 0.8 : 0.64) * step));
  }
  const tone = f.lit
    ? tint(f.band === 1 ? mix(GEM_LIT, GEM_CREST, 0.45) : GEM_LIT)
    : scale(GEM_BASE, f.band === 1 ? 0.8 : 0.72);
  return gemFloor(scale(tone, step));
}

function paintGemFace(back: boolean, seed: number) {
  const s = new Sheet(GEM_PX, GEM_PX);
  const { ctx } = s;
  const map = gemMap(back);
  s.fill(GEM_FLOOR);
  const facets = gemFacets(back ? "back" : "front");
  facets.forEach((f, i) => {
    const path = polyPath(f.pts.map(map));
    ctx.fillStyle = s.c(facetTone(f, Math.floor(i / (back ? 1 : 2))));
    ctx.fill(path);
    // Hairline seams between facets so each one prints as its own plane.
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 0.6;
    ctx.stroke(path);
  });
  s.snap();

  const outline = gemOutline();
  const keel = back ? "#c9b5ff" : "#ffffff";
  crisp(
    ctx,
    (l) => {
      l.strokeStyle = "#fff";
      l.lineWidth = back ? 1.2 : 1.6;
      l.lineCap = "round";
      l.beginPath();
      for (let a = 0; a < 4; a++) {
        const tip = outline[a * 6];
        const [tx, ty] = map(tip);
        if (back) {
          const [cx, cy] = map(tip.clone().set(0, 0));
          l.moveTo(tx, ty);
          l.lineTo(cx, cy);
        } else {
          const [mx, my] = map(tip.clone().multiplyScalar(GEM.crown.scale));
          const [dx, dy] = map(tip.clone().normalize().multiplyScalar(GEM.table.r));
          l.moveTo(tx, ty);
          l.lineTo(mx, my);
          l.lineTo(dx, dy);
        }
      }
      const sat = satelliteOutline();
      const [scx, scy] = map(sat[0].clone().set(GEM.satellite.x, GEM.satellite.y));
      for (let k = 0; k < 8; k += 2) {
        const [x, y] = map(sat[k]);
        l.moveTo(scx, scy);
        l.lineTo(x, y);
      }
      l.stroke();
    },
    back ? 0.7 : 0.85,
    keel,
  );
  // The girdle edge.
  crisp(
    ctx,
    (l) => {
      l.strokeStyle = "#fff";
      l.lineWidth = 1.5;
      l.stroke(polyPath(insetLoop(outline, 0.012).map(map)));
      l.stroke(polyPath(insetLoop(satelliteOutline(), 0.01).map(map)));
    },
    back ? 0.45 : 0.75,
  );

  if (!back) {
    // The table: brightest, a laser-etched AI as big as the diamond allows, hard glints above it.
    const [cx, cy] = map(outline[0].clone().set(0, 0));
    crisp(
      ctx,
      (l) => {
        l.font = `900 21px ${SANS}`;
        l.textAlign = "center";
        l.textBaseline = "middle";
        l.fillStyle = "#fff";
        l.fillText("AI", cx, cy + 1);
      },
      1,
      "#4a36c0",
    );
    s.rect(WHITE, Math.round(cx - 4), Math.round(cy - 16), 3, 3);
    s.rect(WHITE, Math.round(cx - 8), Math.round(cy - 11), 2, 2);
    // Hard glint bands across the upper-left arms.
    crisp(
      ctx,
      (l) => {
        l.translate(cx - 42, cy - 40);
        l.rotate(-Math.PI / 4);
        l.fillStyle = "#fff";
        l.fillRect(-14, -2, 28, 3);
        l.fillRect(-9, 4, 18, 2);
      },
      0.4,
    );
  } else {
    // Fire: a few chips of hot colour caught in the pavilion.
    const rand = rng(seed);
    const fire = ["#ffd23f", "#45d4ff", "#ff4fb8", "#ffffff"];
    for (let i = 0; i < 9; i++) {
      const a = rand() * Math.PI * 2;
      const r = 0.2 + rand() * 0.7;
      const [x, y] = map(outline[0].clone().set(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5));
      s.rect(fire[i % fire.length], Math.round(x), Math.round(y), 2, 2);
    }
  }
  return s.canvas;
}

export function paintGemFaces() {
  return { front: paintGemFace(false, 500), back: paintGemFace(true, 501), aspect: 1 };
}

// The girdle band: one lilac band, a white row at the crown edge, a dark one at the pavilion
// edge and the cheap mould's parting line. Stacked hues here read as an RGB-split fringe.
function paintGemGirdle() {
  const s = new Sheet(64, 16);
  s.rect("#b9adff", 0, 0, 64, 16);
  s.rect("#f4f0ff", 0, 0, 64, 1);
  s.rect("#8f7fff", 0, 8, 64, 1);
  s.rect("#4a36c0", 0, 15, 64, 1);
  s.snap();
  return s.canvas;
}

// ---------------------------------------------------------------------------------------------
// Cut faces: tileable, big readable shapes with hard outlines.

function voronoi(S: number, seeds: Pt[]) {
  const id = new Int32Array(S * S);
  const f1 = new Float32Array(S * S);
  const f2 = new Float32Array(S * S);
  const dx = new Float32Array(S * S);
  const dy = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let a = Infinity;
      let b = Infinity;
      let k = 0;
      let ox = 0;
      let oy = 0;
      for (let i = 0; i < seeds.length; i++) {
        const ex = torus(x + 0.5 - seeds[i][0], S);
        const ey = torus(y + 0.5 - seeds[i][1], S);
        const d = Math.hypot(ex, ey);
        if (d < a) {
          b = a;
          a = d;
          k = i;
          ox = ex;
          oy = ey;
        } else if (d < b) b = d;
      }
      const p = y * S + x;
      id[p] = k;
      f1[p] = a;
      f2[p] = b;
      dx[p] = ox;
      dy[p] = oy;
    }
  }
  return { id, f1, f2, dx, dy };
}

function jittered(S: number, n: number, jitter: number, rand: () => number): Pt[] {
  const cell = S / n;
  const seeds: Pt[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      seeds.push([
        (i + 0.5 + (rand() - 0.5) * jitter) * cell,
        (j + 0.5 + (rand() - 0.5) * jitter) * cell,
      ]);
    }
  }
  return seeds;
}

function pixels(S: number, colour: (p: number) => RGB) {
  const [canvas, ctx] = makeCanvas(S, S);
  const image = ctx.createImageData(S, S);
  const d = image.data;
  for (let p = 0; p < S * S; p++) {
    const [r, g, b] = colour(p);
    d[p * 4] = r;
    d[p * 4 + 1] = g;
    d[p * 4 + 2] = b;
    d[p * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

// Cheap frame moulding is polystyrene: packed beads, each outlined, lit top-left, a few voids. The
// whole ramp sits well under white (lit beads included), so a cut still reads on a white page.
function paintCutPolystyrene(seed: number) {
  const S = 128;
  const rand = rng(seed);
  const seeds = jittered(S, 10, 0.7, rand);
  const hollow = seeds.map(() => rand() < 0.12);
  const { id, f1, f2, dx, dy } = voronoi(S, seeds);
  const bead = hex("#ddd3bd");
  const lit = hex("#f1ead8");
  const edge = hex("#8a7f68");
  const shade = hex("#bfb39a");
  const hole = hex("#6e634f");
  return pixels(S, (p) => {
    const gap = f2[p] - f1[p];
    if (gap < 2.2) return edge;
    if (hollow[id[p]]) return gap < 3 ? shade : hole;
    const r = (f1[p] + f2[p]) / 2;
    const toward = (dx[p] + dy[p]) / Math.max(1, r);
    if (toward < -0.5 && gap > 3.2) return lit;
    if (toward > 0.55 || gap < 3.2) return shade;
    return bead;
  });
}

// Closed-cell foam, near white (the material colour tints it per bubble): big round cells with a
// darker rim and a hard highlight crescent, small ones packed between.
function paintCutFoam(seed: number) {
  const S = 128;
  const s = new Sheet(S, S);
  const { ctx } = s;
  const rand = rng(seed);
  const cells: [number, number, number][] = [];
  for (let tries = 0; tries < 4000 && cells.length < 26; tries++) {
    const big = cells.length < 9;
    const r = big ? 10 + rand() * 4 : 3 + rand() * 3.5;
    const x = rand() * S;
    const y = rand() * S;
    const clear = cells.every(
      ([cx, cy, cr]) => Math.hypot(torus(x - cx, S), torus(y - cy, S)) > r + cr + 2.5,
    );
    if (clear) cells.push([x, y, r]);
  }
  s.fill("#b6bfcf");
  const disc = (x: number, y: number, r: number, colour: string) => {
    ctx.fillStyle = s.c(colour);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  wrapped(ctx, () => {
    for (const [x, y, r] of cells) {
      disc(x, y, r, "#7f8aa1");
      disc(x, y, r - 2, "#eef1f7");
      if (r > 5) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r - 2, 0, Math.PI * 2);
        ctx.clip();
        disc(x - 2, y - 2, r - 3, "#ffffff");
        disc(x, y, r - 3.5, "#eef1f7");
        disc(x + 2, y + 2, r - 5, "#dde2ec");
        ctx.restore();
      }
    }
  });
  s.snap();
  return s.canvas;
}

// Gem interior: a few big facet planes in violet tones, bright fracture lines on some edges, dark
// on others, and a couple of white inclusions.
function paintCutCrystal(seed: number) {
  const S = 256;
  const rand = rng(seed);
  const seeds = jittered(S, 3, 0.9, rand);
  const tones = ["#2c1a70", "#4b2fb0", "#6b4dff", "#9d8cff"].map(hex);
  const tone = seeds.map(() => Math.floor(rand() * tones.length));
  const split = seeds.map((): Pt => {
    const a = rand() * Math.PI;
    return [Math.cos(a), Math.sin(a)];
  });
  const bright = seeds.map(() => rand() < 0.5);
  const { id, f1, f2, dx, dy } = voronoi(S, seeds);
  const fracture = hex("#e6deff");
  const crack = hex("#160b3c");
  const canvas = pixels(S, (p) => {
    const k = id[p];
    const gap = f2[p] - f1[p];
    if (bright[k] && gap < 3) return fracture;
    if (!bright[k] && gap < 2) return crack;
    const side = dx[p] * split[k][0] + dy[p] * split[k][1];
    if (Math.abs(side) < 1) return bright[k] ? tones[3] : crack;
    const t = Math.min(tones.length - 1, tone[k] + (side > 0 ? 1 : 0));
    return tones[t];
  });
  const ctx = canvas.getContext("2d")!;
  wrapped(ctx, () => {
    const r = rng(seed + 1);
    for (let i = 0; i < 3; i++) {
      const x = r() * S;
      const y = r() * S;
      ctx.fillStyle = "#160b3c";
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x, y, 2.8, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  snap(ctx, [...tones, fracture, crack, WHITE]);
  return canvas;
}

// ---------------------------------------------------------------------------------------------

export interface DecorSources {
  // Frame moulding strip (u repeats along the moulding, v across the profile).
  frameGold: HTMLCanvasElement;
  // Frame rosettes and crest.
  frameOrnament: HTMLCanvasElement;
  // Small trim cells: the frame's brass hanger and the bubble's care tag.
  trim: HTMLCanvasElement;
  // Bubble seam piping, greys tinted by the material colour; u repeats.
  chatSeam: HTMLCanvasElement;
  // Gem girdle band.
  gemGirdle: HTMLCanvasElement;
  cutFoam: HTMLCanvasElement;
  cutCrystal: HTMLCanvasElement;
  cutPolystyrene: HTMLCanvasElement;
}

const TILED = new Set<keyof DecorSources>([
  "frameGold",
  "chatSeam",
  "cutFoam",
  "cutCrystal",
  "cutPolystyrene",
]);

export function paintDecor(seed: number): DecorSources {
  return {
    frameGold: paintGoldStrip(seed),
    frameOrnament: paintOrnament(),
    trim: paintTrim(),
    chatSeam: paintChatSeam(),
    gemGirdle: paintGemGirdle(),
    cutFoam: paintCutFoam(seed + 3),
    cutCrystal: paintCutCrystal(seed + 4),
    cutPolystyrene: paintCutPolystyrene(seed + 5),
  };
}

export function wrapDecor<T>(
  src: DecorSources,
  plain: (canvas: HTMLCanvasElement) => T,
  tiled: (canvas: HTMLCanvasElement) => T,
) {
  const out = {} as Record<keyof DecorSources, T>;
  for (const key of Object.keys(src) as (keyof DecorSources)[]) {
    out[key] = TILED.has(key) ? tiled(src[key]) : plain(src[key]);
  }
  return out;
}
