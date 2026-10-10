import { cn } from "@/lib/utils";
import { MotionConfig, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DemoFrame } from "./demo-frame";

const PEOPLE = [
  {
    id: "maya",
    name: "Maya Lindqvist",
    mark: "sunrise",
    background: "fill-[oklch(0.6_0.13_255)]",
    accent: "fill-[oklch(0.36_0.08_255)]",
  },
  {
    id: "jonas",
    name: "Jonas Albrecht",
    mark: "quarter",
    background: "fill-[oklch(0.64_0.11_155)]",
    accent: "fill-[oklch(0.38_0.07_155)]",
  },
  {
    id: "sofia",
    name: "Sofía Marín",
    mark: "peak",
    background: "fill-[oklch(0.68_0.14_45)]",
    accent: "fill-[oklch(0.42_0.1_40)]",
  },
  {
    id: "theo",
    name: "Theo Brandt",
    mark: "rings",
    background: "fill-[oklch(0.58_0.12_300)]",
    accent: "fill-[oklch(0.36_0.08_300)]",
  },
  {
    id: "clara",
    name: "Clara Weiss",
    mark: "split",
    background: "fill-[oklch(0.78_0.12_85)]",
    accent: "fill-[oklch(0.46_0.08_70)]",
  },
] as const;

type PersonId = (typeof PEOPLE)[number]["id"];

// Who talks next. Jonas keeps coming back, which is why you want him muted.
const SEQUENCE: PersonId[] = [
  "jonas",
  "maya",
  "jonas",
  "sofia",
  "jonas",
  "clara",
  "maya",
  "jonas",
  "theo",
];
const TURN_MS = 1400;

const INITIAL_SPOKE: Record<PersonId, number> = { jonas: 5, maya: 4, sofia: 3, clara: 2, theo: 1 };

// Each mark is a cream shape and a darker one on a coloured disc. The disc clips the corners.
const MARK_PATHS = {
  sunrise: {
    shape: "M5 23a11 11 0 0 1 22 0Z",
    accent: "M0 23h32v9H0Z",
  },
  quarter: {
    shape: "M0 0h19A19 19 0 0 1 0 19Z",
    accent: "M17 21a5 5 0 1 0 10 0a5 5 0 1 0-10 0Z",
  },
  peak: {
    shape: "M16 7l11 19H5Z",
    accent: "M16 7l11 19H16Z",
  },
  rings: {
    shape: "M6 16a10 10 0 1 0 20 0a10 10 0 1 0-20 0Z",
    accent: "M12 16a4 4 0 1 0 8 0a4 4 0 1 0-8 0Z",
  },
  split: {
    shape: "M0 32L32 0v32Z",
    accent: "M6 11a5 5 0 1 0 10 0a5 5 0 1 0-10 0Z",
  },
} as const;

function ParticipantMark({
  person,
  isSpeaking,
  isMuted,
  small = false,
}: {
  person: (typeof PEOPLE)[number];
  isSpeaking: boolean;
  isMuted: boolean;
  small?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative block size-6 shrink-0 rounded-full transition-[box-shadow,filter,opacity] duration-150",
        small && "size-5",
        isSpeaking && "shadow-[0_0_0_2px_var(--panel),0_0_0_3.5px_oklch(0.68_0.15_155)]",
        isMuted && "opacity-50 grayscale",
      )}
    >
      <svg viewBox="0 0 32 32" className="size-full overflow-hidden rounded-full">
        <rect width="32" height="32" className={person.background} />
        <path d={MARK_PATHS[person.mark].shape} className="fill-[oklch(0.97_0.015_85)]" />
        <path d={MARK_PATHS[person.mark].accent} className={person.accent} />
      </svg>
      {/* Same edge as the buttons in this post: a hairline plus a soft highlight along the top. */}
      <span className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_0_0_1px_oklch(0_0_0/0.1),inset_0_4px_4px_-3px_oklch(1_0_0/0.4)] dark:shadow-[inset_0_0_0_1px_oklch(1_0_0/0.12),inset_0_4px_4px_-3px_oklch(1_0_0/0.25)]" />
    </span>
  );
}

