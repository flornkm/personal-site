import { RangeSlider } from "@/components/ui/range-slider";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

/* Figure for "Custom loading states should feel fast".

   One skeleton and one slider. The slider sets how fast the highlight sweeps, and while nobody
   is touching it, it drifts from slow to fast and back on its own, so the figure demonstrates
   itself: the same placeholder reads as an app taking its time at one end and as an app
   straining to get the content out at the other.

   The sweep is driven by hand rather than by the CSS animation the site's Skeleton uses. A CSS
   animation keeps its elapsed time when its duration changes, so nudging the slider would make
   the highlight jump; stepping a phase by dt / duration each frame lets the pace change under it
   without a hitch. */

// Seconds per sweep at each end of the slider. Geometric between them, so equal slider travel
// feels like an equal change in pace at both ends.
const SLOW_S = 3.2;
const FAST_S = 0.45;
// One full slow-fast-slow drift while the slider is left alone.
const DRIFT_S = 9;
const STEPS = 1000;

function sweepSeconds(speed: number) {
  return SLOW_S * (FAST_S / SLOW_S) ** speed;
}

export function ShimmerSpeed() {
  const reduceMotion = useReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  const speed = useRef(0);
  const hovering = useRef(false);
  const grabbing = useRef(false);
  // Where along the drift the slider is; reset on resume so the drift continues from wherever
  // the hand left the thumb instead of snapping back to its own timeline.
  const drift = useRef(0);

  function resumeFromSpeed() {
    drift.current = (Math.acos(1 - 2 * speed.current) / (2 * Math.PI)) * DRIFT_S;
  }

  useEffect(() => {
    if (reduceMotion) return;
    const card = cardRef.current;
    const sweeps = card?.querySelectorAll<HTMLElement>("[data-sweep]");
    if (!card || !sweeps?.length) return;

    let frame = 0;
    let last = performance.now();
    let phase = 0;

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;

      if (!hovering.current && !grabbing.current) {
        drift.current += dt;
        speed.current = 0.5 - 0.5 * Math.cos((2 * Math.PI * drift.current) / DRIFT_S);
        if (sliderRef.current) sliderRef.current.value = String(speed.current * STEPS);
      }

      phase = (phase + dt / sweepSeconds(speed.current)) % 1;
      // The same ease-in-out the CSS sweep uses, so the two read as one family.
      const eased = phase < 0.5 ? 2 * phase * phase : 1 - (-2 * phase + 2) ** 2 / 2;

      // One band of light the width of the card, travelling from fully left of it to fully
      // right. Each bone shows the part of that band passing over it: its sweep is sized to the
      // card and offset back by the bone's own position, so the bones light up in turn as a
      // single highlight crosses the group rather than each running a small one of its own.
      // Reads first, then writes, so the measurements never force a second layout.
      const cardBox = card.getBoundingClientRect();
      const offsets = Array.from(sweeps, (sweep) => {
        const bone = sweep.parentElement as HTMLElement;
        return bone.getBoundingClientRect().left - cardBox.left;
      });
      const x = (-1 + 2 * eased) * cardBox.width;
      sweeps.forEach((sweep, index) => {
        sweep.style.left = `${-offsets[index]}px`;
        sweep.style.width = `${cardBox.width}px`;
        sweep.style.transform = `translateX(${x.toFixed(2)}px)`;
      });

      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduceMotion]);

  return (
    <figure className="not-prose max-lg:-mx-4 mx-auto my-8 max-w-[520px] font-pretendard">
      {/* Same stage as the figures in the tips article. The control is pinned to the floor
          rather than given a grid row, so the card centres on the whole stage. */}
      <div className="relative flex min-h-[18rem] items-center justify-center rounded-sm p-4 outline -outline-offset-1 outline-black/5 md:p-12 dark:outline-white/8">
        {/* Centred in the space above the slider rather than on the whole stage: the bottom
            margin is the slider row's height, so the card's centre lands halfway up what is left. */}
        <div className="mb-8">
          <div ref={cardRef} className="w-72 space-y-3">
            <div className="flex items-center gap-3">
              <Bone className="size-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Bone className="h-2.5 w-3/5" />
                <Bone className="h-2.5 w-2/5" />
              </div>
            </div>
            <Bone className="h-24 w-full rounded-lg" />
          </div>

          <div
            className="absolute bottom-4 left-1/2 flex w-56 -translate-x-1/2 items-center gap-3"
            onPointerEnter={() => {
              hovering.current = true;
            }}
            onPointerLeave={() => {
              hovering.current = false;
              if (!grabbing.current) resumeFromSpeed();
            }}
          >
            <span className="text-[12px] leading-none text-quaternary">Slow</span>
            <RangeSlider
              ref={sliderRef}
              aria-label="Shimmer speed"
              min={0}
              max={STEPS}
              step={1}
              defaultValue={0}
              onChange={(event) => {
                speed.current = Number(event.currentTarget.value) / STEPS;
              }}
              onGrabbingChange={(isGrabbing) => {
                grabbing.current = isGrabbing;
                if (!isGrabbing && !hovering.current) resumeFromSpeed();
              }}
            />
            <span className="text-[12px] leading-none text-quaternary">Fast</span>
          </div>
        </div>
      </div>
    </figure>
  );
}

// The site's skeleton, with the sweep as a real element the frame loop can move. Same sRGB
// gradient and GPU layer as the primitive, for the same Safari reasons.
function Bone({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative transform-gpu overflow-hidden rounded-full bg-black/6 dark:bg-white/8",
        className,
      )}
    >
      {/* Positioned and sized by the frame loop; parked off to the left until it runs. The park
          is an inline transform, not a translate utility: Tailwind v4's translate utilities set
          the separate `translate` property, which would stay stacked under the loop's transform
          and hold the band one card-width to the left of where it should be. */}
      <span
        data-sweep
        style={{ transform: "translateX(-100%)" }}
        className="absolute inset-y-0 left-0 w-full bg-linear-to-r/srgb from-transparent via-white/70 to-transparent dark:via-white/8"
      />
    </div>
  );
}
