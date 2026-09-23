import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

/* A switch that wears in. Every flip drags the knob across the track, and rubber on a hard
   surface leaves marks: the track collects dark streaks along the knob's path the way a runway
   collects tyre rubber in its touchdown zone, heaviest where the knob brakes at either end and
   faint in between. The mechanism goes with it. A new switch flicks; after a few dozen flips it
   takes longer to get moving and lands without any bounce, and it gives less under the finger
   while held, because a worn pivot is a stiff one. The knob wears along with the track it runs
   in. Nothing here is stored — a reload is a new switch. */

const TRACK_W = 52;
const TRACK_H = 32;
const PAD = 3;
const KNOB = TRACK_H - PAD * 2;
// The far inset while held on a fresh switch; a worn one gives less.
const STRETCH = 6;
// Knob centre at rest, either end.
const OFF_X = PAD + KNOB / 2;
const ON_X = TRACK_W - PAD - KNOB / 2;

// Flips until the switch feels fully worn in. The curve is asymptotic, so it never quite stops
// getting heavier, but past this it is hard to tell one flip from the next.
const WEAR_FLIPS = 60;

const hash1 = (n: number) => {
  const s = Math.sin(n * 127.1 + 74.7) * 43758.5453;
  return s - Math.floor(s);
};
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a: number, b: number, v: number) => smooth(clamp01((v - a) / (b - a)));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/* The knob's path leaves three to five streaks per flip, drawn straight onto the canvas and left
   there, so the marks build up with alpha the way rubber does: fast at first, then saturating
   toward black. Each streak is one continuous stroke whose alpha runs along a gradient, so its
   weight varies along the travel without breaking into dashes. The arriving end is the heavier
   one — braking scrubs more rubber off than setting off — and the middle, where the knob is
   coasting, barely marks at all. */
