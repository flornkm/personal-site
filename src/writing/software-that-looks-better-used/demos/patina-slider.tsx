import { cn } from "@/lib/utils";
import { useEffect, useId, useMemo, useRef, useState } from "react";

/* A slider that learns where you keep leaving it. Nothing here is dirt or damage: a rail wears
   where the thumb comes to rest, not where it passes, because a setting is a place something sits
   for months rather than a place it travels through. Every time you let go, the value you let go
   at gets a little deeper, and a deep enough seat starts to catch the thumb on the way past —
   first as a hesitation, then as something you have to pull out of.

   The wear is cut out of the rail rather than drawn on top of it. Shading alone, however carefully
   lit, only ever looks like a mark on the surface; taking the same bite out of the silhouette is
   what makes it read as a groove, so the rail is pinched from both edges at every seat and the
   fill is pinched with it, both being the same path. Nothing wears evenly, though, so each seat
   takes more out of one edge than the other — and since the thumb rides the middle of the rail
   rather than the top of it, a lopsided seat carries the thumb a little above or below the line it
   would otherwise sit on. That is the whole reason to wear both edges: one edge is a notch, two
   edges are a path the thumb has to follow.

   Which makes this the one figure in the post where the wear is worth having: a control that has
   quietly learned the two or three values you use and made them easier to hit than the two hundred
   you do not. A reload is a new rail. */

const WIDTH = 248;
const RAIL_H = 12;
const THUMB = 24;
const TRAVEL = WIDTH - THUMB;
// How much a fully worn seat takes out of a twelve pixel rail, shared between its two edges.
const BITE = 4;
// How far a seat can favour one edge over the other, and the least it is allowed to commit: a seat
// that splits its wear evenly leaves the thumb exactly where it found it, and a rail of those has
// nothing for the thumb to follow.
const LEAN = 0.7;
const LEAST_LEAN = 0.45;
// A thumb resting in a lopsided groove does not bisect it — it settles toward the side that has
// given way, so it moves a little further than the middle of the rail has.
const RIDE = 1.6;

// A new seat is faint, and each return takes a fixed share of what is left, so the first few times
// you come back change it a lot and the twentieth barely shows.
const FIRST = 0.16;
const DEEPEN = 0.22;
// Two settings this close are the same setting — the seat takes both and drifts between them.
const MERGE = 7 / TRAVEL;
// How far out a seat can reach for the thumb, how hard it pulls once it has it, and the share of
// that reach where it pulls at full strength: a seat needs a flat bottom to sit in, or the thumb
// only ever drifts toward it instead of settling into it.
const REACH = 9 / TRAVEL;
const GRAB = 0.95;
const FLAT = 0.35;
const MAX_SEATS = 7;

// Rubber, as on the switch beside it: a drag scrubs a few streaks along the stretch it crossed,
// they build up with alpha where the thumb keeps going, and the end it stops at takes the heavier
// mark, because braking scrubs off more than setting off does. A short shove leaves nothing.
const SKID_MIN = 7;
const MAX_STREAKS = 90;

// How fast the thumb's own face takes marks: hardest on a new surface, slowing as it saturates,
// the way a factory finish goes early and then holds.
const bite = (drag: number) => 1 + 1.8 * Math.exp(-drag / 7);

// A seat spreads as it deepens, because a thumb returning a hundred times does not land in the
// same place twice.
const SEAT_SPREAD = 3.4;
const SEAT_GROWTH = 3.6;

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/* An integer mix rather than the usual fractional sine. The sine version aliases for inputs in
   this range — every seat on the rail came out leaning the same way, which is exactly the thing
   the lean exists to avoid. */
