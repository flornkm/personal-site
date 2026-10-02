import * as THREE from "three";
import {
  LAPTOP_ALU,
  LAPTOP_BASE,
  LAPTOP_FEET,
  LAPTOP_LID,
  PHONE_BACK,
  PHONE_BUMP,
  PHONE_RAIL,
  POPSOCKET,
  TRIM,
  TRIM_SIZE,
  TV_BACK,
  TV_BEZEL,
  TV_CASING,
  TV_KNOBS,
  TV_SCREEN,
  TV_WELL,
  phoneRailZones,
  tvCasingZones,
} from "./models-electronics";
import {
  bevelRect,
  brushed,
  crisp,
  label,
  makeCanvas,
  quantize,
  rng,
  sparkle,
  specks,
  starburstPath,
  sticker,
  tone,
  wrapped,
  type Ctx,
} from "./paint-kit";
import {
  CODE_CARDS,
  VIDEOS,
  paintAmenPost,
  paintBreakingPost,
  paintCeoPost,
  paintGuruPost,
  paintInfluencerPost,
  paintLaptopScreen,
  paintTvScreen,
} from "./paint-screens";

// Body skins, the trim sheet and the cut faces of the slop electronics (models-electronics.ts).
// Planar skins are mapped from the same constants the models use, so a painted knob ring lands
// under its knob. Shading is baked direction-free: hard AO steps in recesses, a lit line on every
// crest, sparse grime; the Gouraud rig adds the direction.

const DUST = ["#6e675e", "#5a544c", "#7b746a"];

// world rect -> canvas px, canvas top = world +y (mirrored when the face is seen from behind).
function mapper(
  [x0, y0, x1, y1]: [number, number, number, number],
  W: number,
  H: number,
  mirror = false,
) {
  return {
    X: (x: number) => (mirror ? (x1 - x) / (x1 - x0) : (x - x0) / (x1 - x0)) * W,
    Y: (y: number) => ((y1 - y) / (y1 - y0)) * H,
    S: W / (x1 - x0),
  };
}

function roundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
}

// ---------------------------------------------------------------------------------------------
// TV

function paintTvBezel() {
  const W = 192;
  const H = Math.round((W * TV_BEZEL.h) / TV_BEZEL.w);
  const [canvas, ctx] = makeCanvas(W, H);
  const { X, Y, S } = mapper(
    [-TV_BEZEL.w / 2, -TV_BEZEL.h / 2, TV_BEZEL.w / 2, TV_BEZEL.h / 2],
    W,
    H,
  );
  const box = (w: number, h: number, r: number, y = 0) =>
    roundRectPath(ctx, X(-w / 2), Y(y + h / 2), w * S, h * S, r * S);
  const fill = (color: string) => {
    ctx.fillStyle = color;
    ctx.fill();
  };
  // Outer chamfer, the lit crest where it meets the face, then the face: lighter above the chin.
  ctx.fillStyle = "#53565e";
  ctx.fillRect(0, 0, W, H);
  box(2.76, 2.26, 0.23);
  fill("#878b95");
  box(2.72, 2.22, 0.22);
  fill("#3a3c42");
  ctx.save();
  box(2.72, 2.22, 0.22);
  ctx.clip();
  ctx.fillStyle = "#323439";
  ctx.fillRect(0, Math.round(Y(-0.81)), W, H);
  ctx.fillStyle = "#43464d";
  ctx.fillRect(0, Math.round(Y(1.11)), W, 1);
  ctx.restore();

  // The screen well: a lit lip, a dark wall, a black rubber gasket.
  const s = TV_SCREEN;
  box(TV_WELL.w + 0.035, TV_WELL.h + 0.035, 0.19, s.y);
  fill("#767a83");
  box(TV_WELL.w, TV_WELL.h, 0.17, s.y);
  fill("#17181b");
  box(TV_WELL.w - 0.05, TV_WELL.h - 0.05, 0.16, s.y);
  fill("#101113");
  box(s.w + 0.1, s.h + 0.1, 0.14, s.y);
  fill("#08080a");

  // Chin, left: a vertical-slot speaker grille.
  const gy0 = Math.round(Y(-0.86));
  const gy1 = Math.round(Y(-1.05));
  for (let x = Math.round(X(-1.22)); x < X(-0.46); x += 4) {
    ctx.fillStyle = "#0b0c0e";
    ctx.fillRect(x, gy0, 2, gy1 - gy0);
    ctx.fillStyle = "#555861";
    ctx.fillRect(x + 2, gy0 + 1, 1, gy1 - gy0);
    ctx.fillRect(x, gy1, 2, 1);
  }

  // Chin, centre: the chrome nameplate, split hard into a lit top and a dark bottom.
  const px0 = Math.round(X(-0.38));
  const px1 = Math.round(X(0.46));
  const py0 = Math.round(Y(-0.86));
  const py1 = Math.round(Y(-1.05));
  const pm = Math.round((py0 + py1) / 2);
  ctx.fillStyle = "#0c0d10";
  ctx.fillRect(px0 - 1, py0 - 1, px1 - px0 + 2, py1 - py0 + 2);
  ctx.fillStyle = "#e6e9ef";
  ctx.fillRect(px0, py0, px1 - px0, pm - py0);
  ctx.fillStyle = "#979daa";
  ctx.fillRect(px0, pm, px1 - px0, py1 - pm);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(px0, py0, px1 - px0, 1);
  label(ctx, "SLOPVISION", (px0 + px1) / 2, (py0 + py1) / 2 + 0.5, {
    size: 10,
    weight: 900,
    color: "#17191e",
    align: "center",
    baseline: "middle",
    maxW: px1 - px0 - 4,
  });

  // Chin, right: hard AO rings under the modelled knobs, a fingerprint, a red LED.
  for (const k of TV_KNOBS) {
    crisp(ctx, (c) => {
      c.fillStyle = "#141518";
      c.beginPath();
      c.arc(X(k.x), Y(k.y), k.r * S + 2.2, 0, Math.PI * 2);
      c.fill();
    });
  }
  crisp(
    ctx,
    (c) => {
      c.strokeStyle = "#ffffff";
      c.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.ellipse(X(1.2), Y(-0.86), 2 + i * 2, 1.5 + i * 1.5, 0.3, Math.PI * 0.9, Math.PI * 2.1);
        c.stroke();
      }
    },
    0.1,
  );
  const lx = Math.round(X(1.2));
  const ly = Math.round(Y(-0.98));
  ctx.fillStyle = "#4a0806";
  ctx.fillRect(lx - 2, ly - 2, 5, 5);
  ctx.fillStyle = "#ff3b30";
  ctx.fillRect(lx - 1, ly - 1, 3, 3);
  ctx.fillStyle = "#ffb7ad";
  ctx.fillRect(lx - 1, ly - 1, 1, 1);

  // Dust settles along the crevice at the foot of the chin.
  specks(ctx, [X(-1.25), Y(-1.08), X(1.25) - X(-1.25), 3], 26, DUST, 7);
  quantize(canvas, 32);
  return canvas;
}

