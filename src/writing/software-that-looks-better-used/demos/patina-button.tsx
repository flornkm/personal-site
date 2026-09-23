import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

/* A button that looks better used. Blue enamel over brass, the way a black-paint Leica is
   built, and every press takes a little of the paint with it. Wear lands where the pointer
   lands, so a user who always hits the same spot opens a bare patch there; the edges brass up on
   their own no matter where you press, because on a real object the edges are what touch
   everything else. Hold and drag to rub. A reload repaints it.

   The paint is a canvas layer eroded by a wear field, one cell per CSS pixel. A cell's paint is
   gone once its wear crosses a per-cell threshold, and the threshold is noise, so the bare
   patches grow as irregular chips with hard edges rather than as a soft fade. Below the
   threshold the paint only dulls. The label is painted into the same layer, so it goes the way
   the paint goes. */

// Fixed size in CSS pixels. Everything below — the wear field, the noise scales — is built for
// these dimensions, so the button never resizes with its container.
const W = 112;
const H = 48;
const R = H / 2;
const LABEL = "Save";

// How much wear one press deposits at its centre, and how far it spreads. At this rate a spot
// pressed over and over shows brass after roughly fifteen presses, while the noise threshold
// keeps neighbouring cells holding on a while longer.
const PRESS_AMOUNT = 0.055;
const PRESS_SIGMA = 9;
// Rubbing wears slower per event but a drag fires many of them.
const RUB_AMOUNT = 0.006;
const RUB_SIGMA = 7;
// Every press brasses the edges a little, wherever it lands.
const EDGE_PER_PRESS = 0.0035;
// Softness of the chip boundary in wear units. Small: paint chips, it does not fade.
const CHIP_EDGE = 0.03;
// Scratches are rare and stop accumulating; past a point more lines is just noise.
const SCRATCH_CHANCE = 0.16;
const MAX_SCRATCHES = 48;

// Deterministic 0..1 hash so the chip pattern and scratches are the same on every load and
// SSR-safe, with no Math.random anywhere.
const hash2 = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const hash1 = (n: number) => hash2(n, 0.37);
const smooth = (t: number) => t * t * (3 - 2 * t);

function vnoise(x: number, y: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const ux = smooth(x - ix);
  const uy = smooth(y - iy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  const top = a + (b - a) * ux;
  const bottom = c + (d - c) * ux;
  return top + (bottom - top) * uy;
}

// Three octaves, normalised back to 0..1.
function fbm(x: number, y: number) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < 3; i++) {
    sum += amp * vnoise(x * freq, y * freq);
    freq *= 2;
    amp *= 0.5;
  }
  return sum / 0.875;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a: number, b: number, v: number) => smooth(clamp01((v - a) / (b - a)));

// Distance from a point inside the pill to its outline.
function edgeDistance(x: number, y: number) {
  if (x < R) return R - Math.hypot(x - R, y - R);
  if (x > W - R) return R - Math.hypot(x - (W - R), y - R);
  return Math.min(y, H - y);
}

