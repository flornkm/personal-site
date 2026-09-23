import { cn } from "@/lib/utils";
import { useState } from "react";

/* Figure for "Stretch your switches while they are held" in the Unpopular tips article.

   One switch, nothing around it, because the whole thing is one `:active` rule on the knob: while
   the pointer is down it stretches towards the end it is about to travel to. No state, no spring
   library, no gesture handler — press and the control gives, release and it snaps back.

   The track never changes size, so nothing next to it can be pushed around. The knob is pinned to
   both ends of it (3px from the side it rests on, 29px from the other) rather than translated,
   which means its width is simply whatever those two offsets leave over: pulling the far one in
   to 20px both elongates it and points it in the right direction, in one property. A translated
   knob would need a second, competing scale to do the same, and would smear its rounded caps
   doing it.

   The knob is a pill before you ever touch it — 72×32 track, 3px of padding, so it rests at 40
   across a 26 tall body and goes to 49 while held. A circle that only becomes a pill on press
   reads as a glitch; a pill that leans a little further into the gap it is about to cross reads as
   the thing giving way under the finger. */

type Mode = "plain" | "stretch";

const MODES: { value: Mode; label: string }[] = [
  { value: "plain", label: "Plain" },
  { value: "stretch", label: "Stretch" },
];

export function SwitchStretch() {
  const [mode, setMode] = useState<Mode>("plain");
  const [on, setOn] = useState(true);
  const stretch = mode === "stretch";

  return (
    <figure className="not-prose max-lg:-mx-4 mx-auto my-8 max-w-[520px] font-pretendard">
      <div className="flex justify-center rounded-sm p-4 outline -outline-offset-1 outline-black/5 md:p-12 dark:outline-white/8">
        {/* A floor on the stage rather than more padding: the switch is small enough that the
            frame would otherwise shrinkwrap to a strip, and the min-height keeps the figure the
            same weight in the column as the other three. Equal 1fr rows above and below the switch
            hold it at the exact vertical center of the stage while the control sits on the floor,
            matching the button figure. */}
        <div className="grid min-h-[12rem] w-full grid-rows-[1fr_auto_1fr] justify-items-center">
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label="Example switch"
            onClick={() => setOn((wasOn) => !wasOn)}
            // Safari only honours `:active` on touch when the element or an ancestor carries a
            // touchstart listener. This empty handler is what gets one registered — without it the
            // stretch is a desktop-only flourish.
            onTouchStart={() => {}}
            className={cn(
              "group relative row-start-2 h-[32px] w-[72px] shrink-0 cursor-pointer touch-manipulation select-none rounded-full",
              "[-webkit-tap-highlight-color:transparent]",
              "transition-colors duration-200 ease-out motion-reduce:transition-none",
              // No ring-offset: Tailwind's offset colour is a hard white, and with no card behind
              // the switch any more that would halo in dark mode.
              "outline-none focus-visible:ring-2 focus-visible:ring-default",
              // Content artwork, so it stays out of the token palette: blue for on, and a track
              // that has to read as *empty* against both a white page and a near-black one. The
              // press does not touch the colour — the stretch is the whole feedback.
              on ? "bg-[oklch(0.63_0.19_258)]" : "bg-[oklch(0.88_0_0)] dark:bg-[oklch(0.33_0_0)]",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-y-[3px] rounded-full bg-white",
                "smooth-shadow-ring-xs smooth-ring-black/12",
                // Quick on the way out, unhurried on the way back, which is what makes the release
                // read as elastic rather than as a second animation.
                "transition-[left,right] duration-[280ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
                "motion-reduce:transition-none",
                on ? "left-[29px] right-[3px]" : "left-[3px] right-[29px]",
                stretch && "group-active:duration-[160ms] group-active:ease-out",
                stretch && (on ? "group-active:left-[20px]" : "group-active:right-[20px]"),
              )}
            />
          </button>

          <div
            role="group"
            aria-label="Press behaviour"
            // 16px off the card's visible edge, not the stage floor: the stage sits inside the
            // card padding, so at md the control has to reach 32px into it to land there. At the
            // small size the padding is 16px, and the stage floor already is that line.
            className="relative row-start-3 flex self-end rounded-full bg-surface-tertiary p-1 md:-mb-8 dark:bg-surface"
          >
            {/* Plain CSS transform rather than a layout animation, and two equal cells, so the
                pill is exactly half the track and slides by its own width. */}
            <span
              aria-hidden
              style={{ transform: `translateX(${mode === "plain" ? "0%" : "100%"})` }}
              className="pointer-events-none absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/2)] rounded-full bg-surface smooth-shadow-ring-sm transition-transform duration-200 ease-out dark:bg-surface-tertiary"
            />
            {MODES.map((option) => {
              const active = mode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setMode(option.value)}
                  aria-pressed={active}
                  className={cn(
                    "relative w-[4.75rem] cursor-pointer whitespace-nowrap rounded-full py-1 text-[12px] font-medium transition-colors",
                    "outline-none focus-visible:ring-2 focus-visible:ring-default",
                    active ? "text-primary" : "text-tertiary hover:text-secondary",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </figure>
  );
}
