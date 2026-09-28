import type { AutomationActionType, Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import { AppError, badRequest, notFound } from "../errors";
import { assertCan, type Actor } from "../auth/actor";
import { EVENT_NAMES } from "../events/bus";
import { audit } from "./audit";

export interface ActionInput {
  type: AutomationActionType;
  config: Record<string, unknown>;
  delayMinutes?: number;
}

export interface AutomationInput {
  name: string;
  description?: string | null;
  event: string;
  enabled?: boolean;
  conditions?: unknown;
  actions: ActionInput[];
}

const RECIPIENTS = new Set(["client", "client_billing", "manager", "editors", "team", "lead_owner", "admins", "finance"]);
const STATUSES = ["INQUIRY", "AWAITING_QUOTE", "AWAITING_CONTRACT", "AWAITING_PAYMENT", "ONBOARDING", "AWAITING_ASSETS", "QUEUED", "EDITING", "INTERNAL_REVIEW", "CLIENT_REVIEW", "REVISION", "FINAL_REVIEW", "APPROVED", "DELIVERED", "ARCHIVED", "CANCELLED"];

function validate(input: AutomationInput) {
  if (!input.name.trim()) throw badRequest("Give the automation a name.", { name: "Required." });
  if (!(EVENT_NAMES as readonly string[]).includes(input.event)) throw badRequest("Unknown trigger event.", { event: "Invalid event." });
  if (!input.actions.length) throw badRequest("Add at least one action.", { actions: "Add at least one action." });
  for (const a of input.actions) {
    const c = a.config as Record<string, any>;
    if (["NOTIFICATION", "EMAIL", "ADMIN_ALERT", "CLIENT_REMINDER"].includes(a.type)) {
      const rcpt = String(c.recipient ?? (a.type === "ADMIN_ALERT" ? "admins" : ""));
      if (!RECIPIENTS.has(rcpt) && !rcpt.startsWith("staff_role:")) throw badRequest("Choose who should receive each action.", { actions: "Recipient required." });
    }
    if (a.type === "EMAIL" && !c.templateKey) throw badRequest("Choose an email template.", { actions: "Template required." });
    if (["NOTIFICATION", "ADMIN_ALERT", "CLIENT_REMINDER"].includes(a.type) && !String(c.title ?? "").trim()) throw badRequest("Notification actions need a title.", { actions: "Title required." });
    if (a.type === "STATUS_UPDATE" && !STATUSES.includes(String(c.toStatus))) throw badRequest("Choose a valid status.", { actions: "Status required." });
    if (a.type === "CREATE_TASK" && !String(c.taskTitle ?? "").trim()) throw badRequest("Task actions need a title.", { actions: "Title required." });
    if ((a.delayMinutes ?? 0) < 0 || (a.delayMinutes ?? 0) > 60 * 24 * 60) throw badRequest("Delay is out of range.");
  }
}

export async function listAutomations(actor: Actor) {
  assertCan(actor, "automations:manage");
  const rows = await db.automation.findMany({ where: { workspaceId: actor.workspaceId }, orderBy: [{ event: "asc" }, { name: "asc" }], include: { actions: { orderBy: { sortOrder: "asc" } }, _count: { select: { runs: true } } } });
  return rows;
}

export async function getAutomation(actor: Actor, id: string) {
  assertCan(actor, "automations:manage");
  const a = await db.automation.findFirst({ where: { id, workspaceId: actor.workspaceId }, include: { actions: { orderBy: { sortOrder: "asc" } }, runs: { orderBy: { createdAt: "desc" }, take: 20 } } });
  if (!a) throw notFound("Automation");
  return a;
}

export async function saveAutomation(actor: Actor, id: string | null, input: AutomationInput) {
  assertCan(actor, "automations:manage");
  validate(input);
  const actions = input.actions.map((a, i) => ({ type: a.type, config: a.config as Prisma.InputJsonValue, delayMinutes: a.delayMinutes ?? 0, sortOrder: i }));
  if (!id) {
    const a = await db.automation.create({
      data: { workspaceId: actor.workspaceId, name: input.name.trim(), description: input.description ?? undefined, event: input.event, enabled: input.enabled ?? true, conditions: (input.conditions ?? undefined) as Prisma.InputJsonValue | undefined, actions: { create: actions } },
      include: { actions: true },
    });
    await audit(actor, { workspaceId: actor.workspaceId, action: "automation.created", entityType: "automation", entityId: a.id, message: `${actor.name} created automation “${a.name}”` });
    return a;
  }
  const existing = await db.automation.findFirst({ where: { id, workspaceId: actor.workspaceId } });
  if (!existing) throw notFound("Automation");
  await db.$transaction([
    db.automationAction.deleteMany({ where: { automationId: id } }),
    db.automation.update({ where: { id }, data: { name: input.name.trim(), description: input.description ?? null, event: input.event, enabled: input.enabled ?? existing.enabled, conditions: (input.conditions ?? undefined) as Prisma.InputJsonValue | undefined, actions: { create: actions } } }),
  ]);
  await audit(actor, { workspaceId: actor.workspaceId, action: "automation.updated", entityType: "automation", entityId: id, message: `${actor.name} edited automation “${input.name}”` });
  return getAutomation(actor, id);
}

export async function toggleAutomation(actor: Actor, id: string, enabled: boolean) {
  assertCan(actor, "automations:manage");
  const a = await db.automation.findFirst({ where: { id, workspaceId: actor.workspaceId } });
  if (!a) throw notFound("Automation");
  await db.automation.update({ where: { id }, data: { enabled } });
  await audit(actor, { workspaceId: actor.workspaceId, action: enabled ? "automation.enabled" : "automation.disabled", entityType: "automation", entityId: id, message: `${actor.name} ${enabled ? "enabled" : "disabled"} automation “${a.name}”` });
  return { ok: true };
}

export async function deleteAutomation(actor: Actor, id: string) {
  assertCan(actor, "automations:manage");
  const a = await db.automation.findFirst({ where: { id, workspaceId: actor.workspaceId } });
  if (!a) throw notFound("Automation");
  if (a.isSystem) throw new AppError("FORBIDDEN", "Built-in automations can't be deleted — switch them off instead.");
  await db.automation.delete({ where: { id } });
  return { ok: true };
}
