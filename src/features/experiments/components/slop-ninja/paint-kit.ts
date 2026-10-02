// Canvas helpers for painting PS2-style skins: everything is drawn at the size the game shows it,
// line art and type are alpha-thresholded to hard pixel edges, shading is a few flat tones instead
// of gradients, and finished canvases are reduced to a small palette like a CLUT texture.

export type Ctx = CanvasRenderingContext2D;
export type RGB = [number, number, number];

export const SANS = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
export const MONO = '"Commit Mono", ui-monospace, Menlo, monospace';

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D canvas unavailable");
  return [canvas, ctx];
}

export function rgb(hex: string): RGB {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const css = ([r, g, b]: RGB, alpha = 1) =>
  alpha === 1
    ? `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`
    : `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${alpha})`;

// Lighter toward white (amount > 0) or darker toward black (< 0).
export function tone(hex: string, amount: number) {
  const c = rgb(hex);
  const target = amount > 0 ? 255 : 0;
  const t = Math.abs(amount);
  return css(c.map((v) => v + (target - v) * t) as RGB);
}

type Box = [x: number, y: number, w: number, h: number];

// A local-space box as the device-pixel rect it covers on `ctx`'s canvas, or null off canvas.
function deviceBox(ctx: Ctx, [x, y, w, h]: Box): Box | null {
  const m = ctx.getTransform();
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [px, py] of [
    [x, y],
    [x + w, y],
    [x, y + h],
    [x + w, y + h],
  ]) {
    xs.push(m.a * px + m.c * py + m.e);
    ys.push(m.b * px + m.d * py + m.f);
  }
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const x1 = Math.min(ctx.canvas.width, Math.ceil(Math.max(...xs)));
  const y1 = Math.min(ctx.canvas.height, Math.ceil(Math.max(...ys)));
  return x1 > x0 && y1 > y0 ? [x0, y0, x1 - x0, y1 - y0] : null;
}

// Paints on a scratch layer in the same coordinate space as `ctx`, snaps the layer's alpha to 0 or
// 1 and stamps it at `opacity`: anti-aliased fuzz becomes a hard pixel edge, like PS2 bitmap art.
// Paint with opaque colours; a faint overlay gets its faintness from `opacity`. `bounds` (local
// space) limits the layer to where the paint lands, which keeps the per-pixel pass cheap.
export function crisp(ctx: Ctx, paint: (layer: Ctx) => void, opacity = 1, bounds?: Box) {
  const { width, height } = ctx.canvas;
  const box = bounds ? deviceBox(ctx, bounds) : ([0, 0, width, height] as Box);
  if (!box) return;
  const [bx, by, bw, bh] = box;
  const [layer, l] = makeCanvas(bw, bh);
  const m = ctx.getTransform();
  l.setTransform(1, 0, 0, 1, -bx, -by);
  l.transform(m.a, m.b, m.c, m.d, m.e, m.f);
  paint(l);
  const image = l.getImageData(0, 0, bw, bh);
  const d = image.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 110 ? 255 : 0;
  l.putImageData(image, 0, 0);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = opacity;
  ctx.drawImage(layer, bx, by);
  ctx.restore();
}

export interface TextStyle {
  size: number;
  color: string;
  weight?: number;
  font?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  spacing?: number;
  maxW?: number;
  // A hard outline [width, colour] and a hard drop shadow [dx, dy, colour].
  outline?: [number, string];
  shadow?: [number, number, string];
}

// Crisp type: shadow, outline and fill each thresholded on their own so no edge goes soft.
export function label(ctx: Ctx, text: string, x: number, y: number, style: TextStyle) {
  const {
    size,
    color,
    weight = 800,
    font = SANS,
    align = "left",
    baseline = "alphabetic",
    spacing = 0,
    maxW,
    outline,
    shadow,
  } = style;
  const set = (c: Ctx) => {
    c.font = `${weight} ${size}px ${font}`;
    c.textAlign = align;
    c.textBaseline = baseline;
    c.letterSpacing = `${spacing}px`;
    c.lineJoin = "round";
  };
  set(ctx);
  const measured = ctx.measureText(text).width;
  const w = maxW ? Math.min(measured, maxW) : measured;
  const pad =
    (outline?.[0] ?? 0) + Math.max(Math.abs(shadow?.[0] ?? 0), Math.abs(shadow?.[1] ?? 0)) + 3;
  const left = align === "center" ? x - w / 2 : align === "right" || align === "end" ? x - w : x;
  const bounds: Box = [left - pad, y - size * 1.3 - pad, w + pad * 2, size * 2.6 + pad * 2];
  const draw = (c: Ctx, dx: number, dy: number, fill: string, stroke?: [number, string]) => {
    set(c);
    if (stroke) {
      c.lineWidth = stroke[0] * 2;
      c.strokeStyle = stroke[1];
      c.strokeText(text, x + dx, y + dy, maxW);
    }
    c.fillStyle = fill;
    c.fillText(text, x + dx, y + dy, maxW);
  };
  if (shadow) {
    crisp(
      ctx,
      (c) =>
        draw(c, shadow[0], shadow[1], shadow[2], outline ? [outline[0], shadow[2]] : undefined),
      1,
      bounds,
    );
  }
  if (outline) crisp(ctx, (c) => draw(c, 0, 0, outline[1], outline), 1, bounds);
  crisp(ctx, (c) => draw(c, 0, 0, color), 1, bounds);
  return w;
}

