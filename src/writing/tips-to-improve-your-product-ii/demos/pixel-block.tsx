import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

/* The selected rectangle as a tile on a tilted floor. Colour and alpha are snapped to a few dozen
   steps through a 4×4 Bayer matrix, which gives gradients and the shadow a faint grain. The
   selection is the editor's chrome, not part of the object, so it goes on a second canvas:
   untouched by the grain or the opacity. */

const ANGLE = (-30 * Math.PI) / 180;
const TILT = (54 * Math.PI) / 180;
const GRID = 12; // floor dot spacing, in CSS px
const LEVELS = 64; // colour steps per channel after dithering
const ARC_STEPS = 10;

// Canvas px per CSS px: full device resolution, so the grain is all that's left of the pixel look.
function density() {
  return window.devicePixelRatio || 1;
}

const SELECTION = "#dd5f2c"; // oklch(0.62 0.17 42): the tile's own orange, a shade deeper

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

// The tile is artwork, so its colour is the same in both themes; only the floor and the shadow
// follow the page.
const TILE = {
  face: "#ff8a5c",
  faceEnd: "#f26a3d",
  bevel: "#ffb08f",
  sideTop: [226, 92, 52],
  sideBottom: [178, 62, 34],
  edge: "rgba(255,255,255,0.95)",
  sheen: "255,255,255",
};

const THEMES = {
  light: {
    dot: "120,126,138",
    shadow: "150,60,30",
    shadowAlpha: [0.22, 0.1, 0.07],
  },
  dark: {
    dot: "150,154,162",
    shadow: "0,0,0",
    shadowAlpha: [0.6, 0.35, 0.25],
  },
} as const;

type Rgb = readonly number[];
type Point = readonly [number, number];
const rgb = (c: Rgb) => `rgb(${c.map(Math.round).join(",")})`;
const scaleRgb = (c: Rgb, f: number) => c.map((v) => Math.min(255, v * f));

// Plane (x right, y toward the viewer, z up) → screen, before scaling.
function project(x: number, y: number, z: number): Point {
  const xr = x * Math.cos(ANGLE) - y * Math.sin(ANGLE);
  const yr = x * Math.sin(ANGLE) + y * Math.cos(ANGLE);
  return [xr, yr * Math.cos(TILT) - z * Math.sin(TILT)];
}

// A rounded rectangle centred on the origin, plus the middle of each corner's arc (where the
// handles sit, so they stay on the shape however round it gets).
function footprint(w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  const corners = [
    [w / 2 - radius, h / 2 - radius, 0],
    [-w / 2 + radius, h / 2 - radius, 90],
    [-w / 2 + radius, -h / 2 + radius, 180],
    [w / 2 - radius, -h / 2 + radius, 270],
  ];
  const along = (cx: number, cy: number, deg: number): Point => [
    cx + Math.cos((deg * Math.PI) / 180) * radius,
    cy + Math.sin((deg * Math.PI) / 180) * radius,
  ];
  const steps = radius > 0 ? ARC_STEPS : 0;
  const outline = corners.flatMap(([cx, cy, start]) =>
    Array.from({ length: steps + 1 }, (_, i) =>
      along(cx, cy, start + (90 * i) / Math.max(steps, 1)),
    ),
  );
  const handles = corners.map(([cx, cy, start]) => along(cx, cy, start + 45));
  return { outline, handles };
}

function tracePath(ctx: CanvasRenderingContext2D, points: readonly Point[]) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}

type BlockProps = { w: number; h: number; radius: number; opacity: number };

