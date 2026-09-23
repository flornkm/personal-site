import Tooltip from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { IconCheckmark1Small } from "central-icons/IconCheckmark1Small";
import { IconCrossSmall } from "central-icons/IconCrossSmall";
import { IconSquareBehindSquare1 } from "central-icons/IconSquareBehindSquare1";
import { useRef, useState } from "react";
import type { ComponentPropsWithoutRef, ComponentType, RefObject } from "react";

/* Every fenced code block in the prose. Two things the plain <pre> did not do.

   The box is wider than the text column by exactly its own padding, so the first character of
   code sits on the same line as the first character of a paragraph. A block that is as wide as
   the text indents its content by the padding, and the indent reads as a mistake.

   And a copy button, since a block of text in a post about handing things to agents is there to
   be taken. It copies the code as written, not the rendered selection. */

// The text column's width plus one padding on each side. Keep in step with the article
// route's max-w on prose children.
const COLUMN = "lg:max-w-[calc(460px+2rem)]";

export function CodeBlock({ className, children, ...props }: ComponentPropsWithoutRef<"pre">) {
  const pre = useRef<HTMLPreElement>(null);
  return (
    // Below lg the column has at least 24px beside it, so the 16px overhang always fits.
    <div className={cn("not-prose relative my-6 max-lg:-mx-4 lg:mx-auto", COLUMN)}>
      <pre
        ref={pre}
        {...props}
        className={cn(
          // Wrapped, not scrolled: a line that runs off the edge is a line nobody reads, and
          // the blocks on this site are prose for agents more often than they are code.
          "rounded-lg bg-tertiary px-4 py-3.5 pr-12 whitespace-pre-wrap [overflow-wrap:anywhere]",
          "font-mono text-xs leading-relaxed text-secondary",
          className,
        )}
      >
        {children}
      </pre>
      <CopyCode source={pre} className="absolute top-2 right-2" />
    </div>
  );
}

type State = "idle" | "copied" | "failed";

const ICONS: Record<State, ComponentType<{ className?: string }>> = {
  idle: IconSquareBehindSquare1,
  copied: IconCheckmark1Small,
  failed: IconCrossSmall,
};

const LABEL: Record<State, string> = {
  idle: "Copy",
  copied: "Copied",
  failed: "Could not copy",
};

const RESET_DELAY = 2000;

// The same control as the post-level copy button, pointed at one block.
function CopyCode({
  source,
  className,
}: {
  source: RefObject<HTMLPreElement | null>;
  className?: string;
}) {
  const [state, setState] = useState<State>("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const settle = (next: State) => {
    setState(next);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setState("idle"), RESET_DELAY);
  };

  const copy = () => {
    const text = source.current?.textContent?.replace(/\n$/, "") ?? "";
    navigator.clipboard
      .writeText(text)
      .then(() => settle("copied"))
      .catch(() => settle("failed"));
  };

  return (
    <Tooltip content={LABEL[state]} className={cn("not-prose", className)}>
      <button
        type="button"
        onClick={copy}
        aria-label={LABEL[state]}
        className={cn(
          "grid size-6 shrink-0 cursor-pointer place-items-center",
          "rounded-lg text-quaternary transition-colors hover:bg-black/5 hover:text-tertiary dark:hover:bg-white/6",
          "outline-none focus-visible:ring-2 focus-visible:ring-default",
          "touch-manipulation select-none",
        )}
      >
        {(Object.keys(ICONS) as State[]).map((key) => {
          const Icon = ICONS[key];
          const active = key === state;
          return (
            <Icon
              key={key}
              aria-hidden
              className={cn(
                "col-start-1 row-start-1 size-4 transition-all duration-200 ease-out",
                "motion-reduce:transition-none",
                active ? "scale-100 opacity-100" : "scale-50 opacity-0",
              )}
            />
          );
        })}
      </button>
    </Tooltip>
  );
}
