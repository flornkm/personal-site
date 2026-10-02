import { type CSSProperties, useEffect, useRef, useState } from "react";
import {
  ASSET_BASE,
  CHAIR_FRAMES,
  DOOR_FRAMES,
  IMAGE_IDS,
  LAYER_IDS,
  TV_FRAMES,
} from "./claude-2010-assets";
import { Claude2010Chat } from "./claude-2010-chat";
import "./claude-2010-demo.css";
import { play, setAmbience, setPhoneRing, setTvLoop } from "./claude-2010-sounds";

/* "It's 2010 and you open Claude for the first time." An American-teen-bedroom
   rendered in Blender from CC0 PSX packs (scripts/room-2010/): every layer is a
   full-frame PNG through the same ortho camera, so they stack 1:1 at the stage
   origin and painter order is the whole composition. The render keeps hard aliased
   edges (no AA filter, nearest-neighbour compositing) over detailed textures — the
   bridget.party look. Clicking the CRT zooms into the glass and boots the messenger;
   most other things in the room hide a low-fps easter egg (chair spin flipbook,
   TV static, lamp glow, squishy beanbag, hopping plush). */

const STAGE_W = 1290;
const STAGE_H = 1150;

const PLUSH_RECT = { x: 838, y: 440, w: 72, h: 72 * (449 / 500) };

// Projected rects from the Blender render (layers.json, minus the crop offset).
const SCREEN = { x: 724, y: 365, w: 60, h: 86 };
const LAMP = { x: 462, y: 346, w: 70, h: 95 };
const CHAIR = { x: 537, y: 441, w: 180, h: 266 };
const BEAN = { x: 238, y: 640, w: 360, h: 310 };
const TV = { x: 256, y: 500, w: 130, h: 150 };
const DOOR = { x: 984, y: 303, w: 106, h: 380 };
const PHONE = { x: 508, y: 322, w: 100, h: 78 };
const FLOORLAMP = { x: 819, y: 682, w: 102, h: 293 };
const BALL = { x: 491, y: 891, w: 59, h: 68 };
// Projected corners of the window glass (bottom-left, bottom-right, top-right,
// top-left) — the basis for the rain and for the sky behind it.
const WINDOW_QUAD = [
  { x: 414, y: 346 },
  { x: 501, y: 296 },
  { x: 501, y: 146 },
  { x: 414, y: 196 },
];
const BEAN_PIVOT = { x: 416, y: 990 };

// Slightly-low-res compositing (1.25 css px per texel, pixelated upscale) so the
// pixel grain reads on top of the unfiltered render's aliased edges.
const texel = () => 0.58;
const ROOM_FIT = 0.8;

interface View {
  scale: number;
  ox: number;
  oy: number;
}

function loadImages(): Record<string, HTMLImageElement> {
  const images: Record<string, HTMLImageElement> = {};
  for (const id of IMAGE_IDS) {
    const img = new Image();
    img.src = `${ASSET_BASE}/${id}.webp`;
    images[id] = img;
  }
  return images;
}

// Cheap deterministic flicker for the practicals, stepped at ~9fps.
const flick = (t: number, seed: number) =>
  0.86 + (0.14 * (((Math.floor(t * 9) * 2654435761 + seed) >>> 0) % 100)) / 100;

// Stop-motion time: quantize to a low frame rate so animations feel hand-flipped.
const lowFps = (t: number, fps: number) => Math.floor(t * fps) / fps;

interface SceneState {
  images: Record<string, HTMLImageElement>;
  room: HTMLCanvasElement;
  tinted: HTMLCanvasElement;
  view: View;
  hoverScreen: boolean;
  dark: boolean;
  // easter eggs
  chairSpinStart: number | null;
  tvOn: boolean;
  lampOn: boolean;
  beanStart: number | null;
  plushStart: number | null;
  doorHover: boolean;
  doorFrame: number;
  doorLastStep: number;
  phoneHover: boolean;
  floorLampOn: boolean;
  ballStart: number | null;
  sunny: boolean;
}

