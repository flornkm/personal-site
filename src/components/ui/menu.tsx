import { cn } from "@/lib/utils";
import { Menu as BaseMenu } from "@base-ui/react/menu";
import type { ComponentProps } from "react";

const Root = BaseMenu.Root;
// Unstyled on purpose: unlike the Select's dedicated pill, a menu opens from whatever
// button the caller already has.
const Trigger = BaseMenu.Trigger;
const Group = BaseMenu.Group;
const GroupLabel = BaseMenu.GroupLabel;

type ContentProps = ComponentProps<typeof BaseMenu.Popup> &
  Pick<ComponentProps<typeof BaseMenu.Positioner>, "side" | "sideOffset" | "align">;

function Content({ className, children, side, sideOffset = 8, align, ...props }: ContentProps) {
  return (
    <BaseMenu.Portal>
      {/* z on the Positioner, not the Popup: the Positioner places itself with a transform,
          which would trap any z-index on its child in a stacking context of its own. */}
      <BaseMenu.Positioner side={side} sideOffset={sideOffset} align={align} className="z-[150]">
        <BaseMenu.Popup
          className={cn(
            // Anchor width as a floor rather than the Select's fixed formula: menu rows are
            // actions of arbitrary length, so the content decides how much wider it grows.
            "min-w-[calc(var(--anchor-width)_+_2rem)] rounded-2xl bg-surface p-1.5",
            // A step brighter than the page it floats over in dark mode: on a near-black
            // surface a shadow has nothing left to darken, so the surface carries the lift.
            // The ring is an *outer* layer, so it renders against the page behind the popup
            // rather than against that brighter fill — and the plugin's 18% default lands at
            // exactly surface-tertiary over a black page, i.e. no edge at all. /28 is the
            // explicit override the plugin documents for surfaces this light.
            "smooth-shadow-ring-lg smooth-ring-black/8 dark:bg-surface-tertiary dark:smooth-ring-white/28",
            "origin-[var(--transform-origin)] transition-all duration-150 ease-out",
            "data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            "data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
            className,
          )}
          {...props}
        >
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

function Item({ className, ...props }: ComponentProps<typeof BaseMenu.Item>) {
  return (
    <BaseMenu.Item
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2",
        "text-[13px] text-primary outline-none",
        // Dark highlight goes lighter, not darker: surface-secondary sits below the popup's
        // own surface there and would read as a hole.
        "data-[highlighted]:bg-surface-tertiary dark:data-[highlighted]:bg-white/8",
        className,
      )}
      {...props}
    />
  );
}

function Separator({ className, ...props }: ComponentProps<typeof BaseMenu.Separator>) {
  return (
    <BaseMenu.Separator
      // Negative margin runs the line into the popup padding so it spans edge to edge.
      className={cn("-mx-1.5 my-1.5 h-px bg-black/8 dark:bg-white/10", className)}
      {...props}
    />
  );
}

export const Menu = {
  Root,
  Trigger,
  Content,
  Item,
  Separator,
  Group,
  GroupLabel,
};
