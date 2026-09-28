import type { NoteEntity } from "@/generated/prisma/client";
import { db } from "../db";
import { badRequest, forbidden, notFound } from "../errors";
import { assertCan, can, type Actor } from "../auth/actor";
import { invoiceScope, leadScope, clientScope, projectScope, taskScope } from "../auth/access";
import { notify } from "./notifications";

/**
 * Internal notes live in their own table and are only reachable through staff endpoints that require
 * `notes:read`/`notes:write`. Portal (client) users can't authenticate against any route that touches this table.
 */
async function assertEntityAccess(actor: Actor, type: NoteEntity, id: string) {
  assertCan(actor, "notes:read");
  const ok =
    type === "LEAD" ? await db.lead.count({ where: { AND: [{ id }, leadScope(actor)] } })
    : type === "CLIENT" ? await db.client.count({ where: { AND: [{ id }, clientScope(actor)] } })
    : type === "PROJECT" ? await db.project.count({ where: { AND: [{ id }, projectScope(actor)] } })
    : type === "TASK" ? await db.task.count({ where: { AND: [{ id }, taskScope(actor)] } })
    : await db.invoice.count({ where: { AND: [{ id }, invoiceScope(actor)] } });
  if (!ok) throw notFound("Record");
}

export async function listNotes(actor: Actor, type: NoteEntity, id: string) {
  await assertEntityAccess(actor, type, id);
  const rows = await db.internalNote.findMany({ where: { workspaceId: actor.workspaceId, entityType: type, entityId: id }, orderBy: [{ pinned: "desc" }, { createdAt: "desc" }], include: { author: { select: { id: true, name: true } } } });
  return rows.map((n) => ({ id: n.id, body: n.body, pinned: n.pinned, createdAt: n.createdAt, author: n.author, mine: n.authorId === actor.userId, mentions: n.mentionUserIds }));
}

export async function addNote(actor: Actor, input: { entityType: NoteEntity; entityId: string; body: string; mentionUserIds?: string[]; pinned?: boolean }) {
  await assertEntityAccess(actor, input.entityType, input.entityId);
  assertCan(actor, "notes:write");
  const body = input.body.trim();
  if (!body) throw badRequest("Write a note first.", { body: "Required." });
  if (body.length > 5000) throw badRequest("Notes are limited to 5,000 characters.");
  let mentions: string[] = [];
  if (input.mentionUserIds?.length) {
    const valid = await db.user.findMany({ where: { id: { in: input.mentionUserIds }, workspaceId: actor.workspaceId, isStaff: true }, select: { id: true } });
    mentions = valid.map((v) => v.id);
  }
  const n = await db.internalNote.create({ data: { workspaceId: actor.workspaceId, entityType: input.entityType, entityId: input.entityId, authorId: actor.userId, body, mentionUserIds: mentions, pinned: !!input.pinned }, include: { author: { select: { id: true, name: true } } } });
  if (mentions.length) {
    const base = input.entityType === "PROJECT" ? `/admin/projects/${input.entityId}` : input.entityType === "LEAD" ? `/admin/leads/${input.entityId}` : input.entityType === "CLIENT" ? `/admin/clients/${input.entityId}` : input.entityType === "INVOICE" ? `/admin/invoices/${input.entityId}` : `/admin/tasks`;
    await notify({ workspaceId: actor.workspaceId, userIds: mentions, exclude: [actor.userId], category: "PROJECT", type: "note.mention", title: `${actor.name} mentioned you in an internal note`, message: body.slice(0, 140), link: base, email: false });
  }
  return { id: n.id, body: n.body, pinned: n.pinned, createdAt: n.createdAt, author: n.author, mine: true, mentions };
}

export async function deleteNote(actor: Actor, id: string) {
  const n = await db.internalNote.findFirst({ where: { id, workspaceId: actor.workspaceId } });
  if (!n) throw notFound("Note");
  assertCan(actor, "notes:write");
  if (n.authorId !== actor.userId && !can(actor, "settings:manage")) throw forbidden("You can only delete your own notes.");
  await db.internalNote.delete({ where: { id } });
  return { ok: true };
}

export async function pinNote(actor: Actor, id: string, pinned: boolean) {
  assertCan(actor, "notes:write");
  const n = await db.internalNote.findFirst({ where: { id, workspaceId: actor.workspaceId } });
  if (!n) throw notFound("Note");
  await assertEntityAccess(actor, n.entityType, n.entityId);
  await db.internalNote.update({ where: { id }, data: { pinned } });
  return { ok: true };
}
