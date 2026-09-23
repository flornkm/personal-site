import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useState } from "react";

/* Figure for "Don't skip the active state" in the Unpopular tips article.

   One button and a dropdown that swaps what happens while it is held. Nothing else, because the
   entire subject is a single `:active` rule: there is no state to track, no gesture handler, no
   spring library. The dropdown only decides which class the button carries.

   Hover is here too, a step up where the press is a drop to near-black. The two have to be ranked,
   not merely different: hover says the cursor is over the target, the press says the target took
   the input, and if the hover is as loud as the press then arriving somewhere looks the same as
   doing something. Which is also the reason the press cannot be left out — on touch the hover
   step never happens at all, so a button without an active state gives its user nothing.

   The two press styles are the two honest answers, not a good one and a bad one. Scaling gives
   way under the finger and reads playful; a tonal shift stays exactly where it is and reads calm.
   Which one is right is a question about the brand, and "None" is there so the difference against
   nothing at all is available in the same control. */

type Press = "none" | "playful" | "subtle";

const PRESS_OPTIONS: { value: Press; label: string }[] = [
  { value: "none", label: "None" },
  { value: "playful", label: "Playful" },
  { value: "subtle", label: "Subtle" },
];

// Near-black, and a true neutral: chroma zero rather than a cooled or warmed grey, so nothing in
// here competes with the page. One fill serves both themes, which is the reason it stops at 0.27
// instead of going to black — against this site's pure #000 dark page a black button would be a
// hole, and 0.27 clears it by more than the site's own cards clear it.
//
// Hover goes up rather than down: four points off near-black in the other direction is almost
// nothing to look at, so the lift is where the contrast is. The press then goes the opposite way
// and nearly all the way, which is what makes the two unmistakable rather than different — the
// button rises to meet the cursor and drops out from under the finger, and neither can be mistaken
// for the other at a glance. Rest sits at 0.27 rather than lower so the press has somewhere to
// travel to, and so one fill can serve both themes.
const BUTTON_FILL = "bg-[oklch(0.27_0_0)] text-white hover:bg-[oklch(0.31_0_0)]";

/* Depth from two layers, both inside the button, and no drop shadow at all. The fill has to stay
   a single animatable `background-color` for the press below, so none of this can be a gradient.

   1. Light along the top inside edge, blurred and fading down into the fill rather than drawn as
      a hard 1px line. The negative spread pushes the other three sides out of the box so the glow
      only exists where light would actually land, and the offset runs one px past it, which leaves
      a hairline of the glow at full strength on the top row with the blur carrying the rest down.
      Cancelling the two exactly instead puts the whole falloff on the boundary, and half of it
      then lands outside the button — the reason the first pass at this was invisible on a fill
      this dark. A hard line reads as a second border; this reads as a surface curving up to meet
      the light. Plain white rather than a tint, since the fill has no hue of its own to pick up,
      and dimmer in dark mode: the same white reads far hotter with a black page around it than
      with a white one, because the eye is judging it against everything else on screen.
   2. The edge, inset so it lands on the button's own pixels instead of adding a line outside it.
      Black on a light page, white at 15% on a dark one: the seam has to be the thing the surface
      is not, and against a near-black page a black rim would just be more page. Listed first,
      because the earlier layer in a box-shadow paints over the later ones — the rim sits on top
      and the light starts just inside it. Reversed, the highlight's brightest row would land on
      the rim and read as a dark line above its own glow.

   Keeping the elevation entirely internal is what stops the figure drifting off its subject. A
   drop shadow lifts the button off the page, and once it is floating the eye starts reading the
   distance rather than the press. */
const BUTTON_DEPTH = cn(
  "[--btn-edge:oklch(0_0_0)] dark:[--btn-edge:oklch(1_0_0_/_0.15)]",
  "[--btn-glow:oklch(1_0_0_/_0.4)] dark:[--btn-glow:oklch(1_0_0_/_0.18)]",
  "shadow-[inset_0_0_0_1px_var(--btn-edge),inset_0_4px_4px_-3px_var(--btn-glow)]",
);

// A real spring, sampled into `linear()` rather than approximated by a bezier — a bezier cannot
// cross its own target, which is the entire character of a spring. Underdamped at ζ=0.5: it
// overshoots 16% of the distance a third of the way through and is settled by the end. On a 0.06
// scale delta that is a dip to 0.930 going down and a lift to 1.010 coming back, which is the give
// a hand expects and no more. 21 samples because the curve crosses its target twice and coarser
// sampling straightens the second crossing out.
const SPRING_VAR =
  "[--press-spring:linear(0,0.09,0.298,0.547,0.779,0.963,1.085,1.148,1.163,1.145,1.11,1.069,1.032,1.003,0.985,0.975,0.974,0.977,0.983,0.989,1)]";

