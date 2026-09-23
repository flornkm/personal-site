import { cn } from "@/lib/utils";
import { useLocation } from "@tanstack/react-router";
import { animate, motion, useMotionValue, useReducedMotion } from "motion/react";
import scribbleRaw from "./experiments-scribble.svg?raw";
import ContactDialog from "./contact-dialog";
import { Logo } from "./logo";
import { Link } from "../ui/link";

// Hand-drawn strip shown only on /experiments. Inlined (not an <img>) so each
// path can animate in sequence — the filled scribble paths pop in one after
// another, like the strip being written out.
const logoTransition = { type: "spring", duration: 0.3, bounce: 0 } as const;
// Width of the expanded "FLORIAN KIEM" so the hover zone covers the whole word, not just the tiny collapsed logo.
const LOGO_HOVER_WIDTH = 108;

export type Tab = {
  name: string;
  href: string;
};

export const TABS = [
  { name: "Work", href: "/" },
  { name: "About", href: "/about" },
  { name: "Writing", href: "/writing" },
] as Tab[];

export default function Navigation() {
  const { pathname } = useLocation();

  // Lives here so the whole Home link (spanning the overflow area) opens the logo and keeps it open without flicker.
  const logoProgress = useMotionValue(0);
  const reduceMotion = useReducedMotion();
  const setLogoHover = (target: number) => {
    if (reduceMotion) {
      logoProgress.set(target);
    } else {
      animate(logoProgress, target, logoTransition);
    }
  };

  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/" || pathname.startsWith("/work")
      : pathname === href || pathname.startsWith(href + "/");

  const onExperiments = pathname === "/experiments" || pathname.startsWith("/experiments/");

  return (
    <nav className="relative z-50 bg-primary">
      <div className="mx-auto grid w-full max-w-[2560px] grid-cols-9 items-center gap-x-6 px-6 pt-6 pb-4">
        {/* w-fit keeps the link hugging the logo so its footprint isn't the whole 2-column track. */}
        <Link
          href="/"
          className="flex w-fit items-center col-span-2 justify-self-start"
          aria-label="Home"
        >
          <span
            className="relative flex shrink-0 items-center"
            style={{ width: LOGO_HOVER_WIDTH }}
            onMouseEnter={() => setLogoHover(1)}
            onMouseLeave={() => setLogoHover(0)}
          >
            <Logo className="h-3 w-auto text-primary" progress={logoProgress} />
          </span>
        </Link>
        <div className="relative hidden items-center gap-4 col-span-5 md:flex md:gap-6">
          {TABS.map((tab) => (
            <Link
              key={tab.name}
              href={tab.href}
              className={cn(
                "text-sm font-medium transition-colors duration-50 hit-area-10",
                isActive(tab.href) ? "text-primary" : "text-tertiary hover:text-secondary",
              )}
            >
              {tab.name}
            </Link>
          ))}
          {/* Right-aligned to the tabs' grid track — the same column edge the
              nav items align left to — and out of flow so it never stretches
              the nav row. This strip is short enough to clear the tabs from lg
              up; below that only the mobile top-right instance shows. */}
          {onExperiments && (
            <span
              aria-hidden
              className="absolute right-0 top-[calc(50%+3px)] hidden aspect-[1209/72] h-5 -translate-y-1/2 select-none dark:invert [&_svg]:size-full lg:block"
              dangerouslySetInnerHTML={{ __html: scribbleRaw }}
            />
          )}
        </div>
        {/* Desktop only: in flow in the last grid track, so it lines up with the content's right
            edge without taking the nav out of the document. The dialog itself expands absolutely
            inside this cell, so opening it never stretches the nav row. On mobile the Contact
            button lives in the bottom bar instead. */}
        <div className="hidden justify-end col-span-2 md:flex">
          <ContactDialog />
        </div>
      </div>

      {/* Mobile keeps the scribble at the top right; Contact lives in the bottom
          bar there, so the corner is free. Width-capped so it clears the logo. */}
      {onExperiments && (
        <span
          aria-hidden
          className="absolute right-6 top-7 aspect-[1209/72] w-[58vw] max-w-80 select-none dark:invert [&_svg]:size-full md:hidden"
          dangerouslySetInnerHTML={{ __html: scribbleRaw }}
        />
      )}

      {/* Mobile-only floating bar; on desktop the tabs and Contact live in the top nav above. */}
      <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center md:hidden">
        <div className="flex items-center gap-1 rounded-full bg-primary p-1.5 smooth-shadow-ring-lg">
          {TABS.map((tab) => {
            const active = isActive(tab.href);
            return (
              <Link
                key={tab.name}
                href={tab.href}
                className={cn(
                  "relative px-4 py-1.5 text-sm font-medium transition-colors duration-50 hit-area-6",
                  active ? "text-primary" : "text-tertiary hover:text-secondary",
                )}
              >
                {/* Shared-layout pill: Framer slides this single element between tabs when the active route changes. */}
                {active && (
                  <motion.span
                    layoutId="nav-active-pill"
                    transition={{ type: "spring", stiffness: 500, damping: 40, mass: 0.8 }}
                    className="absolute inset-0 rounded-full bg-surface-tertiary"
                  />
                )}
                <span className="relative">{tab.name}</span>
              </Link>
            );
          })}
          <ContactDialog roundedRightWhenClosed />
        </div>
      </div>
    </nav>
  );
}