function draw(
  canvas: HTMLCanvasElement,
  block: HTMLCanvasElement,
  overlay: HTMLCanvasElement,
  props: BlockProps,
) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const bctx = block.getContext("2d");
  const octx = overlay.getContext("2d");
  if (!ctx || !bctx || !octx) return;
  const { width: W, height: H } = canvas;
  const k = W / Math.max(canvas.clientWidth, 1); // canvas px per CSS px
  const theme = window.matchMedia("(prefers-color-scheme: dark)").matches
    ? THEMES.dark
    : THEMES.light;

  const w = Math.max(props.w, 1);
  const h = Math.max(props.h, 1);
  const lift = Math.min(Math.min(w, h) * 0.14, 22);
  const { outline, handles } = footprint(w, h, props.radius);

  // Zoom to fit: half size like a flat editor, unless the slab would leave the canvas.
  const box = outline.flatMap(([x, y]) => [project(x, y, 0), project(x, y, lift)]);
  const xs = box.map((p) => p[0]);
  const ys = box.map((p) => p[1]);
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  const scale = Math.min(0.5 * k, (W * 0.6) / spanX, (H * 0.58) / spanY);
  const ox = W / 2 - ((Math.max(...xs) + Math.min(...xs)) / 2) * scale;
  const oy = H / 2 - ((Math.max(...ys) + Math.min(...ys)) / 2) * scale;
  const at = (x: number, y: number, z: number): Point => {
    const [sx, sy] = project(x, y, z);
    return [ox + sx * scale, oy + sy * scale];
  };
  // A soft bevel: the sides stop a little below the top, a lighter band climbs to it, and the
  // face itself is the footprint inset by the bevel's width.
  const bevel = Math.min(lift * 0.45, Math.min(w, h) * 0.08, 7);
  const shoulder = lift - bevel * 0.4;
  const rim = outline.map(([x, y]) => at(x, y, shoulder));
  const inner = footprint(w - bevel * 2, h - bevel * 2, Math.max(props.radius - bevel, 0)).outline;
  const top = inner.map(([x, y]) => at(x, y, lift));

  ctx.clearRect(0, 0, W, H);

  // Floor dots, fading out toward the canvas edge.
  const step = (GRID * k) / scale;
  const reach = Math.ceil((Math.max(W, H) * 1.6) / (step * scale));
  for (let i = -reach; i <= reach; i++) {
    for (let j = -reach; j <= reach; j++) {
      const [px, py] = at(i * step, j * step, 0);
      const d = Math.hypot((px - W / 2) / (W / 2), (py - H / 2) / (H / 2));
      if (d > 1) continue;
      ctx.fillStyle = `rgba(${theme.dot},${0.55 * (1 - d) ** 1.2})`;
      ctx.fillRect(
        Math.round(px),
        Math.round(py),
        Math.max(1, Math.round(k)),
        Math.max(1, Math.round(k)),
      );
    }
  }

  // The slab goes on its own canvas so opacity applies to it as one object.
  bctx.clearRect(0, 0, W, H);

  // Layered like a box-shadow: tight contact, a soft lift, a wide ambient one. Each is the
  // footprint drawn off-canvas, so only its blurred shadow lands.
  const floor = outline.map(([x, y]) => at(x, y, 0));
  const SHADOWS = [
    { blur: 1.5, x: 0, y: 1 },
    { blur: 6, x: 2, y: 4 },
    { blur: 20, x: 4, y: 12 },
  ];
  SHADOWS.forEach(({ blur, x, y }, i) => {
    bctx.save();
    bctx.shadowColor = `rgba(${theme.shadow},${theme.shadowAlpha[i]})`;
    bctx.shadowBlur = blur * k;
    bctx.shadowOffsetX = W * 2 + x * k;
    bctx.shadowOffsetY = y * k;
    tracePath(
      bctx,
      floor.map(([px, py]) => [px - W * 2, py]),
    );
    bctx.fill();
    bctx.restore();
  });

  // Sides facing the viewer: lighter at the top edge, darker where they meet the floor, and a
  // touch brighter on the faces turned toward the light at the front left.
  const front: number[] = [];
  outline.forEach(([x0, y0], i) => {
    const [x1, y1] = outline[(i + 1) % outline.length];
    const nx = y1 - y0;
    const ny = -(x1 - x0);
    const len = Math.hypot(nx, ny) || 1;
    const facing = (nx * Math.sin(ANGLE) + ny * Math.cos(ANGLE)) / len;
    if (facing <= 0) return;
    front.push(i);
    const lit = 0.94 + Math.max(0, (-nx * 0.6 + ny * 0.8) / len) * 0.08;
    const [ax, ay] = at(x0, y0, shoulder);
    const [bx, by] = at(x0, y0, 0);
    const gradient = bctx.createLinearGradient(ax, ay, bx, by);
    gradient.addColorStop(0, rgb(scaleRgb(TILE.sideTop, lit)));
    gradient.addColorStop(1, rgb(scaleRgb(TILE.sideBottom, lit)));
    tracePath(bctx, [at(x0, y0, 0), at(x1, y1, 0), at(x1, y1, shoulder), at(x0, y0, shoulder)]);
    bctx.fillStyle = gradient;
    bctx.strokeStyle = gradient;
    bctx.lineWidth = 0.6;
    bctx.fill();
    bctx.stroke();
  });

  // The bevel band, between the shoulder and the face, then the face on top of it.
  tracePath(bctx, rim);
  bctx.fillStyle = TILE.bevel;
  bctx.fill();

  const [tx0, ty0] = at(-w / 2, -h / 2, lift);
  const [tx1, ty1] = at(w / 2, h / 2, lift);
  const face = bctx.createLinearGradient(tx0, ty0, tx1, ty1);
  face.addColorStop(0, TILE.face);
  face.addColorStop(1, TILE.faceEnd);
  tracePath(bctx, top);
  bctx.fillStyle = face;
  bctx.fill();

  // A sheen across the face from the top left, clipped to it.
  const [sx, sy] = at(-w * 0.22, -h * 0.25, lift);
  const sheen = bctx.createRadialGradient(
    sx,
    sy,
    0,
    sx,
    sy,
    Math.hypot(tx1 - tx0, ty1 - ty0) * 0.5,
  );
  sheen.addColorStop(0, `rgba(${TILE.sheen},0.4)`);
  sheen.addColorStop(1, `rgba(${TILE.sheen},0)`);
  bctx.save();
  bctx.clip();
  bctx.fillStyle = sheen;
  bctx.fill();
  bctx.restore();

  // The edge highlight: full white along the front of the bevel, where the light catches it.
  bctx.strokeStyle = TILE.edge;
  bctx.lineWidth = k;
  bctx.lineCap = "round";
  bctx.beginPath();
  front.forEach((i) => {
    const [ax, ay] = rim[i];
    const [bx, by] = rim[(i + 1) % rim.length];
    bctx.moveTo(ax, ay);
    bctx.lineTo(bx, by);
  });
  bctx.stroke();

  ctx.globalAlpha = props.opacity;
  ctx.drawImage(block, 0, 0);
  ctx.globalAlpha = 1;

  const image = ctx.getImageData(0, 0, W, H);
  const data = image.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const t = BAYER[(y & 3) * 4 + (x & 3)];
      for (let c = 0; c < 4; c++) {
        const v = (data[i + c] / 255) * (LEVELS - 1);
        const base = Math.floor(v);
        data[i + c] = ((base + (v - base > t ? 1 : 0)) * 255) / (LEVELS - 1);
      }
    }
  }
  ctx.putImageData(image, 0, 0);

  // Selection: traces the top face itself, with handles on the corners' arcs. In CSS px, on the
  // full-resolution overlay.
  const dpr = overlay.width / Math.max(overlay.clientWidth, 1);
  const toOverlay = ([px, py]: Point): Point => [(px / k) * dpr, (py / k) * dpr];
  octx.clearRect(0, 0, overlay.width, overlay.height);
  octx.strokeStyle = SELECTION;
  octx.lineWidth = dpr;
  octx.lineJoin = "round";
  tracePath(
    octx,
    outline.map(([x, y]) => toOverlay(at(x, y, lift))),
  );
  octx.stroke();

  const size = 7 * dpr;
  handles.forEach(([x, y]) => {
    const [px, py] = toOverlay(at(x, y, lift));
    octx.beginPath();
    octx.roundRect(px - size / 2, py - size / 2, size, size, 1.5 * dpr);
    octx.fillStyle = "#fff";
    octx.fill();
    octx.stroke();
  });
}

export function PixelBlock({
  w,
  h,
  radius,
  opacity,
  className,
}: BlockProps & { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const blockRef = useRef<HTMLCanvasElement | null>(null);

  // Sizes both backing stores to the element and redraws on resize, theme or value change.
  useEffect(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !overlay) return;
    const block = (blockRef.current ??= document.createElement("canvas"));
    const render = () => draw(canvas, block, overlay, { w, h, radius, opacity });
    const resize = () => {
      const width = Math.max(1, Math.round(canvas.clientWidth * density()));
      const height = Math.max(1, Math.round(canvas.clientHeight * density()));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = block.width = width;
        canvas.height = block.height = height;
      }
      const dpr = window.devicePixelRatio || 1;
      overlay.width = Math.max(1, Math.round(overlay.clientWidth * dpr));
      overlay.height = Math.max(1, Math.round(overlay.clientHeight * dpr));
      render();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    scheme.addEventListener("change", render);
    return () => {
      observer.disconnect();
      scheme.removeEventListener("change", render);
    };
  }, [w, h, radius, opacity]);

  return (
    <div aria-hidden className={cn("pointer-events-none relative size-full", className)}>
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
      <canvas ref={overlayRef} className="absolute inset-0 size-full" />
    </div>
  );
}
