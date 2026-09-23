import { cn } from "@/lib/utils";
import { IconChevronRight } from "central-icons/IconChevronRight";
import { useRef, useState } from "react";
import { IconChevronLeft } from "central-icons/IconChevronLeft";
import Skeleton from "@/components/ui/skeleton";
import { CALENDAR_DATE, CALENDAR_PARTS, CalendarPage } from "./calendar";

/* Figure for "Prefetch and cache content".

   Two panels, the same app, the same request. In the left one the day is fetched when the row
   is clicked, so the click is followed by a skeleton for as long as the request takes. In the
   right one the same request starts the moment the pointer arrives on the row. The hand
   takes a few hundred milliseconds to get from arriving to pressing, and that is usually more
   than the request needs, so the click lands on a page that is already there.

   The prefetching browser is given most of the article's own claim: its request is short enough
   that a settled hover covers it, while a quick click that beats it still shows a short skeleton,
   so the mechanism stays visible. The other browser pays the full request after the click. */

// What the click-side browser waits for: roughly a list endpoint on decent wifi.
const FETCH_MS = 450;
// What the hover-side browser waits for, from the moment the pointer arrives.
const PREFETCH_MS = 300;
// The least time the day view shows its skeleton when the click beats the request. A hover
// that has rested on the row long enough opens the day instantly, as a real prefetch would; a
// click that lands before the request is back would otherwise show the last few milliseconds
// of skeleton, too short to read, so it is held for this long instead.
const FLASH_MS = 150;

export function PrefetchOnHover() {
  return (
    <figure className="not-prose max-lg:-mx-4 @container mx-auto my-10 font-pretendard">
      {/* Same breakout as the opening figure, to 640px. */}
      <div className="grid gap-4 @md:grid-cols-2 lg:ml-[50%] lg:w-[640px] lg:-translate-x-1/2">
        <NavigatingPanel label="Fetch on click" prefetch={false} />
        <NavigatingPanel label="Prefetch on hover" prefetch />
      </div>
    </figure>
  );
}

type Page = "home" | "day";

function NavigatingPanel({ label, prefetch }: { label: string; prefetch: boolean }) {
  const [page, setPage] = useState<Page>("home");
  const [loaded, setLoaded] = useState(false);
  const [flashed, setFlashed] = useState(false);
  const timer = useRef<number | null>(null);
  const flash = useRef<number | null>(null);

  // Idempotent: hover, focus, touch and the click itself all funnel into one request, and only
  // the first of them starts it. Whichever starts it sets how long it takes.
  function fetchDay(ms: number) {
    if (loaded || timer.current !== null) return;
    timer.current = window.setTimeout(() => setLoaded(true), ms);
  }

  function open() {
    setPage("day");
    if (loaded) {
      setFlashed(true);
      return;
    }
    fetchDay(FETCH_MS);
    flash.current = window.setTimeout(() => setFlashed(true), FLASH_MS);
  }

  // Going back also forgets the cache, so the figure can be tried again from a cold start. A
  // real app would keep it, which is the point of the article, but a demo that only works once
  // is no demo.
  function back() {
    if (timer.current !== null) window.clearTimeout(timer.current);
    if (flash.current !== null) window.clearTimeout(flash.current);
    timer.current = null;
    flash.current = null;
    setLoaded(false);
    setFlashed(false);
    setPage("home");
  }

  const onDay = page === "day";
  const shown = loaded && flashed;
  const ready = Array.from({ length: CALENDAR_PARTS }, () => shown);

  return (
    // Stacked on narrow screens the panel would span the full column, which is wide for a
    // phone-sized app; capped and centred there, full column width once the two sit side by side.
    <div className="mx-auto w-full max-w-[320px] @md:max-w-none">
      {/* No browser around this one. The panel's own title row carries the navigation: a back
          button appears in it on the day view, and the row is the same height on both pages.
          The whole page area is pinned to one height, so switching pages never moves anything. */}
      <div className="rounded-[10px] bg-surface p-4 pt-3 smooth-shadow-ring-xs dark:smooth-ring-white/6">
        <div className="h-[166px] space-y-3">
          <div className="flex h-6 items-center gap-1 leading-none">
            {onDay && (
              <button
                type="button"
                aria-label="Back"
                onClick={back}
                className={cn(
                  "-ml-1 flex size-6 cursor-pointer items-center justify-center rounded-md text-secondary",
                  "transition-colors hover:bg-black/5 dark:hover:bg-white/5",
                  "outline-none focus-visible:ring-2 focus-visible:ring-default",
                )}
              >
                <IconChevronLeft size={12} mode="raw" />
              </button>
            )}
            <span className="text-[14px] font-medium text-primary">
              {onDay ? "Today" : "Calendar"}
            </span>
            {onDay && <DayDate ready={shown} />}
          </div>
          {onDay ? (
            <CalendarPage ready={ready} header={false} />
          ) : (
            <Home onOpen={open} onIntent={prefetch ? () => fetchDay(PREFETCH_MS) : undefined} />
          )}
        </div>
      </div>
      <p className="mt-3 text-center text-[14px] text-tertiary">{label}</p>
    </div>
  );
}

function DayDate({ ready }: { ready: boolean }) {
  if (!ready) return <Skeleton className="rounded-full ml-auto h-2 w-14" />;
  return <span className="ml-auto text-[12px] text-tertiary">{CALENDAR_DATE}</span>;
}

const TODAY = { label: "Today", meta: "3 events" };

function Home({ onOpen, onIntent }: { onOpen: () => void; onIntent?: () => void }) {
  return (
    // Intent is the pointer arriving, keyboard focus landing, or a finger touching down:
    // each is the earliest moment this row is likely to be opened.
    <button
      type="button"
      onClick={onOpen}
      onPointerEnter={onIntent}
      onFocus={onIntent}
      onTouchStart={onIntent}
      className={cn(
        "-mx-2 flex h-9 w-[calc(100%+1rem)] items-center rounded-lg bg-surface-tertiary px-2 text-[13px] leading-none",
        "cursor-pointer transition-colors duration-150 hover:bg-quaternary dark:hover:bg-interactive-active",
        "outline-none focus-visible:ring-2 focus-visible:ring-default",
      )}
    >
      <DayRow day={TODAY} />
    </button>
  );
}

function DayRow({ day }: { day: typeof TODAY }) {
  return (
    <>
      <span className="text-primary">{day.label}</span>
      <span className="ml-auto flex items-center gap-1 text-tertiary">
        {day.meta}
        <IconChevronRight size={10} mode="raw" className="text-quaternary" />
      </span>
    </>
  );
}
