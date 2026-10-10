import Tooltip from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { IconCheckmark1Small } from "central-icons/IconCheckmark1Small";
import { IconCrossSmall } from "central-icons/IconCrossSmall";
import { IconSquareBehindSquare1 } from "central-icons/IconSquareBehindSquare1";
import { useRef, useState } from "react";
import type { ComponentType } from "react";

/* Puts the whole post on the clipboard as markdown — the same body an agent gets from the
   page's `.md` twin (server/middleware/markdown.ts), code blocks and all, rather than the
   rendered DOM a manual selection would pick up. An article that invites you to hand it to
   an agent should not make you assemble it first.

   Inline and wordless: it sits at the end of the invitation, which already says what it does,
   with the label kept in a tooltip. */

type State = "idle" | "copied" | "failed";

const ICONS: Record<State, ComponentType<{ className?: string }>> = {
  idle: IconSquareBehindSquare1,
  copied: IconCheckmark1Small,
  failed: IconCrossSmall,
};

const LABEL: Record<State, string> = {
  idle: "Copy this post as Markdown",
  copied: "Copied as Markdown",
  failed: "Could not copy",
};

// Long enough to read the confirmation, short enough that the button is ready again by the
// time anyone reaches for it twice.
const RESET_DELAY = 2000;

export function CopyAsMarkdown() {
  const [state, setState] = useState<State>("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markdown = useRef<string | null>(null);
  const request = useRef<Promise<string> | null>(null);

  const settle = (next: State) => {
    setState(next);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setState("idle"), RESET_DELAY);
  };

  const load = () => {
    request.current ??= fetch(`${window.location.pathname.replace(/\/$/, "")}.md`, {
      headers: { accept: "text/markdown" },
    })
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status}`);
        return response.text();
      })
      .then((text) => {
        markdown.current = text;
        return text;
      })
      .catch((error: unknown) => {
        // Never cache a failure: the next press has to be a fresh attempt, not a replay of
        // this rejection.
        request.current = null;
        throw error;
      });
    return request.current;
  };

  /* Fetched on approach rather than on click, so the round trip happens while the pointer is
     still travelling and the press itself has nothing to wait for. Started from hover, focus
     and pointerdown alike: a mouse announces itself well ahead, a finger only at pointerdown,
     and the keyboard not at all until focus lands. A reader who never goes near the button
     never pays for the request. Rejections are swallowed because nobody has asked for
     anything yet — the press is what gets to report a failure. */
  const prefetch = () => {
    void load().catch(() => {});
  };

  const report = (work: Promise<unknown>) => {
    work.then(() => settle("copied")).catch(() => settle("failed"));
  };

  const copy = () => {
    const ready = markdown.current;
    if (ready !== null) {
      report(navigator.clipboard.writeText(ready));
      return;
    }

    /* Nothing prefetched yet, which on a touch device is every first tap: pointerdown lands
       only a moment before the click. Awaiting the fetch here and then writing is what made
       the button report a failure it had not earned — an await spends the gesture's transient
       activation, and Safari refuses the clipboard from that point on.

       So the write is handed a *promise* instead. `ClipboardItem` accepts one, which is
       exactly this case: the write is authorised by the gesture that started it and resolves
       whenever the text lands. Where that is unsupported there is nothing left but to await
       and try, which is what the browsers missing it accept anyway. */
    const pending = load();
    if (typeof ClipboardItem === "function") {
      const item = new ClipboardItem({
        "text/plain": pending.then((text) => new Blob([text], { type: "text/plain" })),
      });
      report(
        navigator.clipboard
          .write([item])
          .catch(() => pending.then((text) => navigator.clipboard.writeText(text))),
      );
      return;
    }

    report(pending.then((text) => navigator.clipboard.writeText(text)));
  };

  return (
    // The label lives in the tooltip rather than beside the icon, on the app's default delay.
    // No `title` alongside it: the browser's own tooltip would arrive late and say it twice.
    <Tooltip content={LABEL[state]} inline className="not-prose align-[-0.3em]">
      <button
        type="button"
        onClick={copy}
        onPointerEnter={prefetch}
        onPointerDown={prefetch}
        onFocus={prefetch}
        aria-label={LABEL[state]}
        className={cn(
          "grid size-6 shrink-0 cursor-pointer place-items-center",
          "rounded-md text-quaternary transition-colors hover:bg-surface-tertiary hover:text-tertiary",
          "active:bg-interactive-active active:duration-0",
          "outline-none focus-visible:ring-2 focus-visible:ring-default",
          "touch-manipulation select-none",
        )}
      >
        {/* All three stacked in one cell so they cross-fade through each other rather than
          swapping: the outgoing icon shrinks away under the incoming one, which is what makes
          a state change read as the same control changing its mind rather than two buttons. */}
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
