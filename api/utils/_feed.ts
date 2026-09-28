import { createHmac } from "node:crypto";

import { loosenPath } from "./_polyline.js";
import type { StoredRun } from "./_strava.js";

// Countries where runs start near home, by ISO alpha-2 code (AE covers Dubai). Their routes
// are loosened on the way out of every response, so the exact shape, which could be matched
// against a street map, never leaves the server. Travel runs keep their real shape.
const PRIVATE_COUNTRY_CODES = new Set(["DE", "AE", "NL"]);

function isPrivate(run: StoredRun): boolean {
  return !!run.countryCode && PRIVATE_COUNTRY_CODES.has(run.countryCode);
}

// Seeds each run's rotation and mirror from a server secret. Deterministic per run, so every
// response carries the same loosened shape: fresh randomness per request would let anyone
// average many responses back towards the real route. Keyed, so the Strava id alone can't
// reproduce it.
function seededRandom(secret: string, runId: string): () => number {
  const digest = createHmac("sha256", secret).update(runId).digest();
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

// A stored run as it may be served, or null when it must not be. Home routes are swapped for
// their loosened shape (with the per-point series re-aligned to it); a home run that can't be
// loosened, or any home run while the secret is missing, is withheld rather than sent raw.
function toPublicRun(run: StoredRun): StoredRun | null {
  if (run.sportType === "VirtualRun") return null;
  // A route-less run is only shown when it's a known indoor run, drawn as track laps.
  if (run.path === null) return run.indoor === true ? run : null;
  if (!isPrivate(run)) return run;

  const secret = process.env.ROUTE_PRIVACY_SECRET;
  if (!secret) return null;
  const loose = loosenPath(run.path, run.distanceMeters, seededRandom(secret, run.id));
  if (!loose) return null;

  const count = (loose.path.d.match(/[ML]/g) ?? []).length;
  return {
    ...run,
    path: loose.path,
    temperatures: sliceSeries(run.temperatures, loose.from, loose.to, count),
    heartRates: sliceSeries(run.heartRates, loose.from, loose.to, count),
  };
}

// The single definition of what the public sees — used by the /api/runs feed and by
// everything that derives display data from it (e.g. the writing list's "newest run" date),
// so they can never disagree.
export function publicRuns(stored: StoredRun[]): StoredRun[] {
  return stored
    .map(toPublicRun)
    .filter((run): run is StoredRun => run !== null)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
}
