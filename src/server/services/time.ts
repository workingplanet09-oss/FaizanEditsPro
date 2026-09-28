import { db } from "../db";
import { AppError, badRequest, notFound } from "../errors";
import { assertCan, can, type Actor } from "../auth/actor";
import { getSetting } from "./settings";
import { requireProject } from "./projects";

async function assertEnabled(actor: Actor) {
  const wf = await getSetting(actor.workspaceId, "workflow");
  if (!wf.timeTrackingEnabled) throw new AppError("NOT_CONFIGURED", "Time tracking is switched off in settings.");
}

export async function startTimer(actor: Actor, input: { projectId: string; taskId?: string; note?: string }) {
  assertCan(actor, "time:track");
  await assertEnabled(actor);
  await requireProject(actor, input.projectId);
  const running = await db.timeEntry.findFirst({ where: { userId: actor.userId, endedAt: null } });
  if (running) throw new AppError("CONFLICT", "You already have a timer running. Stop it first.");
  return db.timeEntry.create({ data: { workspaceId: actor.workspaceId, projectId: input.projectId, userId: actor.userId, taskId: input.taskId, note: input.note, startedAt: new Date() } });
}

export async function stopTimer(actor: Actor) {
  assertCan(actor, "time:track");
  const running = await db.timeEntry.findFirst({ where: { userId: actor.userId, endedAt: null } });
  if (!running) throw notFound("Running timer");
  const now = new Date();
  return db.timeEntry.update({ where: { id: running.id }, data: { endedAt: now, seconds: Math.max(1, Math.round((now.getTime() - running.startedAt.getTime()) / 1000)) } });
}

export async function addManualTime(actor: Actor, input: { projectId: string; minutes: number; note?: string; date?: Date }) {
  assertCan(actor, "time:track");
  await assertEnabled(actor);
  await requireProject(actor, input.projectId);
  if (input.minutes <= 0 || input.minutes > 24 * 60) throw badRequest("Enter between 1 minute and 24 hours.");
  const at = input.date ?? new Date();
  return db.timeEntry.create({ data: { workspaceId: actor.workspaceId, projectId: input.projectId, userId: actor.userId, startedAt: at, endedAt: new Date(at.getTime() + input.minutes * 60000), seconds: input.minutes * 60, note: input.note } });
}

export async function myTimer(actor: Actor) {
  const running = await db.timeEntry.findFirst({ where: { userId: actor.userId, endedAt: null }, include: { project: { select: { id: true, name: true, code: true } } } });
  return running;
}

export async function listTime(actor: Actor, opts: { projectId?: string; userId?: string } = {}) {
  assertCan(actor, "time:track");
  if (opts.projectId) await requireProject(actor, opts.projectId);
  const all = can(actor, "time:read_all");
  const rows = await db.timeEntry.findMany({
    where: { workspaceId: actor.workspaceId, ...(opts.projectId ? { projectId: opts.projectId } : {}), ...(all ? (opts.userId ? { userId: opts.userId } : {}) : { userId: actor.userId }) },
    orderBy: { startedAt: "desc" },
    take: 200,
    include: { user: { select: { name: true } }, project: { select: { id: true, name: true, code: true } } },
  });
  return rows;
}

export async function deleteTime(actor: Actor, id: string) {
  const e = await db.timeEntry.findFirst({ where: { id, workspaceId: actor.workspaceId } });
  if (!e) throw notFound("Time entry");
  if (e.userId !== actor.userId && !can(actor, "time:read_all")) throw notFound("Time entry");
  await db.timeEntry.delete({ where: { id } });
  return { ok: true };
}
