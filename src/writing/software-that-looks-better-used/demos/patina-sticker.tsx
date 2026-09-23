import { cn } from "@/lib/utils";
import { useEffect, useId, useState } from "react";

/* A sticker that comes off. Every time the pointer passes over it the bottom-right corner lifts
   a little further and stays lifted, the way a sticker on a laptop loses its corner to a sleeve
   brushing past a hundred times, and once the corner has curled far enough the whole thing lets
   go: it drops, and leaves behind the clean rectangle it was covering plus a hairline of
   adhesive. Hovering also lifts the corner a touch more while the pointer is on it, so every
   pass reads as the thing that did the damage. A reload sticks a new one on.

   The curl is the sticker's own corner mirrored across the fold line, rounded tip and die-cut
   edge included, rather than a triangle drawn on top: a corner folded back shows exactly the
   shape it had before. SVG, because a reflection is one transform there and the crease shadow
   and paper gradient can follow the fold wherever it is. */

const W = 56;
const H = 26;
const R = 7;
// The die-cut margin: real stickers carry a white border around the print.
const CUT = 2;
// Corner legs at a full curl, in px. Past this the sticker falls.
const MAX_CURL = 19;
// How much each pass adds, and the extra lift while the pointer is actually on it.
const PASS = 0.11;
const HOVER_LIFT = 0.07;

type Phase = "stuck" | "falling" | "gone";

