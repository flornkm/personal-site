import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

export function Stage({ className, ...props }: ComponentProps<"figure">) {
  return (
    <figure
      className={cn(
        "not-prose mx-auto mt-2 mb-14 flex w-full flex-col items-center justify-center py-6 font-pretendard",
        className,
      )}
      {...props}
    />
  );
}

export const CARD = "relative w-full rounded-[20px] bg-surface p-4 smooth-shadow-ring-md";
export const FIELD =
  "h-9 w-full rounded-[10px] bg-surface-tertiary px-3 text-[13px] text-primary outline-none focus-visible:shadow-[inset_0_0_0_1.5px_oklch(0.55_0.2_260)]";
