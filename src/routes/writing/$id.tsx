import { H1 } from "@/components/design-system/heading";
import { useMdxContent } from "@/components/shared/mdx-content";
import { Link } from "@/components/ui/link";
import { fetchNewestRunDate } from "@/features/writing/lib/newest-run-date";
import { runsQueryOptions } from "@/features/writing/lib/runs";
import { getContent, isWritingEntry, type WritingEntry } from "@/lib/mdx";
import { queryClient } from "@/lib/query-client";
import { absoluteUrl, canonicalLink } from "@/lib/site";
import { writingPostStructuredData } from "@/lib/structured-data";
import { Await, createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { IconArrowUndoUp } from "central-icons/IconArrowUndoUp";
import dayjs from "dayjs";
import { Suspense } from "react";

// Isomorphic base64 so the loader can build the OG icon on the client (no round-trip)
// while producing identical markup on the server. Buffer on SSR, TextEncoder in the browser.
function encodeBase64(str: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(str, "utf-8").toString("base64");
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

// Plain (non-server) function: getContent reads from a bundled eager glob and the icon
// helpers are pure string ops, so this runs on the client too. Wrapping it in
// createServerFn would force an RPC round-trip on every navigation into a post — the
// reason detail pages felt slow to open.
function getWritingItem(slug: string) {
  const items = getContent("writing");
  const itemRaw = items.find((i) => i.slug === slug);

  if (!itemRaw) {
    throw notFound();
  }

  if (!isWritingEntry(itemRaw)) {
    throw new Error(`Item ${slug} is missing required fields`);
  }

  const item: WritingEntry = itemRaw;

  const collaborators =
    typeof item.collaborators === "string"
      ? item.collaborators.split(",").map((c: string) => c.trim())
      : item.collaborators || [];

  return {
    slug: item.slug,
    title: item.title,
    description: item.description,
    type: item.type,
    // Live posts (e.g. runs) carry no frontmatter date — their date streams in via newestRunDate.
    date: typeof item.date === "string" ? item.date : "",
    collaborators,
  };
}

// Pre-render the mark so the OG card shows the same icon as the grid. The icon renderer
// (post-icon + icon-svg, ~100 KB with its path data) is imported dynamically inside the
// loader instead of at module top level: the loader lives in this route's eager,
// non-code-split module, so a static import would drag that graph into every route's
// initial bundle — including the homepage. This way it loads only when a post is opened.
async function buildPostIcon(slug: string): Promise<string> {
  const [{ resolvePostIcon }, { toStandaloneSvg }] = await Promise.all([
    import("@/features/writing/lib/post-icon"),
    import("@/features/writing/lib/icon-svg"),
  ]);
  return encodeBase64(toStandaloneSvg(resolvePostIcon(slug), 200));
}

// Server-only Firebase read. Kept separate and deferred so navigation never blocks on it —
// only the live "runs" post needs it, and its date streams in after the page renders.
const getNewestRunDate = createServerFn().handler(() => fetchNewestRunDate());

export const Route = createFileRoute("/writing/$id")({
  loader: async ({ params }) => {
    const item = getWritingItem(params.id);
    // The router preloads this route on link hover (defaultPreload: "intent"), so starting the
    // feed's request here means the live post usually mounts with its runs already cached.
    // Not awaited: navigation must never wait on it. Client only: the feed fetches a relative
    // URL, which has no origin on the server, and its SSR output is the skeleton either way.
    if (item.type === "live" && typeof window !== "undefined") {
      void queryClient.prefetchQuery(runsQueryOptions);
    }
    return {
      ...item,
      icon: await buildPostIcon(item.slug),
      newestRunDate: item.type === "live" ? getNewestRunDate() : null,
    };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const ogImage = absoluteUrl(
      `/api/og?writing=1&title=${encodeURIComponent(loaderData.title)}` +
        `&icon=${encodeURIComponent(loaderData.icon)}`,
    );
    return {
      meta: [
        { title: `${loaderData.title} ‹ Florian Kiem` },
        { name: "description", content: loaderData.description },
        { property: "og:title", content: loaderData.title },
        { property: "og:description", content: loaderData.description },
        { property: "og:image", content: ogImage },
        // Overrides the root's og:type=website (deepest match wins). Only dated posts
        // claim to be articles; the live post has no publish time to declare.
        ...(loaderData.date
          ? [
              { property: "og:type", content: "article" },
              { property: "article:published_time", content: loaderData.date },
              { property: "article:author", content: "Florian Kiem" },
            ]
          : []),
        { name: "twitter:title", content: loaderData.title },
        { name: "twitter:description", content: loaderData.description },
        { name: "twitter:image", content: ogImage },
      ],
      links: [canonicalLink(`/writing/${loaderData.slug}`)],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(writingPostStructuredData(loaderData, ogImage)),
        },
      ],
    };
  },
  component: WritingDetailPage,
});

