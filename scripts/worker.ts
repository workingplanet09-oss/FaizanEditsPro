import "dotenv/config";
import { ensureSweepScheduled, runJobs } from "../src/server/jobs/runner";

/** Standalone worker: `npm run worker`. Safe to run several instances (jobs are claimed with FOR UPDATE SKIP LOCKED). */
async function main() {
  console.log("[worker] started");
  let lastSweep = 0;
  for (;;) {
    if (Date.now() - lastSweep > 5 * 60_000) {
      await ensureSweepScheduled().catch(() => {});
      lastSweep = Date.now();
    }
    const r = await runJobs({ limit: 50, budgetMs: 20_000 }).catch((e) => (console.error(e), { processed: 0 }));
    if (!r.processed) await new Promise((res) => setTimeout(res, 3000));
  }
}
main();
