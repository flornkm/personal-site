import { cn } from "@/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";

/* A control that forgets what it is called. The other two figures here collect things — rubber,
   grime, a stain in the glass. This one loses something instead: every press takes a little of
   the printed legend off the pad it lands on, the way a keycap loses its letter or the ground
   floor button in a lift goes blank while the rest of the panel stays crisp. The ink goes from
   wherever the finger actually landed, so a word hollows out from the middle and the ends of it
   hang on, and thin strokes drop below visible before thick ones do, which is why the letters go
   patchy and start to break up before they disappear. Underneath, the pad picks up the polish
   that took the ink off.

   The legend is drawn into a canvas rather than set as text, because what is wanted is an eraser:
   each press punches soft holes in the ink with destination-out, and nothing ever puts any back.
   That leaves the alpha channel as the record of how worn the pad is, so recolouring it when the
   selection or the theme changes is a source-in pass that leaves every hole exactly where it was.
   Nothing here is stored — a reload is a fresh set of pads. */

const LABELS = ["Day", "Week", "Month"];
const SEG_W = 72;
const SEG_H = 28;

// Wear bites hardest on the first few presses, the way a printed finish goes long before the
// plastic under it does, then slows to a crawl.
const BITE_PRESSES = 5;
const LABEL_FONT = '500 12px "Pretendard Variable", Inter, sans-serif';

// What the polish left behind by a thumb settles to: darker on a pale pad, glossier on a dark one.
const SHEEN = { light: "rgb(188,180,162)", dark: "rgb(126,120,106)" };

const hash1 = (n: number) => {
  const s = Math.sin(n * 127.1 + 74.7) * 43758.5453;
  return s - Math.floor(s);
};

const bite = (press: number) => 1 + 2.2 * Math.exp(-press / BITE_PRESSES);

function context(canvas: HTMLCanvasElement | null, dpr: number) {
  const ctx = canvas?.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  return ctx;
}

function drawLegend(canvas: HTMLCanvasElement | null, text: string, colour: string, dpr: number) {
  const ctx = context(canvas, dpr);
  if (!ctx) return;
  ctx.clearRect(0, 0, SEG_W, SEG_H);
  ctx.fillStyle = colour;
  ctx.font = LABEL_FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, SEG_W / 2, SEG_H / 2 + 0.5);
}

/* Repaint in a new colour without touching a single hole: source-in keeps the destination's alpha
   and takes the source's colour, so the wear survives a change of selection or of theme. */
function recolour(canvas: HTMLCanvasElement | null, colour: string, dpr: number) {
  const ctx = context(canvas, dpr);
  if (!ctx) return;
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, SEG_W, SEG_H);
  ctx.globalCompositeOperation = "source-over";
}

const softStop = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  alpha: number,
) => {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
  gradient.addColorStop(0, `rgba(0,0,0,${alpha.toFixed(4)})`);
  gradient.addColorStop(0.55, `rgba(0,0,0,${(alpha * 0.55).toFixed(4)})`);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  return gradient;
};

/* One press worth of ink taken off. A contact patch is wider than it is tall and it is not a
   clean circle, so the press lands as a scatter of soft holes rather than one smooth blur. */
