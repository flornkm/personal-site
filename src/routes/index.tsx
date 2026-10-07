import { Image } from "@/components/shared/image";
import { SmartVideo } from "@/components/shared/smart-video";
import { Link } from "@/components/ui/link";
import { PROJECTS, type Project } from "@/features/work/projects";
import { useActiveSection } from "@/hooks/use-active-section";
import { useMediaQuery } from "@/hooks/use-media-query";
import { absoluteUrl, canonicalLink } from "@/lib/site";
import { thumbhashToDataURL } from "@/lib/thumbhash";
import { cn } from "@/lib/utils";
import { videoManifest } from "@/videoMap.gen";
import { createFileRoute } from "@tanstack/react-router";
import { IconArrowUpRight } from "central-icons/IconArrowUpRight";
import { useEffect, useMemo, useRef, useState } from "react";

const isVideo = (src: string) => /\.(webm|mp4)$/i.test(src);

const MORE_LINKS = [
  { name: "Colophon", href: "/colophon" },
  { name: "Experiments", href: "/experiments" },
  { name: "Tools", href: "/tools" },
];

const projectId = (project: Project) => `project-${project.name.toLowerCase()}`;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Work ‹ Florian Kiem" },
      {
        name: "description",
        content: "Selected design and engineering work by Florian Kiem.",
      },
      { property: "og:title", content: "Work" },
      {
        property: "og:description",
        content: "Selected design and engineering work by Florian Kiem.",
      },
      { property: "og:image", content: absoluteUrl("/api/og?title=Work") },
      { name: "twitter:title", content: "Work" },
      {
        name: "twitter:description",
        content: "Selected design and engineering work by Florian Kiem.",
      },
      { name: "twitter:image", content: absoluteUrl("/api/og?title=Work") },
    ],
    links: [canonicalLink("/")],
  }),
  component: IndexPage,
});

function WideImage({ src, alt, priority }: { src: string; alt: string; priority?: boolean }) {
  return (
    <div className="bg-image-card p-4 md:p-12">
      <Image
        src={src}
        alt={alt}
        objectFit="contain"
        priority={priority}
        draggable={false}
        sizes="(min-width: 768px) 55vw, 92vw"
        className="h-auto w-full rounded-sm outline -outline-offset-1 outline-black/5 select-none dark:outline-white/15"
      />
    </div>
  );
}

