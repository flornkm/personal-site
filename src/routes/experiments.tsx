import { CLAUDE_2010_ASSETS } from "@/features/experiments/components/claude-2010-assets";
import { ExperimentDrawer } from "@/features/experiments/components/experiment-drawer";
import { SLOP_NINJA_ASSETS } from "@/features/experiments/components/slop-ninja/assets";
import { preloadImages } from "@/features/experiments/preload-assets";
import { useMediaQuery } from "@/hooks/use-media-query";
import { absoluteUrl, canonicalLink } from "@/lib/site";
import { cn } from "@/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { IconCrossSmall } from "central-icons/IconCrossSmall";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { type ComponentType, lazy, Suspense, useCallback, useRef, useState } from "react";

// A lazy component that also exposes `preload()` — calling it fires the underlying dynamic
// import so the chunk is fetched ahead of render (on hover/focus/pointer-down), not only once
// the tile mounts it. import() is cached, so the eventual lazy render reuses the same chunk.
type PreloadableComponent = ComponentType & { preload: () => Promise<unknown> };

const lazyDemo = (factory: () => Promise<{ default: ComponentType }>): PreloadableComponent =>
  Object.assign(lazy(factory), { preload: factory });

interface Experiment {
  slug: string;
  title: string;
  tag: string;
  // Transparent posters at public/experiments/<slug>.webp (light) and <slug>-dark.webp
  // (dark). A <picture> media source swaps them by prefers-color-scheme — no JS. Until
  // the files exist the tile falls back to a plain panel.
  poster: string;
  posterDark: string;
  Component: PreloadableComponent;
  // Static images the demo loads on mount, warmed along with its chunk.
  assets: readonly string[];
}

// The centered modal the tile morphs into when opened.
const DIALOG_SIZE = "h-[min(88vh,37.5rem)] w-[min(92vw,50rem)]";

const experiment = (
  slug: string,
  title: string,
  tag: string,
  Component: PreloadableComponent,
  assets: readonly string[] = [],
): Experiment => ({
  slug,
  title,
  tag,
  poster: `/experiments/${slug}.webp`,
  posterDark: `/experiments/${slug}-dark.webp`,
  Component,
  assets,
});