function rubLegend(
  canvas: HTMLCanvasElement | null,
  press: number,
  px: number,
  py: number,
  dpr: number,
) {
  const ctx = context(canvas, dpr);
  if (!ctx) return;
  ctx.globalCompositeOperation = "destination-out";
  const strength = bite(press);
  for (let i = 0; i < 12; i++) {
    const s = press * 71 + i * 17;
    // Two hashes averaged cluster the holes around where the finger landed, with the odd one
    // straying out to the edge of the patch.
    const x = px + (hash1(s) + hash1(s + 1) - 1) * 13;
    const y = py + (hash1(s + 2) + hash1(s + 3) - 1) * 6;
    const r = 2.5 + hash1(s + 4) * 5;
    ctx.fillStyle = softStop(ctx, x, y, r, (0.03 + hash1(s + 5) * 0.03) * strength);
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.globalCompositeOperation = "source-over";
}

// The other half of the same press: whatever took the ink off leaves the pad polished.
function polishPad(
  canvas: HTMLCanvasElement | null,
  press: number,
  px: number,
  py: number,
  dpr: number,
  colour: string,
) {
  const ctx = context(canvas, dpr);
  if (!ctx) return;
  // Wide and very faint: polish is a change of sheen across the whole contact area, not a mark
  // sitting under the letters.
  const r = 22;
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(1.7, 1);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  const peak = 0.0055 * bite(press);
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    gradient.addColorStop(
      t,
      colour.replace("rgb(", "rgba(").replace(")", `,${peak * (1 - t) ** 1.5})`),
    );
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();
}

export const PatinaLegend = () => {
  const legendRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const sheenRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const pressesRef = useRef(LABELS.map(() => 0));
  const dprRef = useRef(1);
  const [selected, setSelected] = useState(1);

  const inkFor = useCallback((index: number, chosen: number) => {
    const style = getComputedStyle(document.documentElement);
    const token = index === chosen ? "--text-primary" : "--text-tertiary";
    return style.getPropertyValue(token).trim() || "#737373";
  }, []);

  useEffect(() => {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    dprRef.current = dpr;
    for (const canvas of [...legendRefs.current, ...sheenRefs.current]) {
      if (!canvas) continue;
      canvas.width = SEG_W * dpr;
      canvas.height = SEG_H * dpr;
    }
    const paintAll = () => {
      LABELS.forEach((label, i) => {
        // Once a pad has been used its ink is history, so it is recoloured rather than redrawn.
        const worn = pressesRef.current[i] > 0;
        const colour = inkFor(i, selected);
        if (worn) recolour(legendRefs.current[i], colour, dpr);
        else drawLegend(legendRefs.current[i], label, colour, dpr);
      });
    };
    paintAll();

    const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const onTheme = () => {
      paintAll();
      for (const canvas of sheenRefs.current) {
        recolour(canvas, darkQuery.matches ? SHEEN.dark : SHEEN.light, dpr);
      }
    };
    darkQuery.addEventListener("change", onTheme);
    // A legend drawn before its webfont lands would be printed in the fallback.
    document.fonts?.ready.then(paintAll);
    return () => darkQuery.removeEventListener("change", onTheme);
    // Selection is deliberately not a dependency: the recolour pass below owns that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inkFor]);

  useEffect(() => {
    LABELS.forEach((_, i) => recolour(legendRefs.current[i], inkFor(i, selected), dprRef.current));
  }, [selected, inkFor]);

  const press = (index: number, e: React.MouseEvent<HTMLButtonElement>) => {
    const dpr = dprRef.current;
    const rect = e.currentTarget.getBoundingClientRect();
    // Keyboard activation carries no pointer, so it lands in the middle, where a thumb would.
    const px = e.detail === 0 ? SEG_W / 2 : e.clientX - rect.left;
    const py = e.detail === 0 ? SEG_H / 2 : e.clientY - rect.top;
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const n = pressesRef.current[index];
    rubLegend(legendRefs.current[index], n, px, py, dpr);
    polishPad(sheenRefs.current[index], n, px, py, dpr, dark ? SHEEN.dark : SHEEN.light);
    pressesRef.current[index] = n + 1;
    setSelected(index);
  };

  return (
    <div
      role="group"
      aria-label="Calendar range"
      className={cn(
        "relative flex shrink-0 rounded-full p-1 font-pretendard",
        "bg-[oklch(0.93_0_0)] dark:bg-[oklch(0.26_0_0)]",
      )}
    >
      <span
        aria-hidden
        style={{ width: SEG_W, height: SEG_H, transform: `translateX(${selected * SEG_W}px)` }}
        className={cn(
          "absolute left-1 top-1 rounded-full bg-white smooth-shadow-ring-xs dark:bg-[oklch(0.36_0_0)]",
          "transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          "motion-reduce:transition-none",
        )}
      />
      {LABELS.map((label, i) => (
        <button
          key={label}
          type="button"
          aria-pressed={i === selected}
          onClick={(e) => press(i, e)}
          // Safari only honours touch presses when the element carries a touchstart listener.
          onTouchStart={() => {}}
          style={{ width: SEG_W, height: SEG_H }}
          className={cn(
            "relative cursor-pointer touch-manipulation select-none rounded-full",
            "[-webkit-tap-highlight-color:transparent]",
            "outline-none focus-visible:ring-2 focus-visible:ring-default",
          )}
        >
          <canvas
            ref={(el) => {
              sheenRefs.current[i] = el;
            }}
            aria-hidden
            className="pointer-events-none absolute inset-0 size-full rounded-full"
          />
          <canvas
            ref={(el) => {
              legendRefs.current[i] = el;
            }}
            aria-hidden
            className="pointer-events-none absolute inset-0 size-full"
          />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
};