export function measure(ctx: Ctx, text: string, size: number, weight = 800, font = SANS) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${font}`;
  const w = ctx.measureText(text).width;
  ctx.restore();
  return w;
}

// A flat block with a baked lit top/left edge and a shadowed bottom/right one.
export function bevelRect(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  light: string,
  dark: string,
  edge = 1,
) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = light;
  ctx.fillRect(x, y, w, edge);
  ctx.fillRect(x, y, edge, h);
  ctx.fillStyle = dark;
  ctx.fillRect(x, y + h - edge, w, edge);
  ctx.fillRect(x + w - edge, y, edge, h);
}

// The four-point AI sparkle as a hard polygon: tips on the axes, pinched waists between.
export function sparklePath(ctx: Ctx, x: number, y: number, r: number, waist = 0.3) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * waist;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// A two-tone sparkle (lit upper-left half, shaded lower-right) with a one-texel dark outline.
export function sparkle(
  ctx: Ctx,
  x: number,
  y: number,
  r: number,
  [light, dark]: [string, string],
  outline = "#141418",
  waist = 0.3,
) {
  const bounds: Box = [x - r - 4, y - r - 4, r * 2 + 8, r * 2 + 8];
  crisp(
    ctx,
    (c) => {
      c.fillStyle = outline;
      sparklePath(c, x, y, r + 1.6, waist);
      c.fill();
    },
    1,
    bounds,
  );
  crisp(
    ctx,
    (c) => {
      c.fillStyle = dark;
      sparklePath(c, x, y, r, waist);
      c.fill();
      c.save();
      sparklePath(c, x, y, r, waist);
      c.clip();
      c.fillStyle = light;
      c.beginPath();
      c.moveTo(x - r * 2, y + r * 2);
      c.lineTo(x + r * 2, y - r * 2);
      c.lineTo(x - r * 2, y - r * 2);
      c.closePath();
      c.fill();
      c.restore();
    },
    1,
    bounds,
  );
}

export function starburstPath(
  ctx: Ctx,
  x: number,
  y: number,
  r: number,
  spikes: number,
  inner = 0.78,
) {
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * inner;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

// A die-cut sticker at (x, y), turned by `angle`: a dark hairline, a white border `border` texels
// wide, then the face. `shape(c, grow)` traces the outline grown by `grow` texels, centred on 0,0.
export function sticker(
  ctx: Ctx,
  x: number,
  y: number,
  angle: number,
  shape: (c: Ctx, grow: number) => void,
  face: (c: Ctx) => void,
  border = 2,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  crisp(
    ctx,
    (c) => {
      c.fillStyle = "#141218";
      shape(c, border + 1);
      c.fill();
    },
    0.6,
  );
  crisp(ctx, (c) => {
    c.fillStyle = "#fbfaf6";
    shape(c, border);
    c.fill();
  });
  face(ctx);
  ctx.restore();
}

// Sparse 1-2 texel specks (dust, grime, scuffs) inside a rect.
export function specks(
  ctx: Ctx,
  [x, y, w, h]: [number, number, number, number],
  count: number,
  colours: string[],
  seed: number,
) {
  const rand = rng(seed);
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colours[Math.floor(rand() * colours.length)];
    const s = rand() < 0.3 ? 2 : 1;
    ctx.fillRect(Math.floor(x + rand() * w), Math.floor(y + rand() * h), s, rand() < 0.5 ? 1 : s);
  }
}

// One-texel horizontal streaks of brushed metal, low contrast, quantised to a few tones.
export function brushed(
  ctx: Ctx,
  [x, y, w, h]: [number, number, number, number],
  base: string,
  amount: number,
  seed: number,
) {
  const rand = rng(seed);
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);
  for (let row = y; row < y + h; row++) {
    let col = x;
    while (col < x + w) {
      const len = 6 + Math.floor(rand() * 40);
      const v = Math.round((rand() - 0.5) * 2) * amount;
      if (v !== 0) {
        ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
        ctx.fillRect(col, row, Math.min(len, x + w - col), 1);
      }
      col += len;
    }
  }
}

// Repeats a paint at the eight neighbouring tile offsets so a tileable skin wraps seamlessly.
// `size` is the tile when `ctx` is a scratch layer of another canvas.
export function wrapped(
  ctx: Ctx,
  paint: () => void,
  size: [number, number] = [ctx.canvas.width, ctx.canvas.height],
) {
  const [W, H] = size;
  for (const dx of [-W, 0, W]) {
    for (const dy of [-H, 0, H]) {
      ctx.save();
      ctx.translate(dx, dy);
      paint();
      ctx.restore();
    }
  }
}

// Two hard glass glints across a rect: parallel diagonal bands of white at low alpha.
export function glints(ctx: Ctx, x: number, y: number, w: number, h: number, at = 0.18) {
  const band = (offset: number, width: number, alpha: number) =>
    crisp(
      ctx,
      (c) => {
        c.beginPath();
        c.rect(x, y, w, h);
        c.clip();
        c.fillStyle = "#ffffff";
        c.beginPath();
        const x0 = x + w * offset;
        c.moveTo(x0, y);
        c.lineTo(x0 + width, y);
        c.lineTo(x0 + width - h * 0.9, y + h);
        c.lineTo(x0 - h * 0.9, y + h);
        c.closePath();
        c.fill();
      },
      alpha,
    );
  band(at, Math.max(3, w * 0.07), 0.14);
  band(at + Math.max(0.06, 18 / w), Math.max(2, w * 0.025), 0.08);
}

// Median-cut palette reduction, like a 4- or 8-bit CLUT texture: gradients become flat bands.
// `dither` adds a 2x2 ordered dither of that many levels before matching (photos only).
export function quantize(canvas: HTMLCanvasElement, colours: number, dither = 0) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  const { width, height } = canvas;
  const image = ctx.getImageData(0, 0, width, height);
  const d = image.data;
  const n = width * height;
  const all = new Int32Array(n);
  for (let i = 0; i < n; i++) all[i] = i;
  type Box = { idx: Int32Array; range: number; channel: number };
  const measureBox = (idx: Int32Array): Box => {
    const lo = [255, 255, 255];
    const hi = [0, 0, 0];
    for (const i of idx) {
      for (let c = 0; c < 3; c++) {
        const v = d[i * 4 + c];
        if (v < lo[c]) lo[c] = v;
        if (v > hi[c]) hi[c] = v;
      }
    }
    const ranges = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
    const channel = ranges.indexOf(Math.max(...ranges));
    return { idx, range: ranges[channel], channel };
  };
  const boxes: Box[] = [measureBox(all)];
  while (boxes.length < colours) {
    let pick = -1;
    let best = 0;
    boxes.forEach((b, i) => {
      const score = b.range * Math.sqrt(b.idx.length);
      if (b.idx.length > 1 && b.range > 0 && score > best) {
        best = score;
        pick = i;
      }
    });
    if (pick < 0) break;
    const { idx, channel } = boxes[pick];
    const sorted = Int32Array.from(idx).sort((a, b) => d[a * 4 + channel] - d[b * 4 + channel]);
    const mid = sorted.length >> 1;
    boxes.splice(pick, 1, measureBox(sorted.subarray(0, mid)), measureBox(sorted.subarray(mid)));
  }
  const palette = boxes.map(({ idx }) => {
    const sum = [0, 0, 0];
    for (const i of idx) for (let c = 0; c < 3; c++) sum[c] += d[i * 4 + c];
    return sum.map((s) => s / idx.length);
  });
  const bayer = [-0.375, 0.125, 0.375, -0.125];
  // Matches are cached per 5-bit colour cell: close enough for a CLUT, and far fewer searches.
  const cache = new Int16Array(1 << 15).fill(-1);
  const nearest = (r: number, g: number, b: number) => {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    if (cache[key] >= 0) return cache[key];
    let bestI = 0;
    let bestD = Infinity;
    palette.forEach(([pr, pg, pb], i) => {
      const dist = 0.3 * (r - pr) ** 2 + 0.59 * (g - pg) ** 2 + 0.11 * (b - pb) ** 2;
      if (dist < bestD) {
        bestD = dist;
        bestI = i;
      }
    });
    cache[key] = bestI;
    return bestI;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      const o = dither ? bayer[(y & 1) * 2 + (x & 1)] * dither : 0;
      const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v + o)));
      const c = palette[nearest(clamp(d[p]), clamp(d[p + 1]), clamp(d[p + 2]))];
      d[p] = c[0];
      d[p + 1] = c[1];
      d[p + 2] = c[2];
      d[p + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}
