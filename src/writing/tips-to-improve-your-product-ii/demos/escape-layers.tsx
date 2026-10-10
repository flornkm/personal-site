import { cn } from "@/lib/utils";
import { IconCheckmark1Small } from "central-icons/IconCheckmark1Small";
import { IconChevronBottom } from "central-icons/IconChevronBottom";
import { IconCrossSmall } from "central-icons/IconCrossSmall";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CARD, DemoFrame, GHOST_BUTTON, SUBTITLE, TITLE } from "./demo-frame";

/* A dialog with a menu open inside it. Escape peels one layer per press: the menu first, then the
   dialog. The keycap under it presses with the real key (or can be clicked on touch), and the line
   next to it says what the next press will close. */

const REPEATS = ["Never", "Every day", "Every week", "Every month"] as const;
type Repeat = (typeof REPEATS)[number];
type Layer = "menu" | "dialog" | "none";

const HINTS: Record<Layer, string> = {
  menu: "Closes the menu",
  dialog: "Closes the dialog",
  none: "Nothing left to close",
};

// Dark grey, not black, so it stays a button rather than a hole. Inverted in dark mode.
const PRIMARY_BUTTON = cn(
  "h-7 shrink-0 cursor-pointer rounded-[7px] px-2.5 text-[12px] font-medium text-white outline-none dark:text-[oklch(0.2_0_0)]",
  "bg-[oklch(0.32_0_0)] hover:bg-[oklch(0.28_0_0)] active:bg-[oklch(0.24_0_0)] dark:bg-[oklch(0.88_0_0)] dark:hover:bg-[oklch(0.84_0_0)] dark:active:bg-[oklch(0.8_0_0)]",
  "transition-[background-color,scale] duration-200 ease-out active:scale-[0.97] active:duration-100",
  "focus-visible:ring-2 focus-visible:ring-default",
);

const POP = { opacity: 0, scale: 0.97 };

