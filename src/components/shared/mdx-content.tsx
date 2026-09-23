import { proseVariants } from "@/lib/prose-variants";
import { cn } from "@/lib/utils";
import { MDXProvider } from "@mdx-js/react";
import { ComponentProps, ComponentType, ReactNode, useMemo, useState } from "react";
import { thumbhashToDataURL } from "@/lib/thumbhash";
import { videoManifest } from "@/videoMap.gen";
import { CodeBlock } from "@/components/shared/code-block";
import { Link } from "@/components/ui/link";
import { RunsFeed } from "@/features/writing/components/runs-feed";
import { ModelViewer } from "../3d/model-viewer";
import { Comparison } from "./comparison";
import { FigureImage } from "./figure-image";
import { FootnoteRefs } from "./footnote-ref";
import { Image } from "./image";
import { SmartVideo } from "./smart-video";

// Slug must match the IDs the table of contents links to.
function generateHeadingId(children: ReactNode): string {
  const text = extractTextFromChildren(children);
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function extractTextFromChildren(children: ReactNode): string {
  if (typeof children === "string") {
    return children;
  }
  if (typeof children === "number") {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map(extractTextFromChildren).join("");
  }
  if (children && typeof children === "object" && "props" in children) {
    return extractTextFromChildren(
      (children as { props: { children?: ReactNode } }).props.children,
    );
  }
  return "";
}

function H1({ children, ...props }: { children?: ReactNode }) {
  const id = generateHeadingId(children);
  return (
    <h1 id={id} {...props}>
      {children}
    </h1>
  );
}

function H2({ children, ...props }: { children?: ReactNode }) {
  const id = generateHeadingId(children);
  return (
    <h2 id={id} {...props}>
      {children}
    </h2>
  );
}

function H3({ children, ...props }: { children?: ReactNode }) {
  const id = generateHeadingId(children);
  return (
    <h3 id={id} {...props}>
      {children}
    </h3>
  );
}

function H4({ children, ...props }: { children?: ReactNode }) {
  const id = generateHeadingId(children);
  return (
    <h4 id={id} {...props}>
      {children}
    </h4>
  );
}

function H5({ children, ...props }: { children?: ReactNode }) {
  const id = generateHeadingId(children);
  return (
    <h5 id={id} {...props}>
      {children}
    </h5>
  );
}

function H6({ children, ...props }: { children?: ReactNode }) {
  const id = generateHeadingId(children);
  return (
    <h6 id={id} {...props}>
      {children}
    </h6>
  );
}

export function Video({
  src,
  webm,
  mp4,
  className,
  autoPlay = true,
  muted = true,
  loop = true,
  playsInline = true,
  controls,
  poster,
}: {
  src?: string;
  webm?: string;
  mp4?: string;
  className?: string;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  playsInline?: boolean;
  controls?: boolean;
  poster?: string;
}) {
  const [ready, setReady] = useState(false);
  const lookupKey = webm ?? mp4 ?? src;
  const entry = lookupKey ? videoManifest[lookupKey] : undefined;
  const placeholder = useMemo(() => thumbhashToDataURL(entry?.thumbhash), [entry?.thumbhash]);

  return (
    <div className="not-prose my-8">
      <div className="rounded-sm bg-secondary p-4 md:p-12">
        <div
          className="relative overflow-hidden w-full rounded-sm outline -outline-offset-1 outline-black/5 dark:outline-white/15"
          style={entry ? { aspectRatio: `${entry.width} / ${entry.height}` } : undefined}
          data-ready={ready ? "true" : "false"}
        >
          {placeholder && (
            <img
              src={placeholder}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 h-full w-full object-cover scale-110"
              style={{
                filter: "blur(20px)",
                opacity: ready ? 0 : 1,
                transition: "opacity 400ms ease-out",
              }}
            />
          )}
          <SmartVideo
            src={src}
            webm={webm}
            mp4={mp4}
            className={cn(
              entry
                ? "absolute inset-0 h-full w-full transition-opacity duration-300 ease-out"
                : "w-full transition-opacity duration-300 ease-out",
              "rounded-sm outline -outline-offset-1 outline-black/5 dark:outline-white/15",
              entry && !ready ? "opacity-0" : "opacity-100",
              className,
            )}
            autoPlay={autoPlay}
            muted={muted}
            loop={loop}
            playsInline={playsInline}
            controls={controls}
            poster={poster}
            onCanPlay={() => setReady(true)}
            onLoadedData={() => setReady(true)}
          />
        </div>
      </div>
    </div>
  );
}

export function Model({
  src,
  height = 400,
  className,
  autoRotate = true,
  enableZoom = true,
  enablePan = true,
  metalType = "titanium",
}: {
  src: string;
  height?: number;
  className?: string;
  autoRotate?: boolean;
  enableZoom?: boolean;
  enablePan?: boolean;
  metalType?: "steel" | "aluminum" | "copper" | "gold" | "chrome" | "titanium";
}) {
  return (
    <div className="my-8">
      <ModelViewer
        src={src}
        height={height}
        className={cn("w-full", className)}
        autoRotate={autoRotate}
        enableZoom={enableZoom}
        enablePan={enablePan}
        metalType={metalType}
      />
    </div>
  );
}

function Img({ src, alt, className }: { src?: string; alt?: string; className?: string }) {
  return <FigureImage src={src ?? ""} alt={alt ?? ""} className={className} />;
}

// Markdown links behave like the colophon's: external ones open in a new tab,
// internal ones navigate through the router.
function Anchor({ href, ...props }: ComponentProps<"a">) {
  const isExternal = !!href && /^(https?:|mailto:|tel:)/.test(href);
  return <Link href={href} target={isExternal ? "_blank" : undefined} {...props} />;
}

export function MobileImages({ images }: { images: { src: string; alt: string }[] }) {
  return (
    <div className="not-prose my-8 max-lg:-mx-4">
      <div className="flex gap-3 bg-secondary p-2 py-4 md:py-12 md:p-10">
        {images.map((img) => (
          <div key={img.src} className="flex-1 min-w-0 px-2 @container">
            <Image
              src={img.src}
              alt={img.alt}
              objectFit="contain"
              className="w-full h-auto rounded-[16cqi] outline -outline-offset-1 outline-black/5 dark:outline-white/15"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** One footnote line: `text` names the source, the optional link is appended to the same line. */
export type Footnote = { text: string; href?: string; label?: string };

function FootnoteSource({ href, label }: { href?: string; label?: string }) {
  if (!href) return null;
  return (
    <>
      {" "}
      <a href={href} target="_blank" rel="noreferrer">
        {label ?? href}
      </a>
    </>
  );
}

// Footnotes are passed as data rather than markup: MDX parses multi-line children as flow
// content, which wraps a wrapped <a> in its own paragraph and drops it onto a new line.
export function Footnotes({ items }: { items: Footnote[] }) {
  return (
    // Figure captions look their line up in here by matching the <sup> number.
    <footer data-footnotes className="not-prose mt-16">
      {/* The rule spans a figure's grey stage, so it matches the media rather than the text:
          the 720px figure cap the articles use, full width below that. */}
      <div className="mx-auto w-full max-w-[720px] border-t border-primary" />
      <div
        className={cn(
          "mt-5 space-y-1.5 md:mx-auto md:max-w-[460px]",
          "text-[11px] leading-relaxed text-tertiary",
          "[&_sup]:mr-1 [&_sup]:text-[9px]",
          // Mirrors prose-a (see prose-variants.ts) minus the text color, which stays footnote-tertiary.
          "[&_a]:fw-link [&_a]:transition-all [&_a]:duration-200 [&_a]:underline [&_a]:decoration-tertiary/40 [&_a]:hover:decoration-tertiary/70 [&_a]:underline-offset-[3px] [&_a]:active:no-underline",
        )}
      >
        {items.map((item, index) => (
          <p key={item.text}>
            <sup>{index + 1}</sup>
            {item.text}
            <FootnoteSource href={item.href} label={item.label} />
          </p>
        ))}
      </div>
    </footer>
  );
}

export const mdxComponents = {
  h1: H1,
  h2: H2,
  h3: H3,
  h4: H4,
  h5: H5,
  h6: H6,
  img: Img,
  a: Anchor,
  pre: CodeBlock,
  Image,
  FigureImage,
  Video,
  Model,
  ModelViewer,
  SmartVideo,
  MobileImages,
  Comparison,
  Footnotes,
  FootnoteRefs,
  Runs: RunsFeed,
};

// import.meta.glob must be at module level.
const workModules = import.meta.glob("/src/work/*/article.mdx", { eager: true }) as Record<
  string,
  { default: ComponentType }
>;

const writingModules = import.meta.glob("/src/writing/*/article.mdx", { eager: true }) as Record<
  string,
  { default: ComponentType }
>;

const moduleMap = {
  work: workModules,
  writing: writingModules,
} as const;

export function useMdxContent(category: "work" | "writing", slug: string, className?: string) {
  const modulePath = `/src/${category}/${slug}/article.mdx`;
  const MDXContent = moduleMap[category][modulePath]?.default;

  if (!MDXContent) return null;

  return (
    <article className={cn("w-full", proseVariants({ variant: "default" }), className)}>
      <MDXProvider components={mdxComponents}>
        <MDXContent />
      </MDXProvider>
    </article>
  );
}
