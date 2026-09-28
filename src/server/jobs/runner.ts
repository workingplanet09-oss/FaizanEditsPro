import { hostname } from "node:os";
import { db } from "../db";
import { jobHandlers } from "./handlers";

const WORKER_ID = `${hostname()}:${process.pid}`;

interface JobRow {
  id: string;
  type: string;
  payload: any;
  attempts: number;
  maxAttempts: number;
}

async function claimNext(): Promise<JobRow | null> {
  const rows = await db.$queryRaw<JobRow[]>`
    UPDATE jobs SET status = 'RUNNING', "lockedAt" = now(), "lockedBy" = ${WORKER_ID}, attempts = attempts + 1
    WHERE id = (
      SELECT id FROM jobs
      WHERE (status = 'PENDING' AND "runAt" <= now())
         OR (status = 'RUNNING' AND "lockedAt" < now() - interval '10 minutes')
      ORDER BY "runAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, type, payload, attempts, "maxAttempts"`;
  return rows[0] ?? null;
}

/** Processes due jobs until the queue is empty, the limit is hit, or the time budget is spent. */
export async function runJobs(opts: { limit?: number; budgetMs?: number } = {}) {
  const limit = opts.limit ?? 50;
  const started = Date.now();
  let processed = 0;
  let failed = 0;
  while (processed < limit && Date.now() - started < (opts.budgetMs ?? 25_000)) {
    const job = await claimNext();
    if (!job) break;
    processed++;
    try {
      const handler = jobHandlers[job.type];
      if (!handler) throw new Error(`No handler registered for job type "${job.type}"`);
      await handler(job.payload);
      await db.job.update({ where: { id: job.id }, data: { status: "DONE", completedAt: new Date(), lastError: null, lockedAt: null } });
    } catch (e: any) {
      failed++;
      const final = job.attempts >= job.maxAttempts;
      await db.job.update({
        where: { id: job.id },
        data: {
          status: final ? "FAILED" : "PENDING",
          lastError: String(e?.message ?? e).slice(0, 800),
          lockedAt: null,
          runAt: new Date(Date.now() + 30_000 * 2 ** Math.min(job.attempts, 8)),
        },
      });
      console.error(`[jobs] ${job.type} failed (attempt ${job.attempts}/${job.maxAttempts}):`, e?.message ?? e);
    }
  }
  return { processed, failed };
}

/** Seeds the recurring housekeeping job (invoice overdue, quote expiry, retainers, recurring projects…). */
export async function ensureSweepScheduled() {
  const bucket = Math.floor(Date.now() / (5 * 60_000));
  const { enqueueJob } = await import("./queue");
  await enqueueJob("sweep.all", {}, { dedupeKey: `sweep:${bucket}` });
}
