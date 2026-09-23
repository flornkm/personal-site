import Button from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { IconArrowRotateClockwise } from "central-icons/IconArrowRotateClockwise";
import { IconPause } from "central-icons-filled/IconPause";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

/* Figure for "Don't use spinners".

   The same clip in two players. The left one waits for the full-quality file behind a spinner.
   The right one starts playing the smallest rendition at once and trades up as the better ones
   arrive, the way adaptive streaming does. Both have the sharp version at the same moment; only
   one of them showed the user nothing until then. */

const LOAD_MS = 2400;

// Encoded by scripts/encode-loading-states-clip.ts, lowest first. Each rung takes over at its
// time; the last lands exactly when the spinner's file does.
const RENDITIONS = [
  { label: "240p", src: "/videos/writing/loading-states/clip-240.mp4", at: 0 },
  { label: "480p", src: "/videos/writing/loading-states/clip-480.mp4", at: 800 },
  { label: "720p", src: "/videos/writing/loading-states/clip-720.mp4", at: 1600 },
  { label: "1080p", src: "/videos/writing/loading-states/clip-1080.mp4", at: LOAD_MS },
];
const SHARPEST = RENDITIONS[RENDITIONS.length - 1];

export function VideoLoading() {
  // When the current run started, or null at rest. Rest shows both players sharp with the full
  // load behind them, so the figure reads before the button is ever pressed.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [run, setRun] = useState(0);
  const reduceMotion = useReducedMotion();
  const elapsed = startedAt === null ? LOAD_MS : now - startedAt;

  useEffect(() => {
    if (startedAt === null) return;
    let frame = 0;
    const tick = () => {
      const t = performance.now();
      setNow(t);
      if (t - startedAt < LOAD_MS) frame = requestAnimationFrame(tick);
      else setStartedAt(null);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [startedAt]);

  function reload() {
    const t = performance.now();
    setNow(t);
    setStartedAt(t);
    setRun((current) => current + 1);
  }

  return (
    <figure className="not-prose max-lg:-mx-4 @container mx-auto my-10 font-pretendard lg:max-w-[460px]">
      {/* Side by side at every width: the comparison only works with both in view, and two
          portrait players fit a phone. */}
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <Player label="Spinner until sharp">
          <SpinnerPlayer run={run} loaded={elapsed >= LOAD_MS} />
        </Player>
        <Player label="Soft first, sharper as it comes">
          <ProgressivePlayer run={run} elapsed={elapsed} />
        </Player>
      </div>

      <div className="mt-8 flex justify-center">
        <Button
          variant="tertiary"
          size="sm"
          className="smooth-shadow-ring-xs"
          onClick={reload}
          prefix={
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
    </figure>
  );
}

// The player frame: portrait like the clip, a fixed box so nothing around it moves while the
// picture inside changes.
function Player({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      {/* The edge is a pseudo-element painted over the picture rather than a shadow around it:
          an inset hairline stays on the frame's own pixels, so it reads the same on a bright sky
          and a dark rock, and the video keeps no halo on the page. */}
      <div
        className={cn(
          "relative aspect-[9/16] overflow-hidden rounded-xl bg-black",
          "after:pointer-events-none after:absolute after:inset-0 after:rounded-xl after:inset-ring after:inset-ring-black/10 dark:after:inset-ring-white/10",
        )}
      >
        {children}
      </div>
      <p className="mt-3 text-center text-[12px] text-tertiary md:text-[13px]">{label}</p>
    </div>
  );
}

// Waits for the sharp file, showing nothing but a spinner until it is there.
function SpinnerPlayer({ run, loaded }: { run: number; loaded: boolean }) {
  const [progress, setProgress] = useState(0);
  if (!loaded) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="size-5 animate-spin rounded-full border-2 border-white/20 border-t-white motion-reduce:animate-none" />
      </div>
    );
  }
  return (
    <>
      <Clip key={run} src={SHARPEST.src} onProgress={setProgress} />
      <Controls progress={progress} quality={SHARPEST.label} />
    </>
  );
}

// Plays the smallest rendition at once and stacks each better one on top as it arrives, picking
// up at the same moment so the picture sharpens without a cut.
function ProgressivePlayer({ run, elapsed }: { run: number; elapsed: number }) {
  const players = useRef<(HTMLVideoElement | null)[]>([]);
  const [progress, setProgress] = useState(0);
  const level = RENDITIONS.filter((rendition) => elapsed >= rendition.at).length - 1;

  // A rung that has just arrived joins at the lowest rung's position, so the sharper picture
  // continues the same moment instead of starting the clip over.
  useEffect(() => {
    const base = players.current[0];
    const next = players.current[level];
    if (!base || !next || next === base) return;
    next.currentTime = base.currentTime;
    void next.play().catch(() => {});
  }, [level]);

  return (
    <>
      {RENDITIONS.map((rendition, index) => (
        <Clip
          key={`${run}-${rendition.src}`}
          ref={(node) => {
            players.current[index] = node;
          }}
          src={rendition.src}
          onProgress={index === 0 ? setProgress : undefined}
          className={cn(
            "transition-opacity duration-300 ease-out",
            index <= level ? "opacity-100" : "opacity-0",
          )}
        />
      ))}
      <Controls progress={progress} quality={RENDITIONS[level].label} />
    </>
  );
}

function Clip({
  src,
  className,
  onProgress,
  ref,
}: {
  src: string;
  className?: string;
  onProgress?: (ratio: number) => void;
  ref?: React.Ref<HTMLVideoElement>;
}) {
  return (
    <video
      ref={ref}
      src={src}
      muted
      loop
      autoPlay
      playsInline
      preload="auto"
      onTimeUpdate={(event) => {
        const video = event.currentTarget;
        if (video.duration) onProgress?.(video.currentTime / video.duration);
      }}
      className={cn("absolute inset-0 size-full object-cover", className)}
    />
  );
}

// The chrome a player is recognised by: a pause glyph, a hairline scrubber, and the rendition
// it is showing, over a wash so they read on any frame.
function Controls({ progress, quality }: { progress: number; quality: string }) {
  return (
    <>
      <span className="absolute top-2.5 right-2.5 rounded-full bg-black/30 px-1.5 py-1 text-[10px] leading-none font-medium text-white/90 tabular-nums backdrop-blur-sm">
        {quality}
      </span>
      <div className="absolute inset-x-0 bottom-0 flex h-14 items-end gap-2.5 bg-linear-to-t/srgb from-black/60 to-transparent px-3 pb-3">
        <IconPause size={12} mode="raw" className="shrink-0 text-white" />
        <div className="relative mb-[5px] h-0.5 flex-1 overflow-hidden rounded-full bg-white/25">
          <span
            style={{ transform: `scaleX(${progress})` }}
            className="absolute inset-0 origin-left bg-white"
          />
        </div>
      </div>
    </>
  );
}
