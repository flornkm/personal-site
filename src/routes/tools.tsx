import { absoluteUrl, canonicalLink } from "@/lib/site";
import { createFileRoute } from "@tanstack/react-router";
import { IconArrowUpRight } from "central-icons/IconArrowUpRight";
import type { ComponentType } from "react";

function DitherDemo() {
  /* Pre-rendered output of the plugin's algorithm (Bayer threshold over a radial-gradient
     ball). The live filter + mix-blend-mode pipeline renders inconsistently in Safari at
     this thumbnail scale, so the thumbnail ships as static SVG; regenerate with
     scripts/build-dither-ball.py. */
  return <img src="/images/dither-ball.svg" alt="" className="size-16" />;
}

function GradientBorderDemo() {
  return (
    <div
      className={
        "gradient-border flex h-9 items-center rounded-full px-4 text-sm fw-medium text-secondary shadow-sm " +
        "bg-linear-to-t from-neutral-100 to-white dark:from-neutral-900 dark:to-neutral-800 " +
        "[--gradient-border:linear-gradient(315deg,#ffffff_0%,#fafafa_50%,#ffffff_100%)] " +
        "dark:[--gradient-border:linear-gradient(315deg,rgba(255,255,255,0.1),rgba(255,255,255,0.03)_50%,rgba(255,255,255,0.1))]"
      }
    >
      Preview
    </div>
  );
}

function LaunchVideoDemo() {
  /* Simplified vector of the product's app icon — the original is a 3D render this repo
     doesn't have the source for, so this is a likeness, not the shipped asset. It carries
     its own prefers-color-scheme block, since an <img>-loaded SVG can't see the page's
     classes; theme it there, not with dark: utilities here. */
  return <img src="/images/launchvideo-icon.svg" alt="" className="size-16" />;
}

function ShadowDemo() {
  /* The plugin's ring flips to white via light-dark(), which reads the page's declared
     color-scheme — this site never declares one, so it would stay black (invisible on the
     dark tile). Set the dark ring explicitly instead of opting the whole site into
     color-scheme, which would also restyle native scrollbars and form controls. */
  return (
    <div className="size-16 rounded-2xl bg-primary dark:bg-[#232323] smooth-shadow-ring-md dark:smooth-ring-white/18" />
  );
}

function SonaDemo() {
  /* Sona's mark, traced from the app's own login screen (public/images/sona/login.webp):
     a squircle with a circular cutout. Inline rather than a file in public/images so the
     fill tracks the theme token — the site's other image assets can't. */
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="size-16 fill-primary">
      <path
        fillRule="evenodd"
        d="M0 30A30 30 0 0 1 30 0h40a30 30 0 0 1 30 30v40a30 30 0 0 1-30 30H30A30 30 0 0 1 0 70V30Zm50-15a35 35 0 1 0 0 70 35 35 0 0 0 0-70Z"
      />
    </svg>
  );
}

const TOOLS: { name: string; href: string; demo: ComponentType }[] = [
  { name: "Dither", href: "https://dither.floriankiem.com", demo: DitherDemo },
  {
    name: "Gradient Border",
    href: "https://gradient-border.floriankiem.com",
    demo: GradientBorderDemo,
  },
  {
    name: "Launch Video",
    href: "https://www.launchvideo.dev",
    demo: LaunchVideoDemo,
  },
  { name: "Shadow", href: "https://shadow.floriankiem.com", demo: ShadowDemo },
  { name: "Sona", href: "https://sona.wtf", demo: SonaDemo },
];

export const Route = createFileRoute("/tools")({
  head: () => ({
    meta: [
      { title: "Tools ‹ Florian Kiem" },
      {
        name: "description",
        content: "Small web tools built by Florian Kiem.",
      },
      { property: "og:title", content: "Tools" },
      {
        property: "og:description",
        content: "Small web tools built by Florian Kiem.",
      },
      { property: "og:image", content: absoluteUrl("/api/og?title=Tools") },
      { name: "twitter:title", content: "Tools" },
      {
        name: "twitter:description",
        content: "Small web tools built by Florian Kiem.",
      },
      { name: "twitter:image", content: absoluteUrl("/api/og?title=Tools") },
    ],
    links: [canonicalLink("/tools")],
  }),
  component: ToolsPage,
});

function ToolsPage() {
  return (
    <div className="grid grid-cols-9 gap-x-6">
      <div className="col-start-1 col-span-9 md:col-start-3 md:col-span-5">
        <h1 className="mb-6 text-base fw-medium leading-snug text-primary">Tools</h1>
        <ul className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((tool) => (
            <li key={tool.name}>
              <a
                href={tool.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col gap-2.5"
              >
                <div className="flex aspect-[16/10] items-center justify-center bg-image-card transition-colors duration-200 group-hover:bg-[#efefef] dark:group-hover:bg-[#161616]">
                  <tool.demo />
                </div>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-tertiary transition-colors group-hover:text-secondary">
                  {tool.name}
                  <IconArrowUpRight className="size-3.5 -translate-x-0.5 translate-y-0.5 opacity-0 blur-[2px] transition duration-150 group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100 group-hover:blur-none" />
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
