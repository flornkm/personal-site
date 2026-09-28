// Pure route geometry — no Firebase/Strava IO, so it's safe to import and unit-test in isolation.

// Longest edge of the normalized route, in viewBox units.
const VIEWBOX_SIZE = 100;

export type RoutePath = { d: string; w: number; h: number };

// Google encoded-polyline algorithm (precision 5) → [lat, lng] pairs.
export function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
}

// Project to a coordinate-free SVG path: absolute lat/lng are discarded, only the
// translated + uniformly-scaled shape survives, so no location can be recovered.
export function toNormalizedPath(points: [number, number][]): RoutePath | null {
  if (points.length < 2) return null;

  const meanLat = points.reduce((sum, [lat]) => sum + lat, 0) / points.length;
  const cosLat = Math.cos((meanLat * Math.PI) / 180);

  const xs = points.map(([, lng]) => lng * cosLat);
  const ys = points.map(([lat]) => lat);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX || 1;
  const spanY = Math.max(...ys) - minY || 1;
  const scale = VIEWBOX_SIZE / Math.max(spanX, spanY);

  const h = +(spanY * scale).toFixed(1);
  const d = points
    .map(([lat, lng], i) => {
      const x = ((lng * cosLat - minX) * scale).toFixed(1);
      // Flip Y: SVG grows downward, latitude grows upward.
      const y = (h - (lat - minY) * scale).toFixed(1);
      return `${i === 0 ? "M" : "L"}${x} ${y}`;
    })
    .join(" ");

  return { d, w: +(spanX * scale).toFixed(1), h };
}

// Distance cut from each end of a loosened route, so neither the start nor the finish
// (usually the front door) survives.
const PRIVACY_TRIM_METERS = 500;
// Spacing the route is resampled to before smoothing; anything shorter than this (street
// corners, short blocks) melts into the curve.
const LOOSEN_STEP_METERS = 150;
const SMOOTHING_PASSES = 3;

function parsePoints(d: string): [number, number][] {
  const nums = (d.match(/-?\d*\.?\d+/g) ?? []).map(Number);
  const points: [number, number][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) points.push([nums[i], nums[i + 1]]);
  return points;
}

function pointAt(points: [number, number][], cum: number[], target: number): [number, number] {
  let i = 1;
  while (i < cum.length - 1 && cum[i] < target) i++;
  const t = (target - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
  const [ax, ay] = points[i - 1];
  const [bx, by] = points[i];
  return [ax + (bx - ax) * t, ay + (by - ay) * t];
}

function chaikin(points: [number, number][]): [number, number][] {
  const out: [number, number][] = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    out.push([0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1]);
    out.push([0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1]);
  }
  out.push(points[points.length - 1]);
  return out;
}

export type LoosenedPath = {
  path: RoutePath;
  // Fraction of the original route (by length) the loosened one covers, for slicing the
  // per-point series so they stay aligned with the line.
  from: number;
  to: number;
};

// Deliberately lossy: trims both ends, resamples coarsely and smooths, then rotates and
// optionally mirrors with the caller's `random`. The result still reads as the run but no
// longer lines up with a street map. Returns null when the run is too short to trim.
export function loosenPath(
  path: RoutePath,
  distanceMeters: number,
  random: () => number,
): LoosenedPath | null {
  const points = parsePoints(path.d);
  if (points.length < 2) return null;

  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    cum.push(cum[i - 1] + Math.hypot(bx - ax, by - ay));
  }
  const total = cum[cum.length - 1];
  if (total <= 0 || distanceMeters <= 0) return null;

  const unitsPerMeter = total / distanceMeters;
  const start = PRIVACY_TRIM_METERS * unitsPerMeter;
  const end = total - start;
  const step = LOOSEN_STEP_METERS * unitsPerMeter;
  if (end - start < step * 2) return null;

  let loose: [number, number][] = [];
  for (let at = start; at < end; at += step) loose.push(pointAt(points, cum, at));
  loose.push(pointAt(points, cum, end));
  for (let pass = 0; pass < SMOOTHING_PASSES; pass++) loose = chaikin(loose);

  const angle = random() * Math.PI * 2;
  const mirror = random() < 0.5 ? -1 : 1;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const turned = loose.map(([x, y]): [number, number] => [
    mirror * (x * cos - y * sin),
    x * sin + y * cos,
  ]);

  const minX = Math.min(...turned.map(([x]) => x));
  const minY = Math.min(...turned.map(([, y]) => y));
  const spanX = Math.max(...turned.map(([x]) => x)) - minX || 1;
  const spanY = Math.max(...turned.map(([, y]) => y)) - minY || 1;
  const scale = VIEWBOX_SIZE / Math.max(spanX, spanY);

  const d = turned
    .map(([x, y], i) => {
      const px = ((x - minX) * scale).toFixed(1);
      const py = ((y - minY) * scale).toFixed(1);
      return `${i === 0 ? "M" : "L"}${px} ${py}`;
    })
    .join(" ");

  return {
    path: { d, w: +(spanX * scale).toFixed(1), h: +(spanY * scale).toFixed(1) },
    from: start / total,
    to: end / total,
  };
}