function paintTvCasing() {
  const { w: W, h: H } = TV_CASING;
  const [canvas, ctx] = makeCanvas(W, H);
  const band = ([r0, r1]: readonly [number, number], color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, r0, W, r1 - r0);
  };
  const row = (r: number, color: string, h = 1) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, r, W, h);
  };
  const { wall, ledge, tube, chamfer } = TV_CASING;
  band(wall, "#3e4046");
  row(wall[0], "#666a73", 2);
  row(wall[1] - 2, "#2b2d31", 2);
  band(ledge, "#46484f");
  row(ledge[0], "#6b6f78", 2);
  // The tube housing darkens back in three flat steps, dustier as it goes.
  const third = (tube[1] - tube[0]) / 3;
  band([tube[0], tube[0] + third], "#3b3d43");
  band([tube[0] + third, tube[0] + 2 * third], "#37393e");
  band([tube[0] + 2 * third, tube[1]], "#333539");
  row(tube[0], "#232428", 2);
  band(chamfer, "#2f3135");
  row(chamfer[0], "#595c64", 2);

  const zones = tvCasingZones();
  const U = (u: number) => u * W;
  // Top: chunky vent slots in two banks, either side of the rabbit-ear base.
  const [ta, tb] = [U(zones.top[0]), U(zones.top[1])];
  const mid = (ta + tb) / 2;
  // The base sits at z -0.2, 43% of the way down the tube band.
  const baseRow = tube[0] + 0.43 * (tube[1] - tube[0]);
  for (const [from, to] of [
    [ta + 10, mid - 30],
    [mid + 30, tb - 10],
  ]) {
    for (let x = Math.round(from); x + 3 <= to; x += 7) {
      for (const r0 of [tube[0] + 8, tube[0] + 30, tube[0] + 52]) {
        ctx.fillStyle = "#121315";
        ctx.fillRect(x, r0, 3, 16);
        ctx.fillStyle = "#5c5f67";
        ctx.fillRect(x + 3, r0 + 1, 1, 16);
        ctx.fillRect(x, r0 + 16, 3, 1);
      }
    }
  }
  crisp(ctx, (c) => {
    c.fillStyle = "#1d1e22";
    c.beginPath();
    c.ellipse(mid, baseRow, 22, 21, 0, 0, Math.PI * 2);
    c.fill();
  });
  crisp(ctx, (c) => {
    c.fillStyle = "#37393e";
    c.beginPath();
    c.ellipse(mid, baseRow, 19, 18, 0, 0, Math.PI * 2);
    c.fill();
  });

  // Sides: vent slots toward the back; the right side wears the warning sticker, the left a
  // starburst. On a side, u runs up (right) or down (left) and rows run back, so both turn 90°.
  for (const [a, b] of [zones.right, zones.left]) {
    const from = U(a) + (U(b) - U(a)) * 0.2;
    const to = U(b) - (U(b) - U(a)) * 0.2;
    for (let x = Math.round(from); x + 3 <= to; x += 7) {
      ctx.fillStyle = "#121315";
      ctx.fillRect(x, tube[0] + 52, 3, 24);
      ctx.fillStyle = "#5c5f67";
      ctx.fillRect(x + 3, tube[0] + 53, 1, 24);
      ctx.fillRect(x, tube[0] + 76, 3, 1);
    }
  }
  const rightMid = U((zones.right[0] + zones.right[1]) / 2);
  ctx.save();
  ctx.translate(rightMid, tube[0] + 25);
  ctx.rotate(Math.PI / 2);
  sticker(
    ctx,
    0,
    0,
    0,
    (c, grow) => {
      c.beginPath();
      c.rect(-18 - grow, -10 - grow, 36 + grow * 2, 20 + grow * 2);
    },
    (c) => {
      c.fillStyle = "#ffd23f";
      c.beginPath();
      c.moveTo(-11, -7);
      c.lineTo(-4, 6);
      c.lineTo(-18, 6);
      c.closePath();
      c.fill();
      label(c, "!", -11, 2.5, {
        size: 9,
        weight: 900,
        color: "#141414",
        align: "center",
        baseline: "middle",
      });
      c.fillStyle = "#c42020";
      c.fillRect(-1, -7, 17, 3);
      c.fillStyle = "#6d6f75";
      for (const [y, w] of [
        [-1, 16],
        [3, 12],
      ]) {
        c.fillRect(-1, y, w, 2);
      }
    },
    1,
  );
  ctx.restore();
  const leftMid = U((zones.left[0] + zones.left[1]) / 2);
  ctx.save();
  ctx.translate(leftMid, tube[0] + 26);
  ctx.rotate(-Math.PI / 2 + 0.2);
  sticker(
    ctx,
    0,
    0,
    0,
    (c, grow) => starburstPath(c, 0, 0, 15 + grow, 12, 0.8),
    (c) => {
      c.fillStyle = "#ff2a2a";
      starburstPath(c, 0, 0, 15, 12, 0.8);
      c.fill();
      label(c, "NEW", 0, -3, {
        size: 8,
        weight: 900,
        color: "#ffd23f",
        align: "center",
        baseline: "middle",
      });
      label(c, "AI", 0, 5, {
        size: 8,
        weight: 900,
        color: "#ffffff",
        align: "center",
        baseline: "middle",
      });
    },
    2,
  );
  ctx.restore();

  // Bottom: plain and darker, where the plinth hides it.
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(U(zones.bottom[0]), tube[0], W - U(zones.bottom[0]), tube[1] - tube[0]);
  ctx.fillRect(0, tube[0], U(zones.right[0]) * 0.5, tube[1] - tube[0]);

  const rand = rng(31);
  for (let i = 0; i < 260; i++) {
    const r = tube[0] + Math.floor((1 - rand() ** 2) * (tube[1] - tube[0]));
    ctx.fillStyle = DUST[Math.floor(rand() * DUST.length)];
    ctx.fillRect(Math.floor(rand() * W), r, rand() < 0.3 ? 2 : 1, 1);
  }
  quantize(canvas, 32);
  return canvas;
}

function paintTvBack() {
  const W = 128;
  const [x0, y0, x1, y1] = TV_BACK;
  const H = Math.round((W * (y1 - y0)) / (x1 - x0));
  const [canvas, ctx] = makeCanvas(W, H);
  const { S } = mapper(TV_BACK, W, H, true);
  ctx.fillStyle = "#56595f";
  ctx.fillRect(0, 0, W, H);
  roundRectPath(ctx, 2, 2, W - 4, H - 4, 0.24 * S);
  ctx.fillStyle = "#313338";
  ctx.fill();
  // Vent grid.
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 6; c++) {
      const x = 22 + c * 14;
      const y = 12 + r * 7;
      ctx.fillStyle = "#0f1012";
      ctx.fillRect(x, y, 10, 3);
      ctx.fillStyle = "#5a5d65";
      ctx.fillRect(x, y + 3, 10, 1);
    }
  }
  // Rating label with greeked lines and a QR block.
  bevelRect(ctx, 14, 52, 46, 26, "#e9e7df", "#ffffff", "#a9a69c");
  ctx.fillStyle = "#7c7a74";
  for (const [y, w] of [
    [56, 22],
    [60, 18],
    [64, 24],
    [68, 16],
    [72, 20],
  ]) {
    ctx.fillRect(17, y, w, 2);
  }
  const rand = rng(17);
  ctx.fillStyle = "#1a1a1c";
  ctx.fillRect(43, 56, 14, 14);
  ctx.fillStyle = "#e9e7df";
  for (let qy = 0; qy < 6; qy++) {
    for (let qx = 0; qx < 6; qx++) {
      if (rand() < 0.45) ctx.fillRect(44 + qx * 2, 57 + qy * 2, 2, 2);
    }
  }
  label(ctx, "AI", 50, 75, {
    size: 5,
    weight: 900,
    color: "#6b4dff",
    align: "center",
    baseline: "middle",
  });

  // Cross-slot screws with rust rings.
  for (const [x, y] of [
    [10, 10],
    [W - 11, 10],
    [10, H - 11],
    [W - 11, H - 11],
  ]) {
    crisp(ctx, (c) => {
      c.fillStyle = "#7a4a2a";
      c.beginPath();
      c.arc(x, y, 4, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#9da1a8";
      c.beginPath();
      c.arc(x, y, 3, 0, Math.PI * 2);
      c.fill();
    });
    ctx.fillStyle = "#2a2b2f";
    ctx.fillRect(x - 2, y, 5, 1);
    ctx.fillRect(x, y - 2, 1, 5);
  }
  // The coax port: a hex nut with a pin hole.
  crisp(ctx, (c) => {
    c.fillStyle = "#b9b2a0";
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      c.lineTo(96 + Math.cos(a) * 7, 64 + Math.sin(a) * 7);
    }
    c.closePath();
    c.fill();
    c.fillStyle = "#6f6a5e";
    c.beginPath();
    c.arc(96, 64, 4, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#151517";
    c.beginPath();
    c.arc(96, 64, 2, 0, Math.PI * 2);
    c.fill();
  });
  label(ctx, "ANT", 96, 78, {
    size: 6,
    weight: 900,
    color: "#8a8d94",
    align: "center",
    baseline: "middle",
  });
  specks(ctx, [6, 6, W - 12, H - 12], 60, DUST, 41);
  quantize(canvas, 32);
  return canvas;
}

