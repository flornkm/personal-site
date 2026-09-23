import { Body2 } from "@/components/design-system/body";
import Button, { buttonVariants } from "@/components/ui/button";
import Tooltip from "@/components/ui/tooltip";
import { ColorLegend, RouteCanvas } from "@/features/writing/components/route-canvas";
import {
  fetchRuns,
  formatDate,
  formatDuration,
  formatKm,
  type Metric,
  type Run,
} from "@/features/writing/lib/runs";
import { cn } from "@/lib/utils";
import { IconArrowRotateClockwise } from "central-icons/IconArrowRotateClockwise";
import { IconChevronBottom } from "central-icons/IconChevronBottom";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { useRef, useState } from "react";

function Stat({ value, unit }: { value: string; unit: string }) {
  return (
    <span className="text-2xl font-medium tracking-[-0.02em] text-primary">
      {value} <span className="text-quaternary">{unit}</span>
    </span>
  );
}

// Hanging gutter left of the content column on desktop — shared by the km stat and the
// "AI Summary:" label so their LEFT edges align. The width is sized to the label
// ("AI Summary:" ≈ 5.4rem), keeping both close to the column; wider values (14.1 km)
// overflow rightward into the margin gap, which is harmless. nowrap: absolutely
// positioned boxes shrink-wrap to min-content and would break "5.0 km" in two.
const GUTTER = "md:absolute md:right-full md:top-0 md:mr-3 md:w-[5.5rem] md:whitespace-nowrap";

function RunStats({ run }: { run: Run }) {
  const duration = formatDuration(run.movingSeconds);

  return (
    <div className="relative mx-auto flex w-full max-w-[460px] items-start justify-between">
      <div className="flex items-baseline gap-6">
        {/* Hangs in the left gutter on desktop (over the AI Summary label below), leaving
            the mins stat on the column's left edge; inline next to mins on mobile. */}
        <span className={GUTTER}>
          <Stat value={formatKm(run.distanceMeters)} unit="km" />
        </span>
        <Stat value={duration.value} unit={duration.unit} />
      </div>
      <span className="text-sm text-tertiary">{formatDate(run.startDate)}</span>
    </div>
  );
}

// Plain select in the button primitive's ghost (tertiary) style plus a hairline outline,
// sized to sit inside the route box like a map control. The focus outline comes from the
// global :focus-visible rule (same offset ring as buttons), but browsers treat a focused
// <select> as :focus-visible even for mouse focus — so track the modality ourselves and
// mark pointer-initiated focus, which the global rule skips.
function MetricSwitch({ metric, onChange }: { metric: Metric; onChange: (m: Metric) => void }) {
  const pointerDownRef = useRef(false);
  const [pointerFocused, setPointerFocused] = useState(false);

  return (
    <div className="relative">
      <select
        aria-label="Route color metric"
        value={metric}
        onChange={(e) => onChange(e.target.value as Metric)}
        onPointerDown={() => {
          pointerDownRef.current = true;
        }}
        onFocus={() => {
          setPointerFocused(pointerDownRef.current);
          pointerDownRef.current = false;
        }}
        onBlur={() => setPointerFocused(false)}
        onKeyDown={(e) => {
          setPointerFocused(false);
          // Native selects only open on Space/Alt+Down; make Enter open the picker too.
          if (e.key === "Enter") {
            e.preventDefault();
            try {
              e.currentTarget.showPicker();
            } catch {
              // showPicker is unsupported in some browsers — Space still works there.
            }
          }
        }}
        data-focus-via={pointerFocused ? "pointer" : undefined}
        className={cn(
          buttonVariants({ variant: "tertiary", size: "sm" }),
          "appearance-none bg-transparent pl-2 pr-7 smooth-shadow-ring-xs",
        )}
      >
        <option value="temperature">°C</option>
        <option value="heartrate">bpm</option>
      </select>
      <IconChevronBottom className="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-tertiary" />
    </div>
  );
}

function StatSkeleton({ valueWidth }: { valueWidth: string }) {
  return <div className={cn("h-7 animate-pulse rounded-sm bg-tertiary", valueWidth)} />;
}

