import { createHash } from "node:crypto";

import { loosenPath, MIN_LOOSEN_METERS, type RoutePath } from "./_polyline.js";
import type { StoredRun } from "./_strava.js";

// Countries where runs start near home, by ISO alpha-2 code (AE covers Dubai). Their routes
// are loosened on the way out of every response, so the exact shape, which could be matched
// against a street map, never leaves the server. Travel runs keep their real shape.
const PRIVATE_COUNTRY_CODES = new Set(["DE", "AE", "NL"]);

function isPrivate(run: StoredRun): boolean {
  return !!run.countryCode && PRIVATE_COUNTRY_CODES.has(run.countryCode);
}

// Seeds each run's rotation and mirror from a hash of its exact stored route. Deterministic,
// so every response carries the same loosened shape: fresh randomness per request would let
// anyone average many responses back towards the real route. And the exact route of a home
// run never leaves the server, so nobody outside it can recompute the seed; it works as a
// per-run secret without any env config.
function seededRandom(run: StoredRun & { path: RoutePath }): () => number {
  const digest = createHash("sha256").update(`${run.id}\n${run.path.d}`).digest();
  let offset = 0;
  return () => {
    const value = digest.readUInt32BE(offset);
    offset = (offset + 4) % (digest.length - 3);
    return value / 2 ** 32;
  };
}

function sliceSeries(
  series: number[] | null,
  from: number,
  to: number,
  count: number,
): number[] | null {
  if (!series || series.length === 0) return null;
  const kept = series.slice(
    Math.floor(from * (series.length - 1)),
    Math.ceil(to * (series.length - 1)) + 1,
  );
  return Array.from(
    { length: count },
    (_, i) => kept[Math.round((i / Math.max(1, count - 1)) * (kept.length - 1))],
  );
}

// Whether a stored run may appear in the feed at all. Cheap (no geometry), so paging can decide
// which runs fill a page before loosening only those.
function isVisible(run: StoredRun): boolean {
  if (run.sportType === "VirtualRun") return false;
  // A route-less run is only shown when it's a known indoor run, drawn as track laps.
  if (run.path === null) return run.indoor === true;
  // A home run too short to loosen is withheld rather than sent raw.
  return !isPrivate(run) || run.distanceMeters >= MIN_LOOSEN_METERS;
}

// A visible run as it's served. Home routes are swapped for their loosened shape, with the
// per-point series re-aligned to it; null only for a degenerate route that can't be loosened.
function toPublicRun(run: StoredRun): StoredRun | null {
  if (!run.path || !isPrivate(run)) return run;

  const loose = loosenPath(run.path, run.distanceMeters, seededRandom({ ...run, path: run.path }));
  if (!loose) return null;

  const count = (loose.path.d.match(/[ML]/g) ?? []).length;
  return {
    ...run,
    path: loose.path,
    temperatures: sliceSeries(run.temperatures, loose.from, loose.to, count),
    heartRates: sliceSeries(run.heartRates, loose.from, loose.to, count),
  };
}

// Newest first, with the id breaking ties so the order (and so every cursor) is total.
function cursorOf(run: StoredRun): string {
  return `${run.startDate}~${run.id}`;
}

export type RunsPage = { runs: StoredRun[]; nextCursor: string | null };

// The single definition of what the public sees — used by the /api/runs feed and by everything
// that derives display data from it (e.g. the writing list's "newest run" date), so they can
// never disagree. Keyset-paged: `cursor` is the last run of the previous page, so runs synced
// in between never shift a page or repeat a run the way offsets would.
export function publicRunsPage(
  stored: StoredRun[],
  { cursor, limit }: { cursor?: string | null; limit: number },
): RunsPage {
  const ordered = stored
    .filter(isVisible)
    .map((run) => ({ run, key: cursorOf(run) }))
    .sort((a, b) => b.key.localeCompare(a.key));
  const rest = cursor ? ordered.filter(({ key }) => key < cursor) : ordered;
  const page = rest.slice(0, limit);

  return {
    runs: page.map(({ run }) => toPublicRun(run)).filter((run): run is StoredRun => run !== null),
    nextCursor: rest.length > limit ? page[page.length - 1].key : null,
  };
}
