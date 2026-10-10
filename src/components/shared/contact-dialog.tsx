import { CONTACTS } from "@/const/contacts";
import { cn } from "@/lib/utils";
import { IconCrossSmall } from "central-icons/IconCrossSmall";
import { IconEmail2 } from "central-icons/IconEmail2";
import { IconGithub } from "central-icons/IconGithub";
import { IconLinkedin } from "central-icons/IconLinkedin";
import { IconPhone } from "central-icons/IconPhone";
import { IconX } from "central-icons/IconX";
import { MailLines } from "./mail-lines";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import type { ComponentType } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

const ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  X: IconX,
  GitHub: IconGithub,
  LinkedIn: IconLinkedin,
  Email: IconEmail2,
  iMessage: IconPhone,
};

const SOCIAL_LINKS = CONTACTS.map((c) => ({
  name: c.name,
  handle: c.handle,
  href: c.href,
  icon: ICON_MAP[c.name],
})).filter((l) => l.icon);

// Email is the large featured link; the rest fill the left column.
const FEATURED_LINK = SOCIAL_LINKS.find((l) => l.name === "Email");
const COLUMN_LINKS = SOCIAL_LINKS.filter((l) => l !== FEATURED_LINK);

const isExternal = (href: string) => href.startsWith("http");

export default function ContactDialog({
  roundedRightWhenClosed = false,
}: {
  // When the closed pill sits at the right end of the mobile bottom bar, round its
  // right corners fully so it nests into the bar's fully-rounded right edge.
  roundedRightWhenClosed?: boolean;
} = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const copyTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const close = useCallback(() => setIsOpen(false), []);

  const copyEmail = useCallback(() => {
    const email = FEATURED_LINK?.handle;
    if (!email) return;
    void navigator.clipboard?.writeText(email);
    setCopied(true);
    clearTimeout(copyTimeout.current);
    copyTimeout.current = setTimeout(() => setCopied(false), 2400);
  }, []);

  useEffect(() => () => clearTimeout(copyTimeout.current), []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, close]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [isOpen, close]);

  // In the mobile bottom bar the pill is fully rounded so it nests into the bar's pill shape
  // and matches the morphing nav pill; standalone (desktop) it keeps its tighter 4px corners.
  const closedRadius = roundedRightWhenClosed ? { borderRadius: 9999 } : { borderRadius: 4 };

  return (
    <MotionConfig transition={{ type: "spring", visualDuration: 0.2, bounce: 0 }}>
      <div ref={containerRef} className="relative z-10 hidden min-[350px]:flex items-center">
        <div className="h-8 md:h-6.5 px-2.5 text-sm fw-medium invisible">Contact</div>
        <motion.div
          layout
          aria-label={isOpen ? "Contact" : undefined}
          role={isOpen ? "dialog" : undefined}
          className={cn(
            "bg-interactive-secondary text-primary overflow-hidden outline outline-transparent outline-offset-0 transition-[outline-color,outline-offset,outline-width,background-color] duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blue-300",
            isOpen
              ? // Mobile: pin to the viewport, capped at 380px and centered (mx-auto, not a transform, so it doesn't fight the layout animation) so it never grows too wide or overflows. Desktop: anchored top-right like before.
                // 286px makes the featured tile square: its width matches the 4-row link column's height.
                "fixed inset-x-0 bottom-20 mx-auto w-[286px] max-w-[calc(100vw-1rem)] md:absolute md:inset-x-auto md:mx-0 md:bottom-auto md:right-0 md:top-0 md:w-[286px] md:max-w-none"
              : "absolute right-0 bottom-0 md:bottom-auto md:top-0 hover:bg-interactive-secondary-hover active:bg-interactive-secondary-active active:duration-0",
          )}
          style={isOpen ? { borderRadius: 8 } : closedRadius}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {isOpen ? (
              <motion.div
                key="panel"
                layout="position"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="p-1.5"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm fw-medium pl-1">Contact</span>
                  <button
                    type="button"
                    onClick={close}
                    aria-label="Close contact dialog"
                    className="size-6 flex items-center justify-center rounded-sm text-neutral-500 dark:text-neutral-400 hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/8 dark:active:bg-white/8 transition-colors active:duration-0 cursor-pointer"
                  >
                    <IconCrossSmall className="size-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="flex flex-col gap-0.5">
                    {COLUMN_LINKS.map((link) => (
                      <a
                        key={link.name}
                        href={link.href}
                        target={isExternal(link.href) ? "_blank" : undefined}
                        rel={isExternal(link.href) ? "noopener noreferrer" : undefined}
                        className="flex items-center gap-2.5 px-1.5 py-1.5 rounded-sm hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/8 dark:active:bg-white/8 transition-colors active:duration-0 text-sm"
                      >
                        <link.icon className="size-4 shrink-0" />
                        <span className="font-medium">{link.name}</span>
                      </a>
                    ))}
                  </div>
                  {FEATURED_LINK && (
                    <button
                      type="button"
                      onClick={copyEmail}
                      aria-label={
                        copied ? "Email address copied" : `Copy email ${FEATURED_LINK.handle}`
                      }
                      className="flex flex-col rounded-sm bg-black/5 dark:bg-white/5 p-3 pb-2 text-left hover:bg-black/10 dark:hover:bg-white/10 active:bg-black/13 dark:active:bg-white/13 transition-colors active:duration-0 cursor-pointer"
                    >
                      <div className="relative flex-1 min-h-0">
                        <MailLines shape={copied ? "check" : "mail"} className="absolute inset-0" />
                      </div>
                      <div className="mt-3 text-sm font-medium">
                        <AnimatePresence mode="wait" initial={false}>
                          <motion.span
                            key={copied ? "copied" : "email"}
                            className="block origin-left"
                            initial={{ opacity: 0, scale: 0.98, filter: "blur(2px)" }}
                            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                            exit={{ opacity: 0, scale: 0.98, filter: "blur(2px)" }}
                            transition={{ duration: 0.18, ease: "easeOut" }}
                          >
                            {copied ? "Copied" : "Copy Email"}
                          </motion.span>
                        </AnimatePresence>
                      </div>
                    </button>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.button
                type="button"
                key="button"
                layout="position"
                onClick={() => setIsOpen(true)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.1 }}
                className="text-sm fw-medium leading-none whitespace-nowrap px-2.5 h-8 md:h-6.5 flex items-center cursor-pointer"
                style={{ borderRadius: 4 }}
              >
                Contact
              </motion.button>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </MotionConfig>
  );
}