// ---------------------------------------------------------------------------------------------
// Laptop

const ALU = "#b8bcc5";

function paintLaptopDeck() {
  const W = 192;
  const { w, d, well } = LAPTOP_BASE;
  const H = Math.round((W * d) / w);
  const [canvas, ctx] = makeCanvas(W, H);
  const { X, Y } = mapper([-w / 2, -d / 2, w / 2, d / 2], W, H);
  brushed(ctx, [0, 0, W, H], ALU, 0.035, 3);
  // Lit crest round the deck edge, just inside the chamfer.
  ctx.fillStyle = "#e3e6eb";
  ctx.fillRect(2, 2, W - 4, 1);
  ctx.fillRect(2, 2, 1, H - 4);
  ctx.fillStyle = "#9a9ea6";
  ctx.fillRect(2, H - 3, W - 4, 1);
  ctx.fillRect(W - 3, 2, 1, H - 4);

  const kx0 = Math.round(X(-well.w / 2));
  const kx1 = Math.round(X(well.w / 2));
  const ky0 = Math.round(Y(well.y + well.d / 2));
  const ky1 = Math.round(Y(well.y - well.d / 2));
  // The well: lit lip, black floor, keys.
  ctx.fillStyle = "#dfe2e7";
  ctx.fillRect(kx0 - 1, ky1, kx1 - kx0 + 2, 1);
  ctx.fillStyle = "#868a92";
  ctx.fillRect(kx0 - 1, ky0 - 1, kx1 - kx0 + 2, 1);
  ctx.fillStyle = "#121316";
  ctx.fillRect(kx0, ky0, kx1 - kx0, ky1 - ky0);

  // Keycaps lifted well off the well's black so the grid survives minification: a 2-texel lit top,
  // a 1-texel dark bottom.
  const keycap = (x: number, y: number, w: number, h: number, fill: string, light: string) => {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = light;
    ctx.fillRect(x, y, w, 2);
    ctx.fillStyle = "#2a2c31";
    ctx.fillRect(x, y + h - 1, w, 1);
  };
  const ROWS: [number, string?][][] = [
    [[1, "esc"], [1], [1], [1], [1], [1], [1], [1], [1], [1], [1], [1], [1], [1.5]],
    [[1.5, "PROMPT"], [1], [1], [1], [1], [1], [1], [1], [1], [1], [1], [1], [1], [1]],
    [[1.75], [1], [1], [1], [1], [1], [1], [1], [1], [1], [1], [1], [1.75, "ret"]],
    [[2.25], [1], [1], [1, "C"], [1, "V"], [1], [1], [1], [1], [1], [1], [2.25]],
    [[1], [1], [1], [1.25], [5, "space"], [1.25], [2, "AI"], [2, "arrows"]],
  ];
  const ix0 = kx0 + 2;
  const iy0 = ky0 + 2;
  const unit = (kx1 - kx0 - 4) / 14.5;
  const pitch = (ky1 - ky0 - 3) / ROWS.length;
  ROWS.forEach((row, r) => {
    let x = ix0;
    const y = Math.round(iy0 + r * pitch);
    const kh = Math.round(pitch) - 2;
    for (const [span, name] of row) {
      const kw = Math.round(span * unit) - 2;
      const kx = Math.round(x);
      if (name === "arrows") {
        const aw = Math.floor((kw - 2) / 3);
        for (let i = 0; i < 3; i++) {
          const ax = kx + i * (aw + 1);
          keycap(ax, y + Math.floor(kh / 2), aw, Math.ceil(kh / 2), "#50535b", "#767a84");
        }
        keycap(kx + aw + 1, y, aw, Math.floor(kh / 2) - 1, "#50535b", "#767a84");
      } else if (name === "AI") {
        crisp(ctx, (c) => {
          c.fillStyle = "#ffffff";
          c.fillRect(kx - 1, y - 1, kw + 2, kh + 2);
        });
        bevelRect(ctx, kx, y, kw, kh, "#9d8cff", "#c9beff", "#6b4dff");
        sparkle(ctx, kx + kw / 2, y + kh / 2, 3.2, ["#ffffff", "#ece7ff"], "#4b31c9");
      } else if (name === "PROMPT") {
        bevelRect(ctx, kx, y, kw, kh, "#45d4ff", "#a6ecff", "#1c8db3");
        ctx.fillStyle = "#0d4a60";
        ctx.fillRect(kx + 3, y + 3, kw - 6, 2);
      } else {
        // Cmd-C and Cmd-V are worn shiny.
        const worn = name === "C" || name === "V";
        keycap(kx, y, kw, kh, worn ? "#7a7e88" : "#50535b", worn ? "#a3a7b1" : "#767a84");
        if (name === "space") {
          // Thumb-polished in the middle.
          ctx.fillStyle = "#62666f";
          ctx.fillRect(kx + kw / 2 - 8, y + 2, 16, kh - 3);
        }
      }
      x += span * unit;
    }
  });

  // Speaker dots either side of the well.
  for (const sx of [5, W - 9]) {
    for (let y = ky0 + 1; y < ky1 - 1; y += 4) {
      ctx.fillStyle = "#3c3f46";
      ctx.fillRect(sx, y, 2, 2);
      ctx.fillRect(sx + 3, y + 2, 2, 2);
    }
  }

  // Palm rest: trackpad, palm grease, the AI INSIDE sticker.
  const tw = 62;
  const th = 34;
  const tx = Math.round(W / 2 - tw / 2);
  const ty = Math.round((ky1 + H) / 2 - th / 2);
  ctx.fillStyle = "#8b8f97";
  ctx.fillRect(tx - 1, ty - 1, tw + 2, th + 2);
  ctx.fillStyle = "#adb1ba";
  ctx.fillRect(tx, ty, tw, th);
  ctx.fillStyle = "#d9dce2";
  ctx.fillRect(tx, ty + th, tw, 1);
  sticker(
    ctx,
    W - 26,
    H - 18,
    0.06,
    (c, grow) => roundRectPath(c, -11 - grow, -8 - grow, 22 + grow * 2, 16 + grow * 2, 2 + grow),
    (c) => {
      c.fillStyle = "#6b4dff";
      c.fillRect(-11, -8, 22, 16);
      c.fillStyle = "#8f78ff";
      c.fillRect(-11, -8, 22, 2);
      sparkle(c, -5, 0, 4.5, ["#ffffff", "#d9d2ff"], "#2a1a7a");
      label(c, "AI", 5, 0.5, {
        size: 8,
        weight: 900,
        color: "#ffffff",
        align: "center",
        baseline: "middle",
      });
    },
    1,
  );
  specks(ctx, [3, ky1 + 2, W - 6, H - ky1 - 5], 30, ["#8f8a82", "#9d9890"], 13);
  quantize(canvas, 48);
  return canvas;
}

