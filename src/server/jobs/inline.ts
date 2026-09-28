import { ensureSweepScheduled, runJobs } from "./runner";

const g = globalThis as unknown as { __inlineWorker?: { timer: NodeJS.Timeout; sweeper: NodeJS.Timeout } };

/**
 * In-process worker for single-node deployments and local development. For scale-out, set JOBS_INLINE=false
 * and run `npm run worker` (or call POST /api/cron/run from a scheduler) instead — the queue lives in Postgres,
 * so any number of workers can safely share it.
 */
export function startInlineWorker() {
  if (g.__inlineWorker) return;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      await runJobs({ limit: 30, budgetMs: 10_000 });
    } catch (e) {
      console.error("[worker] tick failed", e);
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(tick, 4000);
  const sweeper = setInterval(() => void ensureSweepScheduled().catch(() => {}), 5 * 60_000);
  timer.unref?.();
  sweeper.unref?.();
  void ensureSweepScheduled().catch(() => {});
  g.__inlineWorker = { timer, sweeper };
  console.log("[worker] inline job worker started");
}