// Each demo is lazy-loaded. validateSearch and the tile grid read this array in the route's
// eager (non-code-split) module, so a static `import { SlopDetector }` here would drag every
// demo's bundle — including the three/drei/hls 3D graph (~950 KB) — into every route's initial
// load, the homepage included. Loading each Component behind import() keeps that code in its own
// chunk, fetched only when its tile is opened, and lets this stay the single source of truth.
const EXPERIMENTS: Experiment[] = [
  experiment(
    "slop-ninja",
    "Slop Ninja",
    "PS2",
    lazyDemo(() =>
      import("@/features/experiments/components/slop-ninja").then((m) => ({
        default: m.SlopNinja,
      })),
    ),
    SLOP_NINJA_ASSETS,
  ),
  experiment(
    "icon-lens",
    "Icon Lens",
    "Refraction",
    lazyDemo(() =>
      import("@/features/experiments/components/icon-lens-demo").then((m) => ({
        default: m.IconLens,
      })),
    ),
  ),
  experiment(
    "liquid-glass",
    "Liquid Glass",
    "Liquid",
    lazyDemo(() =>
      import("@/features/experiments/components/liquid-glass-demo").then((m) => ({
        default: m.LiquidGlass,
      })),
    ),
  ),
  experiment(
    "magnet-mark",
    "Magnet Mark",
    "Magnet",
    lazyDemo(() =>
      import("@/features/experiments/components/magnet-mark-demo").then((m) => ({
        default: m.MagnetMark,
      })),
    ),
  ),
  experiment(
    "claude-2010",
    "Claude 2010",
    "Isometric",
    lazyDemo(() =>
      import("@/features/experiments/components/claude-2010-demo").then((m) => ({
        default: m.Claude2010,
      })),
    ),
    CLAUDE_2010_ASSETS,
  ),
  experiment(
    "claude-mark",
    "Claude Mark",
    "Optics",
    lazyDemo(() =>
      import("@/features/experiments/components/claude-mark-demo").then((m) => ({
        default: m.ClaudeMark,
      })),
    ),
  ),
  experiment(
    "prism-orb",
    "Prism Orb",
    "Glass",
    lazyDemo(() =>
      import("@/features/experiments/components/prism-orb-demo").then((m) => ({
        default: m.PrismOrb,
      })),
    ),
  ),
  experiment(
    "video-tapes",
    "Video Tapes",
    "Aero",
    lazyDemo(() =>
      import("@/features/experiments/components/video-tapes-demo").then((m) => ({
        default: m.VideoTapes,
      })),
    ),
  ),
  experiment(
    "world-cup",
    "World Cup 26",
    "Motion",
    lazyDemo(() =>
      import("@/features/experiments/components/world-cup-tunnel-demo").then((m) => ({
        default: m.WorldCupTunnel,
      })),
    ),
  ),
  experiment(
    "overlap-type",
    "Overlap Type",
    "Type",
    lazyDemo(() =>
      import("@/features/experiments/components/overlap-type-demo").then((m) => ({
        default: m.OverlapType,
      })),
    ),
  ),
  experiment(
    "flo",
    "Flo",
    "Rough",
    lazyDemo(() =>
      import("@/features/experiments/components/flo-demo").then((m) => ({
        default: m.Flo,
      })),
    ),
  ),
  experiment(
    "transit-ticket",
    "Transit Ticket",
    "Print",
    lazyDemo(() =>
      import("@/features/experiments/components/transit-ticket-demo").then((m) => ({
        default: m.TransitTicket,
      })),
    ),
  ),
  experiment(
    "dot-clock",
    "Dot Clock",
    "Physics",
    lazyDemo(() =>
      import("@/features/experiments/components/dot-clock-demo").then((m) => ({
        default: m.DotClock,
      })),
    ),
  ),
  experiment(
    "chrome-horse",
    "Chrome Horse",
    "Chrome",
    lazyDemo(() =>
      import("@/features/experiments/components/chrome-horse-demo").then((m) => ({
        default: m.ChromeHorse,
      })),
    ),
  ),
  experiment(
    "node-map",
    "Node Map",
    "SVG",
    lazyDemo(() =>
      import("@/features/experiments/components/node-map-demo").then((m) => ({
        default: m.NodeMap,
      })),
    ),
  ),
  experiment(
    "digital-garden",
    "Digital Garden",
    "GeoCities",
    lazyDemo(() =>
      import("@/features/experiments/components/digital-garden-demo").then((m) => ({
        default: m.DigitalGarden,
      })),
    ),
  ),
  experiment(
    "machine-plate",
    "Machine Plate",
    "WebGL",
    lazyDemo(() =>
      import("@/features/experiments/components/metal-plate-demo").then((m) => ({
        default: m.MetalPlate,
      })),
    ),
  ),
  experiment(
    "sticker-file",
    "Sticker File",
    "Paper",
    lazyDemo(() =>
      import("@/features/experiments/components/sticker-file-demo").then((m) => ({
        default: m.StickerFile,
      })),
    ),
  ),
  experiment(
    "windows-xp",
    "Windows XP",
    "Nostalgia",
    lazyDemo(() =>
      import("@/features/experiments/components/xp-mascot-demo").then((m) => ({
        default: m.XpMascot,
      })),
    ),
  ),
  experiment(
    "slop-detector",
    "Slop Detector",
    "3D",
    lazyDemo(() =>
      import("@/features/experiments/components/slop-detector").then((m) => ({
        default: m.SlopDetector,
      })),
    ),
  ),
  experiment(
    "frosted-camera",
    "Frosted Camera",
    "Camera",
    lazyDemo(() =>
      import("@/features/experiments/components/frosted-camera-demo").then((m) => ({
        default: m.FrostedCamera,
      })),
    ),
  ),
  experiment(
    "crt-terminal",
    "CRT Terminal",
    "Terminal",
    lazyDemo(() =>
      import("@/features/experiments/components/crt-chat-demo").then((m) => ({
        default: m.CrtChat,
      })),
    ),
  ),
];

const TRANSITION = { duration: 0.45, ease: [0.22, 1, 0.36, 1] } as const;

// Placeholder while no experiment has been opened yet (the drawer stays mounted).
const NoExperiment = () => null;

interface ExperimentsSearch {
  demo?: string;
}

const pageMeta = (title: string, ogTitle: string, description: string, image: string) => [
  { title },
  { name: "description", content: description },
  { property: "og:title", content: ogTitle },
  { property: "og:description", content: description },
  { property: "og:image", content: absoluteUrl(image) },
  { name: "twitter:title", content: ogTitle },
  { name: "twitter:description", content: description },
  { name: "twitter:image", content: absoluteUrl(image) },
];

export const Route = createFileRoute("/experiments")({
  validateSearch: (search: Record<string, unknown>): ExperimentsSearch => {
    const demo = search.demo;
    return typeof demo === "string" && EXPERIMENTS.some((e) => e.slug === demo) ? { demo } : {};
  },
  // A shared deep-link (?demo=<slug>) previews the experiment itself: its title plus a
  // pre-rendered card of the light-mode poster (scripts/build-experiment-og.ts). Only
  // validated slugs get this — every other visit keeps the page's default card.
  head: ({ match }) => {
    const shared = EXPERIMENTS.find((e) => e.slug === match.search.demo);
    return {
      meta: shared
        ? pageMeta(
            `${shared.title} ‹ Florian Kiem`,
            shared.title,
            `${shared.title} — a design and code experiment by Florian Kiem.`,
            `/_og/experiments/${shared.slug}.png`,
          )
        : pageMeta(
            "Experiments ‹ Florian Kiem",
            "Experiments",
            "A page collecting different design and code experiments.",
            "/api/og?title=Experiments",
          ),
      // ?demo= deep links share the same document; the bare page is canonical.
      links: [canonicalLink("/experiments")],
    };
  },
  component: ExperimentsPage,
});

