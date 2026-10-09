import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { H4 } from "../design-system/heading";
import { Link } from "../ui/link";
import { FlorianLines } from "./florian-lines";
import { Tab, TABS } from "./navigation";

const footerLinkVariants = cva(
  "font-medium flex items-center gap-2 text-tertiary hover:text-secondary transition-colors duration-50 hit-area-6",
  {
    variants: {
      size: {
        small: "text-xs",
        medium: "text-sm",
      },
    },
    defaultVariants: { size: "medium" },
  },
);

const pagesColumnVariants = cva("flex flex-col items-start gap-2", {
  variants: {
    variant: {
      default: "md:col-start-1",
      indent: "md:col-start-3",
    },
  },
  defaultVariants: { variant: "default" },
});

const MORE_LINKS: Tab[] = [
  { name: "Colophon", href: "/colophon" },
  { name: "Experiments", href: "/experiments" },
];

const LEGAL_LINKS: Tab[] = [
  { name: "Imprint", href: "/imprint" },
  { name: "Privacy Policy", href: "/privacy-policy" },
];

type FooterProps = VariantProps<typeof pagesColumnVariants>;

export default function Footer({ variant = "default" }: FooterProps) {
  return (
    <footer
      className={cn(
        "relative z-10 bg-primary pt-12",
        // Indent (home): overlap the content on desktop, but use normal spacing on mobile where the sidebar links move into the footer.
        variant === "indent" ? "mt-24 md:-mt-[156px]" : "mt-24",
      )}
    >
      <div className="mx-auto w-full max-w-[2560px] px-6">
        <div className="grid gap-y-12 md:grid-cols-9">
          <div className={pagesColumnVariants({ variant })}>
            <H4 className="mb-1">Pages</H4>
            {TABS.map((tab) => (
              <Link
                key={tab.name}
                href={tab.href}
                className={footerLinkVariants({ size: "medium" })}
              >
                {tab.name}
              </Link>
            ))}
          </div>

          {/* On the indent (home) variant these links live in the page sidebar on desktop, so the footer hides the column there — but on mobile the sidebar hides them, so the footer shows them. */}
          <div
            className={cn(
              "flex flex-col items-start gap-2 md:col-start-3 md:col-span-2",
              variant === "indent" && "md:hidden",
            )}
          >
            <H4 className="mb-1">More</H4>
            {MORE_LINKS.map((tab) => (
              <Link
                key={tab.name}
                href={tab.href}
                className={footerLinkVariants({ size: "medium" })}
              >
                {tab.name}
              </Link>
            ))}
          </div>

          <div className="flex flex-col items-start gap-2 md:col-start-8 md:col-span-2">
            <H4 className="mb-1">Legal</H4>
            {LEGAL_LINKS.map((tab) => (
              <Link
                key={tab.name}
                href={tab.href}
                className={footerLinkVariants({ size: "medium" })}
              >
                {tab.name}
              </Link>
            ))}
          </div>
        </div>

        <FlorianLines className="mt-16" />

        {/* Extra bottom space on mobile so the floating tab bar doesn't cover the copyright. */}
        <div className="mt-16 mb-24 grid gap-y-2 md:mb-8 md:grid-cols-9">
          <p className="text-xs text-quaternary">© {new Date().getFullYear()} Florian Kiem</p>
          <p className="text-xs text-quaternary md:col-start-8 md:col-span-2">
            All rights reserved. No reproduction or AI training.
          </p>
        </div>
      </div>
    </footer>
  );
}
