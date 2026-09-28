import { db } from "./_firebase.js";
import { generateRunDescription } from "./_describe.js";
import { countryDisplayName, fetchRunCountry } from "./_geocode.js";
import { decodePolyline, toNormalizedPath, type RoutePath } from "./_polyline.js";
import { fetchRunTemperatures } from "./_weather.js";

const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
const STRAVA_ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities";
const STRAVA_ACTIVITY_URL = "https://www.strava.com/api/v3/activities";

// Only ever sync runs from this date onward (the live post starts in May 2026).
const SYNC_AFTER_EPOCH = Math.floor(Date.UTC(2026, 4, 1) / 1000); // 2026-05-01

// VirtualRun (Zwift etc.) is deliberately excluded. Treadmill runs come through as plain "Run"
// with `trainer` set and no GPS; they're kept and drawn as track laps.
const RUN_TYPES = new Set(["Run", "TrailRun"]);

// Samples an indoor run's heart rate is resampled to, since it has no polyline to align with.
const INDOOR_SAMPLES = 240;

export type { RoutePath };

type StravaActivity = {
  id: number;
  sport_type: string;
  trainer?: boolean;
  start_date: string;
  start_date_local?: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  average_heartrate?: number;
  // Summary activities include the start coordinate ([] when there's no GPS fix). Used
  // transiently for the weather lookup — never stored, so no location leaks.
  start_latlng?: [number, number] | [];
  map?: { summary_polyline?: string };
};

export type StoredRun = {
  id: string;
  sportType: string;
  startDate: string;
  distanceMeters: number;
  movingSeconds: number;
  elapsedSeconds: number;
  path: RoutePath | null;
  // Treadmill run (Strava `trainer`, or no GPS track). Always has a null path; the feed draws
  // it as track laps from the distance instead.
  indoor: boolean;
  // Ambient °C at the start (Open-Meteo) — the per-run readout.
  temperature: number | null;
  // Per-point °C interpolated across the run's duration from the day's hourly curve, so the
  // line can gradient over time. Subtle within one run, but real.
  temperatures: number[] | null;
  averageHeartRate: number | null;
  // Per-point heart rate resampled to the polyline's point count, so the line can gradient
  // along its length. null when the run has no HR data (e.g. no chest strap / watch).
  heartRates: number[] | null;
  // Country of the start point (English name + ISO alpha-2), reverse-geocoded at sync time.
  // Country-level only, so the feed stays location-safe. The feed filters on the code.
  country: string | null;
  countryCode: string | null;
  // Short diary-style note generated once at sync time (claude-sonnet-5 via the Vercel AI
  // Gateway); null until AI_GATEWAY_API_KEY is available, then filled on the next sync.
  description: string | null;
  syncedAt: string;
};

async function getAccessToken(): Promise<string> {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: process.env.STRAVA_REFRESH_TOKEN,
    }),
  });

  if (!res.ok) {
    throw new Error(`Strava token refresh failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("Strava token refresh returned no access_token");
  }
  return data.access_token;
}

async function fetchActivities(accessToken: string): Promise<StravaActivity[]> {
  const all: StravaActivity[] = [];

  for (let page = 1; ; page++) {
    const url = `${STRAVA_ACTIVITIES_URL}?after=${SYNC_AFTER_EPOCH}&per_page=100&page=${page}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

    if (!res.ok) {
      throw new Error(`Strava activities fetch failed: ${res.status} ${await res.text()}`);
    }

    const batch = (await res.json()) as StravaActivity[];
    all.push(...batch);
    if (batch.length < 100) break;
  }

  return all;
}

// Per-activity heart-rate stream (one sample per GPS record). null when the run wasn't
// recorded with HR — that's expected, not an error, so a failed fetch degrades to null.
async function fetchHeartrateStream(accessToken: string, id: number): Promise<number[] | null> {
  const url = `${STRAVA_ACTIVITY_URL}/${id}/streams?keys=heartrate&key_by_type=true`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const data = (await res.json()) as { heartrate?: { data?: number[] } };
  const hr = data.heartrate?.data;
  return Array.isArray(hr) && hr.length > 0 ? hr : null;
}

// Resample a stream to exactly `n` values by proportional index, so per-point data lines up
// with the simplified summary polyline (which has far fewer points than the raw stream).
function resample(values: number[], n: number): number[] {
  if (n <= 1) return values.slice(0, n);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(values[Math.round((i / (n - 1)) * (values.length - 1))]);
  }
  return out;
}