// Written as the `transition` shorthand rather than as Tailwind's duration and easing utilities,
// because the two properties in play need different ones and those utilities only set one of each.
// The colour is on a plain ease-out throughout — hover and press are the same material and should
// behave the same — while the scale gets the spring. Sending a colour through an overshooting
// curve would push it past its target and back, which on any saturated fill just clips.
//
// Down fast, back slowly, in both modes. The press is a reaction and has to land inside the same
// moment as the finger; the release is the button recovering, and letting it take its time is what
// stops the return reading as a second, separate animation.
//
// Spelled out in full rather than composed from constants: Tailwind reads these class names out of
// the source as plain text, and a template literal is invisible to it.
const PRESS_CLASS: Record<Press, string> = {
  none: "[transition:background-color_180ms_ease-out]",
  playful: cn(
    "[transition:background-color_180ms_ease-out,scale_420ms_var(--press-spring)]",
    "active:[transition:background-color_180ms_ease-out,scale_240ms_var(--press-spring)]",
    "active:scale-[0.94]",
  ),
  // Almost the floor, not the floor. On a fill already this dark a few points is nothing, so the
  // press takes eleven and stops just short of black — far enough that it cannot be mistaken for
  // the rest state or for hover, short enough that the button is still a surface rather than a
  // hole. Actual black would match this site's dark page exactly and leave the rim holding an
  // empty silhouette, which reads as the button being cut out of the page rather than pressed.
  subtle: cn(
    "[transition:background-color_240ms_ease-out]",
    "active:[transition:background-color_90ms_ease-out]",
    "active:bg-[oklch(0.16_0_0)]",
  ),
};

export function ActiveState() {
  const [press, setPress] = useState<Press>("none");

  return (
    <figure className="not-prose max-lg:-mx-4 mx-auto my-8 max-w-[520px] font-pretendard">
      <div className="flex justify-center rounded-sm p-4 outline -outline-offset-1 outline-black/5 md:p-12 dark:outline-white/8">
        {/* Same floor and the same control-below-the-subject stack as the switch figure, so the two
            sit at the same weight in the column. Equal 1fr rows above and below the button hold it
            at the exact vertical center of the stage while the trigger sits on the floor. One
            content-sized column, so nothing here is a magic number: the button decides the width
            and the default stretch alignment pulls the trigger out to match, landing it exactly
            under the button rather than near it. */}
        <div className="grid min-h-[12rem] w-full grid-rows-[1fr_auto_1fr] justify-center">
          <button
            type="button"
            // Safari only honours `:active` on touch when the element or an ancestor carries a
            // touchstart listener. This empty handler is what registers one — without it the whole
            // figure is a desktop-only flourish on the exact devices that have no hover to fall
            // back on.
            onTouchStart={() => {}}
            className={cn(
              "row-start-2 h-11 shrink-0 cursor-pointer touch-manipulation select-none rounded-full px-6",
              "text-[15px] font-medium [-webkit-tap-highlight-color:transparent]",
              BUTTON_FILL,
              BUTTON_DEPTH,
              "outline-none focus-visible:ring-2 focus-visible:ring-default",
              SPRING_VAR,
              // Promoted up front so the spring never waits on a layer being created mid-press.
              "will-change-transform",
              // `scale`, not `transform`: Tailwind v4's scale utility sets the standalone `scale`
              // property, and a transition naming only `transform` would let it snap.
              PRESS_CLASS[press],
              // The colour keeps fading; it is the movement that reduced motion asks to be spared.
              "motion-reduce:[transition:background-color_180ms_ease-out] motion-reduce:active:scale-100",
            )}
          >
            Continue
          </button>

          <Select.Root
            value={press}
            // Null is Base UI's "cleared" value, which nothing in here can produce: there is no
            // clear affordance and one of the three is always selected.
            onValueChange={(value) => value && setPress(value)}
            items={PRESS_OPTIONS}
            // The page keeps scrolling while this is open. Locking an article's scroll for a
            // three-item control in a figure is heavier than the control deserves.
            modal={false}
          >
            {/* 16px off the card's visible edge, not the stage floor: the stage sits inside the
                card padding, so at md the control has to reach 32px into it to land there. At the
                small size the padding is 16px, and the stage floor already is that line. */}
            <Select.Trigger aria-label="Press behaviour" className="row-start-3 self-end md:-mb-8">
              <Select.Value />
            </Select.Trigger>

            <Select.Content
              // No overlay in the figure — the popup opening over the trigger reads as the
              // control jumping. Open upwards instead, into the empty half of the stage the
              // button is standing in, rather than over the article.
              alignItemWithTrigger={false}
              side="top"
              // Portalled out of the figure, so the article's font has to come along with it.
              className="font-pretendard"
            >
              {PRESS_OPTIONS.map((option) => (
                <Select.Item key={option.value} value={option.value}>
                  {option.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </div>
      </div>
    </figure>
  );
}
