import { cn } from "@/lib/utils";
import { IconCheckmark1Small } from "central-icons/IconCheckmark1Small";
import { useRef, useState } from "react";

/* An invite with an address that looks right at a glance but has no domain. Disabled, the button
   just sits there grey and you start re-reading everything. Enabled, the click is the question
   "what's wrong?" and the field answers: it nudges, takes focus with the caret at the end, and
   one short line says what's missing. */

type Mode = "disabled" | "enabled";
type Status = "idle" | "missing" | "done";

const MODES: { value: Mode; label: string }[] = [
  { value: "disabled", label: "Disabled" },
  { value: "enabled", label: "Enabled" },
];

const INITIAL_EMAIL = "theo@brandt";
const isEmail = (value: string) => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(value.trim());

export function SubmitButton() {
  const [mode, setMode] = useState<Mode>("disabled");
  const [email, setEmail] = useState(INITIAL_EMAIL);
  const [status, setStatus] = useState<Status>("idle");
  const field = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const isDisabledMode = mode === "disabled";
  const valid = isEmail(email);
  const missing = status === "missing" && !valid;
  const done = status === "done";
  // aria-disabled rather than `disabled`: a real disabled button never gets :active, and the press
  // that does nothing is the point of the "before" clip.
  const blocked = isDisabledMode && !valid;

  function reset() {
    setEmail(INITIAL_EMAIL);
    setStatus("idle");
  }

  function submit() {
    if (done || blocked) return;
    if (!valid) {
      setStatus("missing");
      const el = input.current;
      el?.focus({ preventScroll: true });
      el?.setSelectionRange(el.value.length, el.value.length);
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        field.current?.animate(
          [
            { transform: "translateX(0)" },
            { transform: "translateX(-5px)" },
            { transform: "translateX(4px)" },
            { transform: "translateX(-2px)" },
            { transform: "translateX(0)" },
          ],
          { duration: 360, easing: "cubic-bezier(0.32, 0.72, 0, 1)" },
        );
      }
      return;
    }
    setStatus("done");
    window.setTimeout(reset, 2400);
  }

  return (
    <figure className="not-prose mx-auto my-8 flex min-h-[374px] w-full max-w-[520px] flex-col items-center px-4 md:px-12 pt-24 pb-6 max-lg:-mx-4 rounded-sm outline -outline-offset-1 outline-black/5 dark:outline-white/8 font-pretendard">
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="w-full max-w-[340px] rounded-[20px] bg-surface p-4 smooth-shadow-ring-md"
      >
        <p className="text-[13px] leading-[18px] font-medium text-primary">Share Q4 Launch Plan</p>
        <p className="text-[13px] leading-[18px] text-tertiary">
          Anyone you invite can view and comment.
        </p>

        <div className="mt-4 flex gap-2">
          <div ref={field} className="min-w-0 flex-1">
            <input
              ref={input}
              type="text"
              inputMode="email"
              aria-label="Email"
              aria-invalid={missing}
              value={email}
              disabled={done}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              className={cn(
                "h-9 w-full rounded-[10px] bg-surface-tertiary px-3 text-[13px] text-primary outline-none transition-shadow duration-150",
                missing
                  ? "shadow-[inset_0_0_0_1.5px_oklch(0.62_0.21_25)]"
                  : "focus-visible:shadow-[inset_0_0_0_1.5px_oklch(0.55_0.2_260)]",
              )}
            />
          </div>
          <button
            type="submit"
            aria-disabled={blocked}
            className={cn(
              "flex h-9 shrink-0 items-center gap-1 rounded-[10px] px-3.5 text-[13px] font-medium",
              "transition-[background-color,color,scale,filter] duration-200 ease-out active:duration-100",
              "outline-none focus-visible:ring-2 focus-visible:ring-default",
              "cursor-pointer active:scale-[0.96]",
              "aria-disabled:cursor-not-allowed aria-disabled:bg-surface-tertiary aria-disabled:text-quaternary aria-disabled:active:brightness-[0.96]",
              // Depth as in the active-state tip: a darker rim of the fill's own hue and a soft
              // highlight along the top inside edge, no drop shadow. Off while it looks disabled.
              !blocked &&
                "shadow-[inset_0_0_0_1px_var(--btn-edge),inset_0_4px_4px_-3px_oklch(1_0_0/0.35)]",
              done
                ? "bg-[oklch(0.6_0.15_152)] text-white [--btn-edge:oklch(0.53_0.13_152)]"
                : cn(
                    "bg-[oklch(0.55_0.2_260)] text-white [--btn-edge:oklch(0.49_0.19_261)]",
                    !blocked && "active:bg-[oklch(0.48_0.19_261)]",
                  ),
            )}
          >
            {done && <IconCheckmark1Small className="-ml-1 size-4" />}
            {done ? "Sent" : "Invite"}
          </button>
        </div>

        {/* 0fr → 1fr rows so the hint opens the space it needs instead of popping in. */}
        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
            missing ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <p className="overflow-hidden text-[13px] text-[oklch(0.62_0.21_25)]">
            <span className="block pt-2 pl-0.5">Missing a domain, like .com</span>
          </p>
        </div>
      </form>

      <div
        role="group"
        aria-label="Submit button"
        className="relative mt-auto flex rounded-full bg-surface-tertiary p-1"
      >
        <span
          aria-hidden
          style={{ transform: `translateX(${isDisabledMode ? "0%" : "100%"})` }}
          className="pointer-events-none absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/2)] rounded-full bg-surface smooth-shadow-ring-sm transition-transform duration-200 ease-out"
        />
        {MODES.map((option) => {
          const active = mode === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setMode(option.value);
                reset();
              }}
              aria-pressed={active}
              className={cn(
                "relative w-[5.5rem] cursor-pointer whitespace-nowrap rounded-full py-1.5 text-[12px] font-medium transition-colors",
                "outline-none focus-visible:ring-2 focus-visible:ring-default",
                active ? "text-primary" : "text-tertiary hover:text-secondary",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </figure>
  );
}
