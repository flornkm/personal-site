import {
  HR_STOPS,
  LINE_RAMP,
  NEUTRAL,
  ROUTE_PADDING,
  TEMP_STOPS,
  fitRoute,
  parsePolyline,
  rampColor,
  seriesColors,
  toRgb,
  type Insets,
  type Metric,
  type RoutePath,
} from "@/features/writing/lib/runs";
import { Body3 } from "@/components/design-system/body";
import { cn } from "@/lib/utils";
import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import { arc } from "motion";
import { motion, useInView, useReducedMotion } from "motion/react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
  type SVGProps,
} from "react";

const DRAW_DURATION = 2.8;

// Endpoint markers are custom marks in the writing icons' artwork language
// (src/features/writing/lib/icon-svg.ts): an accent-filled square plate with the ink
// outline and an ink glyph inside — literals because they're illustration, not theme
// chrome, same exception as the icons. The opaque plate is also the background that keeps
// the mark legible when it sits on top of route lines. Drawn in px units centered on
// (0,0); the parent <g> counter-scales and offsets them beside the route point.
const INK = "#171717";
const PLATE = 16;
// Gap between the route point and the plate's near edge.
const MARKER_OFFSET = PLATE / 2 + 6;

// The ink glyph reads on every ramp color, but on the currentColor fallback plate
// (text-primary, used when a run has no data for the metric) it would vanish — flip the
// glyph to the card background there instead.
function glyphColor(fill: string): string {
  return fill === NEUTRAL ? "var(--bg-secondary)" : INK;
}

function MarkerPlate({ fill }: { fill: string }) {
  return (
    <rect
      x={-PLATE / 2}
      y={-PLATE / 2}
      width={PLATE}
      height={PLATE}
      fill={fill}
      stroke={INK}
      strokeWidth={1.4}
      strokeLinejoin="miter"
    />
  );
}

function StartMarker({ fill }: { fill: string }) {
  return (
    <>
      <MarkerPlate fill={fill} />
      {/* Play triangle, nudged right so it sits optically centered. */}
      <path d="M-1.9 -3.4 L3.5 0 L-1.9 3.4 Z" fill={glyphColor(fill)} stroke="none" />
    </>
  );
}

// Wraps an endpoint glyph in the site's Base UI tooltip, anchored to the SVG marker group. Going
// through Base UI (rather than a hand-drawn SVG label) gives us the shared hover delay, a popup
// portaled to the body so it's never clipped by the route box and always on top, and collision-
// aware placement that flips/shifts near the edges. `direction` is the unit vector the marker sits
// out along from its route point, MARKER_OFFSET px away. The transparent hit rect enlarges
// the target; stroke="none" keeps it from inheriting the svg's currentColor stroke as a border.
function EndpointMarker({
  label,
  direction,
  children,
}: {
  label: string;
  direction: [number, number];
  children: ReactNode;
}) {
  const hit = PLATE / 2 + 3;
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger
        render={(triggerProps) => {
          const props = triggerProps as SVGProps<SVGGElement> & { ref?: Ref<SVGGElement> };
          return (
            <g
              {...props}
              transform={`translate(${direction[0] * MARKER_OFFSET} ${direction[1] * MARKER_OFFSET})`}
              className={cn("cursor-default", props.className)}
            >
              <rect
                x={-hit}
                y={-hit}
                width={hit * 2}
                height={hit * 2}
                fill="transparent"
                stroke="none"
                style={{ pointerEvents: "all" }}
              />
              {children}
            </g>
          );
        }}
      />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner sideOffset={8}>
          <BaseTooltip.Popup
            className={cn(
              "z-50 font-medium bg-surface-inverted text-inverted px-2 py-1 rounded-lg",
              "origin-[var(--transform-origin)]",
              "transition-all duration-50 ease-out",
              "data-[starting-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:translate-y-1",
              "data-[ending-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:translate-y-1",
            )}
          >
            <Body3 className="text-inverted whitespace-nowrap">{label}</Body3>
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}