interface DrawOp {
  rot?: number;
  rotCenter?: { x: number; y: number };
  id: string;
  // squash transform about a stage-space pivot
  pivot?: { x: number; y: number };
  sx?: number;
  sy?: number;
  // explicit dest rect (plush); full-frame otherwise
  rect?: { x: number; y: number; w: number; h: number };
}

const CHAIR_SPIN_SECONDS = 1.6;
const SQUISH_SECONDS = 0.6;
const PLUSH_SECONDS = 0.7;

// [dy, scaleX, scaleY] squash-and-hop over progress 0..1.
function hopCurve(p: number): [number, number, number] {
  if (p < 0.2) {
    const q = p / 0.2;
    return [0, 1 + 0.18 * q, 1 - 0.22 * q];
  }
  const q = (p - 0.2) / 0.8;
  const hop = Math.sin(q * Math.PI);
  return [-hop * 24, 1 - 0.1 * hop, 1 + 0.12 * hop];
}

function drawOps(s: SceneState, t: number): DrawOp[] {
  const ops: DrawOp[] = [];
  for (const id of LAYER_IDS) {
    if (id === "chair" && s.chairSpinStart !== null) {
      const p = (t - s.chairSpinStart) / CHAIR_SPIN_SECONDS;
      if (p >= 1) {
        s.chairSpinStart = null;
        ops.push({ id: "chair" });
      } else {
        ops.push({ id: CHAIR_FRAMES[Math.floor(p * 16) % 8] });
      }
      continue;
    }
    if (id === "door") {
      // step one frame toward open/closed at ~12fps for the flipbook feel
      if (t - s.doorLastStep > 1 / 12) {
        s.doorLastStep = t;
        const target = s.doorHover ? DOOR_FRAMES.length - 1 : 0;
        s.doorFrame += Math.sign(target - s.doorFrame);
      }
      ops.push({ id: DOOR_FRAMES[s.doorFrame] });
      continue;
    }
    if (id === "phone" && s.phoneHover) {
      // vibrating handset: 1.5-stage-px jitter stepped at 16fps
      const j = Math.floor(t * 16) % 2 === 0 ? 1.5 : -1.5;
      ops.push({ id: "phone", rect: { x: j, y: 0, w: STAGE_W, h: STAGE_H } });
      continue;
    }
    if (id === "floorlamp" && s.floorLampOn) {
      ops.push({ id: "floorlamp-on" });
      continue;
    }
    if (id === "ball") {
      let p = 0;
      if (s.ballStart !== null) {
        p = Math.min(1, (t - s.ballStart) / 1.4);
        if (p >= 1) s.ballStart = null;
      }
      const out = Math.sin(p * Math.PI);
      const dx = -out * 52;
      const dy = out * 26;
      ops.push({
        id: "ball",
        rect: { x: dx, y: dy, w: STAGE_W, h: STAGE_H },
        rot: (dx / (BALL.w / 2)) * 0.9,
        rotCenter: { x: BALL.x + BALL.w / 2 + dx, y: BALL.y + BALL.h / 2 + dy },
      });
      continue;
    }
    if (id === "tv" && s.tvOn) {
      ops.push({ id: TV_FRAMES[Math.floor(lowFps(t, 6) * 6) % 3] });
      continue;
    }
    if (id === "bean" && s.beanStart !== null) {
      const p = Math.min((t - s.beanStart) / SQUISH_SECONDS, 1);
      if (p >= 1) s.beanStart = null;
      const squish = Math.sin(lowFps(p, 10 / SQUISH_SECONDS) * Math.PI);
      ops.push({ id: "bean", pivot: BEAN_PIVOT, sx: 1 + 0.1 * squish, sy: 1 - 0.12 * squish });
      continue;
    }
    ops.push({ id });
  }

  const plush: DrawOp = { id: "plush", rect: { ...PLUSH_RECT, h: PLUSH_RECT.h } };
  if (s.plushStart !== null) {
    const p = Math.min((t - s.plushStart) / PLUSH_SECONDS, 1);
    if (p >= 1) s.plushStart = null;
    const [dy, sx, sy] = hopCurve(lowFps(p, 12 / PLUSH_SECONDS));
    const w = PLUSH_RECT.w * sx;
    const h = PLUSH_RECT.h * sy;
    plush.rect = {
      x: PLUSH_RECT.x + (PLUSH_RECT.w - w) / 2,
      y: PLUSH_RECT.y + PLUSH_RECT.h - h + dy,
      w,
      h,
    };
  }
  ops.push(plush);
  return ops;
}

