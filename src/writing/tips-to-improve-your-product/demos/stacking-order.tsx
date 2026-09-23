import { selectStyles } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { IconCheckmark1Small } from "central-icons/IconCheckmark1Small";
import { IconChevronGrabberVertical } from "central-icons/IconChevronGrabberVertical";
import { IconColorSwatch } from "central-icons/IconColorSwatch";
import { IconAnimationElastic } from "central-icons/IconAnimationElastic";
import { IconSearchMenu } from "central-icons/IconSearchMenu";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type CSSProperties, useState } from "react";

/* Figure for "Avoid z-index as much as possible" in the Unpopular tips article.
   The oldest bug in the book: a dropdown that opens *behind* the thing below it.

   `z-index` is the panel as most codebases have it. The toolbar sits at z-index 1, the content
   under it at z-index 2, and the menu carries a desperate 9999. The 9999 does nothing: a
   positioned element with a z-index starts its own stacking context, so the menu can only ever
   be the top layer *within the toolbar*, and the toolbar as a whole still loses to the content.
   No number typed into the menu can fix that, which is the point.

   `order` removes every z-index and moves the toolbar to the end of the list while the menu is
   open. Both panels are absolutely positioned off their own fixed offset rather than their index,
   so re-ordering the DOM changes which one paints on top and moves nothing on screen. */

const TOOLBAR_TOP = 0;
// The 33px trigger plus 10px above and below, so the toolbar's vertical padding matches the 10px
// it keeps to the right of the trigger.
const TOOLBAR_HEIGHT = 53;
// A 12px gap — as tight as the cut allows. The content card's top edge lands exactly where the
// open menu's first label starts, so the menu is sliced through its padding instead of through a
// word. Any looser and the cut runs across the glyphs, which reads as a rendering glitch rather
// than as something hidden behind.
const CONTENT_TOP = TOOLBAR_HEIGHT + 12;
const CONTENT_HEIGHT = 132;

const OPTIONS = ["Newest", "Oldest", "A–Z"] as const;
type Option = (typeof OPTIONS)[number];

type Mode = "z" | "order";

const MODES: { value: Mode; label: string }[] = [
  { value: "z", label: "z-index" },
  { value: "order", label: "Order" },
];

// Tag colour is content artwork, not UI chrome, so it sits outside the token palette. These are
// identity, not status — a green/amber/red set would read as a traffic light and drag severity
// into a demo that is about paint order. Instead: three neighbouring hues walking blue → violet →
// pink, each holding its hue across background and text, all four stops locked to one lightness
// and chroma band per theme so no tag shouts louder than the others.
const TAGS = {
  ui: "bg-[oklch(0.95_0.04_255)] text-[oklch(0.52_0.17_255)] dark:bg-[oklch(0.31_0.07_255)] dark:text-[oklch(0.84_0.11_255)]",
  motion:
    "bg-[oklch(0.95_0.04_300)] text-[oklch(0.53_0.17_300)] dark:bg-[oklch(0.31_0.07_300)] dark:text-[oklch(0.85_0.11_300)]",
  tokens:
    "bg-[oklch(0.95_0.04_355)] text-[oklch(0.56_0.17_355)] dark:bg-[oklch(0.31_0.07_355)] dark:text-[oklch(0.85_0.11_355)]",
} as const;

// A design-system changelog — newest first, so the list actually reflects what the toolbar above
// it claims to be doing. The leading icons stay at text weight and tertiary: they identify the
// row at a glance without competing with the tag, which is the only colour in here.
const ROWS = [
  { title: "Command palette", tag: "UI", tone: TAGS.ui, Icon: IconSearchMenu },
  { title: "Spring presets", tag: "Motion", tone: TAGS.motion, Icon: IconAnimationElastic },
  { title: "Color scales", tag: "Tokens", tone: TAGS.tokens, Icon: IconColorSwatch },
];

// Asymmetric on purpose: the menu is simply *there* on open, and leaves slowly enough that you
// can watch which panel it passes behind on the way out.
const MENU_IN = { duration: 0.05, ease: "easeOut" } as const;
const MENU_OUT = { duration: 0.15, ease: "easeOut" } as const;
// Softer and slower than the menu — the trigger gives way, it doesn't snap.
const SETTLE = { type: "spring", stiffness: 340, damping: 26, mass: 0.9 } as const;

