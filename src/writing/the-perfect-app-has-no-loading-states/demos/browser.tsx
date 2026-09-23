import { cn } from "@/lib/utils";
import { IconArrowRotateClockwise } from "central-icons/IconArrowRotateClockwise";
import { IconChevronLeft } from "central-icons/IconChevronLeft";
import type { ReactNode } from "react";

/* The fake browser every figure in this article draws its pages into: a Safari-ish chrome with
   an address field, and a viewport inset 2px inside it. Shared so the windows in every figure
   are the same window. */

// Content artwork, so it stays out of the token palette: the one accent across the figures,
// shared by the ticked boxes, the spinner and the address-bar progress.
export const BLUE = "oklch(0.63 0.19 258)";

type BrowserProps = {
  label: ReactNode;
  url?: string;
  // Safari's address-bar progress. `run` keys the bar so a restart mid-flight sweeps from zero.
  progress?: boolean;
  progressMs?: number;
  run?: number;
  // The page is always rendered so the viewport takes its height from it; a browser that has
  // nothing to show yet hides it and draws its own state on top.
  hidden?: boolean;
  overlay?: ReactNode;
  // A back button appears in the chrome once there is somewhere to go back to.
  onBack?: () => void;
  canGoBack?: boolean;
  children: ReactNode;
};

export function Browser({
  label,
  url = "example.com",
  progress = false,
  progressMs = 0,
  run = 0,
  hidden = false,
  overlay,
  onBack,
  canGoBack = false,
  children,
}: BrowserProps) {
  return (
    <div>
      <div className="overflow-hidden rounded-xl bg-tertiary smooth-shadow-ring-sm dark:bg-surface-secondary dark:smooth-ring-white/10">
        <div className="flex items-center gap-1 px-2 pt-2 pb-1.5">
          {onBack && (
            <button
              type="button"
              aria-label="Back"
              disabled={!canGoBack}
              onClick={onBack}
              className={cn(
                "flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-secondary",
                "transition-colors hover:bg-black/5 disabled:cursor-default disabled:text-quaternary disabled:hover:bg-transparent dark:hover:bg-white/5",
                "outline-none focus-visible:ring-2 focus-visible:ring-default",
              )}
            >
              <IconChevronLeft size={12} mode="raw" />
            </button>
          )}
          <div className="relative flex h-7 flex-1 items-center justify-center overflow-hidden rounded-md bg-black/5 dark:bg-white/5">
            {progress && (
              <span
                key={run}
                aria-hidden
                style={{ animationDuration: `${progressMs}ms`, background: BLUE }}
                className="absolute bottom-0 left-0 h-0.5 animate-address-progress"
              />
            )}
            <span className="relative text-[11px] leading-none text-secondary">{url}</span>
            <IconArrowRotateClockwise
              size={11}
              mode="raw"
              className="absolute right-2 text-tertiary"
            />
          </div>
        </div>
        {/* The viewport sits 2px inside the window, so its corners are the window's minus 2px. In
            dark mode it is the lighter surface on a darker frame, with only a faint seam: the
            frame's ring already draws the one bright edge this window gets. */}
        <div className="px-0.5 pb-0.5">
          <div className="relative rounded-[10px] bg-surface p-4 smooth-shadow-ring-xs dark:smooth-ring-white/6">
            <div className={cn(hidden && "invisible")}>{children}</div>
            {overlay && (
              <div className="absolute inset-0 flex items-center justify-center">{overlay}</div>
            )}
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-[14px] text-tertiary">{label}</p>
    </div>
  );
}

export function Spinner() {
  return (
    <span
      style={{
        borderColor: `color-mix(in oklch, ${BLUE} 20%, transparent)`,
        borderTopColor: BLUE,
      }}
      className="size-5 animate-spin rounded-full border-2 motion-reduce:animate-none"
    />
  );
}
