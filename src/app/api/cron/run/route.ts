import { publicRoute, AppError } from "@/server/api";
import { env } from "@/server/env";
import { safeEqual } from "@/server/auth/crypto";
import { runJobs, ensureSweepScheduled } from "@/server/jobs/runner";
import { runSweeps } from "@/server/jobs/sweeps";

/**
 * Drives background work for serverless / external cron setups: `POST /api/cron/run` with
 * `Authorization: Bearer $CRON_SECRET`. Runs due jobs; `?sweep=1` also runs housekeeping immediately.
 */
export const POST = publicRoute({ csrf: false, rateLimit: { name: "cron", limit: 30, windowSec: 60 } }, async ({ req }) => {
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!env.cronSecret || !safeEqual(given, env.cronSecret)) throw new AppError("UNAUTHENTICATED", "Invalid cron secret.");
  const sweep = new URL(req.url).searchParams.get("sweep") === "1" ? await runSweeps() : (await ensureSweepScheduled(), null);
  // Drain the queue, including jobs enqueued by the work we just did.
  let total = 0;
  let failed = 0;
  for (let i = 0; i < 5; i++) {
    const r = await runJobs({ limit: 100, budgetMs: 20000 });
    total += r.processed;
    failed += r.failed;
    if (r.processed === 0) break;
  }
  return { processed: total, failed, sweep };
});
