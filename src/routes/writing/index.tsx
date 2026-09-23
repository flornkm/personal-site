import { Body2 } from "@/components/design-system/body";
import { H3 } from "@/components/design-system/heading";
import { Link } from "@/components/ui/link";
import Skeleton from "@/components/ui/skeleton";
import { PostIcon } from "@/features/writing/components/post-icon";
import { fetchNewestRunDate } from "@/features/writing/lib/newest-run-date";
import { getContent } from "@/lib/mdx";
import { absoluteUrl, canonicalLink } from "@/lib/site";
import { writingIndexStructuredData } from "@/lib/structured-data";
import { Await, createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Suspense } from "react";

type WritingListItem = { slug: string; title: string; date: string; type: string };

const DESCRIPTION = "Writing contains thoughts, ideas, and experiences from Florian.";

// Written but not ready to be listed yet. The post stays reachable at its own URL.
const UNLISTED_SLUGS = new Set(["software-that-looks-better-used"]);

// Plain (non-server) function: getContent reads from a bundled eager glob, so it runs on
// the client too. Wrapping it in createServerFn would force an RPC round-trip on every
// client-side navigation — the reason /writing felt slow to open.
function getWritingItems(): WritingListItem[] {
  const list = getContent("writing")
    .filter((item) => !UNLISTED_SLUGS.has(item.slug))
    .map((item) => ({
      slug: item.slug,
      title: String(item.title ?? item.slug),
      type: String(item.type ?? ""),
      date: String(item.date ?? ""),
    }));

  // Newest first. Live posts (e.g. runs) carry no frontmatter date so they sort last,
  // but render in their own "Live" section first regardless of position.
  list.sort((a, b) => b.date.localeCompare(a.date));
  return list;
}

// Server-only Firebase read. Kept separate and deferred so the writing list never
// blocks navigation on it — the run's date streams in after the page renders.
const getNewestRunDate = createServerFn().handler(() => fetchNewestRunDate());

export const Route = createFileRoute("/writing/")({
  loader: () => ({
    items: getWritingItems(),
    newestRunDate: getNewestRunDate(),
  }),
  head: ({ loaderData }) => ({
    meta: [
      { title: "Writing ‹ Florian Kiem" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "Writing" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:image", content: absoluteUrl("/api/og?title=Writing") },
      { name: "twitter:title", content: "Writing" },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: absoluteUrl("/api/og?title=Writing") },
    ],
    links: [canonicalLink("/writing")],
    scripts: loaderData
      ? [
          {
            type: "application/ld+json",
            children: JSON.stringify(writingIndexStructuredData(loaderData.items, DESCRIPTION)),
          },
        ]
      : [],
  }),
  component: WritingPage,
});

function formatDate(date: string | undefined) {
  if (!date) return "";
  if (/^\d{4}$/.test(date)) return date;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getYear(date: string | undefined) {
  if (!date) return "";
  const matches = String(date).match(/\d{4}/g);
  return matches ? String(Math.max(...matches.map(Number))) : "";
}

function groupByYear(items: WritingListItem[]) {
  const groups: { year: string; items: WritingListItem[] }[] = [];
  for (const item of items) {
    const year = getYear(item.date);
    const last = groups[groups.length - 1];
    if (last && last.year === year) {
      last.items.push(item);
    } else {
      groups.push({ year, items: [item] });
    }
  }
  return groups;
}

function PostDateSkeleton() {
  // h-5 matches Body2's text-sm line box so the date resolving in causes no shift.
  return (
    <div className="flex h-5 items-center">
      <Skeleton className="h-3.5 w-24" />
    </div>
  );
}

function PostDate({
  item,
  newestRunDate,
}: {
  item: WritingListItem;
  newestRunDate: Promise<string | null>;
}) {
  if (item.type !== "live") {
    return <Body2 className="text-tertiary">{formatDate(item.date)}</Body2>;
  }

  // Live "runs" date comes from Firebase via a deferred promise; show a skeleton
  // until it streams in.
  return (
    <Suspense fallback={<PostDateSkeleton />}>
      <Await promise={newestRunDate}>
        {(runDate) => <Body2 className="text-tertiary">{formatDate(runDate ?? item.date)}</Body2>}
      </Await>
    </Suspense>
  );
}

function WritingPage() {
  const { items, newestRunDate } = Route.useLoaderData();
  const liveItems = items.filter((item) => item.type === "live");
  const datedItems = items.filter((item) => item.type !== "live");

  // "Live" section first, then the usual year groups.
  const sections = [
    ...(liveItems.length > 0 ? [{ label: "Live", items: liveItems }] : []),
    ...groupByYear(datedItems).map((group) => ({ label: group.year, items: group.items })),
  ];

  return (
    <div className="flex flex-col gap-12">
      {sections.map((section) => (
        <section key={section.label} className="md:grid md:grid-cols-9 md:gap-x-6">
          <div className="flex flex-col gap-3 md:col-start-1 md:col-span-7">
            <H3 className="text-tertiary">{section.label}</H3>
            <div className="border-t border-primary" />
          </div>
          <div className="mt-4 flex flex-col md:col-start-3 md:col-span-5">
            {section.items.map((item) => (
              <Link
                key={item.slug}
                href={`/writing/${item.slug}`}
                className="group/item flex items-center gap-4 py-3"
              >
                <div className="flex size-12 shrink-0 items-center justify-center bg-image-card transition-colors duration-200 group-hover/item:bg-[#e7e7e7] dark:group-hover/item:bg-[#1c1c1c]">
                  <PostIcon slug={item.slug} className="size-6" />
                </div>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <H3>{item.title}</H3>
                  <PostDate item={item} newestRunDate={newestRunDate} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
