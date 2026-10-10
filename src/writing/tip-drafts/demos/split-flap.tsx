import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { CARD, Stage } from "./stage";

/* A gate change on a boarding pass, shown the way an airport board shows it. Each character is
   a split flap that only turns forward through its drum, so going from B to C is one flap and
   from C to A is most of the alphabet. The top leaf falls, the next character's bottom leaf
   lands under it. While the pass is on screen the gate changes every few seconds. */

const DRUM = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const GATES = ["B12", "C04", "A07"];
const FLIP_MS = 70;

function Flap({ target }: { target: string }) {
  const [shown, setShown] = useState({ prev: target, current: target, n: 0 });

  // Stepping the drum is a timer: an external clock driving the display.
  useEffect(() => {
    if (shown.current === target) return;
    const timer = window.setTimeout(() => {
      const next = DRUM[(DRUM.indexOf(shown.current) + 1) % DRUM.length];
      setShown((s) => ({ prev: s.current, current: next, n: s.n + 1 }));
    }, FLIP_MS);
    return () => window.clearTimeout(timer);
  }, [shown, target]);

  const half = "absolute inset-x-0 h-1/2 overflow-hidden bg-[oklch(0.24_0.012_250)]";
  const glyph =
    "flex h-[34px] items-center justify-center text-[20px] font-medium text-[oklch(0.96_0_0)] tabular-nums";

  return (
    <span className="relative block h-[34px] w-[24px] rounded-[4px] [perspective:120px] shadow-[0_1px_2px_rgb(0_0_0/0.25)]">
      {/* Behind: the new character's top, the old character's bottom. */}
      <span className={cn(half, "top-0 rounded-t-[4px]")}>
        <span className={glyph}>{shown.current}</span>
      </span>
      <span className={cn(half, "bottom-0 rounded-b-[4px]")}>
        <span className={cn(glyph, "-translate-y-1/2")}>{shown.prev}</span>
      </span>
      {/* The leaves in motion, re-keyed so every step plays again. */}
      <span
        key={`t${shown.n}`}
        className={cn(
          half,
          "top-0 origin-bottom rounded-t-[4px] [backface-visibility:hidden] motion-safe:animate-[flap-top_70ms_ease-in_forwards]",
        )}
      >
        <span className={glyph}>{shown.prev}</span>
      </span>
      <span
        key={`b${shown.n}`}
        className={cn(
          half,
          "bottom-0 origin-top rounded-b-[4px] [backface-visibility:hidden] motion-safe:animate-[flap-bottom_70ms_ease-out_70ms_both]",
        )}
      >
        <span className={cn(glyph, "-translate-y-1/2")}>{shown.current}</span>
      </span>
      {/* The hinge. */}
      <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-black/50" />
    </span>
  );
}

export function SplitFlap() {
  const [gate, setGate] = useState(0);
  const stage = useRef<HTMLElement>(null);

  // The schedule changing is a timer too; only while the pass is visible.
  useEffect(() => {
    let timer = 0;
    const observer = new IntersectionObserver(([entry]) => {
      window.clearInterval(timer);
      if (entry.isIntersecting)
        timer = window.setInterval(() => setGate((g) => (g + 1) % GATES.length), 4200);
    });
    if (stage.current) observer.observe(stage.current);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, []);

  return (
    <Stage ref={stage}>
      <style>{`
        @keyframes flap-top { from { transform: rotateX(0deg) } to { transform: rotateX(-90deg) } }
        @keyframes flap-bottom { from { transform: rotateX(90deg) } to { transform: rotateX(0deg) } }
      `}</style>
      <div className={cn(CARD, "max-w-[340px]")}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[13px] leading-[18px] font-medium text-primary">Lyon → Lisbon</p>
            <p className="text-[13px] leading-[18px] text-tertiary">SL 214 · Boards 14:05</p>
          </div>
          <p className="text-[13px] leading-[18px] text-tertiary">Seat 14A</p>
        </div>
        <div className="mt-4 flex items-end justify-between">
          <div>
            <p className="text-[11px] leading-[16px] text-tertiary">Gate</p>
            <div className="mt-1 flex gap-1">
              {GATES[gate].split("").map((char, index) => (
                <Flap key={index} target={char} />
              ))}
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] leading-[16px] text-tertiary">Status</p>
            <p className="mt-1 text-[13px] leading-[18px] font-medium text-[oklch(0.55_0.12_160)]">
              On time
            </p>
          </div>
        </div>
      </div>
    </Stage>
  );
}
