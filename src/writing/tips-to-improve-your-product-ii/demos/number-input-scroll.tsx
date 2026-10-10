import { cn } from "@/lib/utils";
import { useState } from "react";
import { DollarMark } from "./dollar-mark";

/* Chromium steps a focused `type="number"` input with the wheel while the pointer is over it, and
   swallows the scroll. Click the amount, then scroll the page with the cursor still on it: the
   page refuses to move, and the amount, the line written out in words and the button all change.
   Firefox and Safari no longer do this, so film it in Chrome.

   No `min` on purpose: the wheel happily walks the cheque below zero. */

type Mode = "number" | "numeric";

const MODES: { value: Mode; label: string }[] = [
  { value: "number", label: "Number" },
  { value: "numeric", label: "Inputmode" },
];

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const ONES = [
  "",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES = ["", " thousand", " million", " billion"];

function hundreds(n: number): string {
  const words: string[] = [];
  if (n >= 100) words.push(`${ONES[Math.floor(n / 100)]} hundred`);
  const rest = n % 100;
  if (rest >= 20)
    words.push(TENS[Math.floor(rest / 10)] + (rest % 10 ? `-${ONES[rest % 10]}` : ""));
  else if (rest > 0) words.push(ONES[rest]);
  return words.join(" ");
}

// How a cheque writes its amount: dollars in words, cents as a fraction.
function inWords(value: number): string {
  const sign = value < 0 ? "Minus " : "";
  const abs = Math.abs(value);
  let dollars = Math.floor(abs);
  const cents = Math.round((abs - dollars) * 100);
  const groups: string[] = [];
  for (let i = 0; dollars > 0 && i < SCALES.length; i++, dollars = Math.floor(dollars / 1000)) {
    const group = dollars % 1000;
    if (group) groups.unshift(hundreds(group) + SCALES[i]);
  }
  const words = groups.join(" ") || "zero";
  const text = `${sign}${words} and ${String(cents).padStart(2, "0")}/100`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const CHEQUES = [
  {
    number: "0250",
    date: "Oct 10, 2026",
    payee: "Maya Lindqvist",
    memo: "Rent, November",
    amount: "250",
  },
  {
    number: "0251",
    date: "Oct 12, 2026",
    payee: "Jonas Albrecht",
    memo: "Bike repair",
    amount: "80",
  },
  {
    number: "0252",
    date: "Oct 14, 2026",
    payee: "Sofia Marín",
    memo: "Concert tickets",
    amount: "120",
  },
];

const LABEL = "text-[9px] leading-[11px] font-medium tracking-[0.08em] text-tertiary uppercase";
const RULE =
  "border-b border-[oklch(0.6_0.02_250/0.35)] pb-0.5 dark:border-[oklch(0.75_0.02_250/0.25)]";

export function NumberInputScroll() {
  const [mode, setMode] = useState<Mode>("number");
  const isNumber = mode === "number";

  return (
    <figure className="not-prose mx-auto my-8 flex min-h-[374px] w-full max-w-[520px] flex-col items-center px-4 md:px-12 pt-6 pb-6 max-lg:-mx-4 rounded-sm outline -outline-offset-1 outline-black/5 dark:outline-white/8 font-pretendard">
      {/* A checkbook to scroll through, so there is something for the wheel to do. Over a
          focused number field it never gets there: the amount changes and the book stays put. */}
      <div className="h-[250px] w-full max-w-[384px] overflow-y-auto overscroll-contain px-4 py-4 [mask-image:linear-gradient(to_bottom,transparent,black_16px,black_calc(100%-28px),transparent)] [scrollbar-width:none]">
        <div className="flex flex-col gap-4">
          {CHEQUES.map((cheque) => (
            <Cheque key={cheque.number} mode={mode} {...cheque} />
          ))}
        </div>
      </div>

      <div
        role="group"
        aria-label="Input type"
        className="relative mt-auto flex rounded-full bg-surface-tertiary p-1"
      >
        <span
          aria-hidden
          style={{ transform: `translateX(${isNumber ? "0%" : "100%"})` }}
          className="pointer-events-none absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/2)] rounded-full bg-surface smooth-shadow-ring-sm transition-transform duration-200 ease-out"
        />
        {MODES.map((option) => {
          const active = mode === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setMode(option.value)}
              aria-pressed={active}
              className={cn(
                "relative w-[5.5rem] cursor-pointer whitespace-nowrap rounded-full py-1.5 text-[12px] font-medium transition-colors",
                "outline-none focus-visible:ring-2 focus-visible:ring-default",
                active ? "text-primary" : "text-tertiary hover:text-secondary",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </figure>
  );
}

function Cheque({
  mode,
  number,
  date,
  payee,
  memo,
  amount: initial,
}: {
  mode: Mode;
  number: string;
  date: string;
  payee: string;
  memo: string;
  amount: string;
}) {
  const [amount, setAmount] = useState(initial);
  const isNumber = mode === "number";
  const value = Number(amount) || 0;

  return (
    <div
      className="relative w-full overflow-hidden rounded-[14px] bg-[oklch(0.975_0.005_250)] px-4 pt-3.5 pb-3 smooth-shadow-ring-md [--guilloche:oklch(0.6_0.02_250/0.07)] dark:bg-[oklch(0.24_0.012_250)] dark:[--guilloche:oklch(0.85_0.02_250/0.05)]"
      style={{
        // Two faint crossing line sets: the security tint every cheque is printed on.
        backgroundImage:
          "repeating-linear-gradient(28deg, var(--guilloche) 0 1px, transparent 1px 7px), repeating-linear-gradient(-28deg, var(--guilloche) 0 1px, transparent 1px 7px)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-[5px] rounded-[10px] shadow-[inset_0_0_0_1px_oklch(0.6_0.02_250/0.18)] dark:shadow-[inset_0_0_0_1px_oklch(0.8_0.02_250/0.12)]"
      />

      <div className="relative flex items-start justify-between">
        <div className="flex items-center gap-2">
          <DollarMark />
          <div>
            <p className="text-[13px] leading-[18px] font-medium text-primary">Silverline Bank</p>
            <p className="text-[11px] leading-[16px] text-tertiary">Main account ·· 4021</p>
          </div>
        </div>
        <div className="text-right text-[11px] leading-[16px] text-tertiary tabular-nums">
          <p>No. {number}</p>
          <p>{date}</p>
        </div>
      </div>

      <div className="relative mt-2.5 flex items-end gap-2.5">
        <p className={cn(LABEL, "shrink-0")}>
          Pay to the
          <br />
          order of
        </p>
        <p
          className={cn(
            RULE,
            "min-w-0 flex-1 truncate font-['Cedarville_Cursive'] text-[17px] leading-[22px] text-primary",
          )}
        >
          {payee}
        </p>
        <label className="flex h-9 w-[112px] shrink-0 items-center gap-1 rounded-[8px] bg-white px-2.5 dark:bg-[oklch(0.3_0.012_250)] dark:shadow-[inset_0_0_0_1px_oklch(0.8_0.02_250/0.15)] text-[14px] font-medium text-primary shadow-[inset_0_0_0_1px_oklch(0.6_0.02_250/0.3)] has-focus-visible:shadow-[inset_0_0_0_1.5px_oklch(0.7_0.12_240),0_0_0_3px_oklch(0.7_0.12_240/0.16)]">
          <span className="text-tertiary">$</span>
          {/* key: switching modes remounts the input so the browser drops the old type's state. */}
          <input
            key={mode}
            aria-label="Amount"
            value={amount}
            onChange={(event) =>
              setAmount(isNumber ? event.target.value : event.target.value.replace(/[^\d.]/g, ""))
            }
            autoComplete="off"
            className={cn(
              "h-full min-w-0 flex-1 bg-transparent tabular-nums outline-none",
              "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
            )}
            {...(isNumber ? { type: "number" } : { type: "text", inputMode: "decimal" as const })}
          />
        </label>
      </div>

      <div className="relative mt-2.5 flex items-end gap-2">
        <p
          className={cn(RULE, "min-w-0 flex-1 truncate text-[13px] leading-[18px] text-secondary")}
        >
          {inWords(value)}
        </p>
        <p className={LABEL}>Dollars</p>
      </div>

      <div className="relative mt-2.5 flex items-end gap-2">
        <p className={LABEL}>Memo</p>
        <p
          className={cn(
            RULE,
            "w-[140px] font-['Cedarville_Cursive'] text-[15px] leading-[18px] text-primary",
          )}
        >
          {memo}
        </p>
      </div>

      <div className="relative mt-2 flex items-end justify-between gap-3">
        <p className="pb-0.5 font-mono text-[10px] tracking-[0.2em] text-quaternary">
          ⑆021000021⑆ 004021⑈ {number}
        </p>
        <button
          type="button"
          className={cn(
            // Tucked into the corner: the card's padding minus most of the frame inset.
            "-mr-1.5 -mb-0.5 h-8 shrink-0 cursor-pointer rounded-[8px] px-3 text-[13px] font-medium text-white tabular-nums",
            "transition-[background-color,scale] duration-200 ease-out active:scale-[0.96] active:duration-100",
            // The cheque's own slate blue, with the active-state tip's depth: a slightly darker
            // rim of the same hue and a soft highlight along the top inside edge.
            "bg-[oklch(0.52_0.085_250)] active:bg-[oklch(0.46_0.085_250)]",
            "shadow-[inset_0_0_0_1px_oklch(0.45_0.08_250),inset_0_4px_4px_-3px_oklch(1_0_0/0.3)]",
          )}
        >
          Send {currency.format(value)}
        </button>
      </div>
    </div>
  );
}
