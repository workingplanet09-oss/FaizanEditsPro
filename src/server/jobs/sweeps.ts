import { db } from "../db";
import { emit, type EventName } from "../events/bus";
import { sweepInvoices } from "../services/invoices";
import { expireQuotes } from "../services/quotes";
import { sweepRetainers } from "../services/retainers";
import { sweepLeadFollowUps } from "../services/leads";
import { sweepRecurring } from "../services/recurring";
import { ensureSweepScheduled } from "./runner";
import { enqueueJob } from "./queue";

/** Housekeeping that runs every few minutes: overdue invoices, quote expiry, retainers, recurring projects, reminders. */
export async function runSweeps() {
  const out: Record<string, unknown> = {};
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      out[name] = await fn();
    } catch (e: any) {
      out[name] = `error: ${e?.message ?? e}`;
      console.error(`[sweep] ${name} failed`, e);
    }
  };
  await step("invoices", sweepInvoices);
  await step("quotes", expireQuotes);
  await step("retainers", sweepRetainers);
  await step("recurring", sweepRecurring);
  await step("leadFollowUps", sweepLeadFollowUps);
  await step("deadlines", async () => {
    const soon = await db.project.findMany({ where: { status: { in: ["ONBOARDING", "AWAITING_ASSETS", "QUEUED", "EDITING", "INTERNAL_REVIEW", "REVISION"] }, deadline: { gte: new Date(), lte: new Date(Date.now() + 36 * 3600_000) } }, select: { id: true, workspaceId: true, clientId: true, deadline: true } });
    for (const p of soon) {
      await enqueueJob("automation.emit", { name: "project.deadline_soon", payload: { workspaceId: p.workspaceId, projectId: p.id, clientId: p.clientId } }, { dedupeKey: `deadline:${p.id}:${p.deadline!.toISOString().slice(0, 10)}` });
    }
    return soon.length;
  });
  await step("housekeeping", async () => {
    const s = await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    const t = await db.authToken.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 86400_000) } } });
    const j = await db.job.deleteMany({ where: { status: "DONE", completedAt: { lt: new Date(Date.now() - 7 * 86400_000) } } });
    return { sessions: s.count, tokens: t.count, jobs: j.count };
  });
  await ensureSweepScheduled().catch(() => {});
  return out;
}

export { emit };
export type { EventName };