const hash = (n: number) => {
  let h = Math.imul((Math.round(n * 1e4) | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

interface Streak {
  id: number;
  from: number;
  to: number;
  y: number;
  width: number;
  alpha: number;
}

interface Seat {
  id: number;
  at: number;
  // Where the seat started. Which edge it favours belongs to that spot on the rail rather than to
  // the order the seats were made in, and it is held fixed so the lean cannot flip under the thumb
  // as the seat creeps.
  spot: number;
  depth: number;
}

/* The catch. Full strength across the bottom of the seat, easing off to nothing at its rim, so the
   thumb is held for a few pixels of travel and then let go rather than eased past. */
function settle(raw: number, seats: Seat[]) {
  let best: Seat | null = null;
  let nearest = Infinity;
  for (const seat of seats) {
    const distance = Math.abs(raw - seat.at);
    if (distance < nearest) {
      nearest = distance;
      best = seat;
    }
  }
  if (!best) return raw;
  const reach = REACH * (0.6 + best.depth);
  if (nearest > reach) return raw;
  const grip = clamp01((reach - nearest) / (reach * (1 - FLAT)));
  // The power keeps a seat you have used once as a hesitation while a seat you have used ten times
  // is somewhere the thumb sits: depth alone would make the early ones imperceptible.
  const pull = best.depth ** 0.6 * GRAB * smooth(grip);
  return raw + (best.at - raw) * pull;
}

export interface Profile {
  top: Float32Array;
  bottom: Float32Array;
}

/* The shape of the rail: how much has gone from each edge, per column. Seats combine as the chance
   of an edge being untouched by any of them, so overlapping visits run together into a single
   wider scoop instead of stacking into a deeper bite. Every seat splits its wear between the two
   edges on a fixed lean of its own, which is what keeps the rail from looking milled. */
function profileOf(seats: Seat[]): Profile {
  const top = new Float32Array(WIDTH);
  const bottom = new Float32Array(WIDTH);
  const r = RAIL_H / 2;
  for (let x = 0; x < WIDTH; x++) {
    let aboveLeft = 1;
    let belowLeft = 1;
    for (const seat of seats) {
      const centre = seat.at * TRAVEL + THUMB / 2;
      const spread = SEAT_SPREAD + SEAT_GROWTH * seat.depth;
      const offset = (x - centre) / spread;
      // A slow ripple along the edge, fixed per seat, so no two scoops have the same outline.
      const lumps = 1 + 0.08 * Math.sin(x * (0.1 + hash(seat.id) * 0.16) + hash(seat.id + 9) * 6.3);
      const bite = seat.depth * Math.exp(-(offset * offset) / 2) * lumps;
      const tilt = hash(seat.spot * 439.1 + 3.7) * 2 - 1;
      const share =
        0.5 + Math.sign(tilt) * (LEAST_LEAN + (1 - LEAST_LEAN) * Math.abs(tilt)) * (LEAN / 2);
      aboveLeft *= 1 - clamp01(bite * share);
      belowLeft *= 1 - clamp01(bite * (1 - share));
    }
    // Let the wear go to nothing before the caps, so the rounded ends stay true semicircles
    // however close to them the thumb has been parked.
    const ends = smooth(clamp01((x - r) / 9)) * smooth(clamp01((WIDTH - r - x) / 9));
    top[x] = (1 - aboveLeft) * ends;
    bottom[x] = (1 - belowLeft) * ends;
  }
  return { top, bottom };
}

// The rail's outline: a pill both of whose edges follow the wear. Sampled every other pixel, which
// on a curve this soft is already smoother than the screen can show.
function outlineOf(profile: Profile) {
  const r = RAIL_H / 2;
  const at = (field: Float32Array, x: number) => field[Math.min(WIDTH - 1, Math.round(x))] * BITE;
  const above: string[] = [];
  const below: string[] = [];
  for (let x = r; x <= WIDTH - r; x += 2) {
    above.push(`${x} ${at(profile.top, x).toFixed(2)}`);
    below.unshift(`${x} ${(RAIL_H - at(profile.bottom, x)).toFixed(2)}`);
  }
  return [
    `M ${r} 0`,
    `L ${above.join(" L ")}`,
    `A ${r} ${r} 0 0 1 ${WIDTH - r} ${RAIL_H}`,
    `L ${below.join(" L ")}`,
    `A ${r} ${r} 0 0 1 ${r} 0`,
    "Z",
  ].join(" ");
}

// Where the middle of the rail has moved to at a given column: half the difference between what
// the two edges have lost. The thumb rides this, so an evenly worn seat leaves it where it was and
// a lopsided one lifts or drops it.
function centreShift(profile: Profile, x: number) {
  const i = Math.min(WIDTH - 1, Math.max(0, Math.round(x)));
  return (((profile.top[i] - profile.bottom[i]) * BITE) / 2) * RIDE;
}

/* The thumb ages the way the switch's knob does, because it is the same object being handled the
   same way: the white yellows all over, every grab leaves a smudge a little off centre and never
   twice in the same place, the odd scratch turns up from whatever the hand was carrying, and the
   flank leading the drag scuffs at the rim where it is pressed into whatever it fetches up
   against. Drawn once per drag straight onto the face and never cleared, so it only accumulates —
   which is also why the faint yellowing lands rarely and at full strength rather than on every
   drag at a tenth of it. An 8-bit canvas rounds each fill to whole levels, and a wash faint enough
   that its three channels round to the same level is a wash with no colour left in it — the warm
   brown comes out as neutral grey, or worse, drifts pink as the channel with the furthest to fall
   rounds up while the others round down. Landing one drag in ten at four times the strength keeps
   the ratio between the channels intact. */
function wearThumb(ctx: CanvasRenderingContext2D, drag: number, dir: number) {
  const r = THUMB / 2;
  const seed = drag * 31 + 5;
  const strength = bite(drag);

  if (hash(seed + 70) < 0.1) {
    ctx.fillStyle = `rgba(126,104,58,${(0.02 * strength).toFixed(4)})`;
    ctx.fillRect(0, 0, THUMB, THUMB);
  }

  /* Where the hand landed this time. Also dithered across drags, for a second reason: a gradient
     this faint is dithered by the renderer itself, always onto the same pixels, so laying one down
     every drag weaves that pattern into the face instead of averaging it away. One drag in three
     at three times the strength comes to the same amount of grime with a third of the weave. */
  if (hash(seed + 80) < 0.34) {
    const tx = r + (hash(seed + 1) - 0.5) * r * 0.8;
    const ty = r + (hash(seed + 2) - 0.5) * r * 0.8;
    const peak = 0.018 * strength;
    const smudge = ctx.createRadialGradient(tx, ty, 0, tx, ty, r * 0.95);
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      smudge.addColorStop(t, `rgba(54,46,34,${(peak * (1 - t) ** 2).toFixed(4)})`);
    }
    ctx.fillStyle = smudge;
    ctx.fillRect(0, 0, THUMB, THUMB);
  }

  ctx.lineCap = "round";

  // Not every drag — these come from whatever the hand happened to be carrying.
  if (hash(seed + 59) < 0.4) {
    const angle = hash(seed + 60) * Math.PI;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const off = (hash(seed + 61) - 0.5) * THUMB * 0.7;
    const cx = r - uy * off;
    const cy = r + ux * off;
    const half = r * (0.25 + hash(seed + 62) * 0.4);
    ctx.lineWidth = 0.35 + hash(seed + 63) * 0.3;
    ctx.strokeStyle = `rgba(40,34,28,${(0.02 + hash(seed + 64) * 0.02).toFixed(4)})`;
    ctx.beginPath();
    ctx.moveTo(cx - ux * half, cy - uy * half);
    ctx.lineTo(cx + ux * half, cy + uy * half);
    ctx.stroke();
  }

  // A grab that went nowhere still leaves a hand on the face, but nothing rubs at the rim.
  if (dir === 0) return;
  const lead = dir > 0 ? 0 : Math.PI;
  const scuffs = 3 + Math.floor(hash(seed + 4) * 3);
  for (let i = 0; i < scuffs; i++) {
    const n = seed + 40 + i * 5;
    // Two hashes averaged keep most scuffs square on the leading edge, a few off to the side.
    const angle = lead + (hash(n) + hash(n + 1) - 1) * 0.85;
    const half = 0.05 + hash(n + 3) * 0.14;
    ctx.lineWidth = 0.55 + hash(n + 4) * 0.5;
    ctx.strokeStyle = `rgba(40,34,28,${(0.018 + hash(n + 5) * 0.022).toFixed(4)})`;
    ctx.beginPath();
    ctx.arc(r, r, r - 0.35, angle - half, angle + half);
    ctx.stroke();
  }
}

export const PatinaSlider = () => {
  const railRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);
  const skidRef = useRef(0);
  const fromRef = useRef<number | null>(null);
  const faceRef = useRef<HTMLCanvasElement>(null);
  const dragsRef = useRef(0);
  const clipId = useId();
  const [value, setValue] = useState(0.34);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [streaks, setStreaks] = useState<Streak[]>([]);
  const [held, setHeld] = useState(false);

  const profile = useMemo(() => profileOf(seats), [seats]);
  const outline = useMemo(() => outlineOf(profile), [profile]);

  useEffect(() => {
    const face = faceRef.current;
    if (!face) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    face.width = THUMB * dpr;
    face.height = THUMB * dpr;
    face.getContext("2d")!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, []);

  // Handling it is what ages it, so this runs on letting go rather than on every move.
  const handle = (dir: number) => {
    const ctx = faceRef.current?.getContext("2d");
    if (!ctx) return;
    wearThumb(ctx, dragsRef.current++, dir);
  };

  const valueAt = (clientX: number) => {
    const rect = railRef.current!.getBoundingClientRect();
    return clamp01((clientX - rect.left - THUMB / 2) / (rect.width - THUMB));
  };

  // Letting go is the whole mechanism: the rail only records where the thumb was left.
  const rest = (at: number) => {
    setSeats((current) => {
      const index = current.findIndex((seat) => Math.abs(seat.at - at) < MERGE);
      if (index === -1) {
        const fresh = [...current, { id: idRef.current++, at, spot: at, depth: FIRST }];
        if (fresh.length <= MAX_SEATS) return fresh;
        // The faintest one goes, not the oldest: a mark you made once and never came back to is
        // the one the rail forgets.
        const faintest = fresh.reduce((a, b) => (a.depth <= b.depth ? a : b));
        return fresh.filter((seat) => seat.id !== faintest.id);
      }
      const next = [...current];
      const seat = next[index];
      next[index] = {
        ...seat,
        // The seat creeps toward where you keep actually leaving it.
        at: seat.at + (at - seat.at) * 0.3,
        depth: seat.depth + (1 - seat.depth) * DEEPEN,
      };
      return next;
    });
  };

  const drag = (clientX: number) => {
    const next = settle(valueAt(clientX), seats);
    setValue(next);
    return next;
  };

  /* One drag's worth of rubber. Three or four streaks clustered on the thumb's centre line, where
     the contact patch is, with the odd one out toward the rim. */
  const scrub = (fromPx: number, toPx: number) => {
    if (Math.abs(toPx - fromPx) < SKID_MIN) return;
    const skid = skidRef.current++;
    const dir = Math.sign(toPx - fromPx);
    const made: Streak[] = [];
    const count = 2 + Math.floor(hash(skid * 11 + 1) * 2);
    for (let i = 0; i < count; i++) {
      const seed = skid * 97 + i * 13;
      made.push({
        id: idRef.current++,
        from: fromPx + dir * hash(seed + 5) * 3,
        to: toPx - dir * hash(seed + 6) * 3,
        y: RAIL_H / 2 + (hash(seed + 1) + hash(seed + 2) - 1) * 3.1,
        width: 0.5 + hash(seed + 3) * 0.55,
        alpha: 0.016 + hash(seed + 4) * 0.015,
      });
    }
    // Where it came to a stop.
    made.push({
      id: idRef.current++,
      from: toPx - dir * (5 + hash(skid + 31) * 4),
      to: toPx,
      y: RAIL_H / 2 + (hash(skid + 32) - 0.5) * 3,
      width: 0.75,
      alpha: 0.032,
    });
    setStreaks((current) => {
      const next = [...current, ...made];
      return next.length > MAX_STREAKS ? next.slice(next.length - MAX_STREAKS) : next;
    });
  };

  // The thumb sits on the middle of the rail, wherever the wear has put it.
  const ride = centreShift(profile, value * TRAVEL + THUMB / 2);

  return (
    <div
      ref={railRef}
      role="slider"
      tabIndex={0}
      aria-label="Brightness"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      style={{ width: WIDTH }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        setHeld(true);
        e.currentTarget.setPointerCapture(e.pointerId);
        // From wherever the thumb ends up, not from where it was: a click that jumps the thumb
        // across the rail is not something dragged along it.
        fromRef.current = drag(e.clientX) * TRAVEL + THUMB / 2;
      }}
      onPointerMove={(e) => {
        if (held) drag(e.clientX);
      }}
      onPointerUp={(e) => {
        setHeld(false);
        const at = settle(valueAt(e.clientX), seats);
        rest(at);
        const to = at * TRAVEL + THUMB / 2;
        const from = fromRef.current;
        if (from !== null) {
          scrub(from, to);
          handle(Math.abs(to - from) < SKID_MIN ? 0 : Math.sign(to - from));
        }
        fromRef.current = null;
      }}
      onPointerCancel={() => {
        setHeld(false);
        fromRef.current = null;
      }}
      onKeyDown={(e) => {
        const step = e.key === "ArrowLeft" ? -0.04 : e.key === "ArrowRight" ? 0.04 : 0;
        if (!step) return;
        e.preventDefault();
        // A step is a setting chosen, so each one counts as leaving it there.
        const next = clamp01(value + step);
        setValue(next);
        rest(next);
      }}
      className={cn(
        "relative flex h-7 shrink-0 touch-none select-none items-center",
        held ? "cursor-grabbing" : "cursor-grab",
        "font-pretendard [-webkit-tap-highlight-color:transparent]",
        "outline-none focus-visible:ring-2 focus-visible:ring-default focus-visible:ring-offset-4",
      )}
    >
      <svg
        aria-hidden
        width={WIDTH}
        height={RAIL_H}
        viewBox={`0 0 ${WIDTH} ${RAIL_H}`}
        className="absolute inset-x-0"
      >
        <defs>
          <clipPath id={clipId}>
            <path d={outline} />
          </clipPath>
        </defs>
        <path d={outline} className="fill-[oklch(0.88_0_0)] dark:fill-[oklch(0.33_0_0)]" />
        <rect
          x={0}
          y={0}
          height={RAIL_H}
          width={value * TRAVEL + THUMB / 2}
          clipPath={`url(#${clipId})`}
          className="fill-[#2f6ef0]"
        />
        <g clipPath={`url(#${clipId})`}>
          {streaks.map((streak) => (
            <line
              key={streak.id}
              x1={streak.from}
              y1={streak.y}
              x2={streak.to}
              y2={streak.y}
              strokeWidth={streak.width}
              strokeLinecap="round"
              stroke={`rgba(0,0,0,${streak.alpha.toFixed(3)})`}
            />
          ))}
        </g>
        {/* Stroked on its own outline and clipped to it, so only the inside half survives: the
            worn edge falls away into shadow instead of ending in a cut line. */}
        <path
          d={outline}
          fill="none"
          strokeWidth={2.4}
          clipPath={`url(#${clipId})`}
          className="stroke-black/15 dark:stroke-black/40"
        />
      </svg>
      <span
        aria-hidden
        style={{ left: value * TRAVEL, translate: `0 ${ride.toFixed(2)}px` }}
        className={cn(
          "absolute size-6 overflow-hidden rounded-full bg-white",
          "smooth-shadow-ring-xs smooth-ring-black/12 dark:bg-[oklch(0.93_0_0)]",
          held ? "scale-105" : "scale-100",
          "transition-[transform,left,translate] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
          held && "transition-[transform,translate] duration-150",
          "motion-reduce:transition-none",
        )}
      >
        <canvas ref={faceRef} className="absolute inset-0 size-full rounded-full" />
      </span>
    </div>
  );
};
