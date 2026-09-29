import { db } from "../db";
import { getStorage } from "../storage";
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
  // Files that were never finished or never attached to anything would otherwise sit in storage forever.
  await step("uploads", async () => {
    const day = 86400_000;
    const stale = await db.asset.findMany({
      where: { OR: [{ status: "UPLOADING", createdAt: { lt: new Date(Date.now() - day) } }, { draftToken: { not: null }, leadId: null, createdAt: { lt: new Date(Date.now() - 30 * day) } }, { status: "FAILED", createdAt: { lt: new Date(Date.now() - 7 * day) } }] },
      select: { id: true, storageKey: true, thumbnailKey: true },
      take: 200,
    });
    const storage = getStorage();
    for (const a of stale) {
      await storage.remove(a.storageKey).catch(() => {});
      if (a.thumbnailKey) await storage.remove(a.thumbnailKey).catch(() => {});
    }
    const removed = await db.asset.deleteMany({ where: { id: { in: stale.map((a) => a.id) } } });
    return { removed: removed.count };
  });
  await step("housekeeping", async () => {
    const s = await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    const t = await db.authToken.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 86400_000) } } });
    const j = await db.job.deleteMany({ where: { status: "DONE", completedAt: { lt: new Date(Date.now() - 7 * 86400_000) } } });
    // Read notifications are clutter after a quarter; nothing needs to live in an inbox for more than a year.
    const n = await db.notification.deleteMany({ where: { OR: [{ readAt: { lt: new Date(Date.now() - 90 * 86400_000) } }, { createdAt: { lt: new Date(Date.now() - 365 * 86400_000) } }] } });
    // Run history and finished questionnaire drafts are records of things already stored elsewhere; keep them for a while, not forever.
    const r = await db.automationRun.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 90 * 86400_000) } } });
    const d = await db.onboardingDraft.deleteMany({ where: { OR: [{ submittedAt: { lt: new Date(Date.now() - 14 * 86400_000) } }, { submittedAt: null, updatedAt: { lt: new Date(Date.now() - 90 * 86400_000) } }] } });
    return { sessions: s.count, tokens: t.count, jobs: j.count, notifications: n.count, automationRuns: r.count, drafts: d.count };
  });
  await ensureSweepScheduled().catch(() => {});
  return out;
}

export { emit };
export type { EventName };