async function toStoredRun(
  activity: StravaActivity,
  accessToken: string,
  syncedAt: string,
  prior?: StoredRun,
): Promise<StoredRun> {
  const polyline = activity.map?.summary_polyline;
  const points = polyline ? decodePolyline(polyline) : [];
  const start = activity.start_latlng;
  const startDate = activity.start_date_local ?? activity.start_date;

  // Enrichment is immutable once known, so reuse it from the stored run and only hit the
  // weather / stream APIs for runs still missing it. Keeps re-syncs cheap and off Strava's
  // rate limit; runs that genuinely have no temp/HR are simply re-checked each time (cheap,
  // and lets a recent run pick up temperature once the archive catches up).
  const priorTemp = typeof prior?.temperature === "number" ? prior.temperature : null;
  const priorTemps =
    Array.isArray(prior?.temperatures) && prior.temperatures.length > 0 ? prior.temperatures : null;
  const priorHr =
    Array.isArray(prior?.heartRates) && prior.heartRates.length > 0 ? prior.heartRates : null;
  // Re-derive the display name from the stored code, so runs geocoded before a naming
  // change (e.g. formal ISO names) heal on the next sync without re-geocoding.
  const priorCountry = prior?.countryCode
    ? {
        country: countryDisplayName(prior.countryCode) ?? prior.country ?? null,
        countryCode: prior.countryCode,
      }
    : null;
  // The per-point series arrived after the scalar, so an old run can have temperature but
  // not temperatures — refetch unless both are present (a route-less run can never gain one).
  const hasFullTemps = priorTemp != null && (priorTemps != null || points.length === 0);
  const indoor = !!activity.trainer || points.length === 0;
  // Indoor runs skip weather and geocoding: a treadmill's GPS fix (when a watch records one)
  // is the gym, not the run, and the room's temperature isn't the weather.
  const hasStart = !indoor && start != null && start.length === 2;

  const [temps, hrStream, geo] = await Promise.all([
    hasFullTemps || !hasStart
      ? Promise.resolve({ start: priorTemp, perPoint: priorTemps })
      : fetchRunTemperatures(start[0], start[1], startDate, activity.elapsed_time, points.length),
    priorHr ? Promise.resolve(null) : fetchHeartrateStream(accessToken, activity.id),
    priorCountry || !hasStart
      ? Promise.resolve(priorCountry ?? { country: null, countryCode: null })
      : fetchRunCountry(start[0], start[1]),
  ]);

  // Descriptions are reused here and generated (for runs still missing one) in a
  // sequential pass in syncRuns, so each new note can see the previous ones.
  const description =
    typeof prior?.description === "string" && prior.description ? prior.description : null;

  return {
    id: String(activity.id),
    sportType: activity.sport_type,
    startDate,
    distanceMeters: activity.distance,
    movingSeconds: activity.moving_time,
    elapsedSeconds: activity.elapsed_time,
    path: indoor ? null : toNormalizedPath(points),
    indoor,
    temperature: temps.start,
    temperatures: temps.perPoint,
    averageHeartRate: activity.average_heartrate ?? null,
    heartRates:
      priorHr ?? (hrStream ? resample(hrStream, indoor ? INDOOR_SAMPLES : points.length) : null),
    country: geo.country,
    countryCode: geo.countryCode,
    description,
    syncedAt,
  };
}

// Re-syncs the whole window every call and replaces the stored set wholesale, so a
// missed trigger self-heals on the next run or the daily cron — and runs that no longer
// qualify (e.g. a run later retyped on Strava) get deleted, not orphaned.
export async function syncRuns(): Promise<{ synced: number; total: number }> {
  const accessToken = await getAccessToken();
  const activities = await fetchActivities(accessToken);
  const runs = activities.filter((activity) => RUN_TYPES.has(activity.sport_type));

  // Existing runs carry already-fetched temp/HR so toStoredRun can skip re-fetching them.
  const existingSnap = await db.ref("runs").once("value");
  const existing = (existingSnap.val() ?? {}) as Record<string, StoredRun>;

  const syncedAt = new Date().toISOString();
  const stored = await Promise.all(
    runs.map((activity) =>
      toStoredRun(activity, accessToken, syncedAt, existing[String(activity.id)]),
    ),
  );

  // Describe pass, oldest first and deliberately sequential: each missing note sees the
  // most recent existing ones, so consecutive entries don't converge on the same phrasing
  // (which they do when generated in parallel). Normally only the newest run is missing.
  stored.sort((a, b) => a.startDate.localeCompare(b.startDate));
  for (let i = 0; i < stored.length; i++) {
    const run = stored[i];
    if (run.description) continue;
    const recentNotes = stored
      .slice(0, i)
      .filter((r) => r.description)
      .slice(-3)
      .reverse()
      .map((r) => r.description as string);
    run.description = await generateRunDescription(
      {
        startDate: run.startDate,
        sportType: run.sportType,
        indoor: run.indoor,
        distanceMeters: run.distanceMeters,
        movingSeconds: run.movingSeconds,
        averageHeartRate: run.averageHeartRate,
        temperature: run.temperature,
      },
      recentNotes,
    );
  }

  await db.ref("runs").set(Object.fromEntries(stored.map((run) => [run.id, run])));

  return { synced: runs.length, total: activities.length };
}