// Eases a number toward its target over `ms`. The fold line is SVG geometry, which CSS
// transitions cannot animate, so the tween runs here and the geometry is derived per frame.
function useTween(target: number, ms: number) {
  const [value, setValue] = useState(target);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    let raf = 0;
    let from = 0;
    let start = 0;
    setValue((current) => {
      from = current;
      return current;
    });
    const step = (now: number) => {
      if (!start) start = now;
      const t = Math.min((now - start) / ms, 1);
      const eased = 1 - (1 - t) ** 3;
      setValue(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

export const PatinaSticker = () => {
  const id = useId();
  const [peel, setPeel] = useState(0);
  const [hover, setHover] = useState(false);
  const [phase, setPhase] = useState<Phase>("stuck");

  const pass = () => {
    if (phase !== "stuck") return;
    const next = peel + PASS;
    setPeel(next);
    if (next >= 1) setPhase("falling");
  };

  const lift = Math.min(peel + (hover ? HOVER_LIFT : 0), 1);
  const curl = useTween(lift * MAX_CURL, 320);
  const falling = phase === "falling";
  const gone = phase === "gone";

  // The fold runs from (W - s, H) to (W, H - s): the line x + y = c. Reflecting across it maps
  // (x, y) to (c - y, c - x), which as a matrix is [0 -1 -1 0 c c].
  const s = Math.max(curl, 0.01);
  const c = W + H - s;
  const frontClip = `0,0 ${W},0 ${W},${H - s} ${W - s},${H} 0,${H}`;
  const cornerClip = `${W - s},${H} ${W},${H - s} ${W},${H}`;
  const reflect = `matrix(0 -1 -1 0 ${c} ${c})`;

  const frontId = `${id}-front`;
  const cornerId = `${id}-corner`;
  const paperId = `${id}-paper`;
  const blurId = `${id}-blur`;

  return (
    <div className="relative shrink-0" style={{ width: W, height: H }}>
      {/* What was under it: the page kept clean, ringed by what the adhesive left. */}
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 rounded-[7px] transition-opacity duration-500",
          "bg-[oklch(1_0_0_/_0.6)] shadow-[inset_0_0_0_1px_oklch(0_0_0_/_0.09)]",
          "dark:bg-[oklch(0_0_0_/_0.35)] dark:shadow-[inset_0_0_0_1px_oklch(1_0_0_/_0.1)]",
          gone ? "opacity-100" : "opacity-0",
        )}
      />

      {!gone && (
        <button
          type="button"
          aria-label="New badge sticker"
          onPointerEnter={() => {
            setHover(true);
            pass();
          }}
          onPointerLeave={() => setHover(false)}
          // A tap fires pointerenter too, so touch is covered; this is for the keyboard.
          onClick={(e) => {
            if (e.detail === 0) pass();
          }}
          onTransitionEnd={(e) => {
            if (falling && e.propertyName === "opacity") setPhase("gone");
          }}
          className={cn(
            "absolute inset-0 cursor-default select-none [-webkit-tap-highlight-color:transparent]",
            "rounded-[7px] outline-none focus-visible:ring-2 focus-visible:ring-default focus-visible:ring-offset-2",
            "origin-bottom-left transition-[transform,opacity] ease-in",
            falling ? "opacity-0 duration-700" : "opacity-100 duration-300",
            "motion-reduce:transition-none",
          )}
          style={falling ? { transform: "translateY(38px) rotate(14deg)" } : undefined}
        >
          <svg
            aria-hidden
            viewBox={`0 0 ${W} ${H}`}
            width={W}
            height={H}
            overflow="visible"
            className="block"
          >
            <defs>
              <clipPath id={frontId}>
                <polygon points={frontClip} />
              </clipPath>
              <clipPath id={cornerId}>
                <polygon points={cornerClip} />
              </clipPath>
              {/* Paper side of the curl, in local coordinates before the reflection: from the
                  fold outward to the tip. Dark in the crease, a highlight where the curve faces
                  the light, settling to plain paper at the tip. */}
              <linearGradient
                id={paperId}
                gradientUnits="userSpaceOnUse"
                x1={c / 2}
                y1={c / 2}
                x2={c / 2 + s / 2}
                y2={c / 2 + s / 2}
              >
                <stop offset="0" stopColor="oklch(0.78 0.01 80)" />
                <stop offset="0.3" stopColor="oklch(0.99 0 0)" />
                <stop offset="1" stopColor="oklch(0.93 0.005 80)" />
              </linearGradient>
              <filter id={blurId} x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="1.1" />
              </filter>
            </defs>

            {/* The flat part's own contact shadow, clipped like the front so it stops at the fold. */}
            <g clipPath={`url(#${frontId})`}>
              <rect
                x={0}
                y={1}
                width={W}
                height={H}
                rx={R}
                fill="oklch(0 0 0 / 0.16)"
                filter={`url(#${blurId})`}
              />
            </g>

            {/* The shadow the lifted corner throws onto the page. */}
            <g transform={`translate(0.9 1.6) ${reflect}`} opacity={0.32}>
              <g clipPath={`url(#${cornerId})`}>
                <rect
                  x={0}
                  y={0}
                  width={W}
                  height={H}
                  rx={R}
                  fill="black"
                  filter={`url(#${blurId})`}
                />
              </g>
            </g>

            {/* Front: die-cut white edge, the print, the label. */}
            <g clipPath={`url(#${frontId})`}>
              <rect
                x={0}
                y={0}
                width={W}
                height={H}
                rx={R}
                className="fill-white dark:fill-[oklch(0.93_0_0)]"
              />
              <rect
                x={CUT}
                y={CUT}
                width={W - CUT * 2}
                height={H - CUT * 2}
                rx={R - CUT}
                fill="#2f6ef0"
              />
              <text
                x={W / 2}
                y={H / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fill="white"
                className="font-pretendard text-[11px] font-semibold uppercase tracking-[0.08em]"
              >
                New
              </text>
            </g>

            {/* The curl: the corner, mirrored across the fold. */}
            <g transform={reflect}>
              <g clipPath={`url(#${cornerId})`}>
                <rect
                  x={0}
                  y={0}
                  width={W}
                  height={H}
                  rx={R}
                  fill={`url(#${paperId})`}
                  stroke="oklch(0 0 0 / 0.1)"
                  strokeWidth={0.6}
                />
              </g>
            </g>
          </svg>
        </button>
      )}
    </div>
  );
};