// Mirrors the loaded layout exactly: same root <div> (so prose's max-w rule doesn't cap the
// full-width route cards), same spacing, same widths.
function RunsSkeleton() {
  return (
    <div className="not-prose mx-auto mt-12 w-full md:max-w-[720px]">
      <ul className="flex flex-col gap-20">
        {Array.from({ length: 2 }).map((_, index) => (
          <li key={index}>
            <div className="relative mx-auto flex w-full max-w-[460px] items-start justify-between">
              <div className="flex gap-6">
                <span className={GUTTER}>
                  <StatSkeleton valueWidth="w-14" />
                </span>
                <StatSkeleton valueWidth="w-20" />
              </div>
              <div className="h-3.5 w-24 animate-pulse rounded-sm bg-tertiary" />
            </div>
            <div className="mx-auto mt-3 w-full max-w-[460px] space-y-1.5">
              <div className="h-3.5 w-full animate-pulse rounded-sm bg-tertiary" />
              <div className="h-3.5 w-2/3 animate-pulse rounded-sm bg-tertiary" />
            </div>
            <div className="mt-5 h-[26rem] w-full animate-pulse bg-tertiary md:h-[34rem]" />
          </li>
        ))}
      </ul>
    </div>
  );
}

// The bottom row of map controls sits flush with the box's padding edge, i.e. flush with the
// bottom of the drawing area, so the route has to stay this many px clear of it: the sm button
// height (h-7) the switch and replay share, plus a gap so the line doesn't graze them. The legend
// on the other side is shorter, so one band covers both.
const CHROME_HEIGHT = 28 + 8;

// Each entry carries its own metric toggle, so one run can show temperature while the
// next shows heart rate.
function RunItem({ run }: { run: Run }) {
  const reduceMotion = useReducedMotion();
  const [metric, setMetric] = useState<Metric>("temperature");
  const [replayToken, setReplayToken] = useState(0);
  return (
    <li>
      <RunStats run={run} />
      {run.description && (
        <p className="relative mx-auto mt-3 w-full max-w-[460px] text-balance text-sm leading-[1.5] text-primary">
          {/* Hangs in the left margin on desktop (baseline-aligned via matching text size and
              leading) so the note text keeps the column's left edge; hidden on mobile where
              there's no margin to hang into — the summary stands on its own there. */}
          <span className={cn("hidden font-serif font-medium italic md:inline", GUTTER)}>
            AI Summary:{" "}
          </span>
          {run.description}
        </p>
      )}
      {run.path && (
        <RouteCanvas
          path={run.path}
          metric={metric}
          temperature={run.temperature}
          temperatures={run.temperatures}
          averageHeartRate={run.averageHeartRate}
          heartRates={run.heartRates}
          replayToken={replayToken}
          bottomChrome={CHROME_HEIGHT}
          className="mt-5 h-[26rem] w-full bg-secondary p-3 md:h-[34rem] md:p-5"
        >
          {/* Map-style controls in the box corners: toggle + replay left, color key right. */}
          <div className="absolute bottom-3 left-3 flex items-center gap-2 md:bottom-5 md:left-5">
            <MetricSwitch metric={metric} onChange={setMetric} />
            {/* flex: the trigger div is otherwise a block wrapper whose inline-flex child leaves
                baseline space below, knocking the button out of line with the select. */}
            <Tooltip content="Replay" className="flex">
              <Button
                variant="tertiary"
                size="sm"
                iconOnly
                aria-label="Replay route animation"
                className="smooth-shadow-ring-xs"
                onClick={() => setReplayToken((token) => token + 1)}
              >
                {/* Each click adds a full turn, so rapid clicks keep spinning forward instead
                    of snapping back. */}
                <motion.span
                  className="inline-flex"
                  animate={{ rotate: reduceMotion ? 0 : replayToken * 360 }}
                  transition={{ duration: 0.55, ease: [0.3, 0, 0.2, 1] }}
                >
                  <IconArrowRotateClockwise />
                </motion.span>
              </Button>
            </Tooltip>
          </div>
          <div className="absolute bottom-3 right-3 md:bottom-5 md:right-5">
            <ColorLegend metric={metric} />
          </div>
        </RouteCanvas>
      )}
    </li>
  );
}

export function RunsFeed() {
  const { data: runs, isPending, isError } = useQuery({ queryKey: ["runs"], queryFn: fetchRuns });

  if (isPending) return <RunsSkeleton />;
  if (isError) {
    return (
      <Body2 className="not-prose text-tertiary">
        Runs are taking a breather. Check back soon.
      </Body2>
    );
  }
  if (runs.length === 0) {
    return <Body2 className="not-prose text-tertiary">No runs synced yet.</Body2>;
  }

  return (
    // Capped to the same "proud" width as the wider figure images (720px) so the route maps
    // don't balloon to the full article width on large screens; centred by the article's
    // md:mx-auto. The inner stats/summary keep their own 460px text-column cap.
    <div className="not-prose mx-auto mt-12 w-full md:max-w-[720px]">
      <ul className="flex flex-col gap-20">
        {runs.map((run) => (
          <RunItem key={run.id} run={run} />
        ))}
      </ul>
    </div>
  );
}