export function StackingOrder() {
  const reduceMotion = useReducedMotion() ?? false;
  const [mode, setMode] = useState<Mode>("z");
  const [open, setOpen] = useState(true);
  // Stays true through the menu's exit animation. Moving the toolbar back to its source position
  // the instant `open` flips would drop the menu behind the content card mid-fade — it has to
  // keep painting in front for the whole way out.
  const [menuMounted, setMenuMounted] = useState(true);
  const [selected, setSelected] = useState<Option>("Newest");

  // In `order` mode the toolbar only needs to come last while its menu is on screen; once the
  // menu is gone the panels sit in their natural source order again.
  const toolbarLast = mode === "order" && menuMounted;

  const closeMenu = () => setOpen(false);
  const toggleMenu = () => {
    setMenuMounted(true);
    setOpen((wasOpen) => !wasOpen);
  };

  const toolbar = (
    <Toolbar
      key="toolbar"
      mode={mode}
      open={open}
      selected={selected}
      reduceMotion={reduceMotion}
      onToggle={toggleMenu}
      onMenuGone={() => setMenuMounted(false)}
      onSelect={(option) => {
        setSelected(option);
        closeMenu();
      }}
    />
  );
  const content = <Content key="content" mode={mode} />;

  return (
    // not-prose: the article's prose styles would otherwise reach into the figure and restyle
    // its buttons and rules.
    // 520px against the article's 460px text column: wide enough to read as a figure rather than
    // an inline block, narrow enough that it still belongs to the column it interrupts.
    <figure className="not-prose max-lg:-mx-4 mx-auto my-8 max-w-[520px] font-pretendard">
      {/* Outline only, no fill: the panels bring their own recessed tray, so a second grey box
          around it just stacks two nearly identical greys. The dark hairline is lighter than the
          one images carry — with no fill behind it there is nothing to hold it back, and at
          white/15 it read as a drawn box rather than an edge. */}
      <div className="flex justify-center rounded-sm p-4 outline -outline-offset-1 outline-black/5 md:p-12 dark:outline-white/8">
        {/* Same stage as the button and switch figures: equal 1fr rows hold the subject at the
            vertical center while the control sits on the floor. Taller floor than theirs — the
            tray alone is most of 12rem, and the rows need slack left over to do the centering. */}
        <div className="grid min-h-[20rem] w-full grid-rows-[1fr_auto_1fr] justify-items-center">
          {/* A 4px frame, so its radius is the panels' 20px plus that inset. It must read as
            *recessed* in both themes: surface-tertiary is a step down in light but a step up in
            dark, so the darker secondary takes over there.
            Fluid up to 21rem rather than fixed at it: below ~370px of viewport the figure's own
            padding leaves less than that, and a fixed width would push the panels out of the
            outline instead of narrowing. The cap is 21rem plus the 4px frame on either side. */}
          <div className="row-start-2 w-full max-w-[21.5rem] rounded-3xl bg-surface-tertiary p-1 dark:bg-surface-secondary">
            <div className="relative w-full" style={{ height: CONTENT_TOP + CONTENT_HEIGHT }}>
              {toolbarLast ? [content, toolbar] : [toolbar, content]}
            </div>
          </div>

          <div
            role="group"
            aria-label="Stacking mechanism"
            // 16px off the card's visible edge, not the stage floor: the stage sits inside the
            // card padding, so at md the control has to reach 32px into it to land there. At the
            // small size the padding is 16px, and the stage floor already is that line.
            className="relative row-start-3 flex self-end rounded-full bg-surface-tertiary p-1 md:-mb-8 dark:bg-surface"
          >
            {/* Plain CSS transform, not a Framer `layout` animation — the pill sits outside
              Framer's layout tree, so the tile's open/close morph can't sweep it along.
              Two equal (flex-1) cells, so the pill is half wide and slides by exactly its
              own width. */}
            <span
              aria-hidden
              style={{ transform: `translateX(${mode === "z" ? "0%" : "100%"})` }}
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
                    // Fixed, equal cells rather than flex-1: "z-index" is wider than "order", and a
                    // flex item's min-content floor would push its cell past half the track — so the
                    // pill (exactly half) would never line up with either label.
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

interface ToolbarProps {
  mode: Mode;
  open: boolean;
  selected: Option;
  reduceMotion: boolean;
  onToggle: () => void;
  onMenuGone: () => void;
  onSelect: (option: Option) => void;
}

function Toolbar({
  mode,
  open,
  selected,
  reduceMotion,
  onToggle,
  onMenuGone,
  onSelect,
}: ToolbarProps) {
  // Which row is lit. Held here rather than read off :hover so a resting cursor and the keyboard
  // cannot light two rows at once — the same single-highlight rule Base UI enforces on the
  // article's other dropdown, which is what lets both share one highlight selector.
  const [highlighted, setHighlighted] = useState<Option | null>(null);

  return (
    <div
      // z-index 1 is what traps the menu: it makes the toolbar its own stacking context, so the
      // menu's 9999 is only ever measured against its siblings in here. `order` mode ships none.
      style={{
        top: TOOLBAR_TOP,
        height: TOOLBAR_HEIGHT,
        zIndex: mode === "z" ? 1 : undefined,
      }}
      className="absolute inset-x-0 flex items-center justify-between rounded-[1.25rem] bg-surface pl-4 pr-2.5 smooth-shadow-ring-sm"
    >
      <span className="text-[15px] text-secondary">Sort by</span>

      <div className="relative">
        {/* While the menu is out the trigger settles back a touch, so the menu reads as the thing
            in front. Springs on both edges, so it recovers with the same weight it gave way with. */}
        <motion.button
          type="button"
          onClick={onToggle}
          aria-haspopup="listbox"
          aria-expanded={open}
          initial={false}
          animate={{ scale: open ? 0.94 : 1 }}
          whileTap={{ scale: 0.92 }}
          transition={reduceMotion ? { duration: 0 } : SETTLE}
          className={cn(
            // Sized for the toolbar it sits in rather than borrowed from the shared select: this
            // is a control inside a panel, where the other figure's trigger stands alone on a
            // stage. Only the menu below is shared.
            "flex cursor-pointer items-center gap-1.5 rounded-[0.625rem] bg-surface py-1.5 pl-3 pr-2",
            "text-[14px] font-medium text-primary smooth-shadow-ring-xs",
            "outline-none transition-colors hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-default",
            // Promoted up front so the scale spring never waits on a layer being created mid-press.
            // Note this makes the button its own stacking context — harmless here only because the
            // menu is its *sibling*, not its child. Nested inside, it would be trapped exactly like
            // the toolbar traps it in `z-index` mode.
            "will-change-transform",
          )}
        >
          {selected}
          <IconChevronGrabberVertical className="size-4 text-quaternary" />
        </motion.button>

        {/* Cleared on the way out rather than on each close path, so a menu dismissed with a
            finger still resting over a row does not reopen with that row already lit. */}
        <AnimatePresence
          onExitComplete={() => {
            setHighlighted(null);
            onMenuGone();
          }}
        >
          {open && (
            <motion.div
              role="listbox"
              // The number everyone reaches for, kept honest: it is a real 9999 and it really
              // does not help.
              // --anchor-width is what Base UI would set from the measured trigger; here the menu
              // is absolutely positioned inside a wrapper that *is* the trigger, so 100% resolves
              // to the same number and the shared width rule applies unchanged.
              style={
                {
                  zIndex: mode === "z" ? 9999 : undefined,
                  transformOrigin: "top right",
                  "--anchor-width": "100%",
                } as CSSProperties
              }
              // Barely any travel: at 50ms a slide or a real pop would only register as a flinch,
              // so it just resolves into place — opacity with a whisper of scale behind it.
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{
                opacity: 0,
                scale: 0.98,
                transition: reduceMotion ? { duration: 0 } : MENU_OUT,
              }}
              transition={reduceMotion ? { duration: 0 } : MENU_IN}
              className={cn(selectStyles.popup, "absolute right-0 top-[calc(100%+0.5rem)]")}
            >
              {OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="option"
                  aria-selected={option === selected}
                  onClick={() => onSelect(option)}
                  // The attribute Base UI would set on its own items, driven by hand here so the
                  // shared highlight rule is the same selector in both menus — and so only one
                  // row can be lit, whichever input moved it there.
                  data-highlighted={option === highlighted ? "" : undefined}
                  onPointerEnter={() => setHighlighted(option)}
                  onPointerLeave={() => setHighlighted(null)}
                  onFocus={() => setHighlighted(option)}
                  onBlur={() => setHighlighted(null)}
                  className={cn(selectStyles.item, "transition-colors")}
                >
                  {option}
                  {option === selected && (
                    <IconCheckmark1Small className={selectStyles.itemIndicator} />
                  )}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Content({ mode }: { mode: Mode }) {
  return (
    <div
      // The z-index the menu can never beat — not because 2 > 9999, but because the comparison
      // happens up here, between two panels, and the menu is not in it.
      style={{ top: CONTENT_TOP, height: CONTENT_HEIGHT, zIndex: mode === "z" ? 2 : undefined }}
      className="absolute inset-x-0 flex flex-col justify-center rounded-[1.25rem] bg-surface px-4 smooth-shadow-ring-sm"
    >
      {ROWS.map((row, index) => (
        // The rule lives on the inner track, not the row, so it starts at the title's left edge
        // and leaves the icon column clear — the icons read as a gutter rather than as list items.
        <div key={row.title} className="flex items-center gap-2.5">
          <row.Icon className="size-4 shrink-0 text-tertiary" />
          <div
            className={cn(
              "flex flex-1 items-center justify-between gap-3 py-2 text-[15px]",
              index < ROWS.length - 1 && "border-b border-primary",
            )}
          >
            <span className="truncate text-primary">{row.title}</span>
            <span
              className={cn(
                "shrink-0 rounded-md px-2 py-1 text-[12px] font-medium leading-none",
                row.tone,
              )}
            >
              {row.tag}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