function formatLongDate(date: string) {
  const parsed = dayjs(date);
  return date && parsed.isValid() ? parsed.format("MMMM D, YYYY") : "";
}

function HeaderDate({
  type,
  date,
  newestRunDate,
}: {
  type: string;
  date: string;
  newestRunDate: Promise<string | null> | null;
}) {
  if (type !== "live" || !newestRunDate) {
    const formatted = formatLongDate(date);
    if (!formatted) return null;
    return <p className="mt-1.5 text-sm text-tertiary">{formatted}</p>;
  }

  // Live "runs" date comes from Firebase via a deferred promise; render once it streams in.
  return (
    <Suspense fallback={null}>
      <Await promise={newestRunDate}>
        {(runDate) => {
          const formatted = formatLongDate(runDate ?? date);
          if (!formatted) return null;
          return <p className="mt-1.5 text-sm text-tertiary">{`Last update: ${formatted}`}</p>;
        }}
      </Await>
    </Suspense>
  );
}

function WritingDetailPage() {
  const item = Route.useLoaderData();
  const content = useMdxContent(
    "writing",
    item.slug,
    // Prose <h1> is hidden (the header above is the title). Media (div/figure) spans the full content
    // width on every breakpoint; text is capped/centered via max-w from md up. On mobile everything
    // is full-width so text aligns flush with the header (the root layout's px-6 is the only inset).
    // <footer> (the footnotes) is excluded too: its rule spans the media width and it insets
    // its own notes to the text rail.
    "w-full [&>h1]:hidden [&>h1+*]:mt-0 md:[&>*:not(h1)]:mx-auto md:[&>:not(div):not(figure):not(footer):not(h1)]:max-w-[460px]",
  );

  if (!content) {
    return <div>Content not found</div>;
  }

  return (
    <div className="w-full">
      {/* Mirror the /writing index grid so the article column lines up with it. The root layout
          already supplies the mobile side padding (px-6), so no extra px here. pt-9 from md up
          cancels the -mt-2/-mt-7 pull-up below; without it the title and the back button slide
          up underneath the nav row. */}
      <div className="-mt-[7px] pt-2.5 md:-mt-2 md:grid md:grid-cols-9 md:gap-x-6 md:pt-9">
        <aside className="hidden md:col-span-2 md:col-start-1 md:-mt-7 md:block">
          <div className="md:sticky md:top-9">
            <Link
              href="/writing"
              aria-label="Go back"
              className="inline-flex size-6.5 items-center justify-center rounded-sm bg-interactive-secondary text-primary transition-colors hover:bg-interactive-secondary-hover"
            >
              <IconArrowUndoUp className="size-4" />
            </Link>
          </div>
        </aside>
        <div className="md:col-span-5 md:col-start-3">
          <div className="mb-6 md:hidden">
            <Link
              href="/writing"
              aria-label="Go back"
              className="inline-flex size-7.5 shrink-0 items-center justify-center rounded-sm bg-interactive-secondary text-primary transition-colors hover:bg-interactive-secondary-hover"
            >
              <IconArrowUndoUp className="size-4" />
            </Link>
          </div>
          <header className="mb-8 md:-mt-7 md:mb-10">
            <H1 className="text-sm">{item.title}</H1>
            <HeaderDate type={item.type} date={item.date} newestRunDate={item.newestRunDate} />
          </header>
          <div className="pb-16 md:pb-24">{content}</div>
        </div>
      </div>
    </div>
  );
}
