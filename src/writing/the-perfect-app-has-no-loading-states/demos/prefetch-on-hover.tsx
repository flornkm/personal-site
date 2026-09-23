import { cn } from "@/lib/utils";
import { IconChevronRight } from "central-icons/IconChevronRight";
import { useRef, useState } from "react";
import { Browser } from "./browser";
import { GROCERIES_PARTS, GroceriesPage } from "./groceries";

/* Figure for "Prefetch and cache content".

   Two browsers, the same app, the same request. In the left one the list is fetched when the
   row is clicked, so the click is followed by a skeleton for as long as the request takes. In
   the right one the same request starts the moment the pointer arrives on the row. The hand
   takes a few hundred milliseconds to get from arriving to pressing, and that is usually more
   than the request needs, so the click lands on a page that is already there.

   The prefetching browser is given most of the article's own claim: its request is short enough
   that any unhurried hover covers it, while a click that beats it still shows the remainder as a
   skeleton, so the mechanism stays visible. The other browser pays the full request after the
   click. */

// What the click-side browser waits for: roughly a list endpoint on decent wifi.
const FETCH_MS = 450;
// What the hover-side browser waits for, from the moment the pointer arrives.
const PREFETCH_MS = 100;

export function PrefetchOnHover() {
  return (
    <figure className="not-prose max-lg:-mx-4 @container mx-auto my-10 font-pretendard lg:max-w-[560px]">
      <div className="grid gap-4 @md:grid-cols-2">
        <NavigatingBrowser label="Fetch on click" prefetch={false} />
        <NavigatingBrowser label="Prefetch on hover" prefetch />
      </div>
    </figure>
  );
}

type Page = "home" | "groceries";

function NavigatingBrowser({ label, prefetch }: { label: string; prefetch: boolean }) {
  const [page, setPage] = useState<Page>("home");
  const [loaded, setLoaded] = useState(false);
  const timer = useRef<number | null>(null);

  // Idempotent: hover, focus, touch and the click itself all funnel into one request, and only
  // the first of them starts it. Whichever starts it sets how long it takes.
  function fetchList(ms: number) {
    if (loaded || timer.current !== null) return;
    timer.current = window.setTimeout(() => setLoaded(true), ms);
  }

  function open() {
    fetchList(FETCH_MS);
    setPage("groceries");
  }

  // Going back also forgets the cache, so the figure can be tried again from a cold start. A
  // real app would keep it, which is the point of the article, but a demo that only works once
  // is no demo.
  function back() {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setLoaded(false);
    setPage("home");
  }

  const onGroceries = page === "groceries";
  const ready = Array.from({ length: GROCERIES_PARTS }, () => loaded);

  return (
    <Browser
      label={label}
      url={onGroceries ? "example.com/groceries" : "example.com"}
      onBack={back}
      canGoBack={onGroceries}
    >
      {onGroceries ? (
        <GroceriesPage ready={ready} />
      ) : (
        <Home onOpen={open} onIntent={prefetch ? () => fetchList(PREFETCH_MS) : undefined} />
      )}
    </Browser>
  );
}

function Home({ onOpen, onIntent }: { onOpen: () => void; onIntent?: () => void }) {
  return (
    <div className="space-y-2">
      <div className="flex h-5 items-center leading-none">
        <span className="text-[13px] font-medium text-primary">Lists</span>
      </div>
      {/* Intent is the pointer arriving, keyboard focus landing, or a finger touching down:
          each is the earliest moment this row is likely to be opened. */}
      <button
        type="button"
        onClick={onOpen}
        onPointerEnter={onIntent}
        onFocus={onIntent}
        onTouchStart={onIntent}
        className={cn(
          // The row's box hangs out past the heading by its own padding, so its label sits on
          // the same left edge as "Lists" rather than the box doing.
          "-mx-2 flex h-8 w-[calc(100%+1rem)] cursor-pointer items-center rounded-lg bg-surface-tertiary px-2 text-[12px] leading-none",
          "transition-colors duration-150 hover:bg-quaternary dark:hover:bg-interactive-active",
          "outline-none focus-visible:ring-2 focus-visible:ring-default",
        )}
      >
        <span className="text-primary">Groceries</span>
        <span className="ml-auto flex items-center gap-1 text-tertiary">
          5 items
          <IconChevronRight size={10} mode="raw" className="text-quaternary" />
        </span>
      </button>
      {/* Matches the list page's height so switching pages never moves the window. */}
      <div className="h-34" />
    </div>
  );
}
