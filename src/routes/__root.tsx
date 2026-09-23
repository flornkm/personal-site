import "@/styles/globals.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { HeadContent, Outlet, Scripts, createRootRoute, useLocation } from "@tanstack/react-router";
import { Analytics } from "@vercel/analytics/react";
import { MotionConfig } from "motion/react";

import Footer from "@/components/shared/footer";
import Navigation from "@/components/shared/navigation";
import { TooltipProvider } from "@/components/ui/tooltip";

import Button, { buttonVariants } from "@/components/ui/button";
import { Link } from "@/components/ui/link";
import ScissorsCursor, { CutText } from "@/components/shared/scissors-cursor";
import { queryClient } from "@/lib/query-client";
import { initSelectionDots } from "@/lib/selection-dots";
import { absoluteUrl } from "@/lib/site";
import { structuredDataJson } from "@/lib/structured-data";

if (typeof window !== "undefined") {
  console.info(
    `%cFlorian Kiem %cCurious how this is built? floriankiem.com/colophon`,
    "color: #fff; font-size: 20px; font-weight: medium; margin-top: 10px; margin-bottom: 10px;",
    "color: #a3a3a3; font-size: 12px; margin-top: 10px; margin-bottom: 10px;",
  );
  initSelectionDots();
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      { title: "Florian Kiem" },
      {
        name: "description",
        content:
          "The personal site of Florian Kiem - design and code, bridging the gap between creativity and logic in this portfolio.",
      },
      { property: "og:title", content: "Florian Kiem" },
      {
        property: "og:description",
        content:
          "The personal site of Florian Kiem - design and code, bridging the gap between creativity and logic in this portfolio.",
      },
      { property: "og:image", content: absoluteUrl("/api/og?title=Design%2C%20Code") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Florian Kiem" },
      {
        name: "twitter:description",
        content:
          "The personal site of Florian Kiem - design and code, bridging the gap between creativity and logic in this portfolio.",
      },
      { name: "twitter:image", content: absoluteUrl("/api/og?title=Design%2C%20Code") },
    ],
    links: [
      { rel: "preconnect", href: "https://cdn.floriankiem.com", crossOrigin: "anonymous" },
      {
        // crossOrigin is required for the font preload to be reused.
        rel: "preload",
        href: "https://cdn.floriankiem.com/fonts/haas-recast/v1/HaasRecastVF.woff2",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
      // Chrome/Edge ignore `media` here and take the first icon, so the light
      // SVG self-adapts via an embedded prefers-color-scheme query and stays
      // correct there; Firefox honors `media` and picks the dark SVG.
      {
        rel: "icon",
        href: "/images/icons/favicon.svg",
        type: "image/svg+xml",
        media: "(prefers-color-scheme: light)",
      },
      {
        rel: "icon",
        href: "/images/icons/favicon-dark.svg",
        type: "image/svg+xml",
        media: "(prefers-color-scheme: dark)",
      },
      // .ico fallbacks for browsers without SVG favicon support.
      {
        rel: "icon",
        href: "/images/icons/favicon.ico",
        type: "image/x-icon",
        media: "(prefers-color-scheme: light)",
      },
      {
        rel: "icon",
        href: "/images/icons/favicon-dark.ico",
        type: "image/x-icon",
        media: "(prefers-color-scheme: dark)",
      },
    ],
    scripts: [
      // schema.org Person + WebSite identity for AI agents and search engines.
      { type: "application/ld+json", children: structuredDataJson() },
    ],
  }),
  component: RootLayout,
  notFoundComponent: NotFoundPage,
  errorComponent: ErrorPage,
});

function RootLayout() {
  const { pathname } = useLocation();
  const isHome = pathname === "/";
  // Home already shows Colophon/Experiments in its sidebar, so its footer drops the "More" column.
  const footerVariant = isHome ? "indent" : "default";

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.prepend(document.createComment(${JSON.stringify(
              `
       ________              _
      / ____/ /___  _____   (_)___ _____
     / /_  / / __ \\/ ___/  / / __ \`/ __ \\
    / __/ / / /_/ / /     / / /_/ / / / /
   /_/   /_/\\____/_/     /_/\\__,_/_/ /_/

   Designed & built by Florian Kiem. floriankiem.com
`,
            )}));`,
          }}
        />
        <QueryClientProvider client={queryClient}>
          {/* reducedMotion="user" kills transform/layout animations site-wide (nav pill,
              experiment tile morph) for prefers-reduced-motion; opacity/blur reveals are
              gated per component via useReducedMotion. */}
          <MotionConfig reducedMotion="user">
            <TooltipProvider>
              <Navigation />
              <main
                className={`mx-auto w-full max-w-[2560px] min-h-screen px-6 pt-4 ${isHome ? "pb-0" : "pb-16"}`}
              >
                <Outlet />
              </main>
              <Footer variant={footerVariant} />
            </TooltipProvider>
          </MotionConfig>
        </QueryClientProvider>
        <Analytics />
        <Scripts />
      </body>
    </html>
  );
}

// Sitemap and llms.txt are recovery routes for agents that land on a dead URL.
const errorLinks = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "Sitemap", href: "/sitemap" },
  { label: "llms.txt", href: "/llms.txt" },
];

function NotFoundPage() {
  return (
    <div className="w-full h-[calc(100vh-4rem)] md:h-[calc(100vh-10rem)] flex flex-col items-start justify-center max-w-sm mx-auto px-8">
      <ScissorsCursor>
        <h1 className="text-sm font-medium mb-0.5">
          <CutText text="Looks like this page came loose." />
        </h1>
        <p className="text-sm text-tertiary mb-5">
          <CutText text="These are still attached:" />
        </p>
        <ul className="space-x-2 flex flex-wrap">
          {errorLinks.map((link, index) => (
            <li className="text-sm" key={link.href}>
              <Link
                href={link.href}
                className={buttonVariants({
                  variant: index === 0 ? "primary" : "secondary",
                  size: "md",
                })}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </ScissorsCursor>
    </div>
  );
}

function ErrorPage() {
  return (
    <div className="w-full h-[calc(100vh-4rem)] md:h-[calc(100vh-10rem)] flex flex-col items-start justify-center max-w-sm mx-auto px-8">
      <ScissorsCursor>
        <h1 className="text-sm font-medium mb-0.5">
          <CutText text="500 Error" />
        </h1>
        <p className="text-sm text-tertiary mb-5">
          <CutText text="Internal server error. Please try again later." />
        </p>
        <Button variant="primary" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </ScissorsCursor>
    </div>
  );
}
