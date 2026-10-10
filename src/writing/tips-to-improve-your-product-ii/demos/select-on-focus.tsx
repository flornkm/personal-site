import { cn } from "@/lib/utils";
import { useRef, useState } from "react";
import { PANEL, DemoFrame, SUBTITLE, TITLE } from "./demo-frame";
import { PixelBlock } from "./pixel-block";

type Field = "w" | "h" | "radius" | "opacity";
const INITIAL: Record<Field, string> = { w: "300", h: "160", radius: "24", opacity: "100" };
const FIELDS: { key: Field; label: string; suffix?: string }[] = [
  { key: "w", label: "W" },
  { key: "h", label: "H" },
  { key: "radius", label: "R" },
  { key: "opacity", label: "O", suffix: "%" },
];

export function SelectOnFocus() {
  const [values, setValues] = useState(INITIAL);
  const selectOnUp = useRef(false);

  const w = Number(values.w) || 0;
  const h = Number(values.h) || 0;
  const radius = Number(values.radius) || 0;
  const opacity = Math.min(100, Number(values.opacity) || 0) / 100;

  return (
    <DemoFrame>
      <div className={PANEL}>
        <p className={TITLE}>Rectangle</p>
        <p className={SUBTITLE}>Hero card · Frame 12</p>

        <div className="mt-4 h-[176px] overflow-hidden rounded-[14px] bg-surface-tertiary dark:bg-surface-secondary">
          <PixelBlock w={w} h={h} radius={radius} opacity={opacity} />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {FIELDS.map(({ key, label, suffix }) => (
            <label
              key={key}
              className={cn(
                "flex h-9 min-w-0 cursor-text items-center gap-2 rounded-[10px] bg-surface-tertiary px-3 text-[13px]",
                "transition-[background-color,box-shadow] duration-150 ease-out",
                "has-focus-visible:bg-surface has-focus-visible:shadow-[inset_0_0_0_1.5px_oklch(0.62_0.17_42),0_0_0_3px_oklch(0.62_0.17_42/0.14)]",
              )}
            >
              <span className="w-3 shrink-0 text-[12px] font-medium text-tertiary">{label}</span>
              <input
                aria-label={label}
                inputMode="numeric"
                value={values[key]}
                onChange={(event) =>
                  setValues((v) => ({ ...v, [key]: event.target.value.replace(/[^\d]/g, "") }))
                }
                // On mouseup, not focus: the browser places the caret on mouseup and would undo it.
                onMouseDown={(event) => {
                  selectOnUp.current = document.activeElement !== event.currentTarget;
                }}
                onMouseUp={(event) => {
                  if (!selectOnUp.current) return;
                  selectOnUp.current = false;
                  event.preventDefault();
                  event.currentTarget.select();
                }}
                autoComplete="off"
                className="min-w-0 flex-1 bg-transparent text-primary tabular-nums outline-none selection:bg-[oklch(0.62_0.17_42/0.22)]"
              />
              {suffix && <span className="shrink-0 text-tertiary">{suffix}</span>}
            </label>
          ))}
        </div>
      </div>
    </DemoFrame>
  );
}
