import { LAPTOP_LID, PHONE_GLASS, PHONE_SCREEN, TV_SCREEN } from "./models-electronics";
import {
  MONO,
  crisp,
  glints,
  label,
  makeCanvas,
  measure,
  quantize,
  sparkle,
  starburstPath,
  type Ctx,
} from "./paint-kit";

// The faces of the slop electronics: YouTube thumbnails on the CRT, an AI-written editor on the
// laptop, engagement-bait posts on the phone. Each canvas is sized to ~80-92 texels per world unit
// of the face it lands on, type is set at its final size and thresholded, and nothing small enough
// to vanish is kept: secondary text is greeked into bars.

type Point = [number, number];

// ---------------------------------------------------------------------------------------------
// CRT screens: a 16:9 thumbnail letterboxed in the 4:3 tube, the player chrome in the bars.

export const TV_SCREEN_W = 192;
export const TV_SCREEN_H = Math.round((TV_SCREEN_W * TV_SCREEN.h) / TV_SCREEN.w);

type Mark =
  | { kind: "arrow"; from: Point; to: Point }
  | { kind: "circle"; x: number; y: number; rx: number; ry: number };

export interface VideoSpec {
  img: string;
  title: string;
  caption: string;
  color: string;
  at: Point;
  maxW: number;
  tilt: number;
  duration: string;
  progress: number;
  marks: Mark[];
}

// Laid out on the 192 x 108 picture.
export const VIDEOS: VideoSpec[] = [
  {
    img: "yt-shrimp",
    title: "You won't BELIEVE this",
    caption: "1 IN A\nMILLION",
    color: "#ffe41a",
    at: [5, 50],
    maxW: 116,
    tilt: -0.05,
    duration: "10:01",
    progress: 0.62,
    marks: [
      { kind: "circle", x: 96, y: 18, rx: 14, ry: 12 },
      { kind: "arrow", from: [160, 54], to: [114, 26] },
    ],
  },
  {
    img: "yt-kitten",
    title: "Cutest AI kitten EVER",
    caption: "SHE CRIED 😭",
    color: "#ffffff",
    at: [5, 74],
    maxW: 160,
    tilt: -0.03,
    duration: "23:59",
    progress: 0.18,
    marks: [{ kind: "circle", x: 88, y: 42, rx: 26, ry: 23 }],
  },
  {
    img: "yt-carving",
    title: "Real wood carving (AI)",
    caption: "HE CARVED\nWHAT?!",
    color: "#ffe41a",
    at: [5, 56],
    maxW: 104,
    tilt: -0.02,
    duration: "12:34",
    progress: 0.4,
    marks: [{ kind: "arrow", from: [100, 14], to: [142, 40] }],
  },
  {
    img: "yt-astro",
    title: "Moon landing was AI?!",
    caption: "NOT\nCLICKBAIT",
    color: "#ffffff",
    at: [5, 6],
    maxW: 112,
    tilt: -0.04,
    duration: "47:12",
    progress: 0.85,
    marks: [
      { kind: "circle", x: 49, y: 84, rx: 11, ry: 10 },
      { kind: "arrow", from: [90, 68], to: [63, 81] },
    ],
  },
];

function redArrow(ctx: Ctx, [x0, y0]: Point, [x1, y1]: Point) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const [ux, uy] = [(x1 - x0) / len, (y1 - y0) / len];
  const [px, py] = [-uy, ux];
  const w = 5;
  const head = 12;
  const hw = 9;
  const bx = x1 - ux * head;
  const by = y1 - uy * head;
  const pts: Point[] = [
    [x0 + px * w * 0.3, y0 + py * w * 0.3],
    [bx + (px * w) / 2, by + (py * w) / 2],
    [bx + px * hw, by + py * hw],
    [x1, y1],
    [bx - px * hw, by - py * hw],
    [bx - (px * w) / 2, by - (py * w) / 2],
    [x0 - px * w * 0.3, y0 - py * w * 0.3],
  ];
  const trace = (c: Ctx, dx = 0, dy = 0) => {
    c.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? c.moveTo(x + dx, y + dy) : c.lineTo(x + dx, y + dy)));
    c.closePath();
  };
  crisp(ctx, (c) => {
    c.fillStyle = "#000000";
    trace(c, 2, 2);
    c.fill();
  });
  crisp(ctx, (c) => {
    trace(c);
    c.lineJoin = "round";
    c.lineWidth = 3;
    c.strokeStyle = "#ffffff";
    c.stroke();
  });
  crisp(ctx, (c) => {
    trace(c);
    c.fillStyle = "#ff2016";
    c.fill();
  });
}

