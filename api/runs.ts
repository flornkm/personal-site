import type { VercelRequest, VercelResponse } from "@vercel/node";

import { publicRuns } from "./utils/_feed.js";
import { db } from "./utils/_firebase.js";
import type { StoredRun } from "./utils/_strava.js";

const runsRef = db.ref("runs");

// Public, read-only feed for the live writing post. Firebase holds coordinate-free shapes;
// publicRuns loosens home routes before they go out, so none can be matched to a map.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.json({ error: "Method not allowed" });
    return;
  }

  try {
    const snapshot = await runsRef.once("value");
    const runsMap = (snapshot.val() ?? {}) as Record<string, StoredRun>;
    const runs = publicRuns(Object.values(runsMap));

    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=86400");
    res.statusCode = 200;
    res.json({ runs });
  } catch (error) {
    console.error("Error fetching runs.", error);
    res.statusCode = 500;
    res.json({ error: "Failed to fetch runs" });
  }
}
