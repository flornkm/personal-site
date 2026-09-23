import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

/* The app's one loading placeholder. The highlight is an overlay the size of the element sliding
   across it, so every skeleton on screen sweeps in step no matter how wide each one is. Size and
   shape come from the caller. The fill is translucent rather than a surface token, so it still
   shows on a surface that is itself the token colour, such as a card.

   The gradient interpolates in sRGB, not Tailwind v4's default OKLab: on the way from transparent
   to white the OKLab ramp passes through grey, which Safari paints as a dark seam down the middle
   of the band. `transform-gpu` gives the box its own layer, which is what makes Safari clip the
   moving overlay to the rounded corners. */
export default function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative transform-gpu overflow-hidden rounded-sm bg-black/6 dark:bg-white/8",
        "before:absolute before:inset-0 before:animate-skeleton-shimmer before:bg-linear-to-r/srgb before:from-transparent before:via-white/70 before:to-transparent",
        "motion-reduce:before:animate-none dark:before:via-white/8",
        className,
      )}
      {...props}
    />
  );
}