function paintLaptopBody() {
  const { w: W, h: H } = LAPTOP_ALU;
  const [canvas, ctx] = makeCanvas(W, H);
  const U = LAPTOP_ALU.underside[1];
  const { w, d } = LAPTOP_BASE;
  const { X, Y } = mapper([-w / 2, -d / 2, w / 2, d / 2], W, U, true);
  brushed(ctx, [0, 0, W, U], "#a8acb5", 0.03, 5);
  // Lit crest round the underside.
  ctx.fillStyle = "#d3d6dc";
  ctx.strokeStyle = "#d3d6dc";
  ctx.lineWidth = 1;
  ctx.strokeRect(2.5, 2.5, W - 5, U - 5);
  // Vents near the back (canvas top), rubber-foot AO pads, screws, a regulatory block.
  for (const r of [10, 17]) {
    for (let x = 42; x + 14 <= W - 40; x += 18) {
      ctx.fillStyle = "#2e3137";
      ctx.fillRect(x, r, 14, 3);
      ctx.fillStyle = "#cdd0d6";
      ctx.fillRect(x, r + 3, 14, 1);
    }
  }
  for (const [fx, fz] of LAPTOP_FEET) {
    // Loft y is world -z.
    const cx = X(fx);
    const cy = Y(-fz);
    ctx.fillStyle = "#7b7f87";
    ctx.fillRect(Math.round(cx - 13 - 2), Math.round(cy - 7 - 2), 30, 18);
  }
  for (const [sx, sy] of [
    [8, 30],
    [W - 9, 30],
    [8, U - 10],
    [W - 9, U - 10],
    [W / 2, U - 8],
  ]) {
    crisp(ctx, (c) => {
      c.fillStyle = "#6d7179";
      c.beginPath();
      c.arc(sx, sy, 2.5, 0, Math.PI * 2);
      c.fill();
    });
    ctx.fillStyle = "#cfd2d8";
    ctx.fillRect(Math.round(sx) - 1, sy - 1, 1, 1);
  }
  label(ctx, "SlopBook", W / 2, 62, {
    size: 9,
    weight: 900,
    color: "#80848d",
    align: "center",
    baseline: "middle",
  });
  ctx.fillStyle = "#8d919a";
  for (const [y, lw] of [
    [72, 70],
    [77, 54],
    [82, 62],
  ]) {
    ctx.fillRect(Math.round(W / 2 - lw / 2), y, lw, 2);
  }

  // Edge bands below the underside, one row band per loft band.
  const band = (
    [r0, r1]: readonly [number, number],
    color: string,
    top?: string,
    bottom?: string,
  ) => {
    brushed(ctx, [0, r0, W, r1 - r0], color, 0.03, r0);
    if (top) {
      ctx.fillStyle = top;
      ctx.fillRect(0, r0, W, 1);
    }
    if (bottom) {
      ctx.fillStyle = bottom;
      ctx.fillRect(0, r1 - 1, W, 1);
    }
  };
  const A = LAPTOP_ALU;
  band(A.baseChamfer, "#cdd1d8", "#eef0f3");
  band(A.baseWall, "#b2b6bf", "#c9ccd3", "#8f939b");
  band(A.baseFoot, "#8e929a", "#9da1a9", "#6c7078");
  // The lid's front chamfer is glossy bezel black, part of the screen border, with one dim crest
  // row where it turns into the wall; only the back chamfer carries a light crest.
  ctx.fillStyle = "#16171b";
  ctx.fillRect(0, A.lidRim[0], W, A.lidRim[1] - A.lidRim[0]);
  ctx.fillStyle = "#3a3c42";
  ctx.fillRect(0, A.lidRim[1] - 1, W, 1);
  band(A.lidWall, "#8e929b", undefined, "#7a7e87");
  band(A.lidBack, "#c3c7ce", undefined, "#e2e5ea");
  quantize(canvas, 32);
  return canvas;
}

function paintLaptopLid() {
  const W = 192;
  const { w, h } = LAPTOP_LID;
  const H = Math.round((W * h) / w);
  const [canvas, ctx] = makeCanvas(W, H);
  brushed(ctx, [0, 0, W, H], ALU, 0.035, 9);
  // Hard-stepped crest ring, and AO along the hinge end (canvas bottom is the hinge).
  ctx.fillStyle = "#dcdfe4";
  ctx.fillRect(2, 2, W - 4, 2);
  ctx.fillRect(2, 2, 2, H - 4);
  ctx.fillRect(W - 4, 2, 2, H - 4);
  ctx.fillRect(2, H - 4, W - 4, 2);
  ctx.fillStyle = "#8e929a";
  ctx.fillRect(4, H - 6, W - 8, 2);

  // The slop signature: a hard two-tone chrome split with a dark outline, big enough to carry.
  sparkle(ctx, W / 2, H / 2, 18, ["#f4f5f8", "#5d6068"], "#1a1b1f");

  // Die-cut slop stickers. VIBE CODER is peeling at one corner.
  sticker(
    ctx,
    46,
    22,
    -0.1,
    (c, g) => roundRectPath(c, -33 - g, -9 - g, 66 + g * 2, 18 + g * 2, 3 + g),
    (c) => {
      c.fillStyle = "#ff4fb8";
      roundRectPath(c, -33, -9, 66, 18, 3);
      c.fill();
      label(c, "VIBE CODER", 0, 1, {
        size: 11,
        weight: 900,
        color: "#ffffff",
        align: "center",
        baseline: "middle",
        maxW: 60,
      });
      c.fillStyle = "#f6dcec";
      c.beginPath();
      c.moveTo(35, -11);
      c.lineTo(35, -1);
      c.lineTo(25, -11);
      c.closePath();
      c.fill();
      c.fillStyle = "#a83a7a";
      c.fillRect(25, -11, 10, 1);
    },
  );
  sticker(
    ctx,
    160,
    24,
    0.22,
    (c, g) => {
      starburstPath(c, 0, 0, 15 + g, 10, 0.8);
    },
    (c) => {
      c.fillStyle = "#ffd23f";
      starburstPath(c, 0, 0, 15, 10, 0.8);
      c.fill();
      label(c, "10x", 0, 1, {
        size: 12,
        weight: 900,
        color: "#141414",
        align: "center",
        baseline: "middle",
      });
    },
  );
  sticker(
    ctx,
    44,
    86,
    0.07,
    (c, g) => roundRectPath(c, -30 - g, -14 - g, 60 + g * 2, 28 + g * 2, 4 + g),
    (c) => {
      c.fillStyle = "#45d4ff";
      roundRectPath(c, -30, -14, 60, 28, 4);
      c.fill();
      label(c, "PROMPT", 0, -5, {
        size: 10,
        weight: 900,
        color: "#0b2f3d",
        align: "center",
        baseline: "middle",
        maxW: 54,
      });
      label(c, "ENGINEER", 0, 6, {
        size: 10,
        weight: 900,
        color: "#0b2f3d",
        align: "center",
        baseline: "middle",
        maxW: 54,
      });
    },
  );
  sticker(
    ctx,
    152,
    88,
    -0.09,
    (c, g) => roundRectPath(c, -28 - g, -9 - g, 56 + g * 2, 18 + g * 2, 2 + g),
    (c) => {
      c.fillStyle = "#121214";
      c.fillRect(-28, -9, 56, 18);
      label(c, "AGI SOON", 0, 1, {
        size: 11,
        weight: 900,
        color: "#ffffff",
        align: "center",
        baseline: "middle",
        maxW: 52,
      });
    },
  );
  const rocket = (c: Ctx) => {
    c.beginPath();
    c.moveTo(0, -13);
    c.quadraticCurveTo(6, -6, 5, 6);
    c.lineTo(-5, 6);
    c.quadraticCurveTo(-6, -6, 0, -13);
    c.closePath();
  };
  sticker(
    ctx,
    132,
    52,
    0.5,
    (c, g) => {
      rocket(c);
      c.lineWidth = g * 2;
      c.lineJoin = "round";
      c.strokeStyle = c.fillStyle;
      c.stroke();
      c.fill();
      c.beginPath();
      c.rect(-9 - g, 0 - g, 18 + g * 2, 9 + g * 2);
    },
    (c) => {
      c.fillStyle = "#ff2a2a";
      c.beginPath();
      c.moveTo(-5, 1);
      c.lineTo(-9, 9);
      c.lineTo(-4, 6);
      c.closePath();
      c.moveTo(5, 1);
      c.lineTo(9, 9);
      c.lineTo(4, 6);
      c.closePath();
      c.fill();
      c.fillStyle = "#eef0f4";
      rocket(c);
      c.fill();
      c.fillStyle = "#3d7bff";
      c.beginPath();
      c.arc(0, -4, 2.5, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#ffd23f";
      c.fillRect(-3, 6, 6, 3);
    },
  );
  specks(ctx, [6, 6, W - 12, H - 12], 40, ["#9b968e", "#8a857d"], 23);
  quantize(canvas, 64);
  return canvas;
}

// ---------------------------------------------------------------------------------------------
// Phone case

const LILAC = "#9d8cff";

function paintPhoneBack() {
  const W = 128;
  const [x0, y0, x1, y1] = PHONE_BACK;
  const H = Math.round((W * (y1 - y0)) / (x1 - x0));
  const [canvas, ctx] = makeCanvas(W, H);
  const { X, Y, S } = mapper(PHONE_BACK, W, H, true);
  // Silicone: two flat tone steps toward the shoulders.
  ctx.fillStyle = tone(LILAC, -0.16);
  ctx.fillRect(0, 0, W, H);
  roundRectPath(ctx, 2, 2, W - 4, H - 4, 0.27 * S);
  ctx.fillStyle = tone(LILAC, -0.07);
  ctx.fill();
  roundRectPath(ctx, 6, 6, W - 12, H - 12, 0.22 * S);
  ctx.fillStyle = LILAC;
  ctx.fill();

  // AO round the camera bump and the PopSocket.
  const half = (PHONE_BUMP.size / 2) * S;
  crisp(ctx, (c) => {
    roundRectPath(
      c,
      X(PHONE_BUMP.x) - half - 2,
      Y(PHONE_BUMP.y) - half - 2,
      half * 2 + 4,
      half * 2 + 4,
      0.14 * S + 2,
    );
    c.fillStyle = "#6a59d0";
    c.fill();
  });
  crisp(ctx, (c) => {
    c.fillStyle = "#6a59d0";
    c.beginPath();
    c.arc(X(POPSOCKET.x), Y(POPSOCKET.y), 0.34 * S + 2.5, 0, Math.PI * 2);
    c.fill();
  });

  sticker(
    ctx,
    W / 2,
    Y(-1.02),
    -0.06,
    (c, g) => roundRectPath(c, -36 - g, -15 - g, 72 + g * 2, 30 + g * 2, 3 + g),
    (c) => {
      c.fillStyle = "#121214";
      roundRectPath(c, -36, -15, 72, 30, 3);
      c.fill();
      label(c, "AI-FIRST", 0, -5, {
        size: 13,
        weight: 900,
        color: "#ffd23f",
        align: "center",
        baseline: "middle",
        maxW: 66,
      });
      label(c, "FOUNDER", 0, 7, {
        size: 13,
        weight: 900,
        color: "#ffffff",
        align: "center",
        baseline: "middle",
        maxW: 66,
      });
    },
  );
  sticker(
    ctx,
    X(-0.42),
    Y(1.12),
    0.25,
    (c, g) => starburstPath(c, 0, 0, 14 + g, 10, 0.8),
    (c) => {
      c.fillStyle = "#ffd23f";
      starburstPath(c, 0, 0, 14, 10, 0.8);
      c.fill();
      label(c, "10x", 0, 1, {
        size: 11,
        weight: 900,
        color: "#141414",
        align: "center",
        baseline: "middle",
      });
    },
  );
  specks(ctx, [8, 8, W - 16, H - 16], 40, ["#b8adff", "#7f6ee6", "#8a7a6a"], 61);
  quantize(canvas, 32);
  return canvas;
}

function paintPhoneRail() {
  const { w: W, h: H } = PHONE_RAIL;
  const [canvas, ctx] = makeCanvas(W, H);
  const band = ([r0, r1]: readonly [number, number], color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, r0, W, r1 - r0);
  };
  const row = (r: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, r, W, 1);
  };
  const R = PHONE_RAIL;
  band(R.lip, "#7d6ddf");
  row(R.lip[0], "#241d40");
  row(R.lip[0] + 1, "#3b3170");
  band(R.rise, "#8e7ef0");
  row(R.rise[1] - 1, "#c4baff");
  band(R.crest, "#a493ff");
  row(R.crest[0], "#f3f0ff");
  row(R.crest[0] + 1, "#cfc6ff");
  band(R.shoulder, "#9a89fb");
  row(R.shoulder[1] - 1, "#8574ea");
  band(R.wall, "#9381f6");
  band(R.back, "#8b7aee");
  row(R.back[0], "#b9afff");

  const { buttons, port } = phoneRailZones();
  for (const [a, b] of buttons) {
    ctx.fillStyle = "#5b4dbd";
    ctx.fillRect(
      Math.round(a * W) - 2,
      R.wall[0] + 1,
      Math.round((b - a) * W) + 4,
      R.wall[1] - R.wall[0] - 2,
    );
  }
  crisp(ctx, (c) => {
    c.fillStyle = "#17121f";
    roundRectPath(c, port * W - 8, R.wall[0] + 4, 16, 6, 3);
    c.fill();
  });
  specks(ctx, [0, R.wall[0], W, R.back[1] - R.wall[0]], 50, ["#7a6ad8", "#b2a6ff"], 71);
  quantize(canvas, 24);
  return canvas;
}

