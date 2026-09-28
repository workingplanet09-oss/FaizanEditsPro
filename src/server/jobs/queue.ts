import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import { env } from "../env";

export interface EnqueueOptions {
  runAt?: Date;
  delayMs?: number;
  dedupeKey?: string;
  maxAttempts?: number;
}

/**
 * Durable, Postgres-backed job queue (no extra infrastructure). Long-running or fan-out work — emails,
 * automations, scans, sweeps — is enqueued and executed by the worker loop (in-process or `npm run worker`).
 */
export async function enqueueJob(type: string, payload: Prisma.InputJsonValue, opts: EnqueueOptions = {}) {
  try {
    const job = await db.job.create({
      data: {
        type,
        payload,
        runAt: opts.runAt ?? new Date(Date.now() + (opts.delayMs ?? 0)),
        dedupeKey: opts.dedupeKey,
        maxAttempts: opts.maxAttempts ?? 5,
      },
    });
    kickJobs();
    return job;
  } catch (e: any) {
    if (e?.code === "P2002" && opts.dedupeKey) return null; // already queued
    throw e;
  }
}

const g = globalThis as unknown as { __kick?: NodeJS.Timeout | null };

/** Nudge the in-process worker so dev/self-hosted setups feel instant. No-op when jobs run elsewhere. */
export function kickJobs() {
  if (!env.jobsInline || g.__kick) return;
  g.__kick = setTimeout(async () => {
    g.__kick = null;
    try {
      const { runJobs } = await import("./runner");
      await runJobs({ limit: 25 });
    } catch (e) {
      console.error("[jobs] kick failed", e);
    }
  }, 60);
}