function drawSprites(s: SceneState, w: number, h: number, t: number) {
  const { room, view } = s;
  if (room.width !== w || room.height !== h) {
    room.width = w;
    room.height = h;
  }
  const ctx = room.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = false;

  for (const op of drawOps(s, t)) {
    const img = s.images[op.id];
    if (!img || !img.complete || img.naturalWidth === 0) continue;
    const r = op.rect ?? { x: 0, y: 0, w: STAGE_W, h: STAGE_H };
    let dx = view.ox + r.x * view.scale;
    let dy = view.oy + r.y * view.scale;
    let dw = r.w * view.scale;
    let dh = r.h * view.scale;
    if (op.pivot && op.sx !== undefined && op.sy !== undefined) {
      const px = view.ox + op.pivot.x * view.scale;
      const py = view.oy + op.pivot.y * view.scale;
      dx = px + (dx - px) * op.sx;
      dy = py + (dy - py) * op.sy;
      dw *= op.sx;
      dh *= op.sy;
    }
    if (op.rot !== undefined && op.rotCenter) {
      const cx = view.ox + op.rotCenter.x * view.scale;
      const cy = view.oy + op.rotCenter.y * view.scale;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(op.rot);
      ctx.translate(-cx, -cy);
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.restore();
      continue;
    }
    ctx.drawImage(img, dx, dy, dw, dh);
  }
}