// ---------------------------------------------------------------------------------------------
// Trim sheet: 4 x 4 swatches of 64 texels, each with a baked lit top/left and dark bottom/right.

function paintTrim() {
  const S = TRIM_SIZE;
  const C = S / 4;
  const [canvas, ctx] = makeCanvas(S, S);
  const cell = (
    index: number,
    paint: (x: number, y: number) => void,
    edges: [string, string] | null,
  ) => {
    const x = (index % 4) * C;
    const y = Math.floor(index / 4) * C;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, C, C);
    ctx.clip();
    paint(x, y);
    if (edges) {
      ctx.fillStyle = edges[0];
      ctx.fillRect(x, y, C, 2);
      ctx.fillRect(x, y, 2, C);
      ctx.fillStyle = edges[1];
      ctx.fillRect(x, y + C - 2, C, 2);
      ctx.fillRect(x + C - 2, y, 2, C);
    }
    ctx.restore();
  };
  const flat = (color: string) => (x: number, y: number) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, C, C);
  };
  const disc = (x: number, y: number, r: number, color: string) =>
    crisp(ctx, (c) => {
      c.fillStyle = color;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    });

  cell(
    TRIM.rubber,
    (x, y) => {
      flat("#202124")(x, y);
      specks(ctx, [x, y, C, C], 40, ["#2c2d31", "#17181a"], 3);
    },
    ["#36383d", "#121214"],
  );
  // Chrome: a posterised horizon reflection.
  cell(
    TRIM.chrome,
    (x, y) => {
      const bands: [number, string][] = [
        [0, "#f2f4f8"],
        [0.3, "#c9ced7"],
        [0.48, "#5d626c"],
        [0.6, "#2c2f35"],
        [0.75, "#8c929d"],
        [0.9, "#d7dbe2"],
      ];
      bands.forEach(([t, color], i) => {
        const next = bands[i + 1]?.[0] ?? 1;
        ctx.fillStyle = color;
        ctx.fillRect(x, y + Math.round(t * C), C, Math.ceil((next - t) * C));
      });
    },
    ["#ffffff", "#3a3d44"],
  );
  cell(TRIM.steel, (x, y) => brushed(ctx, [x, y, C, C], "#8f949d", 0.06, 11), [
    "#c4c8cf",
    "#5c6068",
  ]);
  cell(TRIM.graphite, flat("#3c3e44"), ["#62656d", "#222327"]);
  // The channel dial's face: a ridged rim, a lit domed centre, a white pointer.
  cell(
    TRIM.knobFace,
    (x, y) => {
      const cx = x + C / 2;
      const cy = y + C / 2;
      flat("#2f3136")(x, y);
      crisp(ctx, (c) => {
        c.beginPath();
        c.rect(x, y, C, C);
        c.clip();
        for (let i = 0; i < 20; i++) {
          c.fillStyle = i % 2 ? "#26282c" : "#55585f";
          c.beginPath();
          c.moveTo(cx, cy);
          c.arc(cx, cy, C, (i / 20) * Math.PI * 2, ((i + 1) / 20) * Math.PI * 2);
          c.closePath();
          c.fill();
        }
      });
      disc(cx, cy, C * 0.34, "#1c1d20");
      disc(cx, cy, C * 0.3, "#6a6e77");
      crisp(ctx, (c) => {
        c.fillStyle = "#9da2ac";
        c.beginPath();
        c.arc(cx, cy, C * 0.3, Math.PI * 0.75, Math.PI * 1.75);
        c.closePath();
        c.fill();
      });
      ctx.fillStyle = "#f4f4f2";
      ctx.fillRect(cx - 2, y + 4, 4, C / 2 - 6);
      ctx.fillStyle = "#ff3b30";
      ctx.fillRect(cx - 2, y + 4, 4, 4);
    },
    null,
  );
  cell(
    TRIM.knurl,
    (x, y) => {
      for (let i = 0; i < C; i += 4) {
        ctx.fillStyle = "#4a4d54";
        ctx.fillRect(x + i, y, 2, C);
        ctx.fillStyle = "#24262a";
        ctx.fillRect(x + i + 2, y, 2, C);
      }
      // A side band's v runs front (0, the cell's bottom) to back: the lit crest is at the bottom.
      ctx.fillStyle = "#16171a";
      ctx.fillRect(x, y, C, 3);
      ctx.fillStyle = "#7a7e87";
      ctx.fillRect(x, y + C - 3, C, 3);
    },
    null,
  );
  // Camera lens: a chrome ring, black glass, a violet coating ring and a hard glint.
  cell(
    TRIM.lens,
    (x, y) => {
      const cx = x + C / 2;
      const cy = y + C / 2;
      flat("#1a1b1f")(x, y);
      disc(cx, cy, C * 0.47, "#9aa0aa");
      disc(cx, cy, C * 0.4, "#060608");
      crisp(ctx, (c) => {
        c.strokeStyle = "#3b3a8a";
        c.lineWidth = 3;
        c.beginPath();
        c.arc(cx, cy, C * 0.24, 0, Math.PI * 2);
        c.stroke();
      });
      disc(cx, cy, C * 0.12, "#121228");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(Math.round(cx - C * 0.22), Math.round(cy - C * 0.24), 7, 7);
      ctx.fillRect(Math.round(cx + C * 0.12), Math.round(cy + C * 0.1), 3, 3);
    },
    null,
  );
  // Holographic foil with a sparkle: the PopSocket cap.
  cell(
    TRIM.holo,
    (x, y) => {
      const colours = ["#ff9ad5", "#c084fc", "#7dd3fc", "#86efac", "#fde68a"];
      for (let i = -6; i < 10; i++) {
        ctx.fillStyle = colours[(i + 10) % colours.length];
        ctx.beginPath();
        ctx.moveTo(x + i * 10, y + C);
        ctx.lineTo(x + i * 10 + 10, y + C);
        ctx.lineTo(x + i * 10 + 10 + C, y);
        ctx.lineTo(x + i * 10 + C, y);
        ctx.closePath();
        ctx.fill();
      }
      sparkle(ctx, x + C / 2, y + C / 2, 18, ["#ffffff", "#e9e3ff"], "#4b31c9", 0.32);
    },
    null,
  );
  cell(TRIM.lilac, flat(LILAC), ["#c2b8ff", "#6f5edb"]);
  // Glossy AI-violet plastic: the dongle's body, a hard glint band across it.
  cell(
    TRIM.violet,
    (x, y) => {
      flat("#6b4dff")(x, y);
      ctx.fillStyle = "#8a72ff";
      ctx.fillRect(x, y + 12, C, 6);
      ctx.fillStyle = "#5238d6";
      ctx.fillRect(x, y + C - 16, C, 8);
    },
    ["#b3a4ff", "#2f1f8f"],
  );
  // The camera bump's top: a lilac rim round black glass, a flash and a mic hole.
  cell(
    TRIM.camPlate,
    (x, y) => {
      flat(LILAC)(x, y);
      ctx.fillStyle = "#c2b8ff";
      ctx.fillRect(x, y, C, 2);
      ctx.fillRect(x, y, 2, C);
      ctx.fillStyle = "#6f5edb";
      ctx.fillRect(x, y + C - 2, C, 2);
      ctx.fillRect(x + C - 2, y, 2, C);
      crisp(ctx, (c) => {
        c.fillStyle = "#141519";
        roundRectPath(c, x + 6, y + 6, C - 12, C - 12, 10);
        c.fill();
      });
      ctx.fillStyle = "#2c2e35";
      ctx.fillRect(x + 8, y + 8, C - 16, 1);
      disc(x + C * 0.7, y + C * 0.27, 6, "#5a5340");
      disc(x + C * 0.7, y + C * 0.27, 4.5, "#fff3c4");
      disc(x + C * 0.7, y + C * 0.73, 2, "#050506");
    },
    null,
  );
  // The hinge barrel: graphite with chrome end rings (v runs along the barrel).
  cell(
    TRIM.hinge,
    (x, y) => {
      flat("#2f3136")(x, y);
      ctx.fillStyle = "#4a4d54";
      ctx.fillRect(x, y + 4, C, C - 8);
      for (const r of [5, C - 9]) {
        ctx.fillStyle = "#c9ced7";
        ctx.fillRect(x, y + r, C, 3);
        ctx.fillStyle = "#5d626c";
        ctx.fillRect(x, y + r + 3, C, 1);
      }
    },
    null,
  );
  cell(
    TRIM.antennaBase,
    (x, y) => {
      flat("#383a40")(x, y);
      ctx.fillStyle = "#666a73";
      ctx.fillRect(x, y, C, 3);
      ctx.fillStyle = "#24262a";
      ctx.fillRect(x, y + C - 4, C, 4);
      specks(ctx, [x, y + C / 2, C, C / 2], 20, DUST, 5);
    },
    null,
  );
  // The volume knob's face: a concave silver dish with a pointer dot.
  cell(
    TRIM.knobSmall,
    (x, y) => {
      const cx = x + C / 2;
      const cy = y + C / 2;
      flat("#4a4d54")(x, y);
      disc(cx, cy, C * 0.42, "#2a2c31");
      disc(cx, cy, C * 0.36, "#8e939c");
      crisp(ctx, (c) => {
        c.fillStyle = "#5f636c";
        c.beginPath();
        c.arc(cx, cy, C * 0.36, Math.PI * 0.75, Math.PI * 1.75);
        c.closePath();
        c.fill();
      });
      disc(cx + C * 0.18, cy - C * 0.18, 4, "#f4f4f2");
    },
    null,
  );
  cell(
    TRIM.popGrip,
    (x, y) => {
      flat("#2a2b31")(x, y);
      ctx.fillStyle = "#4b4d55";
      ctx.fillRect(x, y + 6, C, 4);
    },
    ["#4b4d55", "#16171a"],
  );
  cell(
    TRIM.glass,
    (x, y) => {
      flat("#101114")(x, y);
      crisp(
        ctx,
        (c) => {
          c.fillStyle = "#ffffff";
          c.beginPath();
          c.moveTo(x + 10, y);
          c.lineTo(x + 24, y);
          c.lineTo(x, y + 24);
          c.lineTo(x, y + 10);
          c.closePath();
          c.fill();
        },
        0.16,
      );
    },
    ["#2c2e34", "#050506"],
  );
  quantize(canvas, 64);
  return canvas;
}

