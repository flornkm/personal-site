import { cn } from "@/lib/utils";
import { IconCheckmark1Small } from "central-icons/IconCheckmark1Small";
import { motion, useReducedMotion } from "motion/react";
import { useId, useRef, useState } from "react";

/* Figure for "Clip your avatars" in the Unpopular tips article. Dressed as a real members
   panel, so the technique is shown where it actually gets used rather than on a blank stage.

   The separation between two overlapping avatars is a *hole*, not a ring in the background
   colour. Each avatar is an SVG whose mask subtracts the neighbour's circle, grown by the gap,
   out of its own body — so whatever sits behind the stack shows through the crescent. That is
   what the Backdrop checkbox is for: with a plain surface behind them a painted-on ring and a
   real cutout look identical, and the moment there is anything else back there the fake one
   gives itself away.

   The ring is built the same way: its two arcs are the avatar circle inset by half the stroke
   and the neighbour's grown circle, meeting exactly where the clip's arcs meet, so it hugs the
   cut outline instead of drawing a full circle that the cut then slices through. */

const SIZE = 64;
/** Fraction of the diameter each avatar sinks into the one before it. */
const OVERLAP = 0.25;
// Visible crescent between neighbours, px. Absolute rather than a fraction of SIZE: it reads as
// a hairline of daylight at any avatar size, and scaling it would turn it into a design element.
// Nudged up with the larger avatars only so the stripes behind still have room to show through.
const GAP = 3;
const RING_WIDTH = 1;
/** Centers the stroke so its outer edge sits exactly on the clipped outline. */
const RING_INSET = RING_WIDTH / 2;

const RADIUS = SIZE / 2;
const NEIGHBOUR_CX = RADIUS - SIZE * (1 - OVERLAP);
const CUT_RADIUS = RADIUS + GAP;

// The crescent eats the left of a clipped avatar, so its visible region's optical center sits
// right of the geometric one. Halfway toward the visible band's midpoint reads centered.
const CLIPPED_TEXT_SHIFT = (NEIGHBOUR_CX + CUT_RADIUS) / 4;

/** Stripe period measured perpendicular to the 45° bands. */
const STRIPE_PERIOD = 22;
// Sliding the layer sideways only shifts the pattern's phase by the component along the gradient
// axis, so a horizontal travel of period / sin(45°) lands exactly one stripe on. Anything else
// and the loop visibly jumps at the seam.
const STRIPE_TRAVEL = STRIPE_PERIOD * Math.SQRT2;

// Equal perceived brightness: every fill sits at L 0.52, well below both stripe tones, so the
// stack stays the foreground wherever it lands on the candy. Content artwork, so it stays
// outside the token palette.
const PEOPLE = [
  {
    id: "fk",
    initials: "FK",
    fill: "fill-[oklch(0.52_0.15_265)]",
    ink: "fill-[oklch(0.95_0.03_265)]",
  },
  {
    id: "nils",
    initials: "NE",
    fill: "fill-[oklch(0.52_0.13_210)]",
    ink: "fill-[oklch(0.95_0.03_210)]",
  },
  {
    id: "ew",
    initials: "EW",
    fill: "fill-[oklch(0.52_0.16_330)]",
    ink: "fill-[oklch(0.95_0.03_330)]",
  },
  // The overflow chip: same treatment, so the trick has to survive a neutral fill too.
  { id: "more", initials: "+2", fill: "fill-[oklch(0.62_0_0)]", ink: "fill-[oklch(0.97_0_0)]" },
];

// Finger drift, in px, still counted as a tap rather than an aborted scroll. Roughly the wobble
// of a deliberate tap; past it the reader was going somewhere else.
const TAP_SLOP = 12;

interface Option {
  key: "clip" | "ring" | "optical" | "backdrop";
  label: string;
}

// Labels only: the article says what each one does, and a second line per row turns a control
// panel into a paragraph you have to read before you can play with it.
const OPTIONS: Option[] = [
  { key: "clip", label: "Clip" },
  { key: "ring", label: "Pseudo ring" },
  { key: "optical", label: "Optically center" },
  { key: "backdrop", label: "Backdrop" },
];

