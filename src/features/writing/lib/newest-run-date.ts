// Server-side only (called inside createServerFn handlers): the live "runs" post has no
// frontmatter date and takes its date from the newest *publicly visible* run — same
// visibility rules as the /api/runs feed, so the list never dates the post by a hidden
// run. Reads Firebase directly so it works in every environment. Returns null on
// failure → callers fall back gracefully.
import { publicRunsPage } from "../../../../api/utils/_feed";
import { db } from "../../../../api/utils/_firebase";
import type { StoredRun } from "../../../../api/utils/_strava";

export async function fetchNewestRunDate(): Promise<string | null> {
  try {
    const snapshot = await db.ref("runs").once("value");
    const stored = Object.values((snapshot.val() ?? {}) as Record<string, StoredRun>);
    const [newest] = publicRunsPage(stored, { limit: 1 }).runs;
    return newest ? newest.startDate.slice(0, 10) : null;
  } catch {
    return null;
  }
}
