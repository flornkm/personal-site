import { cn } from "@/lib/utils";
import NumberFlow from "@number-flow/react";
import { useRef, useState } from "react";
import { CARD, Stage } from "./stage";

/* A heating dial in brushed aluminium. The finish is the detail: fine circular brushing and
   the broad highlights a lamp leaves on it, which stay where they are while the knob turns,
   because the light is in the room and not on the knob. Only the notch moves. The ticks around
   it warm up to the set temperature, and the dial clicks in half-degree detents. */

const MIN = 16;
const MAX = 28;
const STEP = 0.5;
const SWEEP = 270;
const TICKS = (MAX - MIN) / STEP + 1;

const angleOf = (value: number) => ((value - MIN) / (MAX - MIN)) * SWEEP - SWEEP / 2;

export function ThermostatKnob() {
  const [value, setValue] = useState(21.5);
  const knob = useRef<HTMLDivElement>(null);

  function setFromPointer(event: React.PointerEvent) {
    const rect = knob.current?.getBoundingClientRect();
    if (!rect) return;
    const x = event.clientX - (rect.left + rect.width / 2);
    const y = event.clientY - (rect.top + rect.height / 2);
    // 0° points up, clockwise positive, clamped to the dial's sweep.
    let deg = (Math.atan2(x, -y) * 180) / Math.PI;
    deg = Math.max(-SWEEP / 2, Math.min(SWEEP / 2, deg));
    const raw = MIN + ((deg + SWEEP / 2) / SWEEP) * (MAX - MIN);
    setValue(Math.round(raw / STEP) * STEP);
  }

  function nudge(delta: number) {
    setValue((v) => Math.max(MIN, Math.min(MAX, v + delta)));
  }

  const angle = angleOf(value);

  return (
    <Stage>
      <div className={cn(CARD, "flex max-w-[340px] items-center gap-5 p-5")}>
        <div className="relative grid size-[132px] shrink-0 place-items-center">
          {/* The scale: ticks up to the setting glow warm. */}
          <svg viewBox="0 0 132 132" className="absolute inset-0" aria-hidden>
            {Array.from({ length: TICKS }, (_, i) => {
              const tickValue = MIN + i * STEP;
              const a = ((angleOf(tickValue) - 90) * Math.PI) / 180;
              const major = i % 4 === 0;
              const on = tickValue <= value;
              const r1 = 60;
              const r2 = major ? 52 : 55;
              const warmth = (tickValue - MIN) / (MAX - MIN);
              return (
                <line
                  key={i}
                  x1={66 + Math.cos(a) * r1}
                  y1={66 + Math.sin(a) * r1}
                  x2={66 + Math.cos(a) * r2}
                  y2={66 + Math.sin(a) * r2}
                  strokeWidth={major ? 1.6 : 1.2}
                  strokeLinecap="round"
                  style={{
                    stroke: on
                      ? `oklch(${0.78 - warmth * 0.14} ${0.1 + warmth * 0.08} ${70 - warmth * 40})`
                      : "oklch(0.86 0 0)",
                    transition: "stroke 120ms ease-out",
                  }}
                />
              );
            })}
          </svg>

          <div
            ref={knob}
            role="slider"
            tabIndex={0}
            aria-label="Temperature"
            aria-valuemin={MIN}
            aria-valuemax={MAX}
            aria-valuenow={value}
            aria-valuetext={`${value.toFixed(1)} degrees`}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              setFromPointer(event);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) setFromPointer(event);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp" || event.key === "ArrowRight") nudge(STEP);
              else if (event.key === "ArrowDown" || event.key === "ArrowLeft") nudge(-STEP);
              else return;
              event.preventDefault();
            }}
            className="relative size-[96px] cursor-grab touch-none rounded-full outline-none select-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-default focus-visible:ring-offset-4"
            style={{
              // Shadows on the table, then the bevel catching light top-left and falling off.
              boxShadow:
                "0 1px 1px rgb(0 0 0 / 0.18), 0 6px 14px -4px rgb(0 0 0 / 0.28), 0 14px 28px -12px rgb(0 0 0 / 0.25), inset 0 1px 0 rgb(255 255 255 / 0.9), inset 0 -1px 1px rgb(0 0 0 / 0.18)",
              background: [
                // Circular brushing, finer than a pixel at the rim.
                "repeating-radial-gradient(circle at 50% 50%, rgb(255 255 255 / 0.07) 0 0.6px, rgb(0 0 0 / 0.05) 0.6px 1.3px)",
                // The lamp's highlights: fixed in the room, never rotated with the knob.
                "conic-gradient(from 200deg, #a9adb3, #f4f5f6 9%, #b8bcc2 20%, #8f949b 33%, #dfe1e4 46%, #fbfbfc 52%, #c3c6cb 62%, #9599a0 76%, #e6e8ea 88%, #a9adb3)",
              ].join(","),
            }}
          >
            {/* A shallow dished face, a step in from the rim. */}
            <div className="absolute inset-[9px] rounded-full bg-[radial-gradient(circle_at_40%_35%,rgb(255_255_255/0.35),transparent_60%),radial-gradient(circle,transparent_60%,rgb(0_0_0/0.06))] shadow-[inset_0_1px_2px_rgb(0_0_0/0.18),0_1px_0_rgb(255_255_255/0.7)]" />
            {/* The notch: the only part that turns. */}
            <div
              className="absolute inset-0 transition-[rotate] duration-100 ease-out"
              style={{ rotate: `${angle}deg` }}
            >
              <span className="absolute top-[14px] left-1/2 h-[12px] w-[4px] -translate-x-1/2 rounded-full bg-[oklch(0.42_0.01_250)] shadow-[inset_0_1px_1px_rgb(0_0_0/0.45),0_1px_0_rgb(255_255_255/0.8)]" />
            </div>
          </div>
        </div>

        <div className="min-w-0">
          <p className="text-[13px] leading-[18px] font-medium text-primary">Living room</p>
          <p className="text-[13px] leading-[18px] text-tertiary">Heating · now 19.8°</p>
          <p className="mt-2 text-[32px] leading-none font-light tracking-[-0.02em] text-primary tabular-nums">
            <NumberFlow
              value={value}
              format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }}
              suffix="°"
            />
          </p>
        </div>
      </div>
    </Stage>
  );
}