function pillSubpath(ctx: CanvasRenderingContext2D) {
  ctx.moveTo(R, 0);
  ctx.lineTo(W - R, 0);
  ctx.arc(W - R, R, R, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(R, H);
  ctx.arc(R, R, R, Math.PI / 2, (3 * Math.PI) / 2);
  ctx.closePath();
}

function pillPath(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  pillSubpath(ctx);
}

/* An inner shadow of light along the top edge, following the pill's curve into the corners.
   Canvas has no inset shadow, so this fills everything *outside* the pill with a white drop
   shadow while clipped to the inside: only the shadow crosses the outline, and it crosses
   deepest along the top because that is where the offset pushes it in. Shadow blur and offset
   ignore the current transform, so they are scaled by the DPR by hand. */
function drawTopLight(ctx: CanvasRenderingContext2D, dpr: number) {
  ctx.save();
  ctx.shadowColor = "rgba(255,255,255,0.5)";
  ctx.shadowBlur = 3 * dpr;
  ctx.shadowOffsetY = 1.5 * dpr;
  ctx.beginPath();
  ctx.rect(-R, -R, W + 2 * R, H + 2 * R);
  pillSubpath(ctx);
  ctx.fillStyle = "#000";
  ctx.fill("evenodd");
  ctx.restore();
}

interface Scratch {
  x: number;
  y: number;
  angle: number;
  len: number;
}

// Derived from the press index alone so the same count always draws the same scratches, on
// reload as much as on the press itself.
function scratchFor(index: number): Scratch | null {
  if (hash1(index * 3 + 1) > SCRATCH_CHANCE) return null;
  return {
    x: R * 0.6 + hash1(index * 3 + 2) * (W - R * 1.2),
    y: 4 + hash1(index * 3 + 3) * (H - 8),
    // Mostly along the button; things get dragged across it, not down it.
    angle: (hash1(index * 3 + 4) - 0.5) * 0.9,
    len: 4 + hash1(index * 3 + 5) * 12,
  };
}

interface Wear {
  // Accumulated wear per cell, W×H.
  field: Float32Array;
  // Wear at which each cell's paint gives up. Noise, lower at the edge.
  threshold: Float32Array;
  // 1 at the outline, 0 a few px in — the edge brassing profile.
  edge: Float32Array;
  edgeWear: number;
  count: number;
}

function createWear(): Wear {
  const n = W * H;
  const threshold = new Float32Array(n);
  const edge = new Float32Array(n);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const d = edgeDistance(x + 0.5, y + 0.5);
      // Two scales of noise: broad regions that chip together, fine detail on their outline.
      const broad = fbm(x / 11, y / 11);
      const fine = fbm(x / 3.2 + 40, y / 3.2 + 40);
      const noise = broad * 0.6 + fine * 0.4;
      const nearEdge = 1 - smoothstep(0, 7, d);
      // The range runs well past 1 on purpose: the stubborn cells are what leave islands of
      // paint standing inside a worn patch instead of one clean hole.
      threshold[i] = Math.max(0.08, 0.42 + 0.8 * noise - 0.36 * nearEdge);
      edge[i] = (1 - smoothstep(0, 5, d)) ** 1.5;
    }
  }
  return { field: new Float32Array(n), threshold, edge, edgeWear: 0, count: 0 };
}

function deposit(wear: Wear, cx: number, cy: number, amount: number, sigma: number) {
  const reach = Math.ceil(sigma * 2.5);
  const x0 = Math.max(0, Math.floor(cx - reach));
  const x1 = Math.min(W - 1, Math.ceil(cx + reach));
  const y0 = Math.max(0, Math.floor(cy - reach));
  const y1 = Math.min(H - 1, Math.ceil(cy + reach));
  const inv = 1 / (2 * sigma * sigma);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      wear.field[y * W + x] += amount * Math.exp(-(dx * dx + dy * dy) * inv);
    }
  }
}

