import Button from "@/components/ui/button";
import { IconCheckmark1Small } from "central-icons/IconCheckmark1Small";
import { AnimatePresence, motion } from "motion/react";
import { useState, type FormEvent } from "react";

type Status = "idle" | "sending" | "done" | "error";

const SWAP = {
  initial: { opacity: 0, filter: "blur(2px)" },
  animate: { opacity: 1, filter: "blur(0px)" },
  exit: { opacity: 0, filter: "blur(2px)" },
  transition: { duration: 0.18, ease: "easeOut" },
} as const;

export function StayInTouch({ source }: { source: string }) {
  const [status, setStatus] = useState<Status>("idle");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setStatus("sending");
    try {
      const response = await fetch("/api/stay-in-touch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          website: form.get("website"),
          source,
        }),
      });
      setStatus(response.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  };

  return (
    <section
      aria-labelledby="stay-in-touch"
      className="mt-24 rounded-[14px] bg-tertiary p-1.5 md:mt-32 lg:mx-auto lg:max-w-[560px]"
    >
      {/* px-2.5 inside the card's p-1.5 lands the text 16px in, on the same line as the
          placeholder (field p-1 + input px-1.5 inside the same p-1.5). */}
      <div className="px-2.5 pt-2.5 pb-4">
        <h2 id="stay-in-touch" className="text-sm leading-5 fw-medium text-primary">
          Stay in touch
        </h2>
        <p className="mt-0.5 text-sm leading-5 text-tertiary">
          I write here every now and then. Leave your email and I'll send a short note when
          something new is up.
        </p>
      </div>
      {/* Concentric corners: rounded-sm (4px) button + p-1 = rounded-lg (8px) field, + the
          card's p-1.5 = 14px card. */}
      <div className="flex h-9 items-center rounded-lg bg-surface p-1 smooth-shadow-ring-xs outline outline-transparent outline-offset-0 transition-[outline-color,outline-offset,outline-width] duration-150 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-blue-300 dark:bg-surface-tertiary">
        <AnimatePresence mode="wait" initial={false}>
          {status === "done" ? (
            <motion.p
              key="done"
              {...SWAP}
              role="status"
              className="flex h-full items-center gap-1 px-1.5 text-sm text-secondary"
            >
              <IconCheckmark1Small className="size-4 shrink-0" />
              Thanks, talk soon.
            </motion.p>
          ) : (
            <motion.form
              key="form"
              {...SWAP}
              onSubmit={submit}
              // Before hydration Enter would otherwise do a native GET to this page: a reload
              // with the address in the URL. Posting to the API instead still saves it.
              action="/api/stay-in-touch"
              method="post"
              className="flex h-full w-full items-center gap-1"
            >
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                aria-label="Email address"
                aria-invalid={status === "error" || undefined}
                aria-describedby={status === "error" ? "stay-in-touch-error" : undefined}
                onChange={() => status === "error" && setStatus("idle")}
                className="h-full min-w-0 flex-1 bg-transparent px-1.5 text-sm text-primary outline-none placeholder:text-quaternary"
              />
              <input type="hidden" name="source" value={source} />
              {/* Honeypot for form-filling bots; hidden from people and assistive tech. */}
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden
                className="sr-only"
              />
              <Button type="submit" size="sm" disabled={status === "sending"}>
                Keep me posted
              </Button>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
      {/* Height animates from 0 so the panel grows to make room instead of jumping. */}
      <AnimatePresence initial={false}>
        {status === "error" && (
          <motion.div
            key="error"
            initial={{ height: 0, opacity: 0, filter: "blur(2px)" }}
            animate={{ height: "auto", opacity: 1, filter: "blur(0px)" }}
            exit={{ height: 0, opacity: 0, filter: "blur(2px)" }}
            transition={{ type: "spring", visualDuration: 0.25, bounce: 0 }}
            className="overflow-hidden"
          >
            <p
              id="stay-in-touch-error"
              role="alert"
              className="px-2.5 pt-2 pb-1 text-xs text-destructive"
            >
              That didn't go through. Check the address and try again.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
