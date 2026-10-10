import { cn } from "@/lib/utils";
import { IconChevronLeft } from "central-icons/IconChevronLeft";
import { IconChevronRight } from "central-icons/IconChevronRight";
import useEmblaCarousel, { type UseEmblaCarouselType } from "embla-carousel-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ComponentProps,
  type KeyboardEvent,
} from "react";

/* shadcn's carousel, on Embla, with this site's tokens and icons. */

type CarouselApi = UseEmblaCarouselType[1];
type CarouselOptions = Parameters<typeof useEmblaCarousel>[0];

type CarouselContextValue = {
  carouselRef: UseEmblaCarouselType[0];
  api: CarouselApi;
  scrollPrev: () => void;
  scrollNext: () => void;
  scrollTo: (index: number) => void;
  canScrollPrev: boolean;
  canScrollNext: boolean;
  selected: number;
  count: number;
};

const CarouselContext = createContext<CarouselContextValue | null>(null);

function useCarousel() {
  const context = useContext(CarouselContext);
  if (!context) throw new Error("useCarousel must be used within a <Carousel />");
  return context;
}

export function Carousel({
  opts,
  className,
  children,
  ...props
}: ComponentProps<"div"> & { opts?: CarouselOptions }) {
  const [carouselRef, api] = useEmblaCarousel({ align: "center", ...opts });
  const [state, setState] = useState({ prev: false, next: false, selected: 0, count: 0 });

  const onSelect = useCallback((embla: CarouselApi) => {
    if (!embla) return;
    setState({
      prev: embla.canScrollPrev(),
      next: embla.canScrollNext(),
      selected: embla.selectedScrollSnap(),
      count: embla.scrollSnapList().length,
    });
  }, []);

  // Embla is an external system; mirror its selection into React.
  useEffect(() => {
    if (!api) return;
    onSelect(api);
    api.on("reInit", onSelect);
    api.on("select", onSelect);
    return () => {
      api.off("reInit", onSelect);
      api.off("select", onSelect);
    };
  }, [api, onSelect]);

  const scrollPrev = useCallback(() => api?.scrollPrev(), [api]);
  const scrollNext = useCallback(() => api?.scrollNext(), [api]);
  const scrollTo = useCallback((index: number) => api?.scrollTo(index), [api]);

  function onKeyDownCapture(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      scrollPrev();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      scrollNext();
    }
  }

  return (
    <CarouselContext.Provider
      value={{
        carouselRef,
        api,
        scrollPrev,
        scrollNext,
        scrollTo,
        canScrollPrev: state.prev,
        canScrollNext: state.next,
        selected: state.selected,
        count: state.count,
      }}
    >
      <div
        onKeyDownCapture={onKeyDownCapture}
        role="region"
        aria-roledescription="carousel"
        data-slot="carousel"
        className={cn("relative", className)}
        {...props}
      >
        {children}
      </div>
    </CarouselContext.Provider>
  );
}

export function CarouselContent({
  className,
  viewportClassName,
  ...props
}: ComponentProps<"div"> & { viewportClassName?: string }) {
  const { carouselRef } = useCarousel();
  return (
    <div
      ref={carouselRef}
      className={cn("overflow-hidden", viewportClassName)}
      data-slot="carousel-content"
    >
      <div className={cn("-ml-4 flex", className)} {...props} />
    </div>
  );
}

export function CarouselItem({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      role="group"
      aria-roledescription="slide"
      data-slot="carousel-item"
      className={cn("min-w-0 shrink-0 grow-0 basis-full pl-4", className)}
      {...props}
    />
  );
}

const ARROW =
  "grid size-8 cursor-pointer place-items-center rounded-full bg-surface text-secondary smooth-shadow-ring-sm outline-none transition-[opacity,scale,color] duration-150 hover:text-primary active:scale-[0.94] disabled:pointer-events-none disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-default";

export function CarouselPrevious({ className, ...props }: ComponentProps<"button">) {
  const { scrollPrev, canScrollPrev } = useCarousel();
  return (
    <button
      type="button"
      aria-label="Previous slide"
      data-slot="carousel-previous"
      disabled={!canScrollPrev}
      onClick={scrollPrev}
      className={cn(ARROW, className)}
      {...props}
    >
      <IconChevronLeft className="size-4" />
    </button>
  );
}

export function CarouselNext({ className, ...props }: ComponentProps<"button">) {
  const { scrollNext, canScrollNext } = useCarousel();
  return (
    <button
      type="button"
      aria-label="Next slide"
      data-slot="carousel-next"
      disabled={!canScrollNext}
      onClick={scrollNext}
      className={cn(ARROW, className)}
      {...props}
    >
      <IconChevronRight className="size-4" />
    </button>
  );
}

export function CarouselDots({ className }: { className?: string }) {
  const { count, selected, scrollTo } = useCarousel();
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {Array.from({ length: count }, (_, index) => (
        <button
          key={index}
          type="button"
          aria-label={`Go to slide ${index + 1}`}
          aria-current={index === selected}
          onClick={() => scrollTo(index)}
          className={cn(
            "h-1.5 cursor-pointer rounded-full transition-[width,background-color] duration-200 ease-out outline-none focus-visible:ring-2 focus-visible:ring-default",
            index === selected
              ? "w-4 bg-surface-inverted"
              : "w-1.5 bg-[oklch(0.85_0_0)] hover:bg-[oklch(0.75_0_0)]",
          )}
        />
      ))}
    </div>
  );
}
