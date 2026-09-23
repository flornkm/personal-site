import Skeleton from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useRef, useState } from "react";

/* Figure for "Show the static shell immediately".

   A mail app, flat on the stage, replayed by the toggle. Title bar and folders never depend on a
   request; the messages do. With everything inside the condition that waits for data, the
   window stays empty until the messages arrive. With the shell rendered first, the bar and
   folders are there on the first frame and only the message rows are placeholders. */

type Mode = "waits" | "shell";

const MODES: { value: Mode; label: string }[] = [
  { value: "waits", label: "Everything waits" },
  { value: "shell", label: "Shell first" },
];

const LOAD_MS = 1400;

const FOLDERS = ["Inbox", "Sent", "Archive"];

// A panel sits on the frame the way the browser viewport does in browser.tsx: the ring is the
// only edge it gets, so no border is drawn.
const PANEL = "rounded-lg bg-surface p-1.5 smooth-shadow-ring-xs dark:smooth-ring-white/6";

const MAILS = [
  { from: "Anna", subject: "Re: Berlin trip" },
  { from: "Jonas", subject: "Slides for Thursday" },
  { from: "Mara", subject: "Lunch on Friday?" },
];

export function StaticShell() {
  const [mode, setMode] = useState<Mode>("shell");
  const [loaded, setLoaded] = useState(true);
  const timer = useRef<number | null>(null);

  // Pressing an option, including the active one, replays the load in that mode.
  function replay(next: Mode) {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setMode(next);
    setLoaded(false);
    timer.current = window.setTimeout(() => setLoaded(true), LOAD_MS);
  }

  const shellVisible = mode === "shell" || loaded;

  return (
    <figure className="not-prose max-lg:-mx-4 mx-auto my-8 max-w-[520px] font-pretendard">
      <div className="relative flex min-h-[25rem] items-center justify-center rounded-sm p-4 outline -outline-offset-1 outline-black/5 md:p-8 dark:outline-white/8">
        {/* The app's window is the viewport and is always there; what changes is what the app
            has put inside it. Same recipe as the article's browser window: a soft frame with the
            title bar sitting directly on it, and the folders and messages as two panels raised
            off it, so the sections read as surfaces rather than as regions cut up by rules.
            Arriving content fades in; on replay it is gone at once. */}
        <div
          aria-hidden
          className="mb-8 flex h-68 w-full max-w-[28rem] flex-col overflow-hidden rounded-xl bg-tertiary text-[14px] leading-none smooth-shadow-ring-sm dark:bg-surface-secondary dark:smooth-ring-white/10"
        >
          <div
            className={cn(
              "flex h-full flex-col transition-opacity duration-200 ease-out motion-reduce:transition-none",
              shellVisible ? "opacity-100" : "opacity-0 transition-none",
            )}
          >
            <div className="flex h-10 shrink-0 items-center px-4">
              <span className="font-medium text-primary">Mail</span>
              <span className="ml-auto text-tertiary">Compose</span>
            </div>
            <div className="flex min-h-0 flex-1 gap-1.5 px-1.5 pb-1.5">
              <div className={cn(PANEL, "w-28 shrink-0 space-y-0.5")}>
                {FOLDERS.map((folder, index) => (
                  <div
                    key={folder}
                    className={cn(
                      "flex h-8 items-center rounded-md px-2.5",
                      index === 0
                        ? "bg-surface-tertiary font-medium text-primary"
                        : "text-tertiary",
                    )}
                  >
                    {folder}
                  </div>
                ))}
              </div>
              <div className={cn(PANEL, "min-w-0 flex-1")}>
                {MAILS.map((mail) => (
                  <MailRow key={mail.from} mail={mail} ready={loaded} />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div
          role="group"
          aria-label="Render order"
          className="absolute bottom-4 left-1/2 flex -translate-x-1/2 rounded-full bg-surface-tertiary p-1 dark:bg-surface"
        >
          <span
            aria-hidden
            style={{ transform: `translateX(${mode === "waits" ? "0%" : "100%"})` }}
            className="pointer-events-none absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/2)] rounded-full bg-surface smooth-shadow-ring-sm transition-transform duration-200 ease-out dark:bg-surface-tertiary"
          />
          {MODES.map((option) => {
            const active = mode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => replay(option.value)}
                aria-pressed={active}
                className={cn(
                  "relative w-[7.5rem] cursor-pointer whitespace-nowrap rounded-full py-1 text-[13px] font-medium transition-colors",
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
    </figure>
  );
}

// The article's own advice: a placeholder should look like it is in a hurry.
const QUICK = "before:[animation-duration:0.5s]";

// A message row keeps its height in both states, so mail landing changes the picture and not
// the layout.
function MailRow({ mail, ready }: { mail: (typeof MAILS)[number]; ready: boolean }) {
  if (!ready) {
    return (
      <div className="flex h-13 flex-col justify-center gap-2.5 px-2.5">
        <Skeleton className={cn(QUICK, "rounded-full h-3 w-14")} />
        <Skeleton className={cn(QUICK, "rounded-full h-3 w-32")} />
      </div>
    );
  }
  return (
    <div className="flex h-13 flex-col justify-center gap-2 px-2.5">
      <div className="font-medium text-primary">{mail.from}</div>
      <div className="truncate text-tertiary">{mail.subject}</div>
    </div>
  );
}
