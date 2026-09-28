import type { Priority, Prisma, TaskStatus } from "@/generated/prisma/client";
import { db } from "../db";
import { badRequest, forbidden, notFound } from "../errors";
import { assertCan, can, type Actor } from "../auth/actor";
import { taskScope } from "../auth/access";
import { audit } from "./audit";
import { pageArgs, paged, type PageInput } from "./common";
import { notify } from "./notifications";
import { requireProject } from "./projects";

const include = {
  assignee: { select: { id: true, name: true } },
  project: { select: { id: true, name: true, code: true } },
  subtasks: { orderBy: { sortOrder: "asc" }, select: { id: true, title: true, status: true, assigneeId: true } },
  _count: { select: { comments: true } },
} satisfies Prisma.TaskInclude;

export interface TaskListQuery extends PageInput {
  projectId?: string;
  assigneeId?: string;
  status?: string;
  mine?: string;
  due?: string;
  q?: string;
  topLevel?: boolean;
}

export async function listTasks(actor: Actor, query: TaskListQuery = {}) {
  const { page, pageSize, skip, take } = pageArgs(query, 50, 200);
  const and: Prisma.TaskWhereInput[] = [taskScope(actor)];
  if (query.topLevel !== false) and.push({ parentId: null });
  if (query.projectId) and.push({ projectId: query.projectId });
  if (query.mine === "1") and.push({ assigneeId: actor.userId });
  else if (query.assigneeId) and.push({ assigneeId: query.assigneeId });
  if (query.status) and.push({ status: { in: query.status.split(",") as TaskStatus[] } });
  const now = new Date();
  const eod = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (query.due === "today") and.push({ dueDate: { lt: eod }, status: { not: "COMPLETE" } });
  if (query.due === "overdue") and.push({ dueDate: { lt: now }, status: { not: "COMPLETE" } });
  if (query.due === "week") and.push({ dueDate: { lt: new Date(now.getTime() + 7 * 86400000) }, status: { not: "COMPLETE" } });
  if (query.q) and.push({ title: { contains: query.q, mode: "insensitive" } });
  const where: Prisma.TaskWhereInput = { AND: and };
  const [rows, total] = await Promise.all([
    db.task.findMany({ where, orderBy: [{ status: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }, { sortOrder: "asc" }], skip, take, include }),
    db.task.count({ where }),
  ]);
  return paged(rows, total, page, pageSize);
}

export async function createTask(actor: Actor, input: { projectId?: string | null; parentId?: string | null; title: string; description?: string; assigneeId?: string | null; priority?: Priority; dueDate?: Date | null; status?: TaskStatus }) {
  assertCan(actor, "tasks:write");
  if (input.projectId) await requireProject(actor, input.projectId);
  let projectId = input.projectId ?? null;
  if (input.parentId) {
    const parent = await db.task.findFirst({ where: { AND: [{ id: input.parentId }, taskScope(actor)] } });
    if (!parent) throw notFound("Parent task");
    projectId = parent.projectId;
  }
  if (input.assigneeId) {
    const u = await db.user.findFirst({ where: { id: input.assigneeId, workspaceId: actor.workspaceId, isStaff: true, status: { not: "SUSPENDED" } } });
    if (!u) throw badRequest("You can only assign tasks to active team members.");
  }
  const last = await db.task.aggregate({ where: { parentId: input.parentId ?? null, projectId }, _max: { sortOrder: true } });
  const t = await db.task.create({
    data: { workspaceId: actor.workspaceId, projectId, parentId: input.parentId ?? undefined, title: input.title.trim(), description: input.description, assigneeId: input.assigneeId ?? undefined, priority: input.priority ?? "NORMAL", dueDate: input.dueDate ?? undefined, status: input.status ?? "TODO", sortOrder: (last._max.sortOrder ?? 0) + 1, createdById: actor.userId },
    include,
  });
  if (t.assigneeId && t.assigneeId !== actor.userId) {
    await notify({ workspaceId: actor.workspaceId, userIds: [t.assigneeId], category: "PROJECT", type: "task.assigned", title: `New task: ${t.title}`, message: t.project ? `${t.project.name} (${t.project.code})` : undefined, link: `/editor/tasks`, email: false });
  }
  return t;
}

export async function updateTask(actor: Actor, id: string, patch: Partial<{ title: string; description: string | null; assigneeId: string | null; priority: Priority; dueDate: Date | null; status: TaskStatus; sortOrder: number }>) {
  assertCan(actor, "tasks:read");
  const t = await db.task.findFirst({ where: { AND: [{ id }, taskScope(actor)] } });
  if (!t) throw notFound("Task");
  // Editors may update status/details on tasks assigned to them; managing others' tasks needs tasks:write on the wider scope.
  if (!can(actor, "tasks:write")) throw forbidden();
  if (patch.assigneeId) {
    const u = await db.user.findFirst({ where: { id: patch.assigneeId, workspaceId: actor.workspaceId, isStaff: true, status: { not: "SUSPENDED" } } });
    if (!u) throw badRequest("You can only assign tasks to active team members.");
  }
  const updated = await db.task.update({ where: { id }, data: { ...patch, completedAt: patch.status === "COMPLETE" ? new Date() : patch.status ? null : undefined }, include });
  if (patch.status === "COMPLETE" && !t.parentId) {
    // completing a parent completes its checklist
    await db.task.updateMany({ where: { parentId: id, status: { not: "COMPLETE" } }, data: { status: "COMPLETE", completedAt: new Date() } });
  }
  if (patch.assigneeId && patch.assigneeId !== t.assigneeId && patch.assigneeId !== actor.userId) {
    await notify({ workspaceId: actor.workspaceId, userIds: [patch.assigneeId], category: "PROJECT", type: "task.assigned", title: `Task assigned: ${updated.title}`, link: `/editor/tasks`, email: false });
  }
  return updated;
}

export async function deleteTask(actor: Actor, id: string) {
  assertCan(actor, "tasks:write");
  const t = await db.task.findFirst({ where: { AND: [{ id }, taskScope(actor)] } });
  if (!t) throw notFound("Task");
  await db.task.delete({ where: { id } });
  await audit(actor, { workspaceId: actor.workspaceId, action: "task.deleted", entityType: "task", entityId: id, message: `${actor.name} deleted task “${t.title}”` });
  return { ok: true };
}

export async function listTaskComments(actor: Actor, taskId: string) {
  const t = await db.task.findFirst({ where: { AND: [{ id: taskId }, taskScope(actor)] } });
  if (!t) throw notFound("Task");
  return db.taskComment.findMany({ where: { taskId }, orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } } } });
}

export async function addTaskComment(actor: Actor, taskId: string, body: string) {
  assertCan(actor, "tasks:read");
  const t = await db.task.findFirst({ where: { AND: [{ id: taskId }, taskScope(actor)] } });
  if (!t) throw notFound("Task");
  if (!body.trim()) throw badRequest("Write a comment first.");
  const c = await db.taskComment.create({ data: { taskId, authorId: actor.userId, body: body.trim().slice(0, 3000) }, include: { author: { select: { name: true } } } });
  if (t.assigneeId && t.assigneeId !== actor.userId) await notify({ workspaceId: actor.workspaceId, userIds: [t.assigneeId], category: "PROJECT", type: "task.comment", title: `${actor.name} commented on “${t.title}”`, message: body.slice(0, 120), link: `/editor/tasks`, email: false });
  return c;
}