function redCircle(ctx: Ctx, x: number, y: number, rx: number, ry: number) {
  const ring = (c: Ctx) => {
    c.beginPath();
    for (let a = -0.4; a <= Math.PI * 2 + 0.25; a += 0.1) {
      const grow = 1 + (a / (Math.PI * 2)) * 0.1;
      const px = x + Math.cos(a) * rx * grow;
      const py = y + Math.sin(a) * ry * grow;
      if (a === -0.4) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
  };
  crisp(ctx, (c) => {
    ring(c);
    c.lineCap = "round";
    c.lineWidth = 5;
    c.strokeStyle = "#000000";
    c.stroke();
  });
  crisp(ctx, (c) => {
    ring(c);
    c.lineCap = "round";
    c.lineWidth = 3;
    c.strokeStyle = "#ff2016";
    c.stroke();
  });
}

function caption(ctx: Ctx, spec: VideoSpec, top: number) {
  const lines = spec.caption.split("\n");
  let size = 25;
  const widest = Math.max(...lines.map((l) => measure(ctx, l, size, 900)));
  if (widest > spec.maxW) size *= spec.maxW / widest;
  ctx.save();
  ctx.translate(spec.at[0], top + spec.at[1]);
  ctx.rotate(spec.tilt);
  lines.forEach((line, i) => {
    label(ctx, line, 0, i * size * 0.94, {
      size,
      weight: 900,
      color: spec.color,
      baseline: "top",
      outline: [2.2, "#000000"],
      shadow: [2, 3, "#000000"],
    });
  });
  ctx.restore();
}

// "8K" on a yellow starburst, stuck on the glass like a shop-floor sticker.
function shopSticker(ctx: Ctx, x: number, y: number) {
  crisp(ctx, (c) => {
    c.fillStyle = "#000000";
    starburstPath(c, x + 1, y + 2, 19, 12);
    c.fill();
  });
  crisp(ctx, (c) => {
    c.fillStyle = "#ffffff";
    starburstPath(c, x, y, 19, 12);
    c.fill();
  });
  crisp(ctx, (c) => {
    c.fillStyle = "#ffd23f";
    starburstPath(c, x, y, 16.5, 12);
    c.fill();
  });
  label(ctx, "AI", x, y - 5, {
    size: 8,
    weight: 900,
    color: "#ff2a2a",
    align: "center",
    baseline: "middle",
  });
  label(ctx, "8K", x, y + 5, {
    size: 14,
    weight: 900,
    color: "#ff2a2a",
    align: "center",
    baseline: "middle",
    outline: [1, "#5a0c06"],
  });
}

// The tube's corners fall off in three hard steps instead of a smooth vignette.
function crtCorners(ctx: Ctx) {
  const { width: W, height: H } = ctx.canvas;
  const image = ctx.getImageData(0, 0, W, H);
  const d = image.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const nx = (x + 0.5) / W - 0.5;
      const ny = (y + 0.5) / H - 0.5;
      const r = Math.pow(Math.abs(nx * 2) ** 5 + Math.abs(ny * 2) ** 5, 1 / 5);
      const k = r > 0.985 ? 0.55 : r > 0.95 ? 0.72 : r > 0.9 ? 0.87 : 1;
      if (k === 1) continue;
      const i = (y * W + x) * 4;
      d[i] *= k;
      d[i + 1] *= k;
      d[i + 2] *= k;
    }
  }
  ctx.putImageData(image, 0, 0);
}

export function paintTvScreen(img: HTMLImageElement, spec: VideoSpec) {
  const W = TV_SCREEN_W;
  const H = TV_SCREEN_H;
  const PIC = Math.round((W * 9) / 16);
  const top = Math.round((H - PIC) / 2);
  const [canvas, ctx] = makeCanvas(W, H);
  ctx.fillStyle = "#0b0b0c";
  ctx.fillRect(0, 0, W, H);
  ctx.filter = "saturate(1.45) contrast(1.12)";
  ctx.drawImage(img, 0, top, W, PIC);
  ctx.filter = "none";

  for (const mark of spec.marks) {
    if (mark.kind === "circle") redCircle(ctx, mark.x, top + mark.y, mark.rx, mark.ry);
  }
  caption(ctx, spec, top);
  for (const mark of spec.marks) {
    if (mark.kind === "arrow") {
      redArrow(ctx, [mark.from[0], top + mark.from[1]], [mark.to[0], top + mark.to[1]]);
    }
  }

  // Title bar: channel avatar and the video title.
  crisp(ctx, (c) => {
    c.fillStyle = "#6b4dff";
    c.beginPath();
    c.arc(10, top / 2, 6, 0, Math.PI * 2);
    c.fill();
  });
  sparkle(ctx, 10, top / 2, 4, ["#ffffff", "#d9d2ff"], "#6b4dff");
  label(ctx, spec.title, 20, top / 2 + 0.5, {
    size: 9,
    weight: 700,
    color: "#f1f1f1",
    baseline: "middle",
    maxW: W - 52,
  });

  // Player chrome in the bottom bar: progress, play, time, buttons.
  const by = top + PIC;
  ctx.fillStyle = "#4a4a4a";
  ctx.fillRect(0, by, W, 3);
  ctx.fillStyle = "#ff0000";
  ctx.fillRect(0, by, Math.round(W * spec.progress), 3);
  crisp(ctx, (c) => {
    c.fillStyle = "#ff0000";
    c.beginPath();
    c.arc(Math.round(W * spec.progress), by + 1.5, 3.5, 0, Math.PI * 2);
    c.fill();
  });
  const mid = by + 3 + (H - by - 3) / 2;
  crisp(ctx, (c) => {
    c.fillStyle = "#ffffff";
    c.beginPath();
    c.moveTo(7, mid - 4.5);
    c.lineTo(14, mid);
    c.lineTo(7, mid + 4.5);
    c.closePath();
    c.fill();
    c.fillRect(W - 28, mid - 3.5, 9, 7);
    c.fillRect(W - 14, mid - 3.5, 7, 7);
  });
  ctx.fillStyle = "#0b0b0c";
  ctx.fillRect(W - 26, mid - 1.5, 5, 3);
  ctx.fillRect(W - 12, mid - 1.5, 3, 3);
  const [min, sec] = spec.duration.split(":").map(Number);
  const at = Math.round((min * 60 + sec) * spec.progress);
  const clock = `${Math.floor(at / 60)}:${String(at % 60).padStart(2, "0")} / ${spec.duration}`;
  label(ctx, clock, 20, mid + 0.5, { size: 8, weight: 700, color: "#ffffff", baseline: "middle" });

  shopSticker(ctx, W - 22, top + 12);
  crtCorners(ctx);
  glints(ctx, 0, 0, W, H, 0.08);
  quantize(canvas, 128, 10);
  return canvas;
}