function deposit(ctx: CanvasRenderingContext2D, flip: number, from: number, to: number) {
  const streaks = 4 + Math.floor(hash1(flip * 11 + 1) * 4);
  const dir = Math.sign(to - from);
  ctx.lineCap = "round";
  for (let sIdx = 0; sIdx < streaks; sIdx++) {
    const seed = flip * 97 + sIdx * 13;
    // Two hashes averaged pull the streaks toward the knob's centre line, where the contact
    // patch is, with the odd one out near the rim.
    const yOff = (hash1(seed + 1) + hash1(seed + 2) - 1) * 11;
    const y = TRACK_H / 2 + yOff;
    const width = 0.45 + hash1(seed + 3) * 0.55;
    const base = 0.03 + hash1(seed + 4) * 0.025;
    const x0 = from + dir * hash1(seed + 5) * 3;
    const x1 = to - dir * hash1(seed + 6) * 3;
    const wobble = hash1(seed + 7) * 6.28;
    const gradient = ctx.createLinearGradient(x0, 0, x1, 0);
    const stops = 8;
    for (let i = 0; i <= stops; i++) {
      const t = i / stops;
      const setOff = 0.6 * smoothstep(0.32, 0, t);
      const braking = smoothstep(0.62, 1, t);
      const weight = 0.4 + 0.6 * Math.max(setOff, braking);
      const jitter = 0.85 + hash1(seed + 20 + i) * 0.3;
      gradient.addColorStop(t, `rgba(0,0,0,${(base * weight * jitter).toFixed(4)})`);
    }
    ctx.strokeStyle = gradient;
    ctx.lineWidth = width;
    ctx.beginPath();
    const points = 6;
    for (let i = 0; i <= points; i++) {
      const t = i / points;
      const x = lerp(x0, x1, t);
      const yy = y + Math.sin(t * 3 + wobble) * 0.35;
      if (i === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
}

/* The knob takes its own wear, and not evenly. It collects what a thumb leaves — a smudge a
   little off centre each time, never twice in the same spot, so the face dirties in patches
   rather than as a wash — its white goes the warm grey of an old keycap, it picks up the odd
   scratch, and the flank that brakes against the end of the track scuffs at the rim there,
   which is why a worn knob is darkest down both sides and still clean top and bottom. Wear
   bites fastest on a new surface and slows as it saturates, the way a factory finish goes early
   and then holds. */
function wearKnob(ctx: CanvasRenderingContext2D, flip: number, dir: number) {
  const r = KNOB / 2;
  const seed = flip * 31 + 5;
  const bite = 1 + 1.8 * Math.exp(-flip / 7);

  // The white yellows all over, the way old plastic does. A wash this faint has to be dithered
  // across flips rather than thinned further: an 8-bit canvas rounds anything under about 0.004
  // over white away to nothing, so a per-flip wash can only ever be a whole level per flip,
  // which over sixty of them would leave the knob beige.
  if (hash1(seed + 70) < 0.3) {
    ctx.fillStyle = `rgba(126,104,58,${(0.0045 * bite).toFixed(4)})`;
    ctx.fillRect(0, 0, KNOB, KNOB);
  }

  // Where the thumb landed this time.
  const tx = r + (hash1(seed + 1) - 0.5) * r * 0.8;
  const ty = r + (hash1(seed + 2) - 0.5) * r * 0.8;
  const peak = 0.0055 * bite;
  const smudge = ctx.createRadialGradient(tx, ty, 0, tx, ty, r * 0.95);
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    smudge.addColorStop(t, `rgba(54,46,34,${(peak * (1 - t) ** 2).toFixed(4)})`);
  }
  ctx.fillStyle = smudge;
  ctx.fillRect(0, 0, KNOB, KNOB);

  ctx.lineCap = "round";

  // The odd scratch across the face. Not every flip — these come from whatever the thumb
  // happened to be carrying.
  if (hash1(seed + 59) < 0.4) {
    const a = hash1(seed + 60) * Math.PI;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const off = (hash1(seed + 61) - 0.5) * KNOB * 0.7;
    const cx = r - uy * off;
    const cy = r + ux * off;
    const half = r * (0.25 + hash1(seed + 62) * 0.4);
    ctx.lineWidth = 0.35 + hash1(seed + 63) * 0.3;
    ctx.strokeStyle = `rgba(40,34,28,${(0.02 + hash1(seed + 64) * 0.02).toFixed(4)})`;
    ctx.beginPath();
    ctx.moveTo(cx - ux * half, cy - uy * half);
    ctx.lineTo(cx + ux * half, cy + uy * half);
    ctx.stroke();
  }

  // The flank that brakes against the end of the track takes the marks, right at the rim.
  const lead = dir > 0 ? 0 : Math.PI;
  const scuffs = 3 + Math.floor(hash1(seed + 4) * 3);
  for (let i = 0; i < scuffs; i++) {
    const s = seed + 40 + i * 5;
    // Two hashes averaged keep most scuffs square on the leading edge, a few off to the side.
    const a = lead + (hash1(s) + hash1(s + 1) - 1) * 0.85;
    const half = 0.05 + hash1(s + 3) * 0.14;
    ctx.lineWidth = 0.55 + hash1(s + 4) * 0.5;
    ctx.strokeStyle = `rgba(40,34,28,${(0.018 + hash1(s + 5) * 0.022).toFixed(4)})`;
    ctx.beginPath();
    ctx.arc(r, r, r - 0.35, a - half, a + half);
    ctx.stroke();
  }
}

function trackPath(ctx: CanvasRenderingContext2D) {
  const r = TRACK_H / 2;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(TRACK_W - r, 0);
  ctx.arc(TRACK_W - r, r, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(r, TRACK_H);
  ctx.arc(r, r, r, Math.PI / 2, (3 * Math.PI) / 2);
  ctx.closePath();
}

// A fresh switch moves on a quick ease-out; a worn one on a curve that is slow to get going and
// settles without overshoot. The control points are interpolated between the two.
const FRESH_CURVE = [0.32, 0.72, 0, 1];
const WORN_CURVE = [0.7, 0.02, 0.25, 1];

function feel(flips: number) {
  const wear = 1 - Math.exp(-flips / WEAR_FLIPS);
  const curve = FRESH_CURVE.map((v, i) => lerp(v, WORN_CURVE[i], wear).toFixed(3));
  return {
    wear,
    duration: Math.round(lerp(280, 720, wear)),
    easing: `cubic-bezier(${curve.join(",")})`,
    stretch: Math.round(lerp(STRETCH, 2, wear)),
  };
}

export const PatinaSwitch = () => {
  const trackRef = useRef<HTMLCanvasElement>(null);
  const knobRef = useRef<HTMLCanvasElement>(null);
  const flipsRef = useRef(0);
  const [on, setOn] = useState(false);
  const [held, setHeld] = useState(false);
  const [flips, setFlips] = useState(0);

  useEffect(() => {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const track = trackRef.current;
    if (track) {
      track.width = TRACK_W * dpr;
      track.height = TRACK_H * dpr;
      const ctx = track.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      trackPath(ctx);
      ctx.clip();
    }
    const knob = knobRef.current;
    if (knob) {
      knob.width = KNOB * dpr;
      knob.height = KNOB * dpr;
      // No clip path here: the knob stretches into a stadium while held, and the border radius
      // on the element follows that where a circle baked into the bitmap would not.
      knob.getContext("2d")!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }, []);

  const flip = () => {
    const trackCtx = trackRef.current?.getContext("2d");
    if (trackCtx) deposit(trackCtx, flipsRef.current, on ? ON_X : OFF_X, on ? OFF_X : ON_X);
    const knobCtx = knobRef.current?.getContext("2d");
    if (knobCtx) wearKnob(knobCtx, flipsRef.current, on ? -1 : 1);
    flipsRef.current += 1;
    setFlips(flipsRef.current);
    setOn((wasOn) => !wasOn);
  };

  const { duration, easing, stretch } = feel(flips);
  // The knob is pinned to both ends of the track rather than translated, so pulling the far
  // inset in while held both elongates it and points it at the end it is about to cross.
  const near = PAD;
  const far = TRACK_W - PAD - KNOB;
  const farHeld = far - stretch;
  const knobStyle = held
    ? {
        left: on ? farHeld : near,
        right: on ? near : farHeld,
        transitionDuration: "160ms",
        transitionTimingFunction: "ease-out",
      }
    : {
        left: on ? far : near,
        right: on ? near : far,
        transitionDuration: `${duration}ms`,
        transitionTimingFunction: easing,
      };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Notifications"
      onClick={flip}
      onPointerDown={(e) => {
        if (e.button === 0) setHeld(true);
      }}
      onPointerUp={() => setHeld(false)}
      onPointerCancel={() => setHeld(false)}
      onPointerLeave={() => setHeld(false)}
      // Safari only honours touch presses when the element carries a touchstart listener.
      onTouchStart={() => {}}
      className={cn(
        "relative h-8 w-[52px] shrink-0 cursor-pointer touch-manipulation select-none rounded-full",
        "[-webkit-tap-highlight-color:transparent]",
        "transition-colors duration-200 ease-out motion-reduce:transition-none",
        "outline-none focus-visible:ring-2 focus-visible:ring-default",
        // Content artwork: the same enamel blue as the button beside it, and a track that reads
        // as empty against both a white page and a near-black one.
        on ? "bg-[#2f6ef0]" : "bg-[oklch(0.88_0_0)] dark:bg-[oklch(0.33_0_0)]",
      )}
    >
      <canvas
        ref={trackRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full rounded-full"
      />
      <span
        aria-hidden
        style={knobStyle}
        className={cn(
          "pointer-events-none absolute inset-y-[3px] overflow-hidden rounded-full bg-white",
          "smooth-shadow-ring-xs smooth-ring-black/12",
          "transition-[left,right] motion-reduce:transition-none",
        )}
      >
        <canvas ref={knobRef} className="absolute inset-0 size-full rounded-full" />
      </span>
    </button>
  );
};