function WorkVideo({ src, alt }: { src: string; alt: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [ready, setReady] = useState(false);
  const entry = videoManifest[src];
  const placeholder = useMemo(() => thumbhashToDataURL(entry?.thumbhash), [entry?.thumbhash]);

  // Codec fallback: Chrome/Firefox decode the webm, Safari/iOS need the mp4. The
  // manifest lists every file under public/videos, so a sibling's presence there
  // tells us which sources actually exist before we advertise them.
  const webmPath = src.replace(/\.mp4$/i, ".webm");
  const mp4Path = src.replace(/\.webm$/i, ".mp4");
  const webm = webmPath in videoManifest ? webmPath : undefined;
  const mp4 = mp4Path in videoManifest ? mp4Path : undefined;

  // Start fetching once the clip is within a viewport of being visible, so it has
  // buffered by the time it scrolls in. Muted autoplay videos otherwise only begin
  // loading on reaching the viewport and visibly pop in late.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setActive(true);
          observer.disconnect();
        }
      },
      { rootMargin: "100% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="bg-image-card p-4 md:p-12">
      {/* The ring lives on an ::after overlay so it paints above the video, and the
          overflow clip lives on an inner layer so the ring itself is never clipped —
          clipping it shaves the corner arc's outer anti-aliasing, which reads as a
          cut-off ring. Unclipped, it renders identically to the images' outline. */}
      <div
        className="relative w-full rounded-sm after:pointer-events-none after:absolute after:inset-0 after:rounded-sm after:outline after:-outline-offset-1 after:outline-black/5 dark:after:outline-white/15"
        style={entry ? { aspectRatio: `${entry.width} / ${entry.height}` } : undefined}
      >
        <div className="absolute inset-0 overflow-hidden rounded-sm">
          {placeholder && (
            <img
              src={placeholder}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover"
              style={{
                filter: "blur(20px)",
                opacity: ready ? 0 : 1,
                transition: "opacity 400ms ease-out",
              }}
            />
          )}
          {active && (
            <SmartVideo
              webm={webm}
              mp4={mp4}
              preload="auto"
              aria-label={alt}
              controlsList="nodownload"
              disablePictureInPicture
              onContextMenu={(e) => e.preventDefault()}
              className={cn(
                // rounded-sm on the video itself: Safari doesn't reliably clip video
                // frames to an ancestor's overflow-hidden radius.
                "absolute inset-0 h-full w-full rounded-sm transition-opacity duration-300 ease-out",
                ready ? "opacity-100" : "opacity-0",
              )}
              onCanPlay={() => setReady(true)}
              onLoadedData={() => setReady(true)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function MobileRow({
  images,
  alt,
  priority,
}: {
  images: string[];
  alt: string;
  priority?: boolean;
}) {
  return (
    <div className="bg-image-card p-2 py-4 md:p-10 md:py-12">
      <div className="flex gap-3">
        {images.map((src) => (
          <div key={src} className="min-w-0 flex-1 px-2 @container">
            <Image
              src={src}
              alt={alt}
              objectFit="contain"
              priority={priority}
              draggable={false}
              sizes="(min-width: 768px) 25vw, 30vw"
              className="h-auto w-full rounded-[16cqi] outline -outline-offset-1 outline-black/5 select-none dark:outline-white/15"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function IndexPage() {
  const withMedia = PROJECTS.filter((project) => project.media && project.media.length > 0).sort(
    (a, b) => (a.mediaOrder ?? Number.MAX_SAFE_INTEGER) - (b.mediaOrder ?? Number.MAX_SAFE_INTEGER),
  );
  const active = useActiveSection(withMedia.map(projectId));
  // The sidebar is only sticky from md up, so scroll-based highlighting only makes
  // sense there. On mobile every item stays highlighted.
  const isDesktop = useMediaQuery("(min-width: 768px)");

  return (
    <div className="md:grid md:grid-cols-9 md:gap-x-6">
      <aside className="mb-16 md:col-span-2 md:mb-0 md:sticky md:top-4 md:z-20 md:flex md:h-[calc(100dvh-2rem)] md:flex-col">
        <h1 className="mb-12 max-w-[15rem] text-base fw-medium leading-snug text-primary md:shrink-0">
          Designs and codes software products. Invests in a few.
        </h1>
        {/* The visual page is deliberately media-only; this gives screen readers and
            non-JS crawlers the same story in text. */}
        <p className="sr-only">
          I am Florian Kiem, a design engineer building software products in the intersection of
          design and code. This page shows selected work: interface design, design systems, motion,
          and front-end engineering for companies like Rogo, Flow Engineering, Sona, Superpower,
          Delphi, Kalshi, Snaptrude, Morphic, Dash0, and Opral. Each project below is presented
          through screenshots and short clips. Read more about me on the about page, browse notes
          and essays on the writing page, or get in touch via the contact page.
        </p>
        <div className="md:-ml-6 md:min-h-0 md:flex-1 md:overflow-y-auto md:pl-6 md:scroll-mask">
          <h2 className="mb-4 text-sm fw-medium text-primary">Selected work</h2>
          <ul className="flex flex-col items-start gap-1.5">
            {PROJECTS.map((project) => {
              const isActive =
                !isDesktop || (!!project.media?.length && active === projectId(project));
              return (
                <li key={project.name}>
                  <a
                    href={project.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "group inline-flex items-center gap-1 text-sm font-medium transition-colors",
                      isActive ? "text-primary" : "text-tertiary hover:text-secondary",
                    )}
                  >
                    {project.name}
                    <IconArrowUpRight className="size-3.5 -translate-x-0.5 translate-y-0.5 opacity-0 blur-[2px] transition duration-150 group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100 group-hover:blur-none" />
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
        {/* Desktop shows these in the sidebar; on mobile they move into the footer's "More" column instead. */}
        {/* flex-wrap: on narrow desktops this row is wider than its 2-column
            track, and the indent footer sits pulled up right beside it — an
            overflowing "Tools" would land on the footer's links. */}
        <div className="mt-12 hidden items-center gap-x-4 gap-y-2 md:mt-0 md:flex md:shrink-0 md:flex-wrap md:pt-12">
          {MORE_LINKS.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              className="text-sm font-medium text-tertiary transition-colors duration-50 hover:text-secondary hit-area-6"
            >
              {link.name}
            </Link>
          ))}
        </div>
      </aside>

      {/* Casual save protection: no context menu on any work image or video. Assets stay
          publicly served — this only blocks the easy right-click path, like aliciagilca.com. */}
      <div
        className="flex flex-col gap-1 md:col-start-3 md:col-span-5"
        onContextMenu={(e) => e.preventDefault()}
      >
        {withMedia.map((project, sectionIndex) => (
          <section
            key={project.name}
            id={projectId(project)}
            className="flex scroll-mt-24 flex-col gap-1"
          >
            <h2 className="sr-only">{project.name}</h2>
            {project.description && <p className="sr-only">{project.description}</p>}
            {project.media?.map((block, index) => {
              // The first media block of the first project is the LCP element: load it
              // eagerly at high priority instead of lazily, so it isn't queued behind
              // hydration and the below-the-fold clips.
              const priority = sectionIndex === 0 && index === 0;
              return Array.isArray(block) ? (
                <MobileRow key={index} images={block} alt={project.name} priority={priority} />
              ) : isVideo(block) ? (
                <WorkVideo key={block} src={block} alt={project.name} />
              ) : (
                <WideImage key={block} src={block} alt={project.name} priority={priority} />
              );
            })}
          </section>
        ))}
        {/* Extends the column so the sticky sidebar settles into the footer's Pages row. */}
        <div aria-hidden className="hidden md:block md:h-48" />
      </div>
    </div>
  );
}