function ExperimentsPage() {
  const { demo } = Route.useSearch();
  const navigate = Route.useNavigate();

  // Dialog state lives in the URL so deep-links and reloads restore it.
  const open = useCallback(
    (slug: string) => navigate({ search: { demo: slug }, resetScroll: false }),
    [navigate],
  );
  const close = useCallback(() => navigate({ search: {}, resetScroll: false }), [navigate]);

  const activeSlug = demo;

  // On mobile the expanded view is a bottom-sheet drawer, not the centered morph.
  const isMobile = useMediaQuery("(max-width: 767px)");
  const activeExperiment = EXPERIMENTS.find((e) => e.slug === activeSlug) ?? null;

  // Keep the last experiment mounted so the drawer can play its close animation
  // after the URL has already cleared.
  const drawerExpRef = useRef<Experiment | null>(null);
  if (activeExperiment) drawerExpRef.current = activeExperiment;
  const drawerExperiment = drawerExpRef.current;

  return (
    <MotionConfig transition={TRANSITION}>
      <div className="md:grid md:grid-cols-9 md:gap-x-6">
        <div className="md:col-span-9">
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
            {EXPERIMENTS.map((item) => (
              <ExperimentTile
                key={item.slug}
                experiment={item}
                isActive={activeSlug === item.slug}
                morph={!isMobile}
                onOpen={() => open(item.slug)}
                onClose={close}
              />
            ))}
          </ul>
        </div>
      </div>

      {/* initial={false}: on fresh load the backdrop is present from frame one and must not fade in. */}
      <AnimatePresence initial={false}>
        {!isMobile && activeSlug && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 z-[100] bg-black/20 backdrop-blur-[2px]"
          />
        )}
      </AnimatePresence>

      {/* Always mounted: if the Root first mounted already-open, Base UI would treat it
          as initially open and skip the enter animation on the first tap. */}
      <ExperimentDrawer
        open={isMobile && activeExperiment !== null}
        title={drawerExperiment?.title ?? ""}
        Component={drawerExperiment?.Component ?? NoExperiment}
        onOpenChange={(next) => {
          if (!next) close();
        }}
      />
    </MotionConfig>
  );
}

interface ExperimentTileProps {
  experiment: Experiment;
  isActive: boolean;
  morph: boolean;
  onOpen: () => void;
  onClose: () => void;
}

