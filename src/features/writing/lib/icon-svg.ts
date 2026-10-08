// Shared by the app and the OG function (api/og.ts); keep free of Vite/React/Node APIs so both can import it.

export type PostIcon = {
  inner: string;
  viewBox: string;
};

const OUTLINE = "#171717";
const INK = "#171717";

// Mirrors the `--accent-*` tokens in src/styles/colors.css, duplicated as literals because
// these strings bake into SVG markup where CSS variables aren't available. Keep both lists in sync.
export const PALETTE = [
  "#f2c94c", // yellow
  "#e8643c", // orange
  "#8d9150", // olive
  "#6fae9f", // sage
  "#d98e5a", // clay
  "#b8607a", // rose
  "#7e9cc4", // dusty blue
  "#caa84a", // gold
];

const SHAPE_PATHS: Record<string, string> = {
  triangle: `<path d="M16 4 L27.5 26 L4.5 26 Z" />`,
  square: `<path d="M7 7 H25 V25 H7 Z" />`,
  hexagon: `<path d="M16 4 L26.4 10 V22 L16 28 L5.6 22 V10 Z" />`,
};

// `<shape>:<mark>`, plus the markless flower. Both marks share one bounding box (x 12.5–19.5,
// ~7px tall around the centre) so a check and a cross carry the same optical weight in the shape.
const SHAPE_KEYS = [
  "triangle:cross",
  "square:cross",
  "hexagon:cross",
  "triangle:check",
  "square:check",
  "hexagon:check",
  "flower",
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Reads as "no / removed / not done". */
function cross(cy: number): string {
  const t = (cy - 3.5).toFixed(1);
  const b = (cy + 3.5).toFixed(1);
  return `<path d="M12.5 ${t} L19.5 ${b} M19.5 ${t} L12.5 ${b}" fill="none" stroke="${INK}" stroke-width="1.55" />`;
}

/** Reads as "do this / the recommended way" — the counterpart to the cross, for posts that advise
    rather than warn. Miter join at the vertex, so the corner stays as sharp as the cross's ends. */
function check(cy: number): string {
  const d = `M12.5 ${cy} L15 ${(cy + 2.8).toFixed(1)} L19.5 ${(cy - 3.2).toFixed(1)}`;
  return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="1.55" />`;
}

const MARKS: Record<string, (cy: number) => string> = { cross, check };

function flowerInner(color: string): string {
  const N = 8;
  const R = 9.5;
  const rArc = (R * Math.sin(Math.PI / N)).toFixed(2);
  const pt = (i: number): string => {
    const a = (i / N) * Math.PI * 2;
    return `${(16 + Math.cos(a) * R).toFixed(2)} ${(16 + Math.sin(a) * R).toFixed(2)}`;
  };
  let d = `M ${pt(0)}`;
  for (let i = 1; i <= N; i++) d += ` A ${rArc} ${rArc} 0 0 1 ${pt(i % N)}`;
  d += " Z";
  return `<path d="${d}" fill="${color}" stroke="${OUTLINE}" stroke-width="1.4" />`;
}

/** Deterministic mark derived from the slug, used when no SVG is authored. */
export function fallbackIcon(slug: string): PostIcon {
  const h = hash(slug);
  const color = PALETTE[h % PALETTE.length];
  // `>>>`, not `>>`: hash() returns a full uint32, so a signed shift goes negative for anything
  // above 2^31 and the modulo then indexes off the front of the array.
  const key = SHAPE_KEYS[(h >>> 4) % SHAPE_KEYS.length];

  if (key === "flower") {
    return { inner: flowerInner(color), viewBox: "0 0 32 32" };
  }

  const [shape, mark] = key.split(":");
  // The triangle's visual center sits a little lower than its geometric one.
  const cy = shape === "triangle" ? 18 : 16;
  const inner = `<g fill="${color}" stroke="${OUTLINE}" stroke-width="1.4" stroke-linejoin="miter">${SHAPE_PATHS[shape]}${MARKS[mark](cy)}</g>`;
  return { inner, viewBox: "0 0 32 32" };
}

export function parseSvg(raw: string): PostIcon {
  const clean = raw.replace(/<\?xml[\s\S]*?\?>/gi, "");
  const attrs = clean.match(/<svg([^>]*)>/i)?.[1] ?? "";
  const viewBox = attrs.match(/viewBox=["']([^"']+)["']/i)?.[1] ?? "0 0 32 32";

  // Replace root <svg> with a <g> so presentation attrs still cascade — otherwise unfilled shapes go black.
  const presentation = attrs
    .replace(/\s(viewBox|width|height|version|id|class|style|xmlns(:\w+)?)=["'][^"']*["']/gi, "")
    .trim();
  const body = clean
    .replace(/<svg[^>]*>/i, "")
    .replace(/<\/svg>/i, "")
    .trim();

  return { inner: `<g ${presentation}>${body}</g>`, viewBox };
}

export function toStandaloneSvg(icon: PostIcon, size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${icon.viewBox}">${icon.inner}</svg>`;
}
