import type { RecurringCadence } from "@/generated/prisma/client";
import { db } from "../db";
import { badRequest, notFound } from "../errors";
import { assertCan, type Actor } from "../auth/actor";
import { addDays, addMonths } from "./common";
import { createProject, requireProject, DEFAULT_SCOPE, type Scope } from "./projects";
import { audit } from "./audit";
import { getSetting } from "./settings";

const advance = (d: Date, cadence: RecurringCadence) => (cadence === "WEEKLY" ? addDays(d, 7) : cadence === "BIWEEKLY" ? addDays(d, 14) : addMonths(d, 1));

export async function listSchedules(actor: Actor, clientId?: string) {
  assertCan(actor, "projects:write");
  return db.recurringSchedule.findMany({ where: { workspaceId: actor.workspaceId, ...(clientId ? { clientId } : {}) }, orderBy: { nextRunAt: "asc" }, include: { template: { select: { name: true } } } });
}

export async function createSchedule(actor: Actor, input: { clientId: string; templateId: string; name: string; cadence: RecurringCadence; firstRunAt: Date }) {
  assertCan(actor, "projects:write");
  const [client, template] = await Promise.all([db.client.findFirst({ where: { id: input.clientId, workspaceId: actor.workspaceId } }), db.projectTemplate.findFirst({ where: { id: input.templateId, workspaceId: actor.workspaceId } })]);
  if (!client) throw notFound("Client");
  if (!template) throw notFound("Template");
  const s = await db.recurringSchedule.create({ data: { workspaceId: actor.workspaceId, clientId: client.id, templateId: template.id, name: input.name.trim() || template.name, cadence: input.cadence, nextRunAt: input.firstRunAt } });
  await audit(actor, { workspaceId: actor.workspaceId, action: "recurring.created", entityType: "recurring_schedule", entityId: s.id, message: `${actor.name} scheduled “${s.name}” ${input.cadence.toLowerCase()} for ${client.companyName}` });
  return s;
}

export async function setScheduleActive(actor: Actor, id: string, active: boolean) {
  assertCan(actor, "projects:write");
  const r = await db.recurringSchedule.updateMany({ where: { id, workspaceId: actor.workspaceId }, data: { active } });
  if (!r.count) throw notFound("Schedule");
  return { ok: true };
}

/** Sweep: create the next batch of work (project + tasks + folders) for each due recurring schedule. */
export async function sweepRecurring() {
  const due = await db.recurringSchedule.findMany({ where: { active: true, nextRunAt: { lte: new Date() } }, include: { template: true } });
  let created = 0;
  for (const s of due) {
    const dateLabel = s.nextRunAt.toISOString().slice(0, 10);
    const dup = await db.project.count({ where: { clientId: s.clientId, templateId: s.templateId, name: `${s.name} — ${dateLabel}` } });
    if (!dup) {
      const client = await db.client.findUnique({ where: { id: s.clientId }, select: { id: true } });
      if (client) {
        const retainer = await db.retainer.findFirst({ where: { clientId: s.clientId, status: "ACTIVE" } });
        const bcfg = await getSetting(s.workspaceId, "business");
        await createProject({ system: true, label: "Recurring schedule" }, {
          clientId: s.clientId,
          name: `${s.name} — ${dateLabel}`,
          templateId: s.templateId,
          serviceId: s.template.serviceId,
          projectTypeKey: s.template.projectTypeKey,
          status: retainer ? "ONBOARDING" : "AWAITING_QUOTE",
          clientVisible: !!retainer,
          retainerId: retainer?.id,
          currency: retainer?.currency ?? bcfg.defaultCurrency,
          workspaceId: s.workspaceId,
        });
        created++;
      }
    }
    await db.recurringSchedule.update({ where: { id: s.id }, data: { lastRunAt: new Date(), nextRunAt: advance(s.nextRunAt, s.cadence) } });
  }
  return created;
}

// ───────────────────────────── project duplication ─────────────────────────────

/** Staff duplicate: copies scope, brand overrides, tasks (reset), folder structure and onboarding defaults — never the video files. */
export async function duplicateProject(actor: Actor, projectId: string, opts: { name?: string; copyOnboarding?: boolean } = {}) {
  assertCan(actor, "projects:write");
  const src = await requireProject(actor, projectId);
  if (opts.name !== undefined && !opts.name.trim()) throw badRequest("Enter a name for the copy.");
  const scope = (src.scope ?? DEFAULT_SCOPE) as unknown as Scope;
  const copy = await createProject(actor, {
    clientId: src.clientId,
    name: opts.name?.trim() || `${src.name} (copy)`,
    description: src.description,
    serviceId: src.serviceId,
    templateId: src.templateId,
    sourceProjectId: src.id,
    priority: src.priority,
    managerId: src.managerId,
    scope,
    revisionLimit: src.revisionLimit,
    currency: src.currency,
    status: "AWAITING_QUOTE",
    tags: src.tags,
  });
  await db.project.update({ where: { id: copy.id }, data: { brandOverrides: src.brandOverrides ?? undefined, projectTypeId: src.projectTypeId } });
  const tasks = await db.task.findMany({ where: { projectId, parentId: null }, orderBy: { sortOrder: "asc" }, include: { subtasks: true } });
  if (!src.templateId) {
    for (const t of tasks) {
      const parent = await db.task.create({ data: { workspaceId: actor.workspaceId, projectId: copy.id, title: t.title, description: t.description, priority: t.priority, sortOrder: t.sortOrder, createdById: actor.userId } });
      for (const st of t.subtasks) await db.task.create({ data: { workspaceId: actor.workspaceId, projectId: copy.id, parentId: parent.id, title: st.title, sortOrder: st.sortOrder, createdById: actor.userId } });
    }
  }
  if (opts.copyOnboarding !== false) {
    const rows = await db.onboardingResponse.findMany({ where: { subjectType: "PROJECT", subjectId: projectId } });
    if (rows.length) await db.onboardingResponse.createMany({ data: rows.map((r) => ({ workspaceId: r.workspaceId, formKey: r.formKey, subjectType: "PROJECT", subjectId: copy.id, questionKey: r.questionKey, questionText: r.questionText, value: r.value as any })) });
  }
  await audit(actor, { workspaceId: actor.workspaceId, action: "project.duplicated", entityType: "project", entityId: copy.id, message: `${actor.name} duplicated ${src.code} into ${copy.code}` });
  return copy;
}
