import * as THREE from "three";

// The only text the game shows: "3 Slop Combo" popping up where a swipe landed, a red X at the
// bottom edge where a piece of slop fell through, and the score over the rematch prop once a run
// ends. All are arcade-style bitmaps (a fill, a thick white outline, a dark keyline and a hard drop shadow) drawn at the
// game's own pixel size, with outlines grown pixel by pixel rather than stroked, so they sit on
// the same hard grid as everything else and never go soft.

const FONT = `"Haas Recast", "Pretendard Variable", sans-serif`;
const WEIGHT = 800;
// Extra space between letters, in game pixels, so neighbouring outlines don't fuse into one blob.
const TRACKING = 2;
// Sizes in game pixels; the canvas is ~400 lines on its short side.
const BASE_SIZE = 21;
const SIZE_STEP = 2;
const MAX_SIZE = 31;
const SCORE_SIZE = 42;
const BEST_SIZE = 19;
const LINE_GAP = 6;
const X_SIZE = 17;
const X_STROKE = 5;
const OUTLINE = 2;
const SHADOW = 2;
const INK = [17, 17, 20] as const;
const PAPER = [255, 255, 255] as const;
const RED = [230, 52, 41] as const;
const MARGIN = 6;

type Kind = "combo" | "miss" | "score";

const TIMING: Record<Kind, { pop: number; hold: number; blink: number; rise: number }> = {
  // `rise` is how far it floats up over its life, in world units (the view is 10 tall).
  combo: { pop: 0.16, hold: 0.82, blink: 0.24, rise: 0.5 },
  miss: { pop: 0.14, hold: 0.7, blink: 0.3, rise: 0 },
  // Stays until it's dismissed.
  score: { pop: 0.2, hold: Infinity, blink: 0.24, rise: 0 },
};

interface Callout {
  kind: Kind;
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  texture: THREE.CanvasTexture;
  // Bitmap size in game pixels.
  w: number;
  h: number;
  x: number;
  y: number;
  age: number;
  // When the blink-out starts; a dismissed score card gets one.
  hold: number;
}

export const comboLabel = (count: number) => `${count} Slop Combo`;
export const comboSize = (count: number) => Math.min(MAX_SIZE, BASE_SIZE + (count - 3) * SIZE_STEP);

// Grows a binary mask by `r` pixels with a rounded kernel: r = 1 is a plus, r = 2 has its corners
// clipped, so outlines come out chunky but not boxy.
function dilate(mask: Uint8Array, w: number, h: number, r: number) {
  const out = new Uint8Array(w * h);
  const reach = r * r + r * 0.8;
  const offsets: [number, number][] = [];
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= reach) offsets.push([dx, dy]);
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      for (const [dx, dy] of offsets) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h) out[ny * w + nx] = 1;
      }
    }
  }
  return out;
}

const PAD = OUTLINE + 1 + SHADOW + 1;

function blank(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D canvas unavailable");
  return [canvas, ctx] as const;
}