export function AvatarClipping() {
  const reduceMotion = useReducedMotion() ?? false;
  // All four off to start: the figure opens on the naive stack the tip is arguing against, so the
  // fix is something the reader switches on rather than something they have to undo.
  const [on, setOn] = useState({ clip: false, ring: false, optical: false, backdrop: false });
  const toggle = (key: Option["key"]) => setOn((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    // Pretendard throughout, matching the other figure — the monogram inherits it like everything
    // else rather than carrying its own family.
    <figure className="not-prose mx-auto my-8 max-w-[520px] font-pretendard">
      <div className="flex justify-center rounded-sm p-4 outline -outline-offset-1 outline-black/5 md:p-12 dark:outline-white/8">
        {/* Concentric radii, so the corners stay parallel to whatever they wrap. Top: the card's
            20px plus the 4px tray padding = 24px. Bottom: the row's 12px plus its 6px inset =
            18px. One radius for both would bow away from the rows now that the padding is tight. */}
        <div className="w-full max-w-[21.5rem] rounded-t-3xl rounded-b-[1.125rem] bg-surface-tertiary p-1 dark:bg-surface-secondary">
          {/* The white card holds the specimen and nothing else. The controls live on the grey
              tray around it, so the surface the avatars are cut against stays uninterrupted. */}
          <div
            className={cn(
              "overflow-hidden rounded-[1.25rem] bg-surface",
              // With the backdrop on, the card is a saturated gradient edge to edge. An elevation
              // shadow under that reads as grime, so the edge moves inside as a hairline instead
              // (drawn as an overlay below, since an inset shadow would paint under the gradient).
              !on.backdrop && "smooth-shadow-ring-sm",
            )}
          >
            <div className="relative flex h-[8.75rem] items-center justify-center overflow-hidden">
              {/* Sits behind the stack, not inside it, so it shows through the crescents rather
                  than around them.

                  Stripes rather than a gradient, because the job here is evidence, not decoration.
                  A gradient only proves the hole where its colour happens to differ from the
                  surface, so it has to be tuned until every part of it reads. A hard edge crossing
                  the crescent proves it outright: you can see a stripe enter one side of the gap
                  and come out the other, which a ring painted in the surface colour can never fake.

                  Candy stripe, so the panel stays friendly rather than looking like a debug
                  overlay. 22px period puts roughly two edges across each crescent, and both tones
                  sit well above the avatars' L 0.52 so the stack still reads as the foreground.
                  The white is a hair off pure (L 0.99, a trace of the red's hue) so it belongs to
                  the stripe rather than reading as a hole in the backdrop itself. */}
              {on.backdrop && (
                <motion.div
                  aria-hidden
                  // Overhangs the card on both sides so the travel never drags an edge into view,
                  // and translated rather than animating background-position: a transform stays on
                  // the compositor, which matters for something running the whole time the figure
                  // is on screen.
                  // The pale band is a var so dark mode can flip it to near-black. A white stripe
                  // on a dark page reads as a light leak; inverting it keeps the backdrop obviously
                  // *behind* the card. Both bands keep a trace of the red's hue so the pair still
                  // belongs to one stripe rather than looking like two unrelated colours.
                  className={cn(
                    "absolute -inset-x-16 inset-y-0",
                    "[--stripe-a:oklch(0.72_0.15_20)] [--stripe-b:oklch(0.99_0.005_20)]",
                    "dark:[--stripe-b:oklch(0.18_0.02_20)]",
                  )}
                  style={{
                    background:
                      "repeating-linear-gradient(45deg, var(--stripe-a) 0 11px, var(--stripe-b) 11px 22px)",
                  }}
                  animate={reduceMotion ? { x: 0 } : { x: [0, STRIPE_TRAVEL] }}
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { duration: 1.6, ease: "linear", repeat: Infinity }
                  }
                />
              )}
              <div className="relative flex items-center">
                {PEOPLE.map((person, index) => (
                  <StackAvatar
                    key={person.id}
                    person={person}
                    isFirst={index === 0}
                    clip={on.clip}
                    ring={on.ring}
                    optical={on.optical}
                  />
                ))}
              </div>

              {/* Last child, not an inset shadow on the card: `box-shadow: inset` paints above the
                  background but below descendants, so the full-bleed gradient would cover it. */}
              {on.backdrop && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-[1.25rem] ring-1 ring-inset ring-black/10 dark:ring-white/15"
                />
              )}
            </div>
          </div>

          {/* Asymmetric: the tray's own p-1 already sits under the last row, so an equal py here
              would leave the bottom looking twice as loose as the gap under the card. pb-0.5
              lands the bottom inset on the same 6px as the sides. */}
          <div className="px-0.5 pb-0.5 pt-1.5">
            {OPTIONS.map((option) => (
              <CheckRow
                key={option.key}
                option={option}
                checked={on[option.key]}
                onChange={() => toggle(option.key)}
              />
            ))}
          </div>
        </div>
      </div>
    </figure>
  );
}

