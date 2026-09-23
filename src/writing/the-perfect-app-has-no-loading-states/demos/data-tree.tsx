import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { BLUE } from "./browser";

/* Figure for "Communicate with your backend engineers".

   The database as a tree: one table of items, grouped under the lists they belong to. The toggle
   is the query. Asking for the whole table lights up every row before the frontend can throw
   most of them away; asking for one list lights up the five rows the page will actually show.
   The wait the user sees was decided here, not in the component. */

type Scope = "table" | "list";

// How long each query takes, roughly a full scan against an indexed lookup on decent hardware.
const SCOPES: { value: Scope; label: string; ms: number }[] = [
  { value: "table", label: "Whole table", ms: 2400 },
  { value: "list", label: "One list", ms: 120 },
];

const W = 320;
const LISTS = [56, 160, 264];
const LEAF_OFFSETS = [-40, -20, 0, 20, 40];
const ROOT = { x: 160, y: 14 };
const LIST_Y = 70;
const LEAF_Y = 126;
// The list the page is for.
const WANTED = 1;

export function DataTree() {
  const [scope, setScope] = useState<Scope>("table");
  // When the current run started, or null at rest. Rest shows the query fully done with its
  // total time, so the figure reads before the toggle is ever touched.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const { ms } = SCOPES.find((option) => option.value === scope) ?? SCOPES[0];
  const elapsed = startedAt === null ? ms : Math.min(now - startedAt, ms);

  // A frame clock while a run is in flight: the counter ticks and the rows light up in turn as
  // the query reaches them.
  useEffect(() => {
    if (startedAt === null) return;
    let frame = 0;
    const tick = () => {
      const t = performance.now();
      setNow(t);
      if (t - startedAt < ms) frame = requestAnimationFrame(tick);
      else setStartedAt(null);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [startedAt, ms]);

  function runQuery(next: Scope) {
    const t = performance.now();
    setScope(next);
    setNow(t);
    setStartedAt(t);
  }

  // The rows this query returns, in the order the database hands them over. Row k arrives once
  // its share of the total time has passed, so a full scan drips in while a lookup lands at once.
  const wanted = (list: number) => scope === "table" || list === WANTED;
  const rowsReturned = LISTS.reduce(
    (n, _, list) => n + (wanted(list) ? LEAF_OFFSETS.length : 0),
    0,
  );
  let arrived = 0;
  const rowLit = () => {
    arrived += 1;
    return elapsed >= (arrived / rowsReturned) * ms;
  };

  return (
    <figure className="not-prose max-lg:-mx-4 mx-auto my-8 max-w-[520px] font-pretendard">
      <div className="relative flex min-h-[16rem] items-center justify-center rounded-sm p-4 outline -outline-offset-1 outline-black/5 md:p-12 dark:outline-white/8">
        <p className="absolute top-4 left-4 text-[13px] leading-none text-tertiary tabular-nums md:top-6 md:left-6">
          <span className="font-medium text-primary">{(elapsed / 1000).toFixed(2)} s</span>
          {" · "}
          {rowsReturned} rows
        </p>

        <svg viewBox={`0 0 ${W} 140`} aria-hidden className="mb-8 w-full max-w-[360px] select-none">
          {LISTS.map((x, list) => {
            const onPath = scope === "list" && list === WANTED;
            return (
              <g key={x}>
                <Edge x1={ROOT.x} y1={ROOT.y} x2={x} y2={LIST_Y} lit={onPath} />
                {LEAF_OFFSETS.map((dx) => {
                  const lit = wanted(list) && rowLit();
                  return (
                    <g key={dx}>
                      <Edge x1={x} y1={LIST_Y} x2={x + dx} y2={LEAF_Y} lit={lit} />
                      <Node x={x + dx} y={LEAF_Y} r={4} lit={lit} />
                    </g>
                  );
                })}
                <Node x={x} y={LIST_Y} r={5} lit={onPath} />
              </g>
            );
          })}
          <Node x={ROOT.x} y={ROOT.y} r={6} lit={scope === "list"} />
        </svg>

        <div
          role="group"
          aria-label="Query scope"
          className="absolute bottom-4 left-1/2 flex -translate-x-1/2 rounded-full bg-surface-tertiary p-1 dark:bg-surface"
        >
          {/* Same control as the figures in the tips article: two equal cells, one sliding pill. */}
          <span
            aria-hidden
            style={{ transform: `translateX(${scope === "table" ? "0%" : "100%"})` }}
            className="pointer-events-none absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/2)] rounded-full bg-surface smooth-shadow-ring-sm transition-transform duration-200 ease-out dark:bg-surface-tertiary"
          />
          {SCOPES.map((option) => {
            const active = scope === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => runQuery(option.value)}
                aria-pressed={active}
                className={cn(
                  "relative w-[6.25rem] cursor-pointer whitespace-nowrap rounded-full py-1 text-[13px] font-medium transition-colors",
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

// Lit parts take the accent; the rest sit in the surface with a hairline. The short fade is
// what keeps a row arriving from reading as a flicker.
const SWAP = "transition-[fill,stroke] duration-150 ease-out motion-reduce:transition-none";

function Node({ x, y, r, lit }: { x: number; y: number; r: number; lit: boolean }) {
  return (
    <circle
      cx={x}
      cy={y}
      r={r}
      style={{
        fill: lit ? BLUE : "var(--surface)",
        stroke: lit ? BLUE : "var(--border-secondary)",
      }}
      strokeWidth={1.25}
      className={SWAP}
    />
  );
}

function Edge({
  x1,
  y1,
  x2,
  y2,
  lit,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  lit: boolean;
}) {
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      style={{ stroke: lit ? BLUE : "var(--border-primary)" }}
      strokeWidth={1}
      className={SWAP}
    />
  );
}
