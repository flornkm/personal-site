import { cn } from "@/lib/utils";
import { Select as BaseSelect } from "@base-ui/react/select";
import { IconCheckmark1Small } from "central-icons/IconCheckmark1Small";
import { IconChevronGrabberVertical } from "central-icons/IconChevronGrabberVertical";
import type { ComponentProps } from "react";

const Root = BaseSelect.Root;
const Value = BaseSelect.Value;

/* The look of an open menu, kept as plain strings so a dropdown that cannot be a Base UI select
   still wears it exactly. The stacking-order figure has to hand-roll its own — Base UI portals
   the popup to the body, which would defeat a demo whose entire subject is which sibling paints
   on top — and the two menus sit a few paragraphs apart in the same article, close enough that
   any drift between them in either theme reads as a mistake. Sharing the strings is what makes
   them identical rather than merely similar.

   The menu only. A trigger belongs to whatever it sits in, and the figure's is a control inside
   a panel rather than one standing alone on a stage. So is the open/close animation, since one
   menu is driven by Base UI's data attributes and the other by Framer. */

const TRIGGER = cn(
  "flex h-9 shrink-0 cursor-pointer items-center justify-between gap-2",
  "rounded-full bg-surface py-1 pl-4 pr-2.5 text-[13px] font-medium text-primary",
  "smooth-shadow-ring-xs",
  "outline-none transition-colors hover:bg-surface-tertiary dark:hover:bg-surface-secondary",
  "focus-visible:ring-2 focus-visible:ring-default",
);

const POPUP = cn(
  // The menu inherits the trigger's measured width plus a margin of its own: a menu cut to the
  // exact width of its trigger reads as the trigger having grown rather than as a surface that
  // opened over it. Base UI measures the anchor for us; a hand-rolled menu positioned inside a
  // trigger-sized wrapper sets --anchor-width to 100% and lands on the same rule.
  "w-[calc(var(--anchor-width)_+_2rem)] rounded-2xl bg-surface p-1.5",
  // A step brighter than the page it floats over in dark mode: on a near-black surface a shadow
  // has nothing left to darken, so the surface carries the lift. The ring is an *outer* layer, so
  // it renders against the page behind the popup rather than against that brighter fill — and the
  // plugin's 18% default lands at exactly surface-tertiary over a black page, i.e. no edge at all.
  // /28 is the explicit override the plugin documents for surfaces this light.
  "smooth-shadow-ring-lg smooth-ring-black/8 dark:bg-surface-tertiary dark:smooth-ring-white/28",
);

const ITEM = cn(
  "flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-left",
  "text-[13px] text-primary outline-none",
  // One selector rather than a hover rule alongside it, so exactly one row can ever be lit:
  // Base UI sets data-highlighted from pointer and keyboard alike, and a hand-rolled menu is
  // expected to set the same attribute rather than lean on :hover, which would keep a row lit
  // under a resting cursor while the keyboard moved the highlight somewhere else.
  // Dark goes lighter, not darker: surface-tertiary sits below the popup's own surface there and
  // would read as a hole.
  "data-[highlighted]:bg-surface-tertiary dark:data-[highlighted]:bg-white/8",
);

const TRIGGER_ICON = "size-4 text-quaternary";
const ITEM_INDICATOR = "size-4 text-tertiary";

export const selectStyles = {
  popup: POPUP,
  item: ITEM,
  itemIndicator: ITEM_INDICATOR,
};

function Trigger({ className, children, ...props }: ComponentProps<typeof BaseSelect.Trigger>) {
  return (
    <BaseSelect.Trigger className={cn(TRIGGER, className)} {...props}>
      {children}
      <BaseSelect.Icon>
        <IconChevronGrabberVertical className={TRIGGER_ICON} />
      </BaseSelect.Icon>
    </BaseSelect.Trigger>
  );
}

type ContentProps = ComponentProps<typeof BaseSelect.Popup> &
  Pick<
    ComponentProps<typeof BaseSelect.Positioner>,
    "side" | "sideOffset" | "align" | "alignItemWithTrigger"
  >;

function Content({
  className,
  children,
  side,
  // Only felt when item alignment can't apply (touch devices, not enough room): the popup
  // natively overlays the trigger with the selected item on top of it, and side/sideOffset
  // are the fallback placement.
  sideOffset = 8,
  align,
  alignItemWithTrigger,
  ...props
}: ContentProps) {
  return (
    <BaseSelect.Portal>
      {/* z on the Positioner, not the Popup: the Positioner places itself with a transform,
          which would trap any z-index on its child in a stacking context of its own. */}
      <BaseSelect.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignItemWithTrigger={alignItemWithTrigger}
        className="z-[150]"
      >
        <BaseSelect.Popup
          className={cn(
            POPUP,
            "origin-[var(--transform-origin)] transition-all duration-150 ease-out",
            "data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            "data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
            className,
          )}
          {...props}
        >
          <BaseSelect.List>{children}</BaseSelect.List>
        </BaseSelect.Popup>
      </BaseSelect.Positioner>
    </BaseSelect.Portal>
  );
}

function Item({ className, children, ...props }: ComponentProps<typeof BaseSelect.Item>) {
  return (
    <BaseSelect.Item className={cn(ITEM, className)} {...props}>
      <BaseSelect.ItemText>{children}</BaseSelect.ItemText>
      <BaseSelect.ItemIndicator>
        <IconCheckmark1Small className={ITEM_INDICATOR} />
      </BaseSelect.ItemIndicator>
    </BaseSelect.Item>
  );
}

export const Select = {
  Root,
  Trigger,
  Value,
  Content,
  Item,
};
