import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import { enqueueJob } from "../jobs/queue";
import { evalLogic, type Logic } from "@/lib/conditions";

export const EVENT_NAMES = [
  "lead.created",
  "lead.assigned",
  "lead.follow_up_due",
  "quote.sent",
  "quote.accepted",
  "quote.rejected",
  "contract.sent",
  "contract.signed",
  "invoice.sent",
  "invoice.due_soon",
  "invoice.overdue",
  "payment.received",
  "project.created",
  "project.activated",
  "project.assigned",
  "project.status_changed",
  "project.deadline_soon",
  "project.approved",
  "project.delivered",
  "onboarding.completed",
  "assets.ready",
  "files.uploaded",
  "file_request.created",
  "change_request.created",
  "draft.uploaded",
  "revision.submitted",
  "revision.completed",
  "message.received",
  "deliverables.published",
  "testimonial.requested",
  "retainer.renewed",
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

export const EVENT_LABELS: Record<EventName, string> = {
  "lead.created": "Lead created",
  "lead.assigned": "Lead assigned",
  "lead.follow_up_due": "Lead follow-up due",
  "quote.sent": "Quote sent",
  "quote.accepted": "Quote accepted",
  "quote.rejected": "Quote rejected",
  "contract.sent": "Contract sent",
  "contract.signed": "Contract signed",
  "invoice.sent": "Invoice sent",
  "invoice.due_soon": "Invoice due soon",
  "invoice.overdue": "Invoice overdue",
  "payment.received": "Payment received",
  "project.created": "Project created",
  "project.activated": "Project activated",
  "project.assigned": "Editor assigned",
  "project.status_changed": "Project status changed",
  "project.deadline_soon": "Project deadline soon",
  "project.approved": "Project approved",
  "project.delivered": "Project delivered",
  "onboarding.completed": "Project onboarding completed",
  "assets.ready": "Client marked assets ready",
  "files.uploaded": "Files uploaded",
  "file_request.created": "File requested from client",
  "change_request.created": "Change request submitted",
  "draft.uploaded": "Draft uploaded",
  "revision.submitted": "Revision submitted",
  "revision.completed": "Revision completed",
  "message.received": "Client message received",
  "deliverables.published": "Final deliverables published",
  "testimonial.requested": "Testimonial requested",
  "retainer.renewed": "Retainer renewed",
};

export interface EventPayload {
  workspaceId: string;
  actorId?: string | null;
  projectId?: string;
  clientId?: string;
  organizationId?: string;
  leadId?: string;
  quoteId?: string;
  contractId?: string;
  invoiceId?: string;
  versionId?: string;
  revisionId?: string;
  taskId?: string;
  retainerId?: string;
  messageId?: string;
  fileRequestId?: string;
  changeRequestId?: string;
  data?: Record<string, string | number | boolean | null>;
}

/**
 * Publish a domain event. Matching, enabled automations are expanded into jobs (with optional delay).
 * Never throws — a broken automation must not break the business action that triggered it.
 */
export async function emit(name: EventName, payload: EventPayload) {
  try {
    const automations = await db.automation.findMany({
      where: { workspaceId: payload.workspaceId, event: name, enabled: true },
      include: { actions: { orderBy: { sortOrder: "asc" } } },
    });
    const ctx = { event: name, ...payload, ...(payload.data ?? {}) } as Record<string, unknown>;
    for (const auto of automations) {
      if (!evalLogic(auto.conditions as Logic | null, ctx)) continue;
      for (const action of auto.actions) {
        await enqueueJob(
          "automation.action",
          { automationId: auto.id, actionId: action.id, event: name, payload: payload as unknown as Prisma.InputJsonValue },
          { delayMs: action.delayMinutes * 60_000 },
        );
      }
      await db.automationRun.create({ data: { automationId: auto.id, event: name, entityId: payload.projectId ?? payload.leadId ?? payload.invoiceId ?? null, status: "queued" } });
    }
  } catch (e) {
    console.error(`[events] failed to emit ${name}`, e);
  }
}