function nightTint(s: SceneState, w: number, h: number): HTMLCanvasElement | null {
  const { tinted, room } = s;
  if (tinted.width !== w || tinted.height !== h) {
    tinted.width = w;
    tinted.height = h;
  }
  const ctx = tinted.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(room, 0, 0);
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = "#a8b0d4";
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(room, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  return tinted;
}

// The glazing bar (wf_mid in scene.py) as a fraction of the glass width, so the repaint puts
// it back exactly where the render has it.
const MULLION = [0.5 - 0.02 / 0.64, 0.5 + 0.02 / 0.64];
// Cloud clusters, in glass-plane units: [u drift phase, v, speed, ellipses].
const CLOUDS: Array<{
  phase: number;
  v: number;
  speed: number;
  puffs: Array<[number, number, number, number]>;
}> = [
  {
    phase: 0.1,
    v: 0.78,
    speed: 0.021,
    puffs: [
      [0, 0, 0.2, 0.05],
      [0.16, 0.018, 0.14, 0.037],
      [-0.14, 0.012, 0.12, 0.03],
    ],
  },
  {
    phase: 0.62,
    v: 0.52,
    speed: 0.014,
    puffs: [
      [0, 0, 0.26, 0.055],
      [0.2, 0.022, 0.15, 0.04],
    ],
  },
  {
    phase: 1.05,
    v: 0.24,
    speed: 0.03,
    puffs: [
      [0, 0, 0.15, 0.038],
      [0.11, 0.014, 0.1, 0.028],
    ],
  },
];

// The sky Claude turns on. Painted inside the window's own plane — the projected corners give a
// parallelogram basis, so clouds drift along the wall rather than across the screen — over the
// render's baked overcast pane. The glazing bar goes back on top afterwards.
function drawSky(ctx: CanvasRenderingContext2D, view: View, t: number) {
  const [bl, br, , tl] = WINDOW_QUAD;
  ctx.save();
  ctx.setTransform(
    (br.x - bl.x) * view.scale,
    (br.y - bl.y) * view.scale,
    (tl.x - bl.x) * view.scale,
    (tl.y - bl.y) * view.scale,
    view.ox + bl.x * view.scale,
    view.oy + bl.y * view.scale,
  );
  ctx.beginPath();
  ctx.rect(0, 0, 1, 1);
  ctx.clip();

  const sky = ctx.createLinearGradient(0, 1, 0, 0);
  sky.addColorStop(0, "#2f8fe0");
  sky.addColorStop(0.55, "#63b4ee");
  sky.addColorStop(1, "#c6e9ff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1, 1);

  // Sun, high and to the right — the side the light shaft falls from.
  const bloom = ctx.createRadialGradient(0.74, 0.88, 0, 0.74, 0.88, 0.34);
  bloom.addColorStop(0, "rgba(255, 248, 214, 0.95)");
  bloom.addColorStop(0.3, "rgba(255, 240, 190, 0.35)");
  bloom.addColorStop(1, "rgba(255, 240, 190, 0)");
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, 1, 1);

  // Stepped drift, same stop-motion clock as everything else in the room.
  const step = lowFps(t, 10);
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  for (const cloud of CLOUDS) {
    const u = ((((step * cloud.speed + cloud.phase) % 1.7) + 1.7) % 1.7) - 0.35;
    for (const [du, dv, rx, ry] of cloud.puffs) {
      ctx.beginPath();
      ctx.ellipse(u + du, cloud.v + dv, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Sheen on the pane, then the glazing bar and the shadow the frame drops onto the glass.
  ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
  ctx.beginPath();
  ctx.moveTo(-0.1, 0.35);
  ctx.lineTo(0.45, 1.1);
  ctx.lineTo(0.62, 1.1);
  ctx.lineTo(0.07, 0.35);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#4a3520";
  ctx.fillRect(MULLION[0], 0, MULLION[1] - MULLION[0], 1);
  ctx.fillStyle = "rgba(255, 226, 186, 0.35)";
  ctx.fillRect(MULLION[0], 0, 0.008, 1);

  ctx.fillStyle = "rgba(38, 24, 12, 0.28)";
  ctx.fillRect(0, 0.972, 1, 0.028);
  ctx.fillRect(0, 0, 0.016, 1);
  ctx.restore();
}

function drawRain(ctx: CanvasRenderingContext2D, view: View, t: number) {
  ctx.save();
  ctx.beginPath();
  WINDOW_QUAD.forEach((p, i) => {
    const px = view.ox + p.x * view.scale;
    const py = view.oy + p.y * view.scale;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.clip();
  ctx.strokeStyle = "rgba(215, 228, 246, 0.45)";
  ctx.lineWidth = Math.max(1, view.scale * 2);
  const step = Math.floor(t * 10);
  for (let i = 0; i < 15; i++) {
    const u = ((i * 61) % 87) / 87;
    const phase = (((i * 73 + step * 37) % 97) / 97) * 0.9;
    const bx = WINDOW_QUAD[0].x + (WINDOW_QUAD[1].x - WINDOW_QUAD[0].x) * u;
    const yTop = WINDOW_QUAD[3].y + (WINDOW_QUAD[2].y - WINDOW_QUAD[3].y) * u;
    const yBottom = WINDOW_QUAD[0].y + (WINDOW_QUAD[1].y - WINDOW_QUAD[0].y) * u;
    const y = yTop + (yBottom - yTop) * phase;
    const x = view.ox + bx * view.scale;
    const py = view.oy + y * view.scale;
    const len = 10 * view.scale;
    ctx.beginPath();
    ctx.moveTo(x, py);
    ctx.lineTo(x - 1.4 * view.scale, py + len);
    ctx.stroke();
  }
  ctx.restore();
}

// Elliptical pool of light lying on a horizontal surface (iso foreshortening:
// height is half the width), with a soft radial falloff.
function pool(
  ctx: CanvasRenderingContext2D,
  view: View,
  x: number,
  y: number,
  r: number,
  color: string,
  alpha: number,
) {
  const px = view.ox + x * view.scale;
  const py = view.oy + y * view.scale;
  const pr = r * view.scale;
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(1, 0.5);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, pr);
  g.addColorStop(0, color.replace("A", String(alpha)));
  g.addColorStop(0.55, color.replace("A", String(alpha * 0.4)));
  g.addColorStop(1, color.replace("A", "0"));
  ctx.fillStyle = g;
  ctx.fillRect(-pr, -pr, pr * 2, pr * 2);
  ctx.restore();
}

// Daylight through the window: a shaft cast from the glass into the room, a warm
// pool where it lands, and a bloom on the pane itself.
function drawSunshine(ctx: CanvasRenderingContext2D, view: View, t: number) {
  const v = view;
  const [bl, br, tr, tl] = WINDOW_QUAD;
  // Into-the-room direction in screen space for this iso camera.
  const dx = 232;
  const dy = 116;
  const pt = (p: { x: number; y: number }, k = 0) => ({
    x: v.ox + (p.x + dx * k) * v.scale,
    y: v.oy + (p.y + dy * k) * v.scale,
  });

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const shaft = ctx.createLinearGradient(
    v.ox + bl.x * v.scale,
    v.oy + bl.y * v.scale,
    v.ox + (bl.x + dx) * v.scale,
    v.oy + (bl.y + dy) * v.scale,
  );
  const breathe = 0.11 + 0.012 * Math.sin(t * 0.8);
  shaft.addColorStop(0, `rgba(255, 238, 186, ${breathe})`);
  shaft.addColorStop(1, "rgba(255, 238, 186, 0)");
  ctx.fillStyle = shaft;
  for (const [a, b] of [
    [tl, tr],
    [bl, br],
  ] as const) {
    ctx.beginPath();
    const p0 = pt(a);
    const p1 = pt(b);
    const p2 = pt(b, 1);
    const p3 = pt(a, 1);
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // warm pool where the shaft lands, and bloom on the glass
  glow(
    ctx,
    v,
    (bl.x + br.x) / 2 + dx * 0.55,
    (bl.y + br.y) / 2 + dy * 0.55,
    150,
    "rgba(255, 226, 150, A)",
    0.13,
  );
  glow(ctx, v, (bl.x + tr.x) / 2, (bl.y + tr.y) / 2, 95, "rgba(255, 246, 214, A)", 0.3);
}

function glow(
  ctx: CanvasRenderingContext2D,
  view: View,
  cx: number,
  cy: number,
  radius: number,
  color: string,
  alpha: number,
) {
  const gx = view.ox + cx * view.scale;
  const gy = view.oy + cy * view.scale;
  const gr = radius * view.scale;
  const gradient = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
  gradient.addColorStop(0, color.replace("A", String(alpha)));
  gradient.addColorStop(1, color.replace("A", "0"));
  ctx.fillStyle = gradient;
  ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
}

function renderScene(
  canvas: HTMLCanvasElement,
  cssW: number,
  cssH: number,
  t: number,
  s: SceneState,
) {
  const px = texel();
  const w = Math.max(2, Math.round(cssW / px));
  const h = Math.max(2, Math.round(cssH / px));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;

  const scale = Math.min(w / STAGE_W, h / STAGE_H) * ROOM_FIT;
  s.view = {
    scale,
    ox: (w - STAGE_W * scale) / 2,
    oy: (h - STAGE_H * scale) / 2,
  };

  drawSprites(s, w, h, t);
  ctx.drawImage(s.dark ? (nightTint(s, w, h) ?? s.room) : s.room, 0, 0);
  if (s.sunny) {
    drawSky(ctx, s.view, t);
    drawSunshine(ctx, s.view, t);
  } else {
    drawRain(ctx, s.view, t);
  }
  {
    const v = s.view;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.05 * flick(t, 53);
    ctx.fillStyle = "rgb(150, 200, 255)";
    ctx.fillRect(
      v.ox + SCREEN.x * v.scale,
      v.oy + SCREEN.y * v.scale,
      SCREEN.w * v.scale,
      SCREEN.h * v.scale,
    );
    ctx.restore();
  }

  // The CRT's glow — always faintly on (the machine is waiting), stronger on hover
  // and at night.
  const crtAlpha = (s.hoverScreen ? 0.38 : s.dark ? 0.25 : 0.1) * flick(t, 11);
  glow(
    ctx,
    s.view,
    SCREEN.x + SCREEN.w / 2,
    SCREEN.y + SCREEN.h / 2,
    SCREEN.w * 1.6,
    "rgba(190, 230, 255, A)",
    crtAlpha,
  );

  if (s.doorFrame > 0) {
    const a = 0.09 * s.doorFrame;
    pool(
      ctx,
      s.view,
      DOOR.x + DOOR.w / 2 - 30,
      DOOR.y + DOOR.h + 10,
      100,
      "rgba(255, 205, 130, A)",
      a,
    );
  }
  if (s.floorLampOn) {
    glow(
      ctx,
      s.view,
      FLOORLAMP.x + FLOORLAMP.w / 2,
      FLOORLAMP.y + FLOORLAMP.h * 0.18,
      170,
      "rgba(255, 200, 120, A)",
      (s.dark ? 0.45 : 0.28) * flick(t, 29),
    );
  }
  if (s.lampOn) {
    const la = (s.dark ? 0.55 : 0.32) * flick(t, 47);
    glow(
      ctx,
      s.view,
      LAMP.x + LAMP.w / 2,
      LAMP.y + LAMP.h * 0.28,
      55,
      "rgba(255, 200, 120, A)",
      la,
    );
    pool(
      ctx,
      s.view,
      LAMP.x + LAMP.w / 2 + 6,
      LAMP.y + LAMP.h * 1.05,
      105,
      "rgba(255, 190, 110, A)",
      la * 0.85,
    );
  }
  if (s.tvOn) {
    const flicker = 0.2 + 0.06 * (Math.floor(t * 6) % 2);
    glow(
      ctx,
      s.view,
      TV.x + TV.w / 2,
      TV.y + TV.h * 0.55,
      170,
      "rgba(160, 210, 255, A)",
      s.dark ? flicker + 0.15 : flicker,
    );
  }
}

function toCss(view: View, r: { x: number; y: number; w: number; h: number }) {
  const px = texel();
  return {
    left: (view.ox + r.x * view.scale) * px,
    top: (view.oy + r.y * view.scale) * px,
    width: r.w * view.scale * px,
    height: r.h * view.scale * px,
  };
}

interface HotspotDef {
  id: string;
  rect: { x: number; y: number; w: number; h: number };
  label: string;
}

const HOTSPOTS: HotspotDef[] = [
  { id: "screen", rect: SCREEN, label: "Turn on the computer" },
  { id: "plush", rect: PLUSH_RECT, label: "Squeeze the plush" },
  { id: "chair", rect: CHAIR, label: "Spin the chair" },
  { id: "tv", rect: TV, label: "Toggle the TV" },
  { id: "lamp", rect: LAMP, label: "Toggle the desk lamp" },
  { id: "door", rect: DOOR, label: "Open the door" },
  { id: "phone", rect: PHONE, label: "The phone" },
  { id: "floorlamp", rect: FLOORLAMP, label: "Toggle the floor lamp" },
  {
    id: "ball",
    rect: { x: BALL.x - 12, y: BALL.y - 12, w: BALL.w + 24, h: BALL.h + 24 },
    label: "Kick the ball",
  },
  { id: "bean", rect: BEAN, label: "Squish the beanbag" },
];

export function Claude2010() {
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mountTimeRef = useRef(0);
  const sceneRef = useRef<SceneState | null>(null);

  const [chatOpen, setChatOpen] = useState(false);
  // Chat mounts only once the zoom has travelled most of the way in.
  const [hotspots, setHotspots] = useState<Array<HotspotDef & { style: CSSProperties }> | null>(
    null,
  );

  useEffect(() => {
    const el = containerRef.current;
    const onDown = () => play("winclick");
    el?.addEventListener("pointerdown", onDown, { capture: true });
    return () => el?.removeEventListener("pointerdown", onDown, { capture: true });
  }, []);

  useEffect(() => {
    setAmbience("rain");
    return () => {
      setAmbience(null);
      setTvLoop(false);
      setPhoneRing(false);
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    // Browser-only construction lives here, not in render, so the deep-linked
    // dialog can server-render.
    sceneRef.current ??= {
      images: loadImages(),
      room: document.createElement("canvas"),
      tinted: document.createElement("canvas"),
      view: { scale: 1, ox: 0, oy: 0 },
      hoverScreen: false,
      dark: false,
      chairSpinStart: null,
      tvOn: false,
      lampOn: true,
      beanStart: null,
      plushStart: null,
      doorHover: false,
      doorFrame: 0,
      doorLastStep: 0,
      phoneHover: false,
      floorLampOn: true,
      ballStart: null,
      sunny: false,
    };
    const scene = sceneRef.current;
    mountTimeRef.current = performance.now();

    const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const applyDark = () => {
      scene.dark = darkQuery.matches;
    };
    applyDark();
    darkQuery.addEventListener("change", applyDark);

    let raf = 0;
    let lastHotspotKey = "";
    const frame = (now: number) => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        renderScene(canvas, rect.width, rect.height, (now - mountTimeRef.current) / 1000, scene);

        const key = `${Math.round(rect.width)}:${Math.round(rect.height)}:${scene.view.scale.toFixed(4)}`;
        if (key !== lastHotspotKey) {
          lastHotspotKey = key;
          setHotspots(
            HOTSPOTS.map((h) => ({
              id: h.id,
              rect: h.rect,
              label: h.label,
              style: toCss(scene.view, h.rect),
            })),
          );
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      darkQuery.removeEventListener("change", applyDark);
    };
  }, []);

  const now = () => (performance.now() - mountTimeRef.current) / 1000;

  const trigger = (id: string) => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (id === "screen") {
      play("chirp");
      setChatOpen(true);
    }
    if (id === "plush" && scene.plushStart === null) {
      play("squeak");
      scene.plushStart = now();
    }
    if (id === "chair" && scene.chairSpinStart === null) {
      play("whoosh");
      scene.chairSpinStart = now();
    }
    if (id === "bean" && scene.beanStart === null) {
      play("thump");
      scene.beanStart = now();
    }
    if (id === "tv") {
      play("static");
      scene.tvOn = !scene.tvOn;
      setTvLoop(scene.tvOn);
    }
    if (id === "lamp" || id === "floorlamp") {
      play("click");
      if (id === "lamp") scene.lampOn = !scene.lampOn;
      else scene.floorLampOn = !scene.floorLampOn;
    }
    if (id === "ball" && scene.ballStart === null) {
      play("kick");
      scene.ballStart = now();
    }
    if (id === "door") {
      play("door");
      scene.doorHover = !scene.doorHover;
    }
  };

  return (
    <div ref={containerRef} className="c2010">
      <div ref={zoomRef} className="c2010-zoom">
        <canvas
          ref={canvasRef}
          className="c2010-canvas"
          role="img"
          aria-label="An isometric teenage bedroom in 2010: corner desk with a CRT computer, plaid bed with an orange plush, posters, a TV and a beanbag"
        />
        {hotspots &&
          !chatOpen &&
          hotspots.map((h) => (
            <button
              key={h.id}
              type="button"
              className="c2010-hotspot"
              style={h.style}
              aria-label={h.label}
              onPointerEnter={() => {
                const scene = sceneRef.current;
                if (!scene) return;
                if (h.id === "screen") scene.hoverScreen = true;
                if (h.id === "door") {
                  if (!scene.doorHover) play("door");
                  scene.doorHover = true;
                }
                if (h.id === "phone") {
                  scene.phoneHover = true;
                  setPhoneRing(true);
                }
              }}
              onPointerLeave={() => {
                const scene = sceneRef.current;
                if (!scene) return;
                if (h.id === "screen") scene.hoverScreen = false;
                if (h.id === "door") scene.doorHover = false;
                if (h.id === "phone") {
                  scene.phoneHover = false;
                  setPhoneRing(false);
                }
              }}
              onClick={() => trigger(h.id)}
            />
          ))}
      </div>

      {chatOpen && (
        <Claude2010Chat
          onClose={() => setChatOpen(false)}
          onWeather={(sunny) => {
            const scene = sceneRef.current;
            if (scene) scene.sunny = sunny;
            setAmbience(sunny ? "birds" : "rain");
          }}
        />
      )}
    </div>
  );
}