function FinishMarker({ fill }: { fill: string }) {
  const glyph = glyphColor(fill);
  return (
    <>
      <MarkerPlate fill={fill} />
      {/* Flag: filled banner on a stroked pole. */}
      <path d="M-2.5 -4 H3.5 V0.5 H-2.5 Z" fill={glyph} stroke="none" />
      <path d="M-2.5 -4 V4.5" fill="none" stroke={glyph} strokeWidth={1.4} strokeLinecap="round" />
    </>
  );
}

// Tiny burst off the finish flag when the draw lands: a few soft round dots in shades of
// the finish plate's color, no outlines. Deterministic (no randomness) so every replay pops
// identically; angles fan upward, distances/sizes/shades vary just enough to feel loose.
const CONFETTI = [
  { angle: -150, dist: 19, r: 1.4, shade: 0.35 },
  { angle: -122, dist: 26, r: 1.1, shade: -0.2 },
  { angle: -104, dist: 21, r: 1.5, shade: 0.15 },
  { angle: -88, dist: 28, r: 1.1, shade: 0.5 },
  { angle: -72, dist: 23, r: 1.4, shade: 0 },
  { angle: -54, dist: 27, r: 1.1, shade: 0.3 },
  { angle: -32, dist: 20, r: 1.5, shade: -0.15 },
];

// Mix an `rgb(...)` color toward white (positive) or black (negative). Returns the color
// untouched when it can't be parsed — the currentColor fallback plate lands here, giving a
// uniform text-primary burst.
function shadeColor(color: string, amount: number): string {
  const channels = color.match(/\d+/g);
  if (!channels || channels.length < 3) return color;
  const mix = (c: number) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  return `rgb(${mix(+channels[0])} ${mix(+channels[1])} ${mix(+channels[2])})`;
}

function FinishConfetti({ color }: { color: string }) {
  // One arc per particle, created once per mount — the returned path carries per-element
  // continuity state, so sharing a single instance across particles would tangle them.
  const paths = useMemo(() => CONFETTI.map(() => arc({ strength: 0.35 })), []);
  return (
    <>
      {CONFETTI.map((particle, i) => {
        const rad = (particle.angle * Math.PI) / 180;
        return (
          <motion.circle
            key={i}
            r={particle.r}
            fill={shadeColor(color, particle.shade)}
            stroke="none"
            initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
            animate={{
              x: Math.cos(rad) * particle.dist,
              y: Math.sin(rad) * particle.dist,
              scale: 0.5,
              opacity: 0,
            }}
            transition={{
              duration: 0.7,
              delay: i * 0.02,
              ease: "easeOut",
              path: paths[i],
              opacity: { duration: 0.7, ease: "easeIn" },
            }}
          />
        );
      })}
    </>
  );
}

// Room each mark claims around its own route point, in screen px. Everything drawn on top of the
// line — plates, glyphs, confetti, tip dot — is counter-scaled to a constant pixel size, so the
// space it needs has to be reserved in pixels too. Reserving it in viewBox units instead (the
// original ROUTE_PADDING) silently under-reserves as the column narrows: at a 350px-wide box the
// scale is ~3px per unit, so 6 units is only ~19px against a plate that reaches 23px, and every
// endpoint sitting on the bounding box edge — which is most of them — got clipped in half.
const PLATE_HALF = PLATE / 2 + 1; // half the plate plus the outer half of its 1.4 stroke
// Slack for the marks that ride the line itself: the tip dot (8px square, centered) and the stroke.
const LINE_SLACK = 5;

// Extra bottom slack when a caller parks chrome (the metric switch, the replay button, the legend)
// along the bottom of the box: the chrome's own height plus the plate reach, so a route point that
// lands on the bottom edge of the fit — and the endpoint mark hanging off it — still clears the
// controls instead of running underneath them.
function bottomSlack(chrome: number): number {
  return chrome > 0 ? LINE_SLACK + chrome + PLATE_HALF : LINE_SLACK;
}

