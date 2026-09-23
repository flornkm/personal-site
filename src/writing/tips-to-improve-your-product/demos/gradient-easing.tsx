import { Image } from "@/components/shared/image";
import { cn } from "@/lib/utils";
import {
  animate,
  motion,
  type MotionValue,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { useState } from "react";

/* Figure for "Ease your gradients" in the Unpopular tips article.

   A scrim over a photo, with the ramp that made it standing beside the card. Pressing the ramp
   eases it.

   The story usually told about this is that fading `to transparent` goes through transparent
   *black* and leaves a grey band. That was a Safari bug and it has been fixed for years —
   gradients interpolate in premultiplied alpha, so the colour comes out right. What is still
   wrong is the shape. A linear ramp is still falling when it hits zero, and that kink in the
   slope draws a horizontal line across the picture exactly where the scrim ends. Nothing in the
   photograph is at that height. The edge belongs to the gradient.

   The figure is built on the second way of writing that curve. Rather than holding the stops in
   place and bending their alpha, it holds every alpha exactly where it is — evenly spaced, top to
   bottom — and moves the stops instead. Even spacing *is* the linear ramp. Pull each stop to where
   the ease reaches its alpha and the same list becomes the eased one, bunched down at the dark end
   and thinned out toward the top where the curve flattens.

   Which makes the control and the effect one operation. There is a single number in this file that
   animates, the handles ride it, the gradient is rebuilt from the same positions on the same frame,
   and the two cannot drift. Nothing enters, nothing leaves, nothing cross-fades — stacking two
   black scrims and dissolving between them would wash pale through the middle of every transition,
   since two half-opacity blacks composite lighter than one full one.

   The photo is load-bearing as well, and it is cropped at source rather than framed at render
   time: the file is already the exact 3:2 window the card shows, kept at the crop's native pixels
   so nothing is resampled twice on the way to the screen. The alp hut centres it and the cattle
   straddle the middle, which is the
   composition; what the figure needs from it is the meadow under them. The ramp — and the edge at
   the top of it — plays out over that one continuous mid-tone field. Over the forest that frames
   the original the two ramps would be near enough indistinguishable, which is the trap this
   figure has to avoid: a texture busy enough hides the very thing being shown. */

// Well short of full black. Anywhere near solid the bottom of the ramp reads as a slab with a
// fade stuck on top of it rather than as one gradient — and with the hold below extending the
// darkest value, the slab threshold sits lower than it did without one. 0.62 over the meadow
// still lands the caption on a comfortably dark ground: the grass is a mid-tone, so the scrim
// carries the contrast budget, but it does not need to win by this much more.
const SCRIM_ALPHA = 0.62;
// Enough stops that each straight segment is shorter than the curvature it stands in for. Fewer
// and the sampling itself starts showing as faint bands, which is the bug being fixed here.
const STOP_COUNT = 16;
/** px. The handle track insets by half of this so the end stops stay centred on 0% and 100%. */
const HANDLE_SIZE = 16;
// px. The stop's own value, shown inside the ring the way a real gradient editor shows it. The
// two sizes leave a 2px ring: enough to hold the swatch off whatever it is sitting on, thin
// enough that the value stays the thing you read rather than the frame around it.
const HANDLE_CORE_SIZE = 12;
// Every other stop gets a handle. All seventeen drive the CSS — dropping the gradient to nine
// stops nearly halves the improvement this figure exists to show, taking the kink where the eased
// ramp lands from 39% of the linear one's up to 54% — but seventeen handles on a bar this narrow
// read as a zipper rather than as something you could grab.
// Must divide STOP_COUNT: anything else leaves the last gap short, and the linear state has to
// read as evenly spaced or the eased one has nothing to be uneven against.
const HANDLE_STRIDE = 4;

/** Fixed for the life of the figure. Only where these sit ever changes. */
const STOP_ALPHAS = Array.from(
  { length: STOP_COUNT + 1 },
  (_, index) => SCRIM_ALPHA * (1 - index / STOP_COUNT),
);

// alpha(p) = A * (1 - p)^n, and the exponent is the whole ease. A cosine arrives flat at *both*
// ends, and the flat end at the bottom is what was building the slab: the ramp sat on its darkest
// value instead of leaving it. Flatness is only worth anything at the top, where the scrim has to
// vanish into the photograph without drawing a line. At the bottom the ramp terminates against
// the hold below it, where a change of slope lands in tones too dark to show, so this curve
// starts moving there immediately — 1.6x the linear ramp's rate off the bottom.
// Above 1 is what keeps the top flat; 1.6 lands the kink there at 35% of the linear ramp's.
const EASE_EXPONENT = 1.6;

// Eased, the ramp compresses upward and this fraction of the scrim's bottom holds near full
// strength. Without a hold, easing drains the exact band the caption stands on — the linear ramp
// is still near its darkest there, the eased one has already left — so toggling the figure made
// its own caption harder to read. A third was tried and read as a slab: a fifth is enough to keep
// the caption's ground steady between the two states while the hold still ends before the eye
// starts reading it as a solid block. The edge being demonstrated lives at the *top* of the ramp
// either way.
const EASE_HOLD = 0.2;

// Inverting the curve for each evenly spaced alpha — the position at which it has already fallen
// that far — then compressing the result into the span above the hold. The bottom stop stays
// pinned to the card edge, so the stretch below the first moved stop reads as the hold: one
// near-flat segment at the scrim's darkest value.
const EASED_POSITIONS = STOP_ALPHAS.map((_, index) => {
  if (index === 0) return 0;
  const inverted = 1 - (1 - index / STOP_COUNT) ** (1 / EASE_EXPONENT);
  return EASE_HOLD + (1 - EASE_HOLD) * inverted;
});

function stopPosition(index: number, progress: number) {
  const linear = index / STOP_COUNT;
  return linear + (EASED_POSITIONS[index] - linear) * progress;
}

function rampAt(progress: number) {
  const parts = STOP_ALPHAS.map(
    (alpha, index) =>
      `rgb(0 0 0 / ${alpha.toFixed(4)}) ${(stopPosition(index, progress) * 100).toFixed(3)}%`,
  );
  return `linear-gradient(to top, ${parts.join(", ")})`;
}

// px. Quadrant of the transparency checker drawn behind each swatch. Sized so an odd number of
// tiles spans the core (12 / 4 = 3): an even count puts a seam through the middle and lands half
// squares on the edge, which scallops the circle and throws the ring's padding out of true.
const CHECKER_SQUARE = 2;
// The pattern a design tool puts behind a colour so its alpha is legible. The light squares are
// left transparent so the handle's own white disc supplies them.
const CHECKER =
  "conic-gradient(rgb(0 0 0 / 0.22) 25%, transparent 0 50%, rgb(0 0 0 / 0.22) 0 75%, transparent 0)";

// Explanatory rather than operational: this is clicked a handful of times, not hundreds, so it can
// take longer than the sub-300ms a real control would get. The bounce is small enough to read as
// weight settling rather than as a flourish. No stagger — the redistribution staggers itself, since
// the middle stops barely move and the ones near the ends travel furthest.
const GLIDE = { type: "spring", duration: 0.5, bounce: 0.1 } as const;
const GLIDE_REDUCED = { duration: 0 } as const;

function RampStop({
  index,
  alpha,
  progress,
}: {
  index: number;
  alpha: number;
  progress: MotionValue<number>;
}) {
  const bottom = useTransform(progress, (p) => `${(stopPosition(index, p) * 100).toFixed(3)}%`);

  return (
    <motion.span
      aria-hidden
      // Centred on its position with margins rather than a translate, so the only thing driving
      // this element is the one value it subscribes to.
      className="absolute left-1/2 flex items-center justify-center rounded-full bg-white smooth-shadow-ring-sm smooth-ring-black/20"
      style={{
        width: HANDLE_SIZE,
        height: HANDLE_SIZE,
        marginLeft: -HANDLE_SIZE / 2,
        marginBottom: -HANDLE_SIZE / 2,
        bottom,
      }}
    >
      {/* The stop's value over a checker, so the swatch reads as an *alpha* rather than as a grey.
          Two layers: the flat colour on top, the checker under it. The bottom stop very nearly
          hides the checker, the top one is pure checker, and every stop between shows exactly how
          much of it survives — which is the transparency, stated in the only unit that needs no
          label. */}
      <span
        className="rounded-full"
        style={{
          width: HANDLE_CORE_SIZE,
          height: HANDLE_CORE_SIZE,
          backgroundImage: `linear-gradient(rgb(0 0 0 / ${alpha.toFixed(4)}), rgb(0 0 0 / ${alpha.toFixed(4)})), ${CHECKER}`,
          backgroundSize: `auto, ${CHECKER_SQUARE * 2}px ${CHECKER_SQUARE * 2}px`,
          // Centred, so the pattern is symmetric about the circle rather than anchored to its
          // top-left corner — otherwise the ring looks thicker on one side than the other.
          backgroundPosition: "center",
        }}
      />
    </motion.span>
  );
}

export function GradientEasing() {
  const reduceMotion = useReducedMotion() ?? false;
  const [eased, setEased] = useState(false);
  const progress = useMotionValue(0);
  const gradient = useTransform(progress, rampAt);

  const toggle = () => {
    const next = !eased;
    setEased(next);
    animate(progress, next ? 1 : 0, reduceMotion ? GLIDE_REDUCED : GLIDE);
  };

  return (
    <figure className="not-prose mx-auto my-8 max-w-[520px] font-pretendard">
      <div className="flex justify-center rounded-sm p-4 outline -outline-offset-1 outline-black/5 md:p-12 dark:outline-white/8">
        {/* items-stretch rather than a matched height: the card's height comes from its aspect
            ratio, and the ramp takes whatever that turns out to be. */}
        <div className="flex w-full items-stretch justify-center gap-3">
          {/* An inset hairline rather than an elevation shadow: the photo's own pixels run all the
              way to the rounded edge, and a line drawn just inside contains them without the card
              having to float off the stage. Outlines paint above descendants, so it stays visible
              where the scrim reaches the bottom corners. */}
          <div
            className={cn(
              "relative w-full max-w-[24rem] overflow-hidden rounded-2xl",
              // Drawn as an overlay rather than the element's own outline: ::after is the last
              // child, so it paints above the photo, the scrim and the caption.
              "after:pointer-events-none after:absolute after:inset-0 after:rounded-2xl",
              "after:outline after:-outline-offset-1 after:outline-black/15 dark:after:outline-white/15",
            )}
          >
            {/* The file is already cropped to exactly this 3:2 window, so nothing is being framed
                here at render time. The crop holds the hut just above centre and stops short of
                the fir tops at the original's bottom edge; everything under the cattle is open
                meadow, which is the one continuous field in the original and the only surface the
                scrim can be honestly read against. */}
            <Image
              src="/images/writing/tips-to-improve-your-product/alpine-pasture.webp"
              alt="A timber alp hut on a mountain pasture seen from above, cattle gathered on the track looping around it"
              objectFit="cover"
              sizes="(min-width: 768px) 384px, 90vw"
              style={{ aspectRatio: "3 / 2" }}
            />
            {/* Reaches just under the hut's forecourt. Its top edge crosses the lower cattle, but
                the top of the ramp is where both curves are at their most transparent, so what
                lands on them is a whisper — while the extra travel is what keeps the fade above
                the caption unhurried. */}
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-[48%]"
              style={{ backgroundImage: gradient }}
            />
            {/* The caption is why a scrim is here at all. Without something to make legible the
                gradient reads as decoration, and decoration nobody misses when it is wrong. */}
            <div className="absolute inset-x-0 bottom-0 flex items-baseline justify-between p-4">
              <p className="text-[13px] font-medium leading-tight text-white">Alpine pasture</p>
              <p className="text-[13px] leading-tight text-white/70">Midday</p>
            </div>
          </div>

          {/* A switch in behaviour, a gradient ramp in appearance. No overflow-hidden — the rounding
              lives on the gradient layer instead, so the end stops can sit centred on 0% and 100%
              without their handles being sliced by the corner radius. */}
          <button
            type="button"
            role="switch"
            aria-checked={eased}
            aria-label="Ease the gradient ramp"
            onClick={toggle}
            className={cn(
              "relative w-2.5 shrink-0 cursor-pointer self-stretch rounded-full bg-white",
              // Same 15% as the card's ring, but with no dark variant: the bar is a white swatch
              // in both themes, so a theme-aware hairline would invert onto white and disappear.
              "outline -outline-offset-1 outline-black/15",
              "transition-[outline-color] duration-150 ease-out",
              "hover:outline-black/30",
              "focus-visible:ring-2 focus-visible:ring-default",
            )}
          >
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{ backgroundImage: gradient }}
            />
            <span
              aria-hidden
              className="absolute inset-x-0"
              style={{ top: HANDLE_SIZE / 2, bottom: HANDLE_SIZE / 2 }}
            >
              {STOP_ALPHAS.map((alpha, index) => {
                if (index % HANDLE_STRIDE !== 0) return null;
                return <RampStop key={index} index={index} alpha={alpha} progress={progress} />;
              })}
            </span>
          </button>
        </div>
      </div>
    </figure>
  );
}