// ---------------------------------------------------------------------------------------------
// Cut faces, tileable both ways: few big outlined parts, no micro detail.

const OUTLINE = "#0b0b0d";

function paintCutCrt(seed: number) {
  const S = 256;
  const [canvas, ctx] = makeCanvas(S, S);
  // Graphite, not black: on the dark page a black cavity would read as a hole in the prop.
  ctx.fillStyle = "#2c2e34";
  ctx.fillRect(0, 0, S, S);
  const rand = rng(seed);
  for (let i = 0; i < 9; i++) {
    const [x, y] = [rand() * S, rand() * S];
    const shade = rand() < 0.5 ? "#282a2f" : "#303238";
    const [w, h] = [30 + rand() * 50, 20 + rand() * 40];
    wrapped(ctx, () => {
      ctx.fillStyle = shade;
      ctx.fillRect(x, y, w, h);
    });
  }
  // Steel chassis bars and a shield plate the parts sit on, lit top-left, outlined hard.
  for (const [x, y, w, h] of [
    [-20, 96, 150, 26],
    [96, 140, 26, 116],
    [150, 74, 92, 40],
  ]) {
    wrapped(ctx, () => {
      ctx.fillStyle = "#101012";
      ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
      bevelRect(ctx, x, y, w, h, "#4a4c52", "#6c6f77", "#3a3c41");
      ctx.fillStyle = "#2a2b30";
      for (let sx = x + 8; sx < x + w - 6; sx += 22) ctx.fillRect(sx, y + h / 2 - 2, 4, 4);
    });
  }
  const ring = (c: Ctx, x: number, y: number, r: number, w: number, color: string) => {
    c.strokeStyle = color;
    c.lineWidth = w;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.stroke();
  };
  const stamp = (paint: (c: Ctx) => void) => crisp(ctx, (c) => wrapped(c, () => paint(c), [S, S]));

  // Deflection yoke round the tube neck: copper windings in four bands, lit upper left.
  const [yx, yy] = [72, 76];
  stamp((c) => ring(c, yx, yy, 31, 22, OUTLINE));
  const coppers = ["#b35f27", "#d98a45", "#a9531f", "#cf7a37"];
  coppers.forEach((color, i) => stamp((c) => ring(c, yx, yy, 22 + i * 5, 5, color)));
  coppers.forEach((_, i) =>
    stamp((c) => {
      c.strokeStyle = "#f6b77c";
      c.lineWidth = 2;
      c.beginPath();
      c.arc(yx, yy, 21 + i * 5, Math.PI * 1.05, Math.PI * 1.5);
      c.stroke();
    }),
  );
  stamp((c) => {
    c.fillStyle = OUTLINE;
    c.beginPath();
    c.arc(yx, yy, 20, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#6e4a1a";
    c.beginPath();
    c.arc(yx, yy, 17, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#b9862e";
    c.beginPath();
    c.arc(yx, yy, 17, Math.PI * 1.0, Math.PI * 1.45);
    c.lineTo(yx, yy);
    c.fill();
  });

  // A green PCB slab with ICs and fat traces.
  ctx.save();
  wrapped(ctx, () => {
    ctx.save();
    ctx.translate(166, 178);
    ctx.rotate(-0.18);
    crisp(
      ctx,
      (c) => {
        c.fillStyle = OUTLINE;
        c.fillRect(-54, -24, 108, 48);
      },
      1,
      [-56, -26, 112, 52],
    );
    ctx.fillStyle = "#2e7d3a";
    ctx.fillRect(-52, -22, 104, 44);
    ctx.fillStyle = "#4fa65a";
    ctx.fillRect(-52, -22, 104, 2);
    ctx.fillStyle = "#1c5525";
    ctx.fillRect(-52, 20, 104, 2);
    ctx.fillStyle = "#c9a640";
    for (const [x, y, w, h] of [
      [-46, -10, 40, 2],
      [-8, -10, 2, 22],
      [-8, 10, 50, 2],
      [20, -16, 2, 26],
      [-40, 6, 2, 12],
      [-40, 16, 30, 2],
    ]) {
      ctx.fillRect(x, y, w, h);
    }
    for (const [x, y] of [
      [-44, -18],
      [-26, -18],
      [0, -18],
      [26, -6],
      [-30, 0],
      [4, 0],
      [30, 12],
    ]) {
      ctx.fillStyle = "#d9dce2";
      for (let k = 0; k < 4; k++) {
        ctx.fillRect(x + 1 + k * 3, y - 2, 1, 2);
        ctx.fillRect(x + 1 + k * 3, y + 8, 1, 2);
      }
      bevelRect(ctx, x, y, 13, 8, "#1b1c1f", "#3c3e44", "#0a0a0b");
    }
    ctx.restore();
  });
  ctx.restore();

  // The flyback transformer: a grey block with a red HV cap.
  wrapped(ctx, () => {
    crisp(
      ctx,
      (c) => {
        c.fillStyle = OUTLINE;
        roundRectPath(c, 178, 34, 40, 36, 5);
        c.fill();
      },
      1,
      [176, 32, 44, 40],
    );
    bevelRect(ctx, 180, 36, 36, 32, "#6f737b", "#a3a7af", "#45484e", 2);
    crisp(
      ctx,
      (c) => {
        c.fillStyle = OUTLINE;
        c.beginPath();
        c.arc(198, 52, 10, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = "#a3262a";
        c.beginPath();
        c.arc(198, 52, 8, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = "#e0565a";
        c.beginPath();
        c.arc(198, 52, 8, Math.PI, Math.PI * 1.5);
        c.lineTo(198, 52);
        c.fill();
      },
      1,
      [186, 40, 24, 24],
    );
  });

  // A fat red/black wire pair.
  const wire = (dx: number, color: string, light: string) =>
    stamp((c) => {
      c.lineCap = "round";
      const path = () => {
        c.beginPath();
        c.moveTo(14 + dx, 236);
        c.bezierCurveTo(40 + dx, 170, 110 + dx, 200, 128 + dx, 136);
      };
      path();
      c.lineWidth = 7;
      c.strokeStyle = OUTLINE;
      c.stroke();
      path();
      c.lineWidth = 4;
      c.strokeStyle = color;
      c.stroke();
      c.translate(-1, -1);
      path();
      c.lineWidth = 1;
      c.strokeStyle = light;
      c.stroke();
    });
  wire(0, "#d32a22", "#ff8a7a");
  wire(7, "#26272b", "#5a5d64");

  // Two blue-sleeved capacitors.
  for (const [x, y] of [
    [222, 118],
    [238, 140],
  ]) {
    stamp((c) => {
      c.fillStyle = OUTLINE;
      c.beginPath();
      c.arc(x, y, 8, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#2f5fd0";
      c.beginPath();
      c.arc(x, y, 6.5, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#c9ced7";
      c.beginPath();
      c.arc(x, y, 3.5, 0, Math.PI * 2);
      c.fill();
    });
    ctx.fillStyle = "#6d7179";
    ctx.fillRect(x - 3, y, 7, 1);
  }

  // An arc of amber funnel glass.
  stamp((c) => {
    c.lineWidth = 9;
    c.strokeStyle = OUTLINE;
    c.beginPath();
    c.arc(40, 200, 46, -0.6, 0.9);
    c.stroke();
    c.lineWidth = 6;
    c.strokeStyle = "#c27f2c";
    c.stroke();
    c.lineWidth = 2;
    c.strokeStyle = "#f2c070";
    c.beginPath();
    c.arc(40, 200, 48, -0.5, 0.4);
    c.stroke();
  });

  // An aluminium heat sink, fins as hard light/dark stripes.
  stamp((c) => {
    c.fillStyle = OUTLINE;
    c.fillRect(118, 102, 44, 32);
    c.fillStyle = "#7d828b";
    c.fillRect(120, 104, 40, 28);
    for (let x = 122; x < 158; x += 6) {
      c.fillStyle = "#c3c8d0";
      c.fillRect(x, 104, 2, 28);
      c.fillStyle = "#4b4f57";
      c.fillRect(x + 2, 104, 1, 28);
    }
  });
  // The power transformer: a laminated iron block round a copper winding.
  stamp((c) => {
    c.fillStyle = OUTLINE;
    c.fillRect(6, 126, 32, 28);
    c.fillStyle = "#5b5e64";
    c.fillRect(8, 128, 28, 24);
    for (let y = 130; y < 152; y += 3) {
      c.fillStyle = "#3e4146";
      c.fillRect(8, y, 28, 1);
    }
    c.fillStyle = OUTLINE;
    c.fillRect(14, 132, 16, 16);
    c.fillStyle = "#c8702f";
    c.fillRect(15, 133, 14, 14);
    c.fillStyle = "#f2a965";
    c.fillRect(15, 133, 14, 2);
  });
  // The speaker magnet, half off the tile edge so it wraps.
  stamp((c) => {
    c.fillStyle = OUTLINE;
    c.beginPath();
    c.arc(232, 238, 19, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#3a3c42";
    c.beginPath();
    c.arc(232, 238, 17, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#6a6e77";
    c.beginPath();
    c.arc(232, 238, 17, Math.PI, Math.PI * 1.5);
    c.lineTo(232, 238);
    c.fill();
    c.fillStyle = OUTLINE;
    c.beginPath();
    c.arc(232, 238, 6, 0, Math.PI * 2);
    c.fill();
  });
  // A grey ribbon cable across the top edge, wrapping to the bottom.
  stamp((c) => {
    c.save();
    c.translate(118, 8);
    c.rotate(0.35);
    c.fillStyle = OUTLINE;
    c.fillRect(-30, -7, 60, 14);
    ["#9ea3ab", "#c9ccd2", "#9ea3ab", "#d33a2c", "#9ea3ab"].forEach((color, i) => {
      c.fillStyle = color;
      c.fillRect(-30, -5 + i * 2, 60, 2);
    });
    c.restore();
  });
  quantize(canvas, 48);
  return canvas;
}

// A laptop's guts for its thin lid and base caps: graphite chassis, two green boards, one silver
// battery pouch band and the near-black keyboard layer. Big blocks only, so a 0.1-thick strip
// still lands on something readable.
function paintCutLaptop(seed: number) {
  const S = 256;
  const [canvas, ctx] = makeCanvas(S, S);
  const rand = rng(seed);
  ctx.fillStyle = "#2c2e34";
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 7; i++) {
    const [x, y] = [rand() * S, rand() * S];
    const shade = rand() < 0.5 ? "#282a2f" : "#313339";
    const [w, h] = [40 + rand() * 50, 24 + rand() * 30];
    wrapped(ctx, () => {
      ctx.fillStyle = shade;
      ctx.fillRect(x, y, w, h);
    });
  }

  // Battery pouch cells across the tile, seams every 64 texels.
  const [by, bh] = [104, 40];
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(0, by - 1, S, bh + 2);
  ctx.fillStyle = "#c9ccd3";
  ctx.fillRect(0, by, S, bh);
  ctx.fillStyle = "#eef0f4";
  ctx.fillRect(0, by, S, 2);
  ctx.fillStyle = "#9a9ea7";
  ctx.fillRect(0, by + bh - 3, S, 3);
  for (let x = 30; x < S; x += 64) {
    ctx.fillStyle = "#7d828b";
    ctx.fillRect(x, by + 2, 2, bh - 5);
    ctx.fillStyle = "#e3e6eb";
    ctx.fillRect(x + 2, by + 2, 1, bh - 5);
  }

  // The keyboard layer: near-black with key stubs, lit along its top.
  const [ky, kh] = [214, 22];
  ctx.fillStyle = "#16171b";
  ctx.fillRect(0, ky, S, kh);
  ctx.fillStyle = "#3a3c42";
  ctx.fillRect(0, ky, S, 1);
  for (let x = 3; x < S; x += 16) bevelRect(ctx, x, ky + 5, 12, 9, "#34363c", "#4c4f57", "#0e0f11");

  const board = (x: number, y: number, w: number, h: number, chips: [number, number][]) =>
    wrapped(ctx, () => {
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
      bevelRect(ctx, x, y, w, h, "#327e3a", "#58a862", "#1c5223", 2);
      ctx.fillStyle = "#c9a640";
      for (const [tx, ty, tw, th] of [
        [8, h * 0.3, w - 16, 2],
        [w * 0.4, 6, 2, h - 12],
        [8, h * 0.72, w * 0.55, 2],
        [w * 0.75, h * 0.3, 2, h * 0.5],
      ]) {
        ctx.fillRect(Math.round(x + tx), Math.round(y + ty), Math.round(tw), Math.round(th));
      }
      for (const [cx, cy] of chips) {
        ctx.fillStyle = "#d9dce2";
        for (let k = 0; k < 5; k++) {
          ctx.fillRect(x + cx + 2 + k * 4, y + cy - 2, 2, 2);
          ctx.fillRect(x + cx + 2 + k * 4, y + cy + 12, 2, 2);
        }
        bevelRect(ctx, x + cx, y + cy, 22, 12, "#18191c", "#45474e", "#08080a");
      }
    });
  board(14, 16, 118, 66, [
    [10, 12],
    [52, 12],
    [24, 44],
    [80, 40],
  ]);
  board(146, 154, 100, 48, [
    [12, 10],
    [62, 26],
  ]);
  quantize(canvas, 32);
  return canvas;
}

function paintCutBattery(seed: number) {
  const S = 256;
  const [canvas, ctx] = makeCanvas(S, S);
  const rand = rng(seed);
  const layers: [number, string][] = [];
  // Lifted off black so a sliced phone keeps its outline on the dark page.
  const electrodes = ["#34353c", "#3c3d44", "#2f3036"];
  const foils = ["#e8e8ee", "#d27a2c"];
  let y = 0;
  let k = 0;
  while (y < S - 8) {
    const h = 12 + Math.floor(rand() * 9);
    layers.push([h, electrodes[k % electrodes.length]]);
    layers.push([2, foils[k % 2]]);
    y += h + 2;
    k++;
  }
  let at = 0;
  for (const [h, color] of layers) {
    ctx.fillStyle = color;
    ctx.fillRect(0, at, S, h);
    at += h;
  }
  // A strip of the lilac case skin to finish the tile.
  ctx.fillStyle = LILAC;
  ctx.fillRect(0, at, S, S - at);
  ctx.fillStyle = "#c2b8ff";
  ctx.fillRect(0, at, S, 1);
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = rand() < 0.5 ? "#4a4c54" : "#22232a";
    ctx.fillRect(Math.floor(rand() * S), Math.floor(rand() * at), 1, 1);
  }
  quantize(canvas, 16);
  return canvas;
}

// ---------------------------------------------------------------------------------------------

type Group<T> = {
  tv: { screens: T[]; bezel: T; casing: T; back: T };
  laptop: { screens: T[]; deck: T; body: T; lid: T };
  phone: { screens: T[]; back: T; rail: T };
  trim: T;
  cuts: { crt: T; battery: T; laptop: T };
};

export type ElectronicsSources = Group<HTMLCanvasElement>;
export type ElectronicsTextures = Group<THREE.Texture>;

export async function paintElectronics(
  image: (name: string) => HTMLImageElement,
  pause: () => Promise<void>,
): Promise<ElectronicsSources> {
  const tvScreens = VIDEOS.slice(0, 2).map((spec) => paintTvScreen(image(spec.img), spec));
  await pause();
  tvScreens.push(...VIDEOS.slice(2).map((spec) => paintTvScreen(image(spec.img), spec)));
  const tv = {
    screens: tvScreens,
    bezel: paintTvBezel(),
    casing: paintTvCasing(),
    back: paintTvBack(),
  };
  await pause();
  const laptop = {
    screens: CODE_CARDS.map(paintLaptopScreen),
    deck: paintLaptopDeck(),
    body: paintLaptopBody(),
    lid: paintLaptopLid(),
  };
  await pause();
  const phoneScreens = [paintGuruPost(), paintCeoPost(), paintAmenPost(image("yt-shrimp"))];
  await pause();
  phoneScreens.push(paintBreakingPost(), paintInfluencerPost(image("img-portrait")));
  const phone = { screens: phoneScreens, back: paintPhoneBack(), rail: paintPhoneRail() };
  await pause();
  const trim = paintTrim();
  const cuts = {
    crt: paintCutCrt(1200),
    battery: paintCutBattery(1201),
    laptop: paintCutLaptop(1202),
  };
  await pause();
  return { tv, laptop, phone, trim, cuts };
}

// `texture` wraps a planar skin; `tiled` one that repeats (wraps, strips and cut faces).
export function wrapElectronics(
  src: ElectronicsSources,
  texture: (canvas: HTMLCanvasElement) => THREE.Texture,
  tiled: (canvas: HTMLCanvasElement) => THREE.Texture,
): ElectronicsTextures {
  return {
    tv: {
      screens: src.tv.screens.map(texture),
      bezel: texture(src.tv.bezel),
      casing: tiled(src.tv.casing),
      back: texture(src.tv.back),
    },
    laptop: {
      screens: src.laptop.screens.map(texture),
      deck: texture(src.laptop.deck),
      body: tiled(src.laptop.body),
      lid: texture(src.laptop.lid),
    },
    phone: {
      screens: src.phone.screens.map(texture),
      back: texture(src.phone.back),
      rail: tiled(src.phone.rail),
    },
    trim: texture(src.trim),
    cuts: {
      crt: tiled(src.cuts.crt),
      battery: tiled(src.cuts.battery),
      laptop: tiled(src.cuts.laptop),
    },
  };
}