// How far the burst travels from its origin at the finish plate's top edge, taken from the table
// so retuning a particle can't quietly reintroduce clipping. The arc bow and the fade-out mean the
// last pixel or two never really reads, hence no extra allowance for the curve.
const CONFETTI_SPREAD = CONFETTI.reduce(
  (spread, particle) => {
    const rad = (particle.angle * Math.PI) / 180;
    const x = Math.cos(rad) * particle.dist;
    const y = Math.sin(rad) * particle.dist;
    return {
      left: Math.max(spread.left, particle.r - x),
      right: Math.max(spread.right, x + particle.r),
      up: Math.max(spread.up, particle.r - y),
    };
  },
  { left: 0, right: 0, up: 0 },
);

type Vec = [number, number];

// Unit direction an endpoint plate hangs in: straight on past the finish, straight back before the
// start, i.e. into space the line never covers. Measured over the last couple of units rather
// than one segment, so GPS jitter at the very end can't swing it. Always-right (the old rule)
// parked the flag on top of the line whenever a run finished heading left or round a bend.
function markerDirection(points: Vec[], fromEnd: boolean, fallback: Vec): Vec {
  const n = points.length;
  if (n < 2) return fallback;
  const origin = fromEnd ? points[n - 1] : points[0];
  for (let i = 1; i < n; i++) {
    const [x, y] = fromEnd ? points[n - 1 - i] : points[i];
    const dx = origin[0] - x;
    const dy = origin[1] - y;
    const length = Math.hypot(dx, dy);
    if (length >= 2) return [dx / length, dy / length];
  }
  return fallback;
}

// Room a plate `MARKER_OFFSET` px out along `dir` claims around its route point, plus any extra
// reach above it (the finish burst).
function plateInsets([ux, uy]: Vec, extra: { up: number; left: number; right: number }): Insets {
  const cx = ux * MARKER_OFFSET;
  const cy = uy * MARKER_OFFSET;
  return {
    left: Math.max(0, PLATE_HALF - cx, extra.left - cx),
    right: Math.max(0, PLATE_HALF + cx, extra.right + cx),
    top: Math.max(0, PLATE_HALF - cy, PLATE / 2 + extra.up - cy),
    bottom: Math.max(0, PLATE_HALF + cy),
  };
}

const NO_EXTRA = { up: 0, left: 0, right: 0 };

