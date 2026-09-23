import { Dialog } from "@/components/ui/dialog";
import { imageManifest } from "@/imageMap.gen";
import { cn } from "@/lib/utils";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { AnimatedCaption } from "./animated-caption";
import { FootnoteRefs } from "./footnote-ref";
import { Image } from "./image";

// Where the divider settles when the pointer isn't steering it.
const REST = 50;
const KEY_STEP = 10;

function clamp(value: number) {
  return Math.min(100, Math.max(0, value));
}

interface DiffSurfaceProps {
  before: string;
  after: string;
  beforeLabel: string;
  afterLabel: string;
  aspectRatio: string;
}

function DiffSurface({ before, after, beforeLabel, afterLabel, aspectRatio }: DiffSurfaceProps) {
  const reduceMotion = useReducedMotion();
  const target = useMotionValue(0);
  const spring = useSpring(target, { stiffness: 300, damping: 30 });
  const position = reduceMotion ? target : spring;

  // Both layers are masked at the divider — the cutouts are transparent, so an unclipped
  // base layer would shine through the other side and read as two overlaid products.
  const beforeClip = useTransform(position, (v) => `inset(0 ${100 - v}% 0 0)`);
  const afterClip = useTransform(position, (v) => `inset(0 0 0 ${v}%)`);
  const dividerLeft = useTransform(position, (v) => `${v}%`);
  // Each label hides while its side is swept away, so open (position 0) shows only the after label.
  const beforeLabelOpacity = useTransform(position, [0, 18], [0, 1]);
  const afterLabelOpacity = useTransform(position, [82, 100], [1, 0]);

  const setPosition = (value: number, surface: HTMLElement) => {
    const next = clamp(value);
    target.set(next);
    surface.setAttribute("aria-valuenow", String(Math.round(next)));
  };

  const steerToPointer = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPosition(((e.clientX - rect.left) / rect.width) * 100, e.currentTarget);
  };

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    // Capture so touch/mouse drags keep steering past the surface bounds.
    e.currentTarget.setPointerCapture(e.pointerId);
    steerToPointer(e);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const step = e.key === "ArrowLeft" ? -KEY_STEP : KEY_STEP;
    setPosition(target.get() + step, e.currentTarget);
  };

  // Opens showing only the after image (matching the inline figure), then sweeps to the middle.
  const sweepIn = (node: HTMLDivElement | null) => {
    if (node) setPosition(REST, node);
  };

  const label =
    "pointer-events-none absolute top-3 font-serif text-[11px] font-normal italic text-primary";

  return (
    <div
      ref={sweepIn}
      role="slider"
      aria-label={`Reveal ${beforeLabel.toLowerCase()} versus ${afterLabel.toLowerCase()}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={0}
      tabIndex={0}
      onPointerMove={steerToPointer}
      onPointerDown={handlePointerDown}
      onPointerLeave={() => target.set(REST)}
      onKeyDown={handleKeyDown}
      className={cn(
        "relative w-full cursor-ew-resize touch-none select-none rounded-sm outline-none",
        // iOS Safari ignores draggable/user-select on images; the callout has to be killed
        // explicitly or a drag long-presses into the native "open image" preview.
        "[-webkit-touch-callout:none]",
        "focus-visible:ring-2 focus-visible:ring-default",
      )}
      style={{ aspectRatio }}
    >
      {/* Full-res originals, not <Image>: the renditions cap at 2048px and get upscaled
          at zoom size on retina displays, which reads as pixelation. */}
      <motion.div className="absolute inset-0" style={{ clipPath: afterClip }}>
        <img
          src={after}
          alt=""
          decoding="async"
          draggable={false}
          className="absolute inset-0 h-full w-full select-none object-contain [-webkit-user-drag:none]"
        />
      </motion.div>
      <motion.div className="absolute inset-0" style={{ clipPath: beforeClip }}>
        <img
          src={before}
          alt=""
          decoding="async"
          draggable={false}
          className="absolute inset-0 h-full w-full select-none object-contain [-webkit-user-drag:none]"
        />
      </motion.div>
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 w-px bg-inverted/40"
        style={{ left: dividerLeft }}
      />
      <motion.span className={cn(label, "left-3")} style={{ opacity: beforeLabelOpacity }}>
        {beforeLabel}
      </motion.span>
      <motion.span className={cn(label, "right-3")} style={{ opacity: afterLabelOpacity }}>
        {afterLabel}
      </motion.span>
    </div>
  );
}

interface ComparisonProps {
  before: string;
  after: string;
  alt: string;
  beforeLabel?: string;
  afterLabel?: string;
  /** Footnote numbers for the image sources, e.g. "1, 2" — rendered as a superscript after the caption. */
  sources?: string;
}

export function Comparison({
  before,
  after,
  alt,
  beforeLabel = "Before",
  afterLabel = "After",
  sources,
}: ComparisonProps) {
  const [open, setOpen] = useState(false);

  // Mirrors FigureImage's zoom sizing: capped by width (92vw / 72rem) or, via the manifest
  // aspect ratio, by height (~78vh incl. the card's 5rem padding) — whichever binds first.
  const entry = imageManifest[after];
  const aspect = entry ? entry.width / entry.height : null;
  const aspectRatio = entry ? `${entry.width} / ${entry.height}` : "3 / 2";
  const zoomWidth = aspect
    ? `min(92vw, 72rem, calc(${(78 * aspect).toFixed(1)}vh - ${(5 * aspect).toFixed(1)}rem))`
    : "min(92vw, 72rem)";

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      {/* Cap the panel to the same "proud" width the wider FigureImages use (720px), so on
          large screens the comparison sits a bit wider than the text column without ballooning
          to the full article width. It's centred by the article's lg:mx-auto on figures. */}
      <figure className="not-prose my-8 first:mt-0 last:mb-0 lg:max-w-[720px]">
        {/* Same overhang as FigureImage: 16px proud of the text below lg, a normal block above. */}
        <Dialog.Trigger
          aria-label={alt ? `Compare: ${alt}` : "Compare images"}
          className={cn(
            "block w-full cursor-zoom-in appearance-none text-left outline-none",
            "focus-visible:ring-2 focus-visible:ring-default",
            "max-md:ml-[50%] max-md:w-[calc(100vw-16px)] max-md:-translate-x-1/2",
            "md:max-lg:-mx-4 md:max-lg:w-[calc(100%+2rem)]",
          )}
        >
          <div className="bg-tertiary p-4 transition-opacity duration-200 hover:opacity-90 md:p-12">
            {/* The cutouts carry wide transparent margins, so the frames overlap via negative
                inner margins to pull the products visually together. */}
            <div className="flex items-center">
              <Image
                src={before}
                alt=""
                objectFit="contain"
                sizes="(min-width: 768px) 30vw, 45vw"
                className="-mr-[12%] h-auto w-full min-w-0 flex-1"
              />
              <Image
                src={after}
                alt={alt}
                objectFit="contain"
                sizes="(min-width: 768px) 30vw, 45vw"
                className="-ml-[12%] h-auto w-full min-w-0 flex-1"
              />
            </div>
          </div>
        </Dialog.Trigger>
        {/* Mirrors the body text column: inset via the same margins on mobile (see the prose
            rules in routes/writing/$id.tsx), centred 460px from md up. */}
        {alt && (
          <figcaption className="mt-4 font-serif text-[11px] font-normal italic text-primary lg:mx-auto lg:max-w-[460px]">
            {alt}
            {sources && <FootnoteRefs sources={sources} />}
          </figcaption>
        )}
      </figure>

      <Dialog.Portal>
        <Dialog.Backdrop blur="soft" />
        <Dialog.Popup variant="headless">
          <Dialog.Title className="sr-only">{alt || "Image comparison"}</Dialog.Title>
          <div
            className="w-full rounded-lg bg-surface p-6 smooth-shadow-ring-lg md:p-10 dark:bg-neutral-950"
            style={{ width: zoomWidth }}
          >
            <DiffSurface
              before={before}
              after={after}
              beforeLabel={beforeLabel}
              afterLabel={afterLabel}
              aspectRatio={aspectRatio}
            />
          </div>
          {alt && <AnimatedCaption text={alt} />}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