function CheckRow({
  option,
  checked,
  onChange,
}: {
  option: Option;
  checked: boolean;
  onChange: () => void;
}) {
  /* A touch click is dispatched at the point the finger *lifted*, not the point it landed. So a
     press that starts on one row and slides a few pixels before releasing toggles whichever row
     it ended over — the wrong one, and on a list this tight usually the row right above or below
     the one the reader was aiming at.

     The gesture is vetted before the click is allowed to count: the press has to have started on
     this row and to have stayed within a finger's wobble of where it landed. A drift is then
     ignored twice over — the row it started on never sees the release, and the row it ended over
     never saw the press — so a sloppy tap costs a second tap rather than undoing an earlier one.
     Both refs live for the length of one gesture and are consumed by the click that ends it. */
  const press = useRef<{ x: number; y: number } | null>(null);
  const wasTap = useRef(false);

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onPointerDown={(event) => {
        press.current = event.isPrimary ? { x: event.clientX, y: event.clientY } : null;
        wasTap.current = false;
      }}
      // Safari only honours `:active` on touch when the element or an ancestor carries a
      // touchstart listener, the same empty handler the button figure needs.
      onTouchStart={() => {}}
      onPointerUp={(event) => {
        const start = press.current;
        press.current = null;
        wasTap.current =
          !!start && Math.hypot(event.clientX - start.x, event.clientY - start.y) <= TAP_SLOP;
      }}
      // Fired the moment the browser decides the gesture is a scroll, which is exactly when the
      // row has to stop treating it as a tap.
      onPointerCancel={() => {
        press.current = null;
        wasTap.current = false;
      }}
      onClick={(event) => {
        const fromTap = wasTap.current;
        wasTap.current = false;
        // detail 0 means the click was synthesised — keyboard, or a screen reader's activation.
        // There is no gesture to vet there, and no other way for those users to reach the row.
        if (event.detail !== 0 && !fromTap) return;
        onChange();
      }}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-left",
        // 44px on a finger, the row's own height under a cursor. The rows sit flush against each
        // other with no gutter to absorb a near miss, so the only thing standing between a tap
        // aimed at one label and the next is how tall the target is.
        "pointer-coarse:min-h-11",
        // No double-tap zoom to wait on: without this the browser holds the click back ~300ms to
        // see whether a second tap is coming, and two quick taps down the list get read as one
        // gesture instead of two. select-none keeps a slightly long press from starting a
        // selection over the label instead of registering as a tap.
        "touch-manipulation select-none",
        // Translucent rather than a surface token: these rows sit on the grey tray, and every
        // named surface lighter than it reads as a highlight rather than a press. Black in light
        // steps the row *down* from the tray; dark inverts to white because the tray is already
        // near-black and there is nothing below it to step to.
        // No transition on the row: a fade makes the highlight trail the cursor as it moves down
        // the list, so two rows read as lit at once. Snapping keeps it pinned to the pointer.
        "outline-none hover:bg-black/8 dark:hover:bg-white/8",
        "focus-visible:bg-black/8 dark:focus-visible:bg-white/8",
        // Tailwind's `hover` only applies where a device can hover, so touch would otherwise get
        // no acknowledgement at all between the tap and the box filling in — and this article has
        // a section arguing precisely that.
        "active:bg-black/8 dark:active:bg-white/8",
      )}
    >
      <span
        className={cn(
          "grid size-[1.125rem] shrink-0 place-items-center rounded-[0.4rem] transition-colors",
          // smooth-shadow-ring-xs already bakes its hairline into the shadow, so the unchecked box gets
          // no separate border on top of it.
          checked ? "bg-accent-primary" : "bg-surface smooth-shadow-ring-xs",
        )}
      >
        {checked && <IconCheckmark1Small className="size-3.5 text-accent-foreground" />}
      </span>
      <span className="truncate text-[14px] font-medium text-primary">{option.label}</span>
    </button>
  );
}