function ExperimentTile({ experiment, isActive, morph, onOpen, onClose }: ExperimentTileProps) {
  const { title, poster, posterDark, Component, assets } = experiment;
  const expanded = isActive && morph;
  const warm = () => {
    void Component.preload();
    preloadImages(assets);
  };

  // Hide a missing poster gracefully instead of showing a broken-image glyph.
  const [posterError, setPosterError] = useState(false);

  // The morph back into the grid is a `layout` animation, not an unmount — so the box keeps
  // painting at its old DOM position. Without an elevated z-index for the whole animation it
  // would slide back *under* the neighbouring tiles. Hold the lift until the layout settles.
  const [morphing, setMorphing] = useState(false);
  const elevated = expanded || morphing;

  // The box grows as one solid surface (the sharp poster scaling up); only once the layout
  // has settled do we blur-dissolve the poster into the live component. Swapping mid-morph is
  // what read as a "shift" — two different images crossfading while the box was still moving.
  // Initialise from the mount-time state: a deep-link/reload lands already expanded with no
  // morph to wait on, so reveal the live component straight away instead of stalling on the poster.
  const [revealed, setRevealed] = useState(expanded);
  // Reset the reveal during render (not an effect) whenever the tile closes, so a re-open
  // always starts from the sharp poster instead of a stale reveal from the previous open.
  const [wasExpanded, setWasExpanded] = useState(expanded);
  if (expanded !== wasExpanded) {
    setWasExpanded(expanded);
    if (!expanded) setRevealed(false);
  }

  return (
    // 4:3 cell — matches the poster ratio (so object-cover never crops) and the dialog ratio
    // (so the open morph is a clean uniform scale).
    // Fixed-size placeholder so the grid never reflows while the tile lifts into the expanded view.
    <li className="relative aspect-[4/3]">
      <motion.div
        layout
        layoutDependency={expanded}
        data-experiment-tile={expanded ? "open" : "closed"}
        onLayoutAnimationStart={() => setMorphing(true)}
        onLayoutAnimationComplete={() => {
          setMorphing(false);
          // Hand off to the live component only after the box has fully settled.
          if (expanded) setRevealed(true);
        }}
        style={{ zIndex: elevated ? 110 : undefined }}
        onKeyDown={(e) => {
          if (expanded && e.key === "Escape") onClose();
        }}
        className={cn(
          "group overflow-hidden",
          expanded
            ? // Definite width AND height (not aspect-ratio): inset-0 pins top/bottom, so
              // aspect-ratio would be ignored and the height would stretch to the viewport.
              // has-[[data-menu-open]]: lets the iOS context menu overflow instead of clipping.
              cn(
                "fixed inset-0 m-auto rounded-lg bg-surface dark:bg-neutral-950 has-[[data-menu-open]]:overflow-visible",
                DIALOG_SIZE,
              )
            : "absolute inset-0 bg-surface-secondary",
        )}
      >
        {/* Resting state: a poster preview — no live component, so the grid stays cheap and the
            morph has nothing to resize. Fades out as the tile expands. */}
        <div
          className={cn(
            "absolute inset-0",
            expanded && "pointer-events-none",
            // The blur is applied instantly the moment the tile expands (no transition class on
            // the grow state) so the surface is already out of focus as it lifts and resizes into
            // the center — like a game booting up. Once settled (`revealed`) the focus pulls in:
            // it dissolves into the live component while the blur resolves to sharp. On close it
            // snaps back to a sharp poster (no transition) so that's what scales down with the box.
            !expanded
              ? "opacity-100"
              : revealed
                ? "opacity-0 blur-0 transition-[opacity,filter] duration-[800ms] ease-out"
                : "opacity-100 blur-[12px]",
          )}
        >
          {!posterError && (
            // <picture> lets the browser pick the dark capture by media query, so the
            // grid never needs to read theme state in JS. onError on the <img> still
            // covers a missing light poster (the resting fallback panel).
            <picture>
              <source srcSet={posterDark} media="(prefers-color-scheme: dark)" />
              <img
                src={poster}
                alt=""
                loading="lazy"
                decoding="async"
                onError={() => setPosterError(true)}
                className="absolute inset-0 size-full object-cover transition-opacity duration-200 group-hover:opacity-90"
              />
            </picture>
          )}
        </div>

        {/* Live component mounts only when expanded, laid out at the final dialog size so it
            never resizes during the morph; it fades in over the box scale. No exit animation:
            on close it unmounts instantly and the poster underneath scales down instead. */}
        {expanded && (
          <motion.div
            key="live"
            initial={{ opacity: 0, filter: "blur(12px)" }}
            // Mounts as the box grows (so it's ready) but stays blurred-out until the layout
            // settles. On reveal the opacity comes up fast so the (still very blurry) content is
            // present immediately, then the blur pulls into focus slowly — a "booting up" feel
            // rather than a brief flicker of softness.
            animate={
              revealed ? { opacity: 1, filter: "blur(0px)" } : { opacity: 0, filter: "blur(12px)" }
            }
            transition={{
              opacity: { duration: 0.3, ease: "easeOut" },
              filter: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
            }}
            className="absolute inset-0 flex items-center justify-center"
          >
            {/* Suspense boundary for the lazy demo chunk; the blurred poster underneath
                covers the (near-instant) fetch during the open morph. */}
            <Suspense fallback={null}>
              <Component />
            </Suspense>
          </motion.div>
        )}

        {!expanded && (
          <button
            type="button"
            onClick={onOpen}
            // Warm the demo's chunk and static images on intent (hover / keyboard focus / press
            // start) so they're fetched before the open morph finishes, not once the dialog has
            // fully mounted.
            onPointerEnter={warm}
            onFocus={warm}
            onPointerDown={warm}
            aria-label={`Open ${title}`}
            className="absolute inset-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-default"
          />
        )}

        {/* No exit animation: unmounts instantly on close so it doesn't distort while
            the box scales back into the grid. */}
        {expanded && (
          <motion.button
            type="button"
            onClick={onClose}
            // Pulls focus into the dialog on open so Escape (handled on the container
            // above) is reachable without a global key listener.
            autoFocus
            aria-label="Close"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.15 }}
            className={cn(
              "absolute right-3 top-3 z-10 flex size-6 items-center justify-center rounded-sm",
              "text-neutral-500 dark:text-neutral-400 hover:bg-black/5 dark:hover:bg-white/5",
              "cursor-pointer transition-colors",
              "outline-none focus-visible:ring-2 focus-visible:ring-default",
            )}
          >
            <IconCrossSmall className="size-4" />
          </motion.button>
        )}
      </motion.div>
    </li>
  );
}
