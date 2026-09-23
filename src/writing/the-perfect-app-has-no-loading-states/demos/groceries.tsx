import Skeleton from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { IconPlusSmall } from "central-icons/IconPlusSmall";
import { useState } from "react";
import { BLUE } from "./browser";

/* The page the figures load: a shopping list, kept to a title and a list so the eye compares
   loading behaviours instead of reading screens. `ready` says which of the two has arrived.
   Every part has a fixed height in both states, so resolving one never moves the other. */

type Item = { label: string; done: boolean };

const ITEMS: Item[] = [
  { label: "Oat milk", done: true },
  { label: "Sourdough", done: true },
  { label: "Avocados", done: false },
  { label: "Coffee beans", done: false },
  { label: "Lemons", done: false },
];

export const GROCERIES_PARTS = 2;

// `shell` is the app's own chrome, here the add row: not data, but not free either, since the
// app has to boot before it can paint it. While false the row keeps its space and shows nothing.
export function GroceriesPage({ ready, shell = true }: { ready: boolean[]; shell?: boolean }) {
  return (
    <div className="space-y-2">
      <Header ready={ready[0]} />
      <List ready={ready[1]} />
      {shell ? <AddRow /> : <div className="h-8" />}
    </div>
  );
}

function Header({ ready }: { ready: boolean }) {
  if (!ready) {
    return (
      <div className="flex h-6 items-center">
        <Skeleton className="rounded-full h-2.5 w-16" />
        <Skeleton className="rounded-full ml-auto h-2 w-10" />
      </div>
    );
  }
  return (
    <div className="flex h-6 items-center leading-none">
      <span className="text-[14px] font-medium text-primary">Groceries</span>
      <span className="ml-auto text-[12px] text-tertiary">Saturday</span>
    </div>
  );
}

function List({ ready }: { ready: boolean }) {
  // Local to each browser, so ticking an item in one does not tick it in the others.
  const [items, setItems] = useState(ITEMS);

  if (!ready) {
    return (
      <div>
        {ITEMS.map((item) => (
          <div key={item.label} className="flex h-8 items-center gap-2.5">
            <Skeleton className="size-4 rounded-[4px]" />
            <Skeleton className="rounded-full h-2 w-20" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div>
      {items.map((item, index) => (
        <ListItem
          key={item.label}
          item={item}
          onToggle={() =>
            setItems((current) =>
              current.map((entry, i) => (i === index ? { ...entry, done: !entry.done } : entry)),
            )
          }
        />
      ))}
    </div>
  );
}

function ListItem({ item, onToggle }: { item: Item; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={item.done}
      onClick={onToggle}
      className="flex h-8 w-full cursor-pointer items-center gap-2.5 text-left text-[13px] leading-none outline-none focus-visible:ring-2 focus-visible:ring-default"
    >
      {/* Checking eases in; unchecking snaps. Undoing is a correction and should not be made to
          wait for a fade, so every transition on the box and the mark is gated on `done`. */}
      <span
        style={item.done ? { background: BLUE } : undefined}
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-[4px]",
          item.done ? "transition-colors duration-150 ease-out" : "transition-none",
          !item.done && "outline -outline-offset-1 outline-black/15 dark:outline-white/20",
        )}
      >
        <svg viewBox="0 0 12 12" aria-hidden className="size-3.5">
          {/* pathLength normalises the stroke to 1, so the dash offset is a plain 0-1 progress
              that Safari animates as happily as Chrome. Delayed a beat so the fill lands first. */}
          <path
            d="M2.5 6.4 L5 8.9 L9.5 3.6"
            pathLength={1}
            fill="none"
            stroke="white"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              strokeDasharray: 1,
              strokeDashoffset: item.done ? 0 : 1,
              transition: item.done
                ? "stroke-dashoffset 200ms cubic-bezier(0.23, 1, 0.32, 1) 60ms"
                : "none",
            }}
          />
        </svg>
      </span>
      <span
        className={cn(
          item.done
            ? "text-tertiary line-through transition-colors duration-150"
            : "text-primary transition-none",
        )}
      >
        {item.label}
      </span>
    </button>
  );
}

// Part of the app shell rather than of the data, so it is there before anything has loaded.
function AddRow() {
  return (
    <div className="flex h-8 items-center gap-2.5 text-[13px] leading-none text-tertiary">
      <span className="flex size-4 items-center justify-center">
        {/* Unmasked: the masked build shares one <mask> id across every copy of the icon, and a
            copy inside a hidden page takes the mask down with it for the visible ones. */}
        <IconPlusSmall size={16} mode="raw" />
      </span>
      Add item
    </div>
  );
}