interface Layers {
  dpr: number;
  brass: HTMLCanvasElement;
  paint: HTMLCanvasElement;
  // Alpha of the surviving paint, black RGB so it doubles as the chip shadow.
  mask: HTMLCanvasElement;
  maskData: ImageData;
  // Dulling of the paint that hasn't chipped yet, white RGB.
  scuff: HTMLCanvasElement;
  scuffData: ImageData;
  font: string;
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

// The masks are built at device resolution by sampling the wear field bilinearly, so a chip's
// outline lands on device pixels with a proper anti-aliased edge. Building them at one cell per
// CSS pixel and letting drawImage scale them up blurs every chip into a smudge on retina.
function createLayers(dpr: number, font: string): Layers {
  const pw = W * dpr;
  const ph = H * dpr;
  const mask = makeCanvas(pw, ph);
  const scuff = makeCanvas(pw, ph);
  return {
    dpr,
    brass: makeCanvas(pw, ph),
    paint: makeCanvas(pw, ph),
    mask,
    maskData: mask.getContext("2d")!.createImageData(pw, ph),
    scuff,
    scuffData: scuff.getContext("2d")!.createImageData(pw, ph),
    font,
  };
}

// Bilinear read of a W×H field at a fractional cell position.
function sample(field: Float32Array, x: number, y: number) {
  const fx = Math.min(Math.max(x - 0.5, 0), W - 1);
  const fy = Math.min(Math.max(y - 0.5, 0), H - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, W - 1);
  const y1 = Math.min(y0 + 1, H - 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const top = field[y0 * W + x0] * (1 - tx) + field[y0 * W + x1] * tx;
  const bottom = field[y1 * W + x0] * (1 - tx) + field[y1 * W + x1] * tx;
  return top + (bottom - top) * ty;
}

/* The bare metal. Drawn once: a vertical gradient because the button is lit from above, a
   brushed grain stretched along the button because that is how the blank was finished, and a
   soft specular band so the reveal reads as metal catching light rather than as a tan fill. */
function drawBrass(layers: Layers) {
  const ctx = layers.brass.getContext("2d")!;
  ctx.setTransform(layers.dpr, 0, 0, layers.dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  pillPath(ctx);
  ctx.clip();

  const base = ctx.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, "#e9c97c");
  base.addColorStop(0.5, "#c3964a");
  base.addColorStop(1, "#7a5522");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);

  // Grain: long horizontal streaks, drawn as per-row noise at one CSS pixel and scaled up so
  // each streak stays a single soft line at any DPR.
  const grain = makeCanvas(W, H);
  const gctx = grain.getContext("2d")!;
  const data = gctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = fbm(x / 1.4 + 200, y * 3.1 + 200) - 0.5;
      const i = (y * W + x) * 4;
      const light = v > 0;
      data.data[i] = light ? 255 : 0;
      data.data[i + 1] = light ? 255 : 0;
      data.data[i + 2] = light ? 255 : 0;
      data.data[i + 3] = Math.round(Math.abs(v) * 2 * 90);
    }
  }
  gctx.putImageData(data, 0, 0);
  ctx.drawImage(grain, 0, 0, W, H);

  const sheen = ctx.createLinearGradient(0, 0, 0, H);
  sheen.addColorStop(0, "rgba(255,244,214,0)");
  sheen.addColorStop(0.18, "rgba(255,244,214,0.5)");
  sheen.addColorStop(0.36, "rgba(255,244,214,0)");
  sheen.addColorStop(1, "rgba(60,36,8,0.28)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/* The paint layer, fresh: one flat enamel blue, a thin line of light along the top edge and
   the label in white. Rebuilt on every render because the wear is applied destructively on top of it. */
function drawFreshPaint(layers: Layers) {
  const ctx = layers.paint.getContext("2d")!;
  ctx.setTransform(layers.dpr, 0, 0, layers.dpr, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  pillPath(ctx);
  ctx.clip();
  ctx.fillStyle = "#2f6ef0";
  ctx.fillRect(0, 0, W, H);
  drawTopLight(ctx, layers.dpr);

  ctx.font = layers.font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.fillText(LABEL, W / 2, H / 2 + 0.5);
  ctx.restore();
}

function updateMasks(layers: Layers, wear: Wear) {
  const m = layers.maskData.data;
  const s = layers.scuffData.data;
  const { dpr } = layers;
  const pw = W * dpr;
  const ph = H * dpr;
  for (let py = 0; py < ph; py++) {
    for (let px = 0; px < pw; px++) {
      const x = (px + 0.5) / dpr;
      const y = (py + 0.5) / dpr;
      const w = sample(wear.field, x, y) + wear.edgeWear * sample(wear.edge, x, y);
      const t = sample(wear.threshold, x, y);
      const alpha = 1 - smoothstep(t - CHIP_EDGE, t + CHIP_EDGE, w);
      const o = (py * pw + px) * 4;
      m[o] = 0;
      m[o + 1] = 0;
      m[o + 2] = 0;
      m[o + 3] = Math.round(alpha * 255);
      // Dulling ramps up as a cell approaches its threshold, so a patch goes matte before it
      // opens — the paint around a chip is always the paint that is about to go.
      const dull = clamp01(w / t) * 0.13;
      s[o] = 255;
      s[o + 1] = 255;
      s[o + 2] = 255;
      s[o + 3] = Math.round(dull * 255);
    }
  }
  layers.mask.getContext("2d")!.putImageData(layers.maskData, 0, 0);
  layers.scuff.getContext("2d")!.putImageData(layers.scuffData, 0, 0);
}

function render(canvas: HTMLCanvasElement, layers: Layers, wear: Wear) {
  updateMasks(layers, wear);
  drawFreshPaint(layers);

  const pctx = layers.paint.getContext("2d")!;
  pctx.setTransform(layers.dpr, 0, 0, layers.dpr, 0, 0);
  pctx.globalCompositeOperation = "source-atop";
  pctx.drawImage(layers.scuff, 0, 0, W, H);
  pctx.globalCompositeOperation = "destination-in";
  pctx.drawImage(layers.mask, 0, 0, W, H);
  pctx.globalCompositeOperation = "source-over";

  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(layers.dpr, 0, 0, layers.dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(layers.brass, 0, 0, W, H);

  // Paint has thickness. A copy of the paint's silhouette, dark and nudged down-right, shows
  // as a hairline of shadow along the inside of every chip, which is what makes the bare patch
  // read as a hole in a coat rather than a stain on it.
  ctx.save();
  pillPath(ctx);
  ctx.clip();
  ctx.globalAlpha = 0.6;
  ctx.drawImage(layers.mask, 0.8, 1.0, W, H);
  ctx.globalAlpha = 1;
  ctx.drawImage(layers.paint, 0, 0, W, H);

  // Scratches catch light on paint and brass alike.
  ctx.strokeStyle = "rgba(255,255,255,0.11)";
  ctx.lineWidth = 0.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  let drawn = 0;
  for (let k = 0; k < wear.count && drawn < MAX_SCRATCHES; k++) {
    const sc = scratchFor(k);
    if (!sc) continue;
    drawn += 1;
    const dx = Math.cos(sc.angle) * sc.len * 0.5;
    const dy = Math.sin(sc.angle) * sc.len * 0.5;
    ctx.moveTo(sc.x - dx, sc.y - dy);
    ctx.lineTo(sc.x + dx, sc.y + dy);
  }
  ctx.stroke();
  ctx.restore();
}

// The same underdamped spring as the article's active-state figure, sampled into `linear()`.
const SPRING_VAR =
  "[--press-spring:linear(0,0.09,0.298,0.547,0.779,0.963,1.085,1.148,1.163,1.145,1.11,1.069,1.032,1.003,0.985,0.975,0.974,0.977,0.983,0.989,1)]";

const PRESS_CLASS = cn(
  "[transition:scale_420ms_var(--press-spring)]",
  "active:[transition:scale_240ms_var(--press-spring)] active:scale-[0.96]",
  "motion-reduce:transition-none motion-reduce:active:scale-100",
);

export const PatinaButton = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wearRef = useRef<Wear | null>(null);
  const layersRef = useRef<Layers | null>(null);
  const heldRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const frameRef = useRef(0);

  const requestRender = () => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      const canvas = canvasRef.current;
      const layers = layersRef.current;
      const wear = wearRef.current;
      if (canvas && layers && wear) render(canvas, layers, wear);
    });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const button = buttonRef.current;
    if (!canvas || !button) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = W * dpr;
    canvas.height = H * dpr;

    // The label is drawn in the button's own font so it matches the DOM text around it. The
    // family may still be loading on first paint, so it is drawn again once fonts settle.
    const family = getComputedStyle(button).fontFamily;
    const font = `500 17px ${family}`;

    const wear = createWear();
    wearRef.current = wear;

    const layers = createLayers(dpr, font);
    layersRef.current = layers;
    drawBrass(layers);
    render(canvas, layers, wear);

    let cancelled = false;
    document.fonts.load(font).then(() => {
      if (!cancelled) requestRender();
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    };
  }, []);

  // Pointer position in the button's unscaled coordinate space. The rect shrinks while the
  // press spring is running, so the ratio against the fixed width corrects for it.
  const localPoint = (e: { clientX: number; clientY: number }) => {
    const rect = buttonRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * W) / rect.width,
      y: ((e.clientY - rect.top) * H) / rect.height,
    };
  };

  const press = (x: number, y: number) => {
    const wear = wearRef.current;
    if (!wear) return;
    // A finger never lands on exactly the same pixel twice.
    const jx = (hash1(wear.count * 7 + 1) - 0.5) * 4;
    const jy = (hash1(wear.count * 7 + 2) - 0.5) * 3;
    deposit(wear, x + jx, y + jy, PRESS_AMOUNT, PRESS_SIGMA);
    wear.edgeWear += EDGE_PER_PRESS;
    wear.count += 1;
    requestRender();
  };

  const rub = (x: number, y: number) => {
    const wear = wearRef.current;
    const last = lastRef.current;
    if (!wear || !last) return;
    const dist = Math.hypot(x - last.x, y - last.y);
    if (dist < 1) return;
    deposit(wear, x, y, RUB_AMOUNT * Math.min(dist / 6, 1), RUB_SIGMA);
    lastRef.current = { x, y };
    requestRender();
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      // Safari only honours `:active` on touch when the element carries a touchstart listener.
      onTouchStart={() => {}}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        heldRef.current = true;
        const p = localPoint(e);
        lastRef.current = p;
        e.currentTarget.setPointerCapture(e.pointerId);
        press(p.x, p.y);
      }}
      onPointerMove={(e) => {
        if (!heldRef.current) return;
        const p = localPoint(e);
        rub(p.x, p.y);
      }}
      onPointerUp={() => {
        heldRef.current = false;
        lastRef.current = null;
      }}
      onPointerCancel={() => {
        heldRef.current = false;
        lastRef.current = null;
      }}
      // Keyboard activation carries no pointer; it lands in the middle, where a thumb would.
      onClick={(e) => {
        if (e.detail === 0) press(W / 2, H / 2);
      }}
      className={cn(
        "relative h-12 w-28 shrink-0 cursor-pointer touch-none select-none rounded-full",
        "font-pretendard text-[17px] font-medium [-webkit-tap-highlight-color:transparent]",
        "outline-none focus-visible:ring-2 focus-visible:ring-default focus-visible:ring-offset-2",
        "will-change-transform",
        // The fresh paint, in CSS, so the button is on the page from the first frame instead of
        // appearing once hydration has run the canvas. Same blue and same top light the canvas
        // draws, and the canvas covers it opaquely the moment it paints.
        "bg-[#2f6ef0] shadow-[inset_0_1.5px_3px_rgba(255,255,255,0.5)]",
        SPRING_VAR,
        PRESS_CLASS,
      )}
    >
      {/* Sits before the canvas so the painted label covers it. Carries the button's accessible
          name too, which is why it is not aria-hidden. */}
      <span className="absolute inset-0 flex items-center justify-center text-white/95">
        {LABEL}
      </span>
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 size-full rounded-full" />
      {/* Edge drawn over the canvas: a dark seam on the light page, a faint white one on the
            dark page, so the button has an outline against whichever it sits on and the chipped
            brass still ends where the button ends. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 rounded-full",
          "[--btn-edge:oklch(0.4_0.17_264_/_0.75)] dark:[--btn-edge:oklch(1_0_0_/_0.18)]",
          "shadow-[inset_0_0_0_1px_var(--btn-edge)]",
        )}
      />
    </button>
  );
};
