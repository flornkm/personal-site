import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { type CSSProperties, useState } from "react";
import { AnimatedCaption } from "./animated-caption";
import { FootnoteRefs } from "./footnote-ref";
import { Image } from "./image";

interface FigureImageProps {
  src: string;
  alt: string;
  className?: string;
  /** Caps the figure width (px) so wide UI captures can be sized down; defaults to full column. */
  width?: number;
  /** Footnote numbers for the image source, e.g. "13" — rendered as a superscript after the caption. */
  sources?: string;
  /** Dark-mode variant, swapped in via prefers-color-scheme. For UI screenshots whose own
      background can't retheme (e.g. a captured GitHub graph). */
  darkSrc?: string;
  /** The hairline ring around the image. On by default; turn off for cutouts/screenshots
      on a transparent background, where the ring frames empty space. */
  ring?: boolean;
  /** Drop the grey stage (bg + padding) so the image fills edge to edge. Use for opaque,
      full-bleed screenshots where the padding would read as light bands around the image. */
  bleed?: boolean;
  /** Caps the image (px) and centres it inside the grey stage, so a small mockup sits in a
      full-width panel instead of filling it. Applied as an inline style (not a Tailwind class). */
  imageWidth?: number;
}

export function FigureImage({
  src,
  alt,
  className,
  width,
  sources,
  darkSrc,
  ring = true,
  bleed = false,
  imageWidth,
}: FigureImageProps) {
  const imageStyle = imageWidth ? { maxWidth: imageWidth, marginInline: "auto" } : undefined;
  // SVGs render borderless with just padding; photos keep the framed look.
  const isDiagram = src.toLowerCase().endsWith(".svg");
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <figure
        className={cn("not-prose mx-auto my-8 first:mt-0 last:mb-0", isDiagram && "max-w-[640px]")}
        style={width ? { maxWidth: width } : undefined}
      >
        {/* On mobile the panel breaks out of ancestor padding to line up with the body
            text's 24px side padding (the root layout's px-6); from md up it's a normal block.
            The breakout is clamped to `width` so a capped figure stays capped instead of
            being blown up to the full viewport and centred off-screen. */}
        <Dialog.Trigger
          aria-label={alt ? `Open image: ${alt}` : "Open image"}
          style={{ "--figure-w": width ? `${width}px` : "100vw" } as CSSProperties}
          className={cn(
            "block w-full cursor-zoom-in appearance-none text-left outline-none",
            "focus-visible:ring-2 focus-visible:ring-default",
            "max-md:ml-[50%] max-md:w-[min(calc(100vw-48px),var(--figure-w))] max-md:-translate-x-1/2",
          )}
        >
          <div
            className={cn(
              "transition-opacity duration-200 hover:opacity-90",
              isDiagram ? "p-4 md:p-8" : bleed ? "" : "bg-tertiary p-4 md:p-12",
            )}
          >
            <Image
              src={src}
              alt={alt}
              objectFit="contain"
              style={imageStyle}
              className={cn(
                "h-auto w-full",
                !isDiagram &&
                  ring &&
                  "rounded-sm outline -outline-offset-1 outline-black/5 dark:outline-white/15",
                darkSrc && "dark:hidden",
                className,
              )}
            />
            {darkSrc && (
              <Image
                src={darkSrc}
                alt={alt}
                objectFit="contain"
                className={cn(
                  "hidden h-auto w-full dark:block",
                  !isDiagram &&
                    ring &&
                    "rounded-sm outline -outline-offset-1 outline-black/5 dark:outline-white/15",
                  className,
                )}
              />
            )}
          </div>
        </Dialog.Trigger>
        {/* Mirrors the body text column: inset via the same margins on mobile (see the prose
            rules in routes/writing/$id.tsx), centred 460px from md up. */}
        {alt && (
          <figcaption className="mt-4 font-serif text-[11px] font-normal italic text-primary md:mx-auto md:max-w-[460px]">
            {alt}
            {sources && <FootnoteRefs sources={sources} />}
          </figcaption>
        )}
      </figure>

      <Dialog.Portal>
        <Dialog.Backdrop blur="soft" />
        {/* Clicking anywhere on the zoomed figure dismisses it (the zoom-out cursor
            promises this); base-ui only closes on backdrop/Escape on its own. */}
        <Dialog.Popup variant="headless" className="cursor-zoom-out" onClick={() => setOpen(false)}>
          <Dialog.Title className="sr-only">{alt || "Image"}</Dialog.Title>
          {/* SVGs are vector, so the dialog scales them UP to a fixed zoom width. Rasters
              shrink-wrap to their natural size (capped) so the dialog is never wider than the
              image and never upscales a bitmap past its resolution. */}
          <div
            className={cn(
              "rounded-lg bg-surface p-6 smooth-shadow-ring-lg md:p-10 dark:bg-neutral-950",
              isDiagram ? "w-[min(92vw,60rem)]" : "w-fit max-w-[min(92vw,76rem)]",
            )}
          >
            {/* Plain <img>: the source is already decoded from the inline figure, so no
                thumbhash blur-up is needed. */}
            <picture>
              {darkSrc && <source srcSet={darkSrc} media="(prefers-color-scheme: dark)" />}
              <img
                src={src}
                alt={alt}
                decoding="async"
                // Cap the image height against the dialog's max-h (92vh) minus a fixed
                // allowance for the card padding and the caption beneath it, so the
                // figcaption always stays on screen even for tall portrait images.
                className={cn(
                  "block h-auto max-h-[calc(92vh_-_10rem)] object-contain",
                  isDiagram ? "w-full" : "w-auto max-w-full",
                  !isDiagram && ring && "rounded-sm",
                )}
              />
            </picture>
          </div>
          {alt && <AnimatedCaption text={alt} />}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
