import { createHash } from "node:crypto";

import { MIN_STYLIZE_METERS, stylizePath, type RoutePath } from "./_polyline.js";
import type { StoredRun } from "./_strava.js";

const STYLIZED_COUNTRY_CODES = new Set(["DE", "AE", "NL"]);

function isStylized(run: StoredRun): boolean {
  return !!run.countryCode && STYLIZED_COUNTRY_CODES.has(run.countryCode);
}

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

// Cheap (no geometry), so paging can pick a page's runs before stylizing only those.
function isVisible(run: StoredRun): boolean {
  if (run.sportType === "VirtualRun") return false;
  if (run.path === null) return run.indoor === true;
  return !isStylized(run) || run.distanceMeters >= MIN_STYLIZE_METERS;
}

function toPublicRun(run: StoredRun): StoredRun | null {
  if (!run.path || !isStylized(run)) return run;

  const styled = stylizePath(
    run.path,
    run.distanceMeters,
    seededRandom({ ...run, path: run.path }),
  );
  if (!styled) return null;

  const count = (styled.path.d.match(/[ML]/g) ?? []).length;
  return {
    ...run,
    path: styled.path,
    temperatures: sliceSeries(run.temperatures, styled.from, styled.to, count),
    heartRates: sliceSeries(run.heartRates, styled.from, styled.to, count),
  };
}

// Newest first, with the id breaking ties so the order (and so every cursor) is total.
function cursorOf(run: StoredRun): string {
  return `${run.startDate}~${run.id}`;
}

export type RunsPage = { runs: StoredRun[]; nextCursor: string | null };

// Keyset-paged: `cursor` is the last run of the previous page, so runs synced in between never
// shift a page or repeat a run the way offsets would.
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