// Thresholds whatever was drawn in black to a hard mask (a touch heavy so thin joins survive),
// then repaints it as fill, outline, keyline and shadow.
function finishBitmap(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  fillColor: readonly number[],
) {
  const { width: w, height: h } = canvas;
  const src = ctx.getImageData(0, 0, w, h).data;
  const fill = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) fill[i] = src[i * 4 + 3] >= 100 ? 1 : 0;
  const outline = dilate(fill, w, h, OUTLINE);
  const keyline = dilate(outline, w, h, 1);

  const image = ctx.createImageData(w, h);
  const px = image.data;
  const paint = (i: number, [r, g, b]: readonly number[]) => {
    px[i * 4] = r;
    px[i * 4 + 1] = g;
    px[i * 4 + 2] = b;
    px[i * 4 + 3] = 255;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (fill[i]) paint(i, fillColor);
      else if (outline[i]) paint(i, PAPER);
      else if (keyline[i]) paint(i, INK);
      // A hard drop shadow: the keyline again, straight down.
      else if (y >= SHADOW && keyline[i - SHADOW * w]) paint(i, INK);
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

// Lines of text, each centred over the widest.
export function drawTextBitmap(lines: { text: string; size: number }[]) {
  const [, probe] = blank(1, 1);
  const set = lines.map(({ text, size }) => {
    const font = `${WEIGHT} ${size}px ${FONT}`;
    probe.font = font;
    // Set glyph by glyph: canvas letterSpacing isn't everywhere yet.
    const glyphs = [...text];
    const advances = glyphs.map((g) => probe.measureText(g).width + TRACKING);
    const m = probe.measureText(text);
    const left = Math.max(0, Math.ceil(m.actualBoundingBoxLeft));
    const run = advances.reduce((a, b) => a + b, 0) - TRACKING;
    return {
      font,
      glyphs,
      advances,
      left,
      ascent: Math.ceil(m.actualBoundingBoxAscent),
      descent: Math.ceil(m.actualBoundingBoxDescent),
      width: left + Math.ceil(run) + 1,
    };
  });
  const inner = Math.max(...set.map((l) => l.width));
  const tall = set.reduce((sum, l) => sum + l.ascent + l.descent, 0) + LINE_GAP * (set.length - 1);
  const [canvas, ctx] = blank(inner + PAD * 2, tall + PAD * 2);
  ctx.fillStyle = "#000";
  let top = PAD;
  for (const line of set) {
    ctx.font = line.font;
    let pen = PAD + Math.floor((inner - line.width) / 2) + line.left;
    line.glyphs.forEach((g, i) => {
      ctx.fillText(g, Math.round(pen), top + line.ascent);
      pen += line.advances[i];
    });
    top += line.ascent + line.descent + LINE_GAP;
  }
  return finishBitmap(canvas, ctx, INK);
}

export const drawComboBitmap = (count: number) =>
  drawTextBitmap([{ text: comboLabel(count), size: comboSize(count) }]);

export const drawScoreBitmap = (score: number, best: number, newBest: boolean) =>
  drawTextBitmap([
    { text: String(score), size: SCORE_SIZE },
    { text: newBest ? "New best" : `Best ${best}`, size: BEST_SIZE },
  ]);

export function drawMissBitmap(size = X_SIZE, stroke = X_STROKE) {
  const side = size + PAD * 2;
  const [canvas, ctx] = blank(side, side);
  ctx.strokeStyle = "#000";
  ctx.lineWidth = stroke;
  ctx.lineCap = "round";
  const a = PAD + stroke / 2;
  const b = PAD + size - stroke / 2;
  ctx.beginPath();
  ctx.moveTo(a, a);
  ctx.lineTo(b, b);
  ctx.moveTo(b, a);
  ctx.lineTo(a, b);
  ctx.stroke();
  return finishBitmap(canvas, ctx, RED);
}

export function createCallouts(overlay: THREE.Scene, renderOrder: number) {
  const plane = new THREE.PlaneGeometry(1, 1);
  const live: Callout[] = [];
  // Materials are reused so three never relinks the shader for a callout.
  const spare: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  let viewW = 1;
  let viewH = 1;
  let pixel = 1;
  let rightInset = 0;
  let reducedMotion = false;

  function remove(index: number) {
    const [callout] = live.splice(index, 1);
    overlay.remove(callout.mesh);
    callout.texture.dispose();
    spare.push(callout.mesh);
  }

  // Keeps every texel on exactly one game pixel: whole-pixel size, and the left/bottom edges
  // snapped to the pixel grid (the ortho view spans -viewW/2..viewW/2 by -viewH/2..viewH/2).
  // Callouts stay inside the frame and clear of the corner buttons on the right.
  function place(c: Callout, scale: number, rise: number) {
    const cols = viewW / pixel;
    const rows = viewH / pixel;
    const cx = (c.x + viewW / 2) / pixel;
    const cy = (c.y + rise + viewH / 2) / pixel;
    // The left and bottom edges win when a callout is wider or taller than the room it has.
    const left = Math.round(Math.max(MARGIN, Math.min(cx - c.w / 2, cols - rightInset - c.w)));
    const bottom = Math.round(Math.max(MARGIN, Math.min(cy - c.h / 2, rows - MARGIN - c.h)));
    c.mesh.position.set(
      (left + c.w / 2) * pixel - viewW / 2,
      (bottom + c.h / 2) * pixel - viewH / 2,
      0,
    );
    c.mesh.scale.set(c.w * pixel * scale, c.h * pixel * scale, 1);
  }

  function add(kind: Kind, canvas: HTMLCanvasElement, x: number, y: number) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    const mesh =
      spare.pop() ??
      new THREE.Mesh(
        plane,
        new THREE.MeshBasicMaterial({
          transparent: true,
          alphaTest: 0.5,
          depthTest: false,
          depthWrite: false,
        }),
      );
    mesh.material.map = texture;
    mesh.material.needsUpdate = true;
    mesh.renderOrder = renderOrder;
    mesh.visible = true;
    overlay.add(mesh);
    const callout: Callout = {
      kind,
      mesh,
      texture,
      w: canvas.width,
      h: canvas.height,
      x,
      y,
      age: 0,
      hold: TIMING[kind].hold,
    };
    live.push(callout);
    place(callout, ...pose(callout));
  }

  // Scale and rise at the callout's current age. Pop: overshoot, then settle on exactly 1 so the
  // bitmap lands pixel for pixel.
  function pose(c: Callout): [number, number] {
    if (reducedMotion) return [1, 0];
    const { pop, blink, rise } = TIMING[c.kind];
    const { hold } = c;
    let scale = 1;
    if (c.age < pop) {
      const t = c.age / pop - 1;
      scale = 0.4 + 0.6 * (1 + 2.6 * t ** 3 + 1.6 * t ** 2);
    }
    return [scale, rise * (1 - (1 - c.age / (hold + blink)) ** 2)];
  }

  // Runs on real time, so the hit-stop that lands with the last cut doesn't hold the pop back.
  function update(dt: number) {
    for (let i = live.length - 1; i >= 0; i--) {
      const c = live[i];
      const { blink } = TIMING[c.kind];
      const { hold } = c;
      c.age += dt;
      if (c.age >= hold + blink) {
        remove(i);
        continue;
      }
      place(c, ...pose(c));
      // Then blinks out, arcade style, instead of fading through soft alpha.
      c.mesh.visible =
        reducedMotion || c.age < hold || Math.floor((c.age - hold) / (blink / 6)) % 2 === 1;
    }
  }

  return {
    // `x, y` in world units on the play plane; the callout centres a little above.
    combo(x: number, y: number, count: number) {
      // A new combo replaces the last one rather than piling on top of it.
      for (let i = live.length - 1; i >= 0; i--) if (live[i].kind === "combo") remove(i);
      add("combo", drawComboBitmap(count), x, y);
    },
    score(x: number, y: number, score: number, best: number, newBest: boolean) {
      add("score", drawScoreBitmap(score, best, newBest), x, y);
    },
    // Blinks out whatever of this kind is still up.
    dismiss(kind: Kind) {
      for (const c of live) if (c.kind === kind) c.hold = Math.min(c.hold, c.age);
    },
    // Sits on the bottom edge under where the slop fell out of frame.
    miss(x: number) {
      add("miss", drawMissBitmap(), x, -Infinity);
    },
    update,
    // `pixelsHigh` is the canvas's internal height (one game pixel is viewH / pixelsHigh units);
    // `inset` keeps callouts that many game pixels clear of the right edge.
    layout(width: number, height: number, pixelsHigh: number, inset: number) {
      viewW = width;
      viewH = height;
      pixel = height / pixelsHigh;
      rightInset = Math.max(MARGIN, Math.ceil(inset));
      // Re-snap anything on screen to the new grid before the resize repaint.
      for (const c of live) place(c, ...pose(c));
    },
    setReducedMotion(value: boolean) {
      reducedMotion = value;
    },
    clear() {
      while (live.length) remove(live.length - 1);
    },
    dispose() {
      while (live.length) remove(live.length - 1);
      for (const mesh of spare) mesh.material.dispose();
      spare.length = 0;
      plane.dispose();
    },
  };
}