// ---------------------------------------------------------------------------------------------
// Laptop screens: the whole inner face of the lid, glossy black bezel and chin included.

export const LAPTOP_SCREEN_W = 192;
export const LAPTOP_SCREEN_H = Math.round((LAPTOP_SCREEN_W * LAPTOP_LID.h) / LAPTOP_LID.w);

export interface CodeCard {
  file: string;
  ghostTab: string;
  cursor: number;
  prose?: number;
  lines: string[];
  ghost?: string[];
}

export const CODE_CARDS: CodeCard[] = [
  {
    file: "utils.ts",
    ghostTab: "utils_final_v2.ts",
    cursor: 5,
    lines: [
      "function isEven(n) {",
      "  if (n === 0) return true;",
      "  if (n === 1) return false;",
      "  if (n === 2) return true;",
      "  if (n === 3) return false;",
      "  if (n === 4) return true;",
    ],
    ghost: ["  if (n === 5) return false;"],
  },
  {
    file: "api.ts",
    ghostTab: "api.old.ts",
    cursor: 6,
    lines: [
      "// ✨ Generated with AI",
      "async function getData(",
      "  url: any): Promise<any> {",
      "  try {",
      "    return await fetch(url);",
      "  } catch (e) {",
      "    // ignore",
    ],
  },
  {
    file: "index.js",
    ghostTab: "index copy.js",
    cursor: 5,
    prose: 0,
    lines: [
      "Certainly! Here's the code:",
      "function main() {",
      '  console.log("here");',
      "  const user = getUser();",
      "  save(user); // works?",
      '  console.log("why");',
      "}",
    ],
  },
];

const SYNTAX = {
  plain: "#e8ebf2",
  keyword: "#d77eff",
  fn: "#5fb8ff",
  type: "#ffcc66",
  string: "#a8e46e",
  number: "#ff9f5a",
  comment: "#8a95a6",
  punct: "#b9c0cc",
};
const KEYWORDS = new Set(["function", "if", "return", "const", "try", "catch", "async", "await"]);
const TYPES = new Set(["any", "Promise", "console"]);
const LITERALS = new Set(["true", "false"]);

