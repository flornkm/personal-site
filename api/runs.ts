import type { VercelRequest, VercelResponse } from "@vercel/node";

import { publicRunsPage } from "./utils/_feed.js";
import { db } from "./utils/_firebase.js";
import type { StoredRun } from "./utils/_strava.js";

const runsRef = db.ref("runs");

// Fixed server-side rather than a query param, so the edge cache only ever holds one variant
// per cursor.
const PAGE_SIZE = 10;

// Public, read-only feed for the live writing post, one page per request (`?cursor=` for the
// next).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.json({ error: "Method not allowed" });
    return;
  }

  try {
    const snapshot = await runsRef.once("value");
    const runsMap = (snapshot.val() ?? {}) as Record<string, StoredRun>;
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : null;
    const page = publicRunsPage(Object.values(runsMap), { cursor, limit: PAGE_SIZE });

    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=86400");
    res.statusCode = 200;
    res.json(page);
  } catch (error) {
    console.error("Error fetching runs.", error);
    res.statusCode = 500;
    res.json({ error: "Failed to fetch runs" });
  }
}