export function HeldOrder() {
  const [lastSpoke, setLastSpoke] = useState(INITIAL_SPOKE);
  const [speaking, setSpeaking] = useState<PersonId>("jonas");
  const [muted, setMuted] = useState<PersonId[]>([]);
  const [frozen, setFrozen] = useState<PersonId[] | null>(null);
  const figure = useRef<HTMLDivElement>(null);
  const mutedRef = useRef<PersonId[]>([]);

  const liveOrder = useMemo(
    () => [...PEOPLE].sort((a, b) => lastSpoke[b.id] - lastSpoke[a.id]).map((p) => p.id),
    [lastSpoke],
  );
  const order = frozen ?? liveOrder;

  // The conversation is a timer: an external clock. It only runs while the demo is on screen.
  useEffect(() => {
    let timer = 0;
    let step = 0;
    let clock = 10;
    const turn = () => {
      let next = SEQUENCE[step++ % SEQUENCE.length];
      // Muted people stop talking, so they stop climbing.
      for (let i = 0; mutedRef.current.includes(next) && i < SEQUENCE.length; i++) {
        next = SEQUENCE[step++ % SEQUENCE.length];
      }
      if (mutedRef.current.includes(next)) return;
      clock += 1;
      setSpeaking(next);
      setLastSpoke((spoke) => ({ ...spoke, [next]: clock }));
    };
    const observer = new IntersectionObserver(([entry]) => {
      window.clearInterval(timer);
      if (entry.isIntersecting) timer = window.setInterval(turn, TURN_MS);
    });
    if (figure.current) observer.observe(figure.current);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, []);

  function toggleMute(id: PersonId) {
    const next = muted.includes(id) ? muted.filter((m) => m !== id) : [...muted, id];
    mutedRef.current = next;
    setMuted(next);
  }

  return (
    <DemoFrame>
      <style>{`@keyframes level { 0%, 100% { scale: 1 0.35 } 50% { scale: 1 1 } }`}</style>
      <div ref={figure} className="flex w-full max-w-[320px] flex-col items-center">
        {/* What the popover hangs from: the call's first avatars, in a pill. Each one but the last
            has a notch masked out where the next overlaps it, so the gap is real, not painted. The green
            dashes, in the speaking green, mark it as the thing that's open. */}
        <div className="flex h-8 items-center gap-2 rounded-full bg-surface-tertiary pr-3 pl-1.5 text-[12px] font-medium whitespace-nowrap text-secondary outline-[1.5px] outline-offset-[3px] outline-[oklch(0.68_0.15_155)] outline-dashed">
          <span className="flex shrink-0">
            {PEOPLE.slice(0, 3).map((person) => (
              <span
                key={person.id}
                className="-ml-1.5 flex [mask-image:radial-gradient(circle_at_24px_50%,transparent_11.5px,black_12px)] first:ml-0 last:[mask-image:none]"
              >
                <ParticipantMark person={person} isSpeaking={false} isMuted={false} small />
              </span>
            ))}
          </span>
          Design sync
        </div>

        {/* Black in light mode, so it reads as a layer over the page rather than a card on it. */}
        <div className="relative mt-4 w-full rounded-[16px] bg-[oklch(0.2_0_0)] px-2 pt-3 pb-2 smooth-shadow-ring-md [--panel:oklch(0.2_0_0)] dark:bg-surface-tertiary dark:[--panel:var(--surface-tertiary)]">
          {/* A light hairline inside the edge, the dark-surface ring; the tip carries it over its
              curve and covers it along its base, so the outline runs unbroken around both. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[16px] shadow-[inset_0_0_0_1px_oklch(1_0_0/0.12)]"
          />
          <svg
            aria-hidden
            viewBox="0 0 16 8.5"
            className="absolute -top-[6.5px] left-1/2 h-[8.5px] w-4 -translate-x-1/2 overflow-visible"
          >
            <path d="M0 7C3.5 7 5.6 0.6 8 0.6S12.5 7 16 7V8.5H0Z" className="fill-[var(--panel)]" />
            <path
              d="M0 7.5C3.5 7.5 5.6 1.1 8 1.1S12.5 7.5 16 7.5"
              className="fill-none stroke-[oklch(1_0_0/0.12)]"
              strokeWidth="1"
            />
          </svg>
          <div className="flex items-baseline justify-between px-2">
            <p className="text-[13px] leading-[18px] font-medium text-white">Design sync</p>
            {/* Swaps in place while the order is held, so nothing below it moves. */}
            <p className="grid text-right text-[13px] leading-[18px] text-white/50 tabular-nums">
              <span
                className={cn(
                  "col-start-1 row-start-1 transition-opacity duration-150",
                  frozen ? "opacity-0" : "opacity-100",
                )}
              >
                5 in call
              </span>
              <span
                className={cn(
                  "col-start-1 row-start-1 transition-opacity duration-150",
                  frozen ? "opacity-100" : "opacity-0",
                )}
              >
                Order paused
              </span>
            </p>
          </div>

          <MotionConfig
            reducedMotion="user"
            transition={{ type: "spring", duration: 0.35, bounce: 0.1 }}
          >
            <ul
              className="mt-2 flex flex-col"
              onPointerEnter={() => setFrozen(liveOrder)}
              onPointerLeave={() => setFrozen(null)}
            >
              {order.map((id) => {
                const person = PEOPLE.find((p) => p.id === id)!;
                const isMuted = muted.includes(id);
                const isSpeaking = speaking === id && !isMuted;
                return (
                  <motion.li
                    key={id}
                    layout="position"
                    className="flex h-10 items-center gap-2.5 rounded-[10px] px-2"
                  >
                    <ParticipantMark person={person} isSpeaking={isSpeaking} isMuted={isMuted} />
                    <span
                      className={cn(
                        "min-w-0 truncate text-[13px] leading-[18px]",
                        isMuted ? "text-white/45" : "text-white",
                      )}
                    >
                      {person.name}
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        "flex h-3 items-center gap-[2px] transition-opacity duration-150",
                        isSpeaking ? "opacity-100" : "opacity-0",
                      )}
                    >
                      {[0, 1, 2].map((bar) => (
                        <span
                          key={bar}
                          style={{ animationDelay: `${bar * 120}ms` }}
                          className="h-3 w-[3px] origin-center rounded-full bg-[oklch(0.68_0.15_155)] motion-safe:animate-[level_520ms_ease-in-out_infinite]"
                        />
                      ))}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleMute(id)}
                      aria-pressed={isMuted}
                      className={cn(
                        "-mr-2.5 ml-auto h-7 shrink-0 cursor-pointer rounded-[8px] px-2.5 text-[12px] font-medium text-white/60 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/40",
                        isMuted && "text-[oklch(0.72_0.17_25)] hover:text-[oklch(0.78_0.15_25)]",
                      )}
                    >
                      {isMuted ? "Muted" : "Mute"}
                    </button>
                  </motion.li>
                );
              })}
            </ul>
          </MotionConfig>
        </div>
      </div>
    </DemoFrame>
  );
}