function tokens(line: string) {
  const matches = [...line.matchAll(/(\/\/.*$)|("[^"]*")|(\d+)|([A-Za-z_$][\w$]*)|(\s+)|(.)/gu)];
  return matches.map((m, i) => {
    const [text, comment, str, num, ident] = m;
    let color = SYNTAX.punct;
    if (comment) color = SYNTAX.comment;
    else if (str) color = SYNTAX.string;
    else if (num || LITERALS.has(ident)) color = SYNTAX.number;
    else if (ident) {
      if (KEYWORDS.has(ident)) color = SYNTAX.keyword;
      else if (TYPES.has(ident)) color = SYNTAX.type;
      else if ((matches[i + 1]?.[0] ?? "").startsWith("(")) color = SYNTAX.fn;
      else color = SYNTAX.plain;
    }
    return { text, color, warn: ident === "any" };
  });
}

export function paintLaptopScreen(card: CodeCard) {
  const W = LAPTOP_SCREEN_W;
  const H = LAPTOP_SCREEN_H;
  const { w, h, screen: s } = LAPTOP_LID;
  const X = (x: number) => ((x + w / 2) / w) * W;
  const Y = (y: number) => ((h / 2 - y) / h) * H;
  const [canvas, ctx] = makeCanvas(W, H);

  // Glossy black bezel, a lit hairline where it meets the aluminium rim.
  ctx.fillStyle = "#3a3d44";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#0c0d10";
  ctx.fillRect(2, 2, W - 4, H - 4);
  ctx.fillStyle = "#1f2126";
  ctx.fillRect(2, 2, W - 4, 1);
  crisp(ctx, (c) => {
    c.fillStyle = "#2a2d34";
    c.beginPath();
    c.arc(W / 2, Y(s.y + s.h / 2) / 2 + 0.5, 2, 0, Math.PI * 2);
    c.fill();
  });
  ctx.fillStyle = "#3fe08a";
  ctx.fillRect(W / 2 + 4, Math.round(Y(s.y + s.h / 2) / 2), 1, 1);
  const chinTop = Y(s.y - s.h / 2);
  label(ctx, "SlopBook", W / 2, (chinTop + H - 2) / 2 + 0.5, {
    size: 8,
    weight: 800,
    color: "#a3a8b2",
    align: "center",
    baseline: "middle",
  });

  const x0 = Math.round(X(-s.w / 2));
  const x1 = Math.round(X(s.w / 2));
  const y0 = Math.round(Y(s.y + s.h / 2));
  const y1 = Math.round(chinTop);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, x1 - x0, y1 - y0);
  ctx.clip();
  ctx.fillStyle = "#23262e";
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

  // Title bar with traffic lights and two tabs.
  const TITLE = 11;
  ctx.fillStyle = "#3a3e4a";
  ctx.fillRect(x0, y0, x1 - x0, TITLE);
  ctx.fillStyle = "#11131a";
  ctx.fillRect(x0, y0 + TITLE, x1 - x0, 1);
  ["#ff5f57", "#febc2e", "#28c840"].forEach((color, i) =>
    crisp(ctx, (c) => {
      c.fillStyle = color;
      c.beginPath();
      c.arc(x0 + 6 + i * 6.5, y0 + TITLE / 2, 2.4, 0, Math.PI * 2);
      c.fill();
    }),
  );
  const tabX = x0 + 26;
  const tabW = measure(ctx, card.file, 8, 700, MONO) + 10;
  ctx.fillStyle = "#23262e";
  ctx.fillRect(tabX, y0 + 2, tabW, TITLE - 2);
  ctx.fillStyle = "#5aa2ff";
  ctx.fillRect(tabX, y0 + 2, tabW, 1);
  label(ctx, card.file, tabX + 5, y0 + TITLE / 2 + 1, {
    size: 8,
    weight: 700,
    font: MONO,
    color: "#eceef3",
    baseline: "middle",
  });
  label(ctx, card.ghostTab, tabX + tabW + 6, y0 + TITLE / 2 + 1, {
    size: 8,
    weight: 700,
    font: MONO,
    color: "#7d8394",
    baseline: "middle",
  });

  // Status bar: two flat bands and a sparkle.
  const STATUS = 8;
  ctx.fillStyle = "#1f74d6";
  ctx.fillRect(x0, y1 - STATUS, x1 - x0, STATUS);
  ctx.fillStyle = "#7b4dff";
  ctx.fillRect(x0 + Math.round((x1 - x0) * 0.58), y1 - STATUS, x1 - x0, STATUS);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x0 + 5, y1 - 5, 18, 2);
  sparkle(ctx, x1 - 30, y1 - STATUS / 2, 3, ["#ffffff", "#e6ddff"], "#7b4dff");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x1 - 25, y1 - 5, 18, 2);

  const ghost = card.ghost ?? [];
  const rows = [
    ...card.lines.slice(0, card.cursor + 1).map((text) => ({ text, ghost: false })),
    ...ghost.map((text) => ({ text, ghost: true })),
    ...card.lines.slice(card.cursor + 1).map((text) => ({ text, ghost: false })),
  ];
  const top = y0 + TITLE + 2;
  const lh = (y1 - STATUS - top) / 7;
  const size = 10;
  const GUTTER = 13;
  ctx.fillStyle = "#1c1f26";
  ctx.fillRect(x0, top - 1, GUTTER - 2, y1 - STATUS - top + 1);
  ctx.fillStyle = "#2c3446";
  ctx.fillRect(x0 + GUTTER - 2, top + card.cursor * lh, x1 - x0, Math.round(lh));
  let caretX = 0;
  rows.forEach(({ text, ghost: isGhost }, i) => {
    const y = top + i * lh + lh / 2 + 0.5;
    label(ctx, String(i + 1), x0 + GUTTER - 4, y, {
      size: 7,
      weight: 700,
      font: MONO,
      color: i === card.cursor ? "#d4d8e0" : "#555c6e",
      align: "right",
      baseline: "middle",
    });
    let x = x0 + GUTTER + 1;
    if (isGhost) {
      label(ctx, text, x, y, {
        size,
        weight: 600,
        font: MONO,
        color: "#6c7385",
        baseline: "middle",
      });
      return;
    }
    if (card.prose === i) {
      const tw = label(ctx, text, x, y, {
        size,
        weight: 800,
        color: "#ffffff",
        baseline: "middle",
      });
      ctx.fillStyle = "#ff5c57";
      ctx.fillRect(x, Math.round(y + 5), Math.round(tw), 2);
      return;
    }
    // One thresholded layer per line, each token in its syntax colour.
    const warns: [number, number][] = [];
    crisp(
      ctx,
      (c) => {
        c.font = `800 ${size}px ${MONO}`;
        c.textBaseline = "middle";
        for (const t of tokens(text)) {
          const tw = c.measureText(t.text).width;
          c.fillStyle = t.color;
          c.fillText(t.text, x, y);
          if (t.warn) warns.push([x, tw]);
          x += tw;
        }
      },
      1,
      [x0, y - lh, x1 - x0, lh * 2],
    );
    ctx.fillStyle = "#ffc23a";
    for (const [wx, ww] of warns)
      ctx.fillRect(Math.round(wx), Math.round(y + 5), Math.round(ww), 2);
    if (i === card.cursor) caretX = x + 1;
  });
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(Math.round(caretX), Math.round(top + card.cursor * lh + 1), 2, Math.round(lh - 2));
  ctx.restore();

  glints(ctx, x0, y0, x1 - x0, y1 - y0, 0.12);
  quantize(canvas, 64);
  return canvas;
}