// The box + animated route line, shared by the /writing/runs feed and the /runs-post view.
// Overlays (metric switch, legend) come in as absolutely-positioned children so each caller
// composes its own chrome around the identical drawing.
export function RouteCanvas({
  path,
  metric,
  temperature,
  temperatures,
  averageHeartRate,
  heartRates,
  replayToken = 0,
  bottomChrome = 0,
  className,
  children,
}: {
  path: RoutePath;
  metric: Metric;
  temperature: number | null;
  temperatures: number[] | null;
  averageHeartRate: number | null;
  heartRates: number[] | null;
  /** Increment to restart the draw animation from zero. */
  replayToken?: number;
  /** Height in px of the overlay chrome the caller pins along the bottom of the box; the fit keeps
   * the route above it. */
  bottomChrome?: number;
  className?: string;
  children?: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const groupRef = useRef<SVGGElement>(null);
  const dotRef = useRef<SVGRectElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.35 });
  const geom = useMemo(() => parsePolyline(path.d), [path]);
  // Flips when the draw finishes; reveals the end marker in the same instant the tip dot hides.
  const [done, setDone] = useState(false);

  // One color per segment from the metric's absolute scale; runs without a per-point series
  // fall back to a uniform color from the average.
  const segmentColors = useMemo(() => {
    const segmentCount = geom.points.length - 1;
    const series = metric === "temperature" ? temperatures : heartRates;
    if (series && series.length) {
      return seriesColors(metric, series.slice(0, segmentCount));
    }
    const average = metric === "temperature" ? temperature : averageHeartRate;
    const stops = metric === "temperature" ? TEMP_STOPS : HR_STOPS;
    const uniform = average != null ? rampColor(stops, average) : NEUTRAL;
    return Array.from({ length: segmentCount }, () => uniform);
  }, [geom, metric, temperature, temperatures, averageHeartRate, heartRates]);

  // The drawing is laid out from the viewport's pixel size: it decides both the viewBox (which has
  // to reserve px-sized room for the endpoint marks) and the user→screen scale that the stroke and
  // the marks counter-scale by so they render at a constant px size. Measured off the <svg> itself,
  // whose size comes from the container — never from the viewBox — so this can't feed back on
  // itself. getBoundingClientRect is post-transform, so an ancestor scale is folded in for free.
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const measure = () => {
      const rect = svg.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setBox((prev) =>
          prev && prev.w === rect.width && prev.h === rect.height
            ? prev
            : { w: rect.width, h: rect.height },
        );
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  // Before the first measurement (and if ResizeObserver is missing entirely) fall back to the
  // uniform viewBox-unit padding — same drawing as before, just without the guarantee.
  const startDir = useMemo(() => markerDirection(geom.points, false, [-1, 0]), [geom]);
  const endDir = useMemo(() => markerDirection(geom.points, true, [1, 0]), [geom]);

  const fit = useMemo(() => {
    const start = geom.points[0];
    const end = geom.points[geom.points.length - 1];
    if (box && start && end) {
      return fitRoute(
        path,
        box.w,
        box.h,
        [
          { at: start, insets: plateInsets(startDir, NO_EXTRA) },
          { at: end, insets: plateInsets(endDir, CONFETTI_SPREAD) },
        ],
        {
          left: LINE_SLACK,
          right: LINE_SLACK,
          top: LINE_SLACK,
          bottom: bottomSlack(bottomChrome),
        },
      );
    }
    const origin = -ROUTE_PADDING;
    return {
      scale: 5,
      viewBox: `${origin} ${origin} ${path.w + ROUTE_PADDING * 2} ${path.h + ROUTE_PADDING * 2}`,
    };
  }, [box, path, geom, bottomChrome, startDir, endDir]);
  const { scale, viewBox } = fit;

  // Draw by growing each segment's own `d` on a plain requestAnimationFrame loop. Only geometry
  // (`d`) changes per frame, which renders identically everywhere — unlike stroke-dash / pathLength
  // / mask / offset-path, which all misbehave on iOS Safari. Segments (vs one path) let each stretch
  // carry its own color for the gradient.
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const { points, cum, total } = geom;

    const render = (p: number) => {
      const target = p * total;
      let tip = points[0];
      for (let i = 0; i < points.length - 1; i++) {
        const seg = group.children[i] as SVGPathElement | undefined;
        const a = points[i];
        const b = points[i + 1];
        if (target >= cum[i + 1]) {
          tip = b;
          seg?.setAttribute("d", `M${a[0]} ${a[1]}L${b[0]} ${b[1]}`);
        } else if (target <= cum[i]) {
          seg?.setAttribute("d", "");
        } else {
          const t = (target - cum[i]) / (cum[i + 1] - cum[i] || 1);
          const x = a[0] + (b[0] - a[0]) * t;
          const y = a[1] + (b[1] - a[1]) * t;
          tip = [x, y];
          seg?.setAttribute("d", `M${a[0]} ${a[1]}L${x} ${y}`);
        }
      }
      const dot = dotRef.current;
      if (dot && tip) {
        dot.setAttribute("transform", `translate(${tip[0]} ${tip[1]})`);
      }
    };

    // The dot only exists while the tip is moving — visibility flips imperatively (React never
    // touches the attribute after mount) so it cuts out the instant the draw lands, no fade.
    const setDotVisible = (visible: boolean) => {
      dotRef.current?.setAttribute("visibility", visible ? "visible" : "hidden");
    };

    render(0);
    setDotVisible(false);
    if (reduceMotion) {
      render(1);
      setDone(true);
      return;
    }
    setDone(false);
    if (!inView) return;

    let frame = 0;
    let startTime = 0;
    const tick = (now: number) => {
      if (!startTime) startTime = now;
      const p = Math.min(1, (now - startTime) / (DRAW_DURATION * 1000));
      render(p);
      if (p < 1) {
        setDotVisible(true);
        frame = requestAnimationFrame(tick);
      } else {
        setDotVisible(false);
        setDone(true);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, reduceMotion, geom, replayToken]);

  const startPoint = geom.points[0];
  const endPoint = geom.points[geom.points.length - 1];
  // Plates sample the line's own gradient at its ends, so they track the metric switch.
  const startColor = segmentColors[0] ?? NEUTRAL;
  const endColor = segmentColors[segmentColors.length - 1] ?? NEUTRAL;
  return (
    <div ref={ref} className={cn("relative", className)}>
      <svg
        ref={svgRef}
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-full w-full text-primary"
        aria-hidden="true"
      >
        {/* Each segment's `d` is set imperatively by the draw loop, so it isn't passed here (React
            would clobber it); only the per-segment color + stroke width flow through props. */}
        <g ref={groupRef}>
          {segmentColors.map((color, i) => (
            <path key={i} stroke={color} strokeWidth={1.5 / scale} />
          ))}
        </g>
        {startPoint && (
          <g transform={`translate(${startPoint[0]} ${startPoint[1]}) scale(${1 / scale})`}>
            <EndpointMarker label="Start" direction={startDir}>
              <StartMarker fill={startColor} />
            </EndpointMarker>
          </g>
        )}
        {endPoint && done && (
          <g transform={`translate(${endPoint[0]} ${endPoint[1]}) scale(${1 / scale})`}>
            <EndpointMarker label="Finish" direction={endDir}>
              <FinishMarker fill={endColor} />
            </EndpointMarker>
            {!reduceMotion && (
              // Burst origin: the top edge of the finish plate.
              <g
                transform={`translate(${endDir[0] * MARKER_OFFSET} ${endDir[1] * MARKER_OFFSET - PLATE / 2})`}
              >
                <FinishConfetti color={endColor} />
              </g>
            )}
          </g>
        )}
        {/* Tip square riding the draw, centered on the origin so the render loop can place it
            with a single translate. Transform and visibility are owned by the imperative loop;
            the props only seed the start point and the hidden initial state. fill-primary is
            ink-black in light mode but tracks the theme so it stays visible on the dark bg. */}
        {startPoint && (
          <rect
            ref={dotRef}
            visibility="hidden"
            transform={`translate(${startPoint[0]} ${startPoint[1]})`}
            x={-4 / scale}
            y={-4 / scale}
            width={8 / scale}
            height={8 / scale}
            stroke="none"
            className="fill-primary"
          />
        )}
      </svg>
      {children}
    </div>
  );
}

// Legend for the line colors, cool to warm.
export function ColorLegend({ metric, className }: { metric: Metric; className?: string }) {
  const [low, high] = metric === "temperature" ? ["Cooler", "Warmer"] : ["Easy", "Hard"];
  const gradient = `linear-gradient(to right, ${LINE_RAMP.map(
    (stop) => `${toRgb(stop.rgb)} ${stop.at * 100}%`,
  ).join(", ")})`;
  return (
    <div
      aria-hidden
      className={cn(
        "flex items-center gap-2 font-serif text-xs font-normal italic leading-none text-tertiary",
        className,
      )}
    >
      <span>{low}</span>
      <span className="h-1.5 w-14" style={{ background: gradient }} />
      <span>{high}</span>
    </div>
  );
}