export function EscapeLayers() {
  const [open, setOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [repeat, setRepeat] = useState<Repeat>("Every day");
  const [pressed, setPressed] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const reopen = useRef<HTMLButtonElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const hints = useRef<Partial<Record<Layer, HTMLSpanElement | null>>>({});
  const [hintWidth, setHintWidth] = useState<number>();
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  const layer: Layer = menuOpen ? "menu" : open ? "dialog" : "none";

  // The hint's box takes the width of the line it shows, so keycap and line stay centred together
  // as a pair, and the width eases instead of jumping when the line changes.
  useLayoutEffect(() => {
    setHintWidth(hints.current[layer]?.offsetWidth);
  }, [layer]);

  // The key can come up anywhere: the element that heard it may be gone by then.
  useEffect(() => {
    const release = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPressed(false);
    };
    const reset = () => setPressed(false);
    window.addEventListener("keyup", release);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keyup", release);
      window.removeEventListener("blur", reset);
    };
  }, []);

  function openMenu() {
    setMenuOpen(true);
    // Focus the selected option so Escape is heard by the menu, as in any real menu.
    requestAnimationFrame(() => items.current[REPEATS.indexOf(repeat)]?.focus());
  }

  function closeMenu() {
    setMenuOpen(false);
    trigger.current?.focus();
  }

  function closeDialog() {
    setMenuOpen(false);
    setOpen(false);
    requestAnimationFrame(() => reopen.current?.focus());
  }

  function openDialog() {
    setOpen(true);
    requestAnimationFrame(() => titleInput.current?.focus());
  }

  // One press, one layer.
  function escape() {
    if (layer === "menu") closeMenu();
    else if (layer === "dialog") closeDialog();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      // Stops here so the page (or an experiment tile around it) never sees it.
      event.stopPropagation();
      event.preventDefault();
      setPressed(true);
      if (!event.repeat) escape();
      return;
    }
    if (layer !== "menu" || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
    event.preventDefault();
    const index = items.current.findIndex((item) => item === document.activeElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    items.current[(index + step + REPEATS.length) % REPEATS.length]?.focus();
  }

  return (
    <DemoFrame className="relative min-h-[460px]">
      <MotionConfig reducedMotion="user">
        {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- delegates Escape for the layers inside */}
        <div onKeyDown={onKeyDown} className="flex w-full flex-1 flex-col items-center">
          {/* The page behind the dialog dims, and a click on it dismisses, like any modal. */}
          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                key="backdrop"
                aria-hidden
                onClick={closeDialog}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="absolute inset-0 rounded-sm bg-black/6 dark:bg-black/40"
              />
            )}
          </AnimatePresence>

          {/* Dialog and the button that reopens it share the frame's centre. */}
          <div className="pointer-events-none absolute inset-0 grid place-items-center px-4 md:px-12">
            <AnimatePresence mode="popLayout" initial={false}>
              {open ? (
                <motion.div
                  key="dialog"
                  role="dialog"
                  aria-labelledby="event-dialog-title"
                  initial={POP}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={POP}
                  transition={{ type: "spring", bounce: 0, duration: 0.22 }}
                  className={cn(CARD, "pointer-events-auto relative")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p id="event-dialog-title" className={TITLE}>
                        New event
                      </p>
                      <p className={SUBTITLE}>Fri, Oct 17 · 14:00</p>
                    </div>
                    <button
                      type="button"
                      aria-label="Close"
                      onClick={closeDialog}
                      className={cn(
                        GHOST_BUTTON,
                        "-mt-1 -mr-1.5 grid size-7 place-items-center px-0",
                      )}
                    >
                      <IconCrossSmall className="size-4" />
                    </button>
                  </div>

                  <input
                    ref={titleInput}
                    aria-label="Title"
                    defaultValue="Design review"
                    autoComplete="off"
                    className="mt-4 h-8 w-full rounded-[8px] bg-surface-tertiary px-2.5 text-[13px] text-primary outline-none transition-shadow duration-150 focus-visible:shadow-[inset_0_0_0_1.5px_oklch(0.45_0_0)] dark:focus-visible:shadow-[inset_0_0_0_1.5px_oklch(0.7_0_0)]"
                  />

                  <div className="relative mt-1.5 flex h-8 items-center justify-between rounded-[8px] bg-surface-tertiary pr-1 pl-2.5 text-[13px]">
                    <span className="text-tertiary">Repeat</span>
                    <button
                      ref={trigger}
                      type="button"
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      onClick={() => (menuOpen ? closeMenu() : openMenu())}
                      className="flex h-6 cursor-pointer items-center gap-1 rounded-[6px] pr-1 pl-1.5 font-medium text-primary outline-none transition-colors hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-default dark:hover:bg-white/8"
                    >
                      {repeat}
                      <IconChevronBottom
                        className={cn(
                          "size-3.5 text-tertiary transition-transform duration-200 ease-out",
                          menuOpen && "rotate-180",
                        )}
                      />
                    </button>

                    <AnimatePresence>
                      {menuOpen && (
                        <motion.div
                          role="menu"
                          aria-label="Repeat"
                          initial={POP}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ ...POP, transition: { duration: 0.1 } }}
                          transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
                          onBlur={(event) => {
                            if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                              setMenuOpen(false);
                            }
                          }}
                          className="absolute top-full right-0 z-10 mt-1.5 w-[168px] origin-top-right rounded-[12px] bg-surface p-1 smooth-shadow-ring-sm"
                        >
                          {REPEATS.map((option, index) => (
                            <button
                              key={option}
                              ref={(el) => {
                                items.current[index] = el;
                              }}
                              type="button"
                              role="menuitemradio"
                              aria-checked={option === repeat}
                              onClick={() => {
                                setRepeat(option);
                                closeMenu();
                              }}
                              className="flex h-8 w-full cursor-pointer items-center justify-between rounded-[8px] px-2.5 text-left text-[13px] text-primary outline-none hover:bg-surface-tertiary focus-visible:bg-surface-tertiary"
                            >
                              {option}
                              {option === repeat && (
                                <IconCheckmark1Small className="size-4 text-tertiary" />
                              )}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="mt-4 flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={closeDialog}
                      className={cn(GHOST_BUTTON, "rounded-[7px] text-[12px]")}
                    >
                      Cancel
                    </button>
                    <button type="button" onClick={closeDialog} className={PRIMARY_BUTTON}>
                      Add event
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.button
                  key="reopen"
                  ref={reopen}
                  type="button"
                  onClick={openDialog}
                  initial={POP}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={POP}
                  transition={{ type: "spring", bounce: 0, duration: 0.22 }}
                  className={cn(PRIMARY_BUTTON, "pointer-events-auto")}
                >
                  New event
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          <div className="relative mt-auto flex items-center gap-2.5">
            <button
              type="button"
              aria-label="Press Escape"
              // Keeps focus where it is, so a click behaves exactly like the key.
              onMouseDown={(event) => event.preventDefault()}
              onPointerDown={() => setPressed(true)}
              onPointerUp={() => setPressed(false)}
              onPointerLeave={() => setPressed(false)}
              onClick={escape}
              data-pressed={pressed}
              className="group cursor-pointer rounded-[7px] pb-[2px] outline-none focus-visible:ring-2 focus-visible:ring-default"
            >
              {/* The cap: a flat top and a 2px skirt underneath. Pressed, it sinks into the skirt,
                  fast on the way down and a little slower back up. */}
              <span
                className={cn(
                  "grid h-7 min-w-10 place-items-center rounded-[7px] bg-surface px-2 text-[11px] font-medium text-secondary",
                  "shadow-[inset_0_0_0_1px_oklch(0_0_0/0.09),0_2px_0_oklch(0_0_0/0.07)] dark:bg-surface-tertiary dark:shadow-[inset_0_0_0_1px_oklch(1_0_0/0.08),0_2px_0_oklch(0_0_0/0.5)]",
                  "transition-[translate,box-shadow] duration-150 ease-out",
                  "group-data-[pressed=true]:translate-y-[1.5px] group-data-[pressed=true]:duration-50",
                  "group-data-[pressed=true]:shadow-[inset_0_0_0_1px_oklch(0_0_0/0.09),0_0.5px_0_oklch(0_0_0/0.07)] dark:group-data-[pressed=true]:shadow-[inset_0_0_0_1px_oklch(1_0_0/0.08),0_0.5px_0_oklch(0_0_0/0.5)]",
                )}
              >
                esc
              </span>
            </button>
            {/* Stacked in one cell; the blur blends the outgoing and incoming lines into one change
                instead of two overlapping words. */}
            <p
              style={{ width: hintWidth }}
              className="grid text-[12px] text-tertiary transition-[width] duration-200 ease-out"
            >
              {(Object.keys(HINTS) as Layer[]).map((key) => (
                <span
                  key={key}
                  ref={(el) => {
                    hints.current[key] = el;
                  }}
                  aria-hidden={key !== layer}
                  className={cn(
                    "col-start-1 row-start-1 w-max whitespace-nowrap transition-[opacity,filter] duration-200 ease-out",
                    key !== layer && "opacity-0 blur-[2px]",
                  )}
                >
                  {HINTS[key]}
                </span>
              ))}
            </p>
          </div>
        </div>
      </MotionConfig>
    </DemoFrame>
  );
}