// ---------------------------------------------------------------------------------------------
// Phone screens: the glass with its black border, a post set big enough to read at ~110 px tall.

export const PHONE_SCREEN_W = 128;
export const PHONE_SCREEN_H = Math.round(
  (PHONE_SCREEN_W * (PHONE_GLASS[3] - PHONE_GLASS[1])) / (PHONE_GLASS[2] - PHONE_GLASS[0]),
);

interface Theme {
  bg: string;
  text: string;
  muted: string;
  line: string;
  greek: string;
}

const LIGHT: Theme = {
  bg: "#ffffff",
  text: "#0f1419",
  muted: "#5d6872",
  line: "#dfe3e7",
  greek: "#c3cad1",
};
const DARK: Theme = {
  bg: "#000000",
  text: "#eef0f1",
  muted: "#7d838b",
  line: "#2f3336",
  greek: "#3c4249",
};

interface Phone {
  ctx: Ctx;
  canvas: HTMLCanvasElement;
  theme: Theme;
  // The screen's content box inside the black border.
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function phoneFrame(theme: Theme): Phone {
  const W = PHONE_SCREEN_W;
  const H = PHONE_SCREEN_H;
  const [canvas, ctx] = makeCanvas(W, H);
  const gw = PHONE_GLASS[2] - PHONE_GLASS[0];
  const border = ((gw - PHONE_SCREEN.w) / 2 / gw) * W;
  const radius = (0.16 / gw) * W;
  ctx.fillStyle = "#050507";
  ctx.fillRect(0, 0, W, H);
  const x0 = border;
  const y0 = border;
  const x1 = W - border;
  const y1 = H - border;
  crisp(ctx, (c) => {
    c.fillStyle = theme.bg;
    c.beginPath();
    c.roundRect(x0, y0, x1 - x0, y1 - y0, radius);
    c.fill();
  });
  const phone = { ctx, canvas, theme, x0, y0, x1, y1 };
  // Status bar: time, punch-hole camera, signal, a big battery.
  label(ctx, "9:41", x0 + 9, y0 + 8.5, {
    size: 8,
    weight: 800,
    color: theme.text,
    baseline: "middle",
  });
  crisp(ctx, (c) => {
    c.fillStyle = "#050507";
    c.beginPath();
    c.arc(W / 2, y0 + 8, 3.5, 0, Math.PI * 2);
    c.fill();
  });
  ctx.fillStyle = theme.text;
  for (let i = 0; i < 3; i++) ctx.fillRect(x1 - 33 + i * 3, y0 + 10 - (i + 1) * 2, 2, (i + 1) * 2);
  ctx.fillRect(x1 - 21, y0 + 5, 12, 7);
  ctx.fillRect(x1 - 9, y0 + 7, 1, 3);
  ctx.fillStyle = theme.bg;
  ctx.fillRect(x1 - 20, y0 + 6, 10, 5);
  ctx.fillStyle = "#34c759";
  ctx.fillRect(x1 - 19, y0 + 7, 8, 3);
  // Home indicator.
  ctx.fillStyle = theme.text;
  ctx.fillRect(W / 2 - 18, y1 - 5, 36, 2);
  return phone;
}

function avatar(p: Phone, x: number, y: number, r: number, fill: string, glyph: string) {
  crisp(p.ctx, (c) => {
    c.fillStyle = fill;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  });
  label(p.ctx, glyph, x, y + 1, {
    size: r * 1.25,
    weight: 400,
    align: "center",
    baseline: "middle",
    color: "#000",
  });
}

function verified(p: Phone, x: number, y: number, color = "#1d9bf0") {
  crisp(p.ctx, (c) => {
    c.fillStyle = color;
    c.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = i % 2 === 0 ? 4.6 : 3.8;
      if (i === 0) c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      else c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    c.closePath();
    c.fill();
  });
  crisp(p.ctx, (c) => {
    c.strokeStyle = "#ffffff";
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(x - 2, y);
    c.lineTo(x - 0.5, y + 1.6);
    c.lineTo(x + 2.2, y - 1.6);
    c.stroke();
  });
}

// A greeked line of secondary text: a solid rounded bar.
function greek(p: Phone, x: number, y: number, w: number, color = p.theme.greek) {
  crisp(p.ctx, (c) => {
    c.fillStyle = color;
    c.beginPath();
    c.roundRect(x, y, w, 3, 1.5);
    c.fill();
  });
}

// One chunky emoji, about 8 x 8 texels: the only glyph a greeked reply keeps.
function emoji(p: Phone, glyph: string, x: number, y: number) {
  label(p.ctx, glyph, x, y, {
    size: 9,
    weight: 400,
    align: "center",
    baseline: "middle",
    color: "#000",
  });
}

// A reply greeked to bars: avatar, a darker name bar, 3-texel text lines with 2-texel gaps, and at
// most one emoji after the last line (kept the longest, so the emoji clears the line above). Small
// reply type only turns to noise at game size.
function reply(
  p: Phone,
  y: number,
  [fill, glyph]: [string, string],
  nameW: number,
  lines: number[],
  mark?: string,
) {
  avatar(p, p.x0 + 12, y, 7, fill, glyph);
  const x = p.x0 + 23;
  greek(p, x, y - 7, nameW, p.theme.muted);
  lines.forEach((w, i) => greek(p, x, y - 2 + i * 5, w));
  const last = lines.length - 1;
  if (mark) emoji(p, mark, x + lines[last] + 7, y - 0.5 + last * 5);
}

function divider(p: Phone, y: number) {
  p.ctx.fillStyle = p.theme.line;
  p.ctx.fillRect(p.x0, Math.round(y), p.x1 - p.x0, 1);
}

function headline(p: Phone, lines: string[], y: number, size = 15, color = p.theme.text) {
  lines.forEach((line, i) =>
    label(p.ctx, line, p.x0 + 6, y + i * size * 1.12, {
      size,
      weight: 800,
      color,
      baseline: "top",
      maxW: p.x1 - p.x0 - 10,
    }),
  );
  return y + lines.length * size * 1.12;
}

type Icon = "reply" | "repost" | "heart" | "views" | "bookmark" | "send" | "comment" | "like";

function icon(p: Phone, kind: Icon, x: number, y: number, color: string, filled = false) {
  crisp(p.ctx, (c) => {
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = 1.6;
    c.lineJoin = "round";
    c.beginPath();
    if (kind === "heart" || kind === "like") {
      c.moveTo(x, y + 3.5);
      c.lineTo(x - 4, y - 0.5);
      c.arc(x - 2, y - 1.5, 2.2, Math.PI * 0.8, Math.PI * 1.9);
      c.arc(x + 2, y - 1.5, 2.2, Math.PI * 1.1, Math.PI * 0.2);
      c.closePath();
    } else if (kind === "reply" || kind === "comment") {
      c.roundRect(x - 4, y - 3.5, 8, 6, 2.5);
      c.moveTo(x - 2, y + 2.5);
      c.lineTo(x - 3.5, y + 4.5);
    } else if (kind === "repost") {
      c.moveTo(x - 4, y + 1);
      c.lineTo(x - 4, y - 2.5);
      c.lineTo(x + 2.5, y - 2.5);
      c.moveTo(x + 4, y - 1);
      c.lineTo(x + 4, y + 2.5);
      c.lineTo(x - 2.5, y + 2.5);
    } else if (kind === "views") {
      c.rect(x - 4, y, 2, 3.5);
      c.rect(x - 1, y - 3.5, 2, 7);
      c.rect(x + 2, y - 1.5, 2, 5);
      c.fill();
      return;
    } else if (kind === "bookmark") {
      c.moveTo(x - 3, y - 4);
      c.lineTo(x + 3, y - 4);
      c.lineTo(x + 3, y + 4);
      c.lineTo(x, y + 1.5);
      c.lineTo(x - 3, y + 4);
      c.closePath();
    } else {
      c.moveTo(x - 4, y);
      c.lineTo(x + 4, y - 4);
      c.lineTo(x + 1, y + 4);
      c.closePath();
    }
    if (filled) c.fill();
    else c.stroke();
  });
}

function counts(p: Phone, y: number, items: [Icon, string, string?][]) {
  const span = (p.x1 - p.x0 - 12) / items.length;
  items.forEach(([kind, count, hot], i) => {
    const x = p.x0 + 10 + i * span;
    const color = hot ?? p.theme.muted;
    icon(p, kind, x, y, color, Boolean(hot));
    label(p.ctx, count, x + 6, y + 0.5, { size: 8, weight: 800, color, baseline: "middle" });
  });
}

function photo(p: Phone, img: HTMLImageElement, y: number, h: number) {
  const w = p.x1 - p.x0;
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * s;
  const dh = img.naturalHeight * s;
  p.ctx.save();
  p.ctx.beginPath();
  p.ctx.rect(p.x0, y, w, h);
  p.ctx.clip();
  p.ctx.filter = "saturate(1.35) contrast(1.08)";
  p.ctx.drawImage(img, p.x0 + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  p.ctx.filter = "none";
  p.ctx.restore();
}

function finishPhone(p: Phone, colours: number, dither = 0) {
  glints(p.ctx, p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0, 0.22);
  quantize(p.canvas, colours, dither);
  return p.canvas;
}

function header(p: Phone, name: string, fill: string, glyph: string, badge?: string) {
  avatar(p, p.x0 + 16, p.y0 + 29, 10, fill, glyph);
  const nx = p.x0 + 30;
  const nw = label(p.ctx, name, nx, p.y0 + 26, {
    size: 12,
    weight: 800,
    color: p.theme.text,
    baseline: "middle",
    maxW: p.x1 - nx - 14,
  });
  if (badge) verified(p, nx + nw + 6, p.y0 + 26, badge);
  greek(p, nx, p.y0 + 34, 38, p.theme.greek);
}

export function paintGuruPost() {
  const p = phoneFrame(LIGHT);
  header(p, "GrowthGuru", "#ff8a4c", "😎", "#1d9bf0");
  const end = headline(
    p,
    ["I replaced my", "whole team", "with AI agents.", "Revenue +900%.", "Here's how 🧵👇"],
    p.y0 + 46,
  );
  greek(p, p.x0 + 6, end + 6, 30);
  greek(p, p.x0 + 40, end + 6, 26, "#8b98a5");
  divider(p, end + 15);
  counts(p, end + 24, [
    ["repost", "8.4K"],
    ["heart", "96K", "#f91880"],
    ["views", "4M"],
  ]);
  divider(p, end + 33);
  const ry = end + 46;
  reply(p, ry, ["#9aa3ad", "🤖"], 34, [46, 58], "🚀");
  reply(p, ry + 26, ["#b4bcc6", "🤖"], 30, [44], "🔥");
  reply(p, ry + 48, ["#c9d1da", "🤖"], 26, [52], "💯");
  return finishPhone(p, 64);
}

export function paintCeoPost() {
  const p = phoneFrame(LIGHT);
  header(p, "Chad Synergy", "#4a6cf7", "💼");
  label(p.ctx, "+ Follow", p.x1 - 6, p.y0 + 38, {
    size: 8,
    weight: 800,
    color: "#0a66c2",
    align: "right",
    baseline: "middle",
  });
  const end = headline(
    p,
    ["I fired my best", "engineer today.", "Then I asked AI", "one question.", "Agree? 👇"],
    p.y0 + 48,
  );
  greek(p, p.x0 + 6, end + 4, 34, "#8b98a5");
  ["👏", "💡", "❤️"].forEach((glyph, i) => {
    crisp(p.ctx, (c) => {
      c.fillStyle = "#e7eef6";
      c.beginPath();
      c.arc(p.x0 + 12 + i * 8, end + 20, 5.5, 0, Math.PI * 2);
      c.fill();
    });
    label(p.ctx, glyph, p.x0 + 12 + i * 8, end + 21, {
      size: 8,
      weight: 400,
      align: "center",
      baseline: "middle",
      color: "#000",
    });
  });
  label(p.ctx, "4,812", p.x0 + 38, end + 20.5, {
    size: 9,
    weight: 800,
    color: p.theme.muted,
    baseline: "middle",
  });
  greek(p, p.x1 - 40, end + 19, 34);
  divider(p, end + 30);
  counts(p, end + 40, [
    ["like", "", "#0a66c2"],
    ["comment", ""],
    ["repost", ""],
    ["send", ""],
  ]);
  divider(p, end + 50);
  const y = end + 62;
  avatar(p, p.x0 + 12, y, 7, "#c9d3df", "🤖");
  crisp(p.ctx, (c) => {
    c.fillStyle = "#eef2f6";
    c.beginPath();
    c.roundRect(p.x0 + 22, y - 9, p.x1 - p.x0 - 28, 26, 6);
    c.fill();
  });
  greek(p, p.x0 + 27, y - 4, 30, p.theme.muted);
  greek(p, p.x0 + 27, y + 2, 46, "#aab3bd");
  greek(p, p.x0 + 27, y + 7, 54, "#aab3bd");
  emoji(p, "🙌", p.x0 + 27 + 54 + 7, y + 8.5);
  return finishPhone(p, 64);
}

export function paintAmenPost(img: HTMLImageElement) {
  const p = phoneFrame(LIGHT);
  header(p, "Blessed Vibes", "#ffd25a", "🙏");
  const end = headline(p, ["Type AMEN if", "you see Him 🙏"], p.y0 + 46, 15);
  const ph = 96;
  photo(p, img, end + 4, ph);
  const y = end + ph + 14;
  ["👍", "❤️", "😮"].forEach((glyph, i) =>
    label(p.ctx, glyph, p.x0 + 10 + i * 9, y, {
      size: 9,
      weight: 400,
      align: "center",
      baseline: "middle",
      color: "#000",
    }),
  );
  label(p.ctx, "48K", p.x0 + 36, y + 0.5, {
    size: 9,
    weight: 800,
    color: p.theme.muted,
    baseline: "middle",
  });
  greek(p, p.x1 - 38, y - 1, 32);
  divider(p, y + 8);
  const cy = y + 22;
  avatar(p, p.x0 + 12, cy, 7, "#f9a8d4", "👵");
  crisp(p.ctx, (c) => {
    c.fillStyle = "#eff1f4";
    c.beginPath();
    c.roundRect(p.x0 + 22, cy - 9, 74, 20, 8);
    c.fill();
  });
  greek(p, p.x0 + 28, cy - 4, 26, p.theme.muted);
  greek(p, p.x0 + 28, cy + 2, 34, "#aab3bd");
  emoji(p, "🙏", p.x0 + 28 + 34 + 8, cy + 3.5);
  return finishPhone(p, 128, 8);
}

export function paintBreakingPost() {
  const p = phoneFrame(DARK);
  header(p, "AI News 24/7", "#ff4b4b", "🚨", "#1d9bf0");
  const end = headline(p, ["🚨 BREAKING:", "AI just made", "every job", "obsolete."], p.y0 + 46);
  crisp(p.ctx, (c) => {
    c.strokeStyle = p.theme.line;
    c.lineWidth = 1.5;
    c.beginPath();
    c.roundRect(p.x0 + 6, end + 4, p.x1 - p.x0 - 12, 20, 5);
    c.stroke();
  });
  crisp(p.ctx, (c) => {
    c.fillStyle = "#1d9bf0";
    c.beginPath();
    c.arc(p.x0 + 14, end + 14, 4, 0, Math.PI * 2);
    c.fill();
  });
  p.ctx.fillStyle = "#ffffff";
  p.ctx.fillRect(Math.round(p.x0 + 13), Math.round(end + 13), 2, 4);
  p.ctx.fillRect(Math.round(p.x0 + 13), Math.round(end + 10), 2, 2);
  label(p.ctx, "Context: it didn't.", p.x0 + 21, end + 14.5, {
    size: 9,
    weight: 800,
    color: p.theme.text,
    baseline: "middle",
    maxW: p.x1 - p.x0 - 30,
  });
  greek(p, p.x0 + 6, end + 32, 30);
  greek(p, p.x0 + 40, end + 32, 24, "#8b98a5");
  divider(p, end + 41);
  counts(p, end + 50, [
    ["repost", "312K"],
    ["heart", "2.4M", "#f91880"],
    ["views", "98M"],
  ]);
  divider(p, end + 59);
  const ry = end + 72;
  reply(p, ry, ["#59626c", "🤖"], 34, [44, 56], "🔥");
  reply(p, ry + 26, ["#3c4249", "🤖"], 28, [46], "🔖");
  return finishPhone(p, 64);
}

export function paintInfluencerPost(img: HTMLImageElement) {
  const p = phoneFrame(LIGHT);
  const ax = p.x0 + 14;
  const ay = p.y0 + 27;
  crisp(p.ctx, (c) => {
    c.fillStyle = "#ec4899";
    c.beginPath();
    c.arc(ax, ay, 9, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#f59e0b";
    c.beginPath();
    c.arc(ax, ay, 9, Math.PI * 0.5, Math.PI * 1.2);
    c.lineTo(ax, ay);
    c.fill();
    c.fillStyle = "#ffffff";
    c.beginPath();
    c.arc(ax, ay, 7.5, 0, Math.PI * 2);
    c.fill();
  });
  p.ctx.save();
  p.ctx.beginPath();
  p.ctx.arc(ax, ay, 6.5, 0, Math.PI * 2);
  p.ctx.clip();
  p.ctx.drawImage(img, ax - 8, ay - 6, 16, 16 * (img.naturalHeight / img.naturalWidth));
  p.ctx.restore();
  const nw = label(p.ctx, "aria.daily", ax + 13, ay - 2, {
    size: 11,
    weight: 800,
    color: p.theme.text,
    baseline: "middle",
  });
  verified(p, ax + 13 + nw + 6, ay - 2, "#3897f0");
  greek(p, ax + 13, ay + 5, 22);
  const top = p.y0 + 40;
  const ph = 118;
  photo(p, img, top, ph);
  const iy = top + ph + 9;
  icon(p, "heart", p.x0 + 10, iy, "#ff3040", true);
  icon(p, "comment", p.x0 + 24, iy, p.theme.text);
  icon(p, "send", p.x0 + 38, iy, p.theme.text);
  icon(p, "bookmark", p.x1 - 10, iy, p.theme.text);
  label(p.ctx, "98,214 likes", p.x0 + 6, iy + 13, {
    size: 10,
    weight: 800,
    color: p.theme.text,
    baseline: "middle",
  });
  greek(p, p.x0 + 6, iy + 21, 64);
  label(p.ctx, "#notAI #real", p.x0 + 6, iy + 32, {
    size: 10,
    weight: 800,
    color: "#2b5bb5",
    baseline: "middle",
  });
  greek(p, p.x0 + 6, iy + 41, 40);
  greek(p, p.x0 + 6, iy + 52, 20, p.theme.muted);
  greek(p, p.x0 + 30, iy + 52, 40);
  emoji(p, "😍", p.x0 + 30 + 40 + 7, iy + 53.5);
  greek(p, p.x0 + 6, iy + 57, 56);
  return finishPhone(p, 128, 8);
}
