import Button from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { IconArrowRotateClockwise } from "central-icons/IconArrowRotateClockwise";
import { motion, useReducedMotion } from "motion/react";
import { useRef, useState } from "react";
import { Browser, Spinner } from "./browser";
import { GROCERIES_PARTS, GroceriesPage } from "./groceries";

/* Figure for "The perfect app has no loading states".

   Three browsers reload the same page from the same button and finish at the same moment, so the
   only variable is where the waiting shows. Server-rendered: the viewport is blank and the only
   sign of life is the browser's own address-bar progress; the page arrives whole and the app never
   has to admit it is loading. Spinner: the app puts one indicator at its root. Skeletons: every
   part draws its own placeholder and resolves on its own, in the order they matter. */

const LOAD_MS = 2400;
// The last skeleton lands exactly when the other two browsers finish, so none of the three wins
// by getting a shorter clock.
const PART_MS = [1400, LOAD_MS];
// How long the client app takes to boot and paint its own shell after a reload.
const SHELL_MS = 25;
// Narrower than the row so the next window peeks in and shows there is more to the side.
const SLIDE = "@max-lg:w-[min(20rem,78cqw)] @max-lg:shrink-0 @max-lg:snap-start";

export function LoadingStrategies() {
  // How many of the page's parts have arrived. Full is the resting state, so the page is
  // populated before the first reload and every browser derives its own view from this one count.
  const [resolved, setResolved] = useState(GROCERIES_PARTS);
  const [shellReady, setShellReady] = useState(true);
  const [run, setRun] = useState(0);
  const timers = useRef<number[]>([]);
  const reduceMotion = useReducedMotion();
  const loading = resolved < GROCERIES_PARTS;

  function reload() {
    // A reload mid-flight restarts the clock rather than layering two runs. React drops state
    // updates from timers that outlive the figure, so there is nothing to clean up on unmount.
    for (const timer of timers.current) window.clearTimeout(timer);
    setResolved(0);
    setShellReady(false);
    setRun((current) => current + 1);
    timers.current = [
      window.setTimeout(() => setShellReady(true), SHELL_MS),
      ...PART_MS.map((ms, index) => window.setTimeout(() => setResolved(index + 1), ms)),
    ];
  }

  const skeletonReady = PART_MS.map((_, index) => resolved > index);
  const allReady = PART_MS.map(() => true);

  return (
    <figure className="not-prose max-lg:-mx-4 @container mx-auto my-10 font-pretendard">
      {/* Wider than the article column from lg: half the column in, half its own width back,
          so it stays centred on the text while each browser gets room to read. */}
      <div className="lg:ml-[50%] lg:w-[840px] lg:-translate-x-1/2">
        {/* Below @lg the three windows don't fit side by side, so they become a snap row that
          scrolls sideways, each edge fading only while a window is hidden past it. The vertical
          padding is cancelled by the negative margin: it exists so the row's overflow clipping
          leaves room for the windows' shadows. */}
        <div
          className={cn(
            "grid gap-4 @lg:grid-cols-3",
            "@max-lg:-my-2 @max-lg:flex @max-lg:snap-x @max-lg:snap-mandatory @max-lg:scroll-px-4 @max-lg:overflow-x-auto @max-lg:px-4 @max-lg:py-2 @max-lg:scroll-mask-x",
          )}
        >
          <div className={SLIDE}>
            <Browser
              label="Server rendered"
              run={run}
              progress={loading}
              progressMs={LOAD_MS}
              hidden={loading}
            >
              <GroceriesPage ready={allReady} />
            </Browser>
          </div>
          <div className={SLIDE}>
            <Browser label="Root spinner" hidden={loading} overlay={loading && <Spinner />}>
              <GroceriesPage ready={allReady} />
            </Browser>
          </div>
          <div className={SLIDE}>
            <Browser label="Skeletons">
              <GroceriesPage ready={skeletonReady} shell={shellReady} />
            </Browser>
          </div>
        </div>

        <div className="mt-8 flex justify-center">
          {/* Same button as the replay control on the runs feed, with its label kept. */}
          <Button
            variant="tertiary"
            size="sm"
            className="smooth-shadow-ring-xs"
            onClick={reload}
            prefix={
              // Each click adds a full turn, so rapid clicks keep spinning forward instead of
              // snapping back.
              <motion.span
                className="inline-flex"
                animate={{ rotate: reduceMotion ? 0 : run * 360 }}
                transition={{ duration: 0.55, ease: [0.3, 0, 0.2, 1] }}
              >
                <IconArrowRotateClockwise />
              </motion.span>
            }
          >
            Reload
          </Button>
        </div>
      </div>
    </figure>
  );
}