function StackAvatar({
  person,
  isFirst,
  clip,
  ring,
  optical,
}: {
  person: (typeof PEOPLE)[number];
  isFirst: boolean;
  clip: boolean;
  ring: boolean;
  optical: boolean;
}) {
  // Per-instance ids: colliding mask ids would clip every stack against the first one's defs.
  const id = useId();
  // The first avatar has no neighbour to subtract, so it is never clipped regardless of the toggle.
  const clipped = clip && !isFirst;

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      aria-hidden
      className="select-none"
      style={{ marginLeft: isFirst ? 0 : -SIZE * OVERLAP }}
    >
      {clipped && (
        <defs>
          <mask id={`${id}-body`}>
            <rect width="100%" height="100%" fill="black" />
            <circle cx={RADIUS} cy={RADIUS} r={RADIUS} fill="white" />
            <circle cx={NEIGHBOUR_CX} cy={RADIUS} r={CUT_RADIUS} fill="black" />
          </mask>
          <mask id={`${id}-ring`}>
            <rect width="100%" height="100%" fill="white" />
            <circle cx={NEIGHBOUR_CX} cy={RADIUS} r={CUT_RADIUS + RING_INSET} fill="black" />
          </mask>
          <clipPath id={`${id}-clip`}>
            <circle cx={RADIUS} cy={RADIUS} r={RADIUS - RING_INSET} />
          </clipPath>
        </defs>
      )}

      <g mask={clipped ? `url(#${id}-body)` : undefined}>
        {/* Painted first so it doubles as the fallback: if the photo is missing the <image> simply
            renders nothing and the fill (plus the initials) is what stays. */}
        <circle cx={RADIUS} cy={RADIUS} r={RADIUS} className={person.fill} />
        // Only the monogram breaks to SF Rounded, and heavier than the panel's type — at 13px //
        the rounded terminals need the weight to register as a choice rather than a wobble.
        <text
          // Geometric center is wrong once the crescent has eaten the left edge: the initials
          // then sit visibly off inside what is actually left of the circle. Nudging halfway
          // toward the visible band's midpoint reads centered; the full midpoint overshoots.
          x={clipped && optical ? RADIUS + CLIPPED_TEXT_SHIFT : RADIUS}
          y={RADIUS}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={SIZE * 0.29}
          fontWeight={700}
          className={person.ink}
        >
          {person.initials}
        </text>
      </g>

      {/* Unclipped, this is the ordinary full circle every avatar stack draws — and the reason
          the gap has to be faked in the surface colour. Clipped, it becomes two arcs that meet
          exactly where the cut does, so it follows the crescent instead of crossing it. */}
      {ring && (
        <g fill="none" strokeWidth={RING_WIDTH} className="stroke-black/20 dark:stroke-white/35">
          <circle
            cx={RADIUS}
            cy={RADIUS}
            r={RADIUS - RING_INSET}
            mask={clipped ? `url(#${id}-ring)` : undefined}
          />
          {clipped && (
            <circle
              cx={NEIGHBOUR_CX}
              cy={RADIUS}
              r={CUT_RADIUS + RING_INSET}
              clipPath={`url(#${id}-clip)`}
            />
          )}
        </g>
      )}
    </svg>
  );
}
