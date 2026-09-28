import { describe, expect, test } from "bun:test";

import { publicRuns } from "../../../../api/utils/_feed";
import type { StoredRun } from "../../../../api/utils/_strava";
import { trackLaps } from "./runs";

// A 6 km out-and-back-ish loop: 60 points across the 100-unit box.
const LOOP_D = Array.from({ length: 60 }, (_, i) => {
  const a = (i / 59) * Math.PI * 1.8;
  return `${i === 0 ? "M" : "L"}${(50 + 45 * Math.cos(a)).toFixed(1)} ${(40 + 30 * Math.sin(a)).toFixed(1)}`;
}).join(" ");

function run(overrides: Partial<StoredRun>): StoredRun {
  return {
    id: "1",
    sportType: "Run",
    startDate: "2026-09-27T22:39:28Z",
    distanceMeters: 6000,
    movingSeconds: 2400,
    elapsedSeconds: 2400,
    path: { d: LOOP_D, w: 90, h: 60 },
    indoor: false,
    temperature: 30,
    temperatures: Array.from({ length: 60 }, (_, i) => 30 + i / 60),
    averageHeartRate: 150,
    heartRates: Array.from({ length: 60 }, (_, i) => 140 + i),
    country: "Germany",
    countryCode: "DE",
    description: null,
    syncedAt: "2026-09-28T00:00:00Z",
    ...overrides,
  };
}

describe("publicRuns", () => {
  test("never serves a home route's real shape, and serves the same loosened one every time", () => {
    const [first] = publicRuns([run({})]);
    const [second] = publicRuns([run({})]);
    expect(first.path?.d).not.toBe(LOOP_D);
    expect(first.path).toEqual(second.path);
    const points = (first.path?.d.match(/[ML]/g) ?? []).length;
    expect(first.heartRates).toHaveLength(points);
    expect(first.temperatures).toHaveLength(points);
  });

  test("withholds a home run too short to loosen", () => {
    expect(publicRuns([run({ distanceMeters: 1000 })])).toEqual([]);
  });

  test("travel runs pass through untouched", () => {
    const travel = run({ countryCode: "IT", country: "Italy" });
    expect(publicRuns([travel])).toEqual([travel]);
  });

  test("keeps indoor runs, drops other route-less and virtual runs", () => {
    const indoor = run({ id: "2", path: null, indoor: true, countryCode: null });
    const ghost = run({ id: "3", path: null, countryCode: null });
    const zwift = run({ id: "4", sportType: "VirtualRun", countryCode: null });
    expect(publicRuns([indoor, ghost, zwift])).toEqual([indoor]);
  });
});

describe("trackLaps", () => {
  test("draws one lap per km, closing back at the start", () => {
    const { path } = trackLaps(3000, null);
    const points = path.d.match(/-?\d*\.?\d+/g)!.map(Number);
    const [x0, y0] = points;
    const [xn, yn] = points.slice(-2);
    expect(path.w).toBe(100);
    // After whole laps the line ends on the home straight, just inside where it started.
    expect(Math.abs(xn - x0)).toBeLessThan(0.2);
    expect(yn).toBeLessThan(y0);
  });

  test("resamples heart rate onto every point of the laps", () => {
    const { path, heartRates } = trackLaps(12_000, [120, 150, 180]);
    expect(heartRates).toHaveLength((path.d.match(/[ML]/g) ?? []).length);
    expect(heartRates?.[0]).toBe(120);
    expect(heartRates?.at(-1)).toBe(180);
  });
});
