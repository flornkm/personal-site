import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import {
  Carousel,
  CarouselContent,
  CarouselDots,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "./carousel";
import { CARD, Stage } from "./stage";
import { TinyObject } from "./tiny-object";
import type { TinyShape } from "./tiny-gl";

/* Ordinary rows from ordinary apps. The only thing out of the ordinary is the object where an
   icon would be. */

const GHOST =
  "h-7 shrink-0 cursor-pointer rounded-[8px] px-2.5 text-[13px] font-medium text-secondary outline-none transition-colors hover:bg-surface-tertiary hover:text-primary focus-visible:ring-2 focus-visible:ring-default";

function Row({
  shape,
  title,
  detail,
  trailing,
}: {
  shape: TinyShape;
  title: string;
  detail: string;
  trailing: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <TinyObject shape={shape} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] leading-[18px] font-medium text-primary">{title}</p>
        <p className="truncate text-[13px] leading-[18px] text-tertiary">{detail}</p>
      </div>
      {trailing}
    </div>
  );
}

function PasskeyDetail() {
  return (
    <div className={cn(CARD, "max-w-[340px]")}>
      <Row
        shape="key"
        title="MacBook Pro"
        detail="Passkey · added Oct 2"
        trailing={
          <button type="button" className={GHOST}>
            Manage
          </button>
        }
      />
    </div>
  );
}

function AttachmentDetail() {
  return (
    <div className={cn(CARD, "max-w-[340px]")}>
      <div className="flex gap-2 text-[13px] leading-[18px]">
        <span className="w-12 text-tertiary">To</span>
        <span className="text-primary">Maya Lindqvist</span>
      </div>
      <div className="mt-1.5 flex gap-2 text-[13px] leading-[18px]">
        <span className="w-12 text-tertiary">Subject</span>
        <span className="text-primary">Lease renewal</span>
      </div>
      <div className="mt-3 rounded-[12px] bg-surface-tertiary py-1 pr-1.5 pl-1">
        <Row
          shape="clip"
          title="Lease renewal.pdf"
          detail="240 KB"
          trailing={
            <button type="button" className={GHOST}>
              Remove
            </button>
          }
        />
      </div>
    </div>
  );
}

function WeatherDetail() {
  return (
    <div className={cn(CARD, "max-w-[340px]")}>
      <Row
        shape="drop"
        title="Lyon"
        detail="Rain starting in 20 min"
        trailing={
          <span className="pr-1 text-[22px] leading-none font-light text-primary tabular-nums">
            12°
          </span>
        }
      />
    </div>
  );
}

function InstantDetail() {
  return (
    <div className={cn(CARD, "max-w-[340px]")}>
      <Row
        shape="bolt"
        title="Instant transfers"
        detail="Included with Silverline Pro"
        trailing={
          <button type="button" className={GHOST}>
            Upgrade
          </button>
        }
      />
    </div>
  );
}

function SimpleDetail({
  shape,
  title,
  detail,
  action,
}: {
  shape: TinyShape;
  title: string;
  detail: string;
  action: string;
}) {
  return (
    <div className={cn(CARD, "max-w-[340px]")}>
      <Row
        shape={shape}
        title={title}
        detail={detail}
        trailing={
          <button type="button" className={GHOST}>
            {action}
          </button>
        }
      />
    </div>
  );
}

const LockDetail = () => (
  <SimpleDetail shape="lock" title="Maya Lindqvist" detail="End-to-end encrypted" action="Verify" />
);
const PinDetail = () => (
  <SimpleDetail shape="pin" title="Arriving in 4 min" detail="14 Rue des Lilas" action="Track" />
);
const StarDetail = () => (
  <SimpleDetail
    shape="star"
    title="2,450 points"
    detail="Silverline Rewards · Gold"
    action="Redeem"
  />
);
const CupDetail = () => (
  <SimpleDetail
    shape="cup"
    title="Flat white is ready"
    detail="Corner Coffee · at the counter"
    action="Got it"
  />
);

const SLIDES = [
  { id: "passkey", Slide: PasskeyDetail },
  { id: "attachment", Slide: AttachmentDetail },
  { id: "weather", Slide: WeatherDetail },
  { id: "instant", Slide: InstantDetail },
  { id: "lock", Slide: LockDetail },
  { id: "pin", Slide: PinDetail },
  { id: "star", Slide: StarDetail },
  { id: "cup", Slide: CupDetail },
];

export function TinyDetailsCarousel() {
  return (
    <Stage>
      <Carousel opts={{ loop: true }} className="w-full max-w-[620px]">
        {/* Neighbours peek in at the sides and fade out into the page. */}
        <CarouselContent viewportClassName="[mask-image:linear-gradient(to_right,transparent,black_22%,black_78%,transparent)]">
          {SLIDES.map(({ id, Slide }) => (
            <CarouselItem key={id} className="basis-[68%]">
              {/* Room around the card so its shadow is not cut by the viewport. */}
              <div className="flex h-[190px] items-center justify-center px-6">
                <Slide />
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <div className="mt-2 flex items-center justify-center gap-4">
          <CarouselPrevious />
          <CarouselDots />
          <CarouselNext />
        </div>
      </Carousel>
    </Stage>
  );
}
