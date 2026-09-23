import Skeleton from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/* A day view, the way calendars draw one: hour rows with hairlines, and each event a tinted
   block placed at its start and sized by its length. The grid is the app's shell; the header's
   date and the events are the data. `ready` says which of the two has arrived. Every part keeps
   its box in both states, so nothing moves when data lands. */

const FIRST_HOUR = 9;
const HOURS = 5;
const HOUR_PX = 24;

// Content artwork: one hue per event, tinted for the block and darkened for its text, with a
// dark-mode pair through light-dark() since the site's theme is a colour-scheme preference.
const EVENTS = [
  { start: 9.5, end: 10.5, title: "Team standup", hue: 255 },
  { start: 11, end: 12.5, title: "Design review", hue: 300 },
  { start: 13, end: 14, title: "Lunch with Jonas", hue: 70 },
];

const tint = (hue: number) => `light-dark(oklch(0.95 0.035 ${hue}), oklch(0.3 0.06 ${hue}))`;
const bar = (hue: number) => `oklch(0.68 0.17 ${hue})`;
const ink = (hue: number) => `light-dark(oklch(0.42 0.12 ${hue}), oklch(0.88 0.08 ${hue}))`;

export const CALENDAR_PARTS = 2;

export const CALENDAR_DATE = "Tue 23 Sep";

// `header` off lets a host draw its own title row, for a screen whose chrome carries the title.
export function CalendarPage({
  ready,
  shell = true,
  header = true,
}: {
  ready: boolean[];
  shell?: boolean;
  header?: boolean;
}) {
  return (
    <div className="space-y-2">
      {header && <Header ready={ready[0]} />}
      <div className={cn("relative", !shell && "invisible")} style={{ height: HOURS * HOUR_PX }}>
        {Array.from({ length: HOURS }, (_, index) => (
          <div
            key={index}
            style={{ top: index * HOUR_PX }}
            className="absolute inset-x-0 flex items-start border-t border-primary"
          >
            <span className="-mt-[5px] w-6 bg-surface pr-1 text-[9px] leading-none text-tertiary tabular-nums">
              {FIRST_HOUR + index}
            </span>
          </div>
        ))}
        {EVENTS.map((event) => (
          <Event key={event.title} event={event} ready={ready[1]} />
        ))}
      </div>
    </div>
  );
}

function Header({ ready }: { ready: boolean }) {
  if (!ready) {
    return (
      <div className="flex h-5 items-center">
        <Skeleton className="rounded-full h-2.5 w-12" />
        <Skeleton className="rounded-full ml-auto h-2 w-14" />
      </div>
    );
  }
  return (
    <div className="flex h-5 items-center leading-none">
      <span className="text-[13px] font-medium text-primary">Today</span>
      <span className="ml-auto text-[11px] text-tertiary">{CALENDAR_DATE}</span>
    </div>
  );
}

function Event({ event, ready }: { event: (typeof EVENTS)[number]; ready: boolean }) {
  const top = (event.start - FIRST_HOUR) * HOUR_PX + 1;
  const height = (event.end - event.start) * HOUR_PX - 2;
  if (!ready) {
    // On the surface colour first: the placeholder is translucent, and the hour lines behind
    // it would otherwise show through as stripes across the bone.
    return (
      <div style={{ top, height }} className="absolute right-0 left-7 rounded-[4px] bg-surface">
        <Skeleton className="size-full rounded-[4px]" />
      </div>
    );
  }
  return (
    <div
      style={{ top, height, background: tint(event.hue), color: ink(event.hue) }}
      className="absolute right-0 left-7 overflow-hidden rounded-[4px] pt-1 pl-2.5 text-[10px] leading-none font-medium"
    >
      <span style={{ background: bar(event.hue) }} className="absolute inset-y-0 left-0 w-0.5" />
      {event.title}
    </div>
  );
}
