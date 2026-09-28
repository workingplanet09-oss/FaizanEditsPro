import type { MessageGroup, Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import { AppError, badRequest, forbidden, notFound } from "../errors";
import { assertCan, assertOrgAction, can, type Actor } from "../auth/actor";
import { messageScope, projectScope } from "../auth/access";
import { emit } from "../events/bus";
import { rateLimit } from "../security/ratelimit";
import { primaryClientFor } from "./clients";
import { notify } from "./notifications";
import { requireProject } from "./projects";
import { formatTimecode } from "@/lib/format";

const URL_RE = /https?:\/\/[^\s<>()]+/gi;

const mDto = (m: any, me: string) => ({
  id: m.id,
  projectId: m.projectId,
  body: m.body,
  links: m.links as string[],
  recipientGroup: m.recipientGroup as MessageGroup,
  mentionUserIds: m.mentionUserIds as string[],
  createdAt: m.createdAt,
  sender: { id: m.sender.id, name: m.sender.name, isStaff: m.sender.isStaff, avatarUrl: m.sender.avatarUrl ?? null },
  mine: m.senderId === me,
  read: m.senderId === me || (m.reads?.length ?? 0) > 0,
  attachments: (m.attachments ?? []).map((a: any) => ({ assetId: a.assetId, name: a.asset.displayName, mimeType: a.asset.mimeType, sizeBytes: Number(a.asset.sizeBytes) })),
});
export type MessageDTO = ReturnType<typeof mDto>;

const include = (me: string) => ({
  sender: { select: { id: true, name: true, isStaff: true, avatarUrl: true } },
  attachments: { include: { asset: { select: { displayName: true, mimeType: true, sizeBytes: true } } } },
  reads: { where: { userId: me } },
}) satisfies Prisma.MessageInclude;

export async function sendMessage(actor: Actor, input: { projectId?: string | null; clientId?: string | null; body: string; recipientGroup?: MessageGroup; mentionUserIds?: string[]; attachmentAssetIds?: string[] }) {
  rateLimit(`msg:${actor.userId}`, 60, 60_000, "You're sending messages very quickly. Give it a second.");
  const body = input.body.trim();
  if (!body && !input.attachmentAssetIds?.length) throw badRequest("Write a message first.", { body: "Required." });
  if (body.length > 5000) throw badRequest("Messages are limited to 5,000 characters.", { body: "Too long." });

  let projectId: string | null = null;
  let clientId: string;
  let organizationId: string;
  let projectName: string | null = null;
  if (input.projectId) {
    const p = await requireProject(actor, input.projectId);
    projectId = p.id;
    clientId = p.clientId;
    organizationId = p.organizationId;
    projectName = p.name;
  } else if (actor.isStaff) {
    if (!input.clientId) throw badRequest("Choose a client or project to message.");
    const c = await db.client.findFirst({ where: { id: input.clientId, workspaceId: actor.workspaceId } });
    if (!c) throw notFound("Client");
    clientId = c.id;
    organizationId = c.organizationId;
  } else {
    const c = await primaryClientFor(actor);
    if (!c) throw new AppError("NOT_FOUND", "No company is linked to your account yet.");
    clientId = c.id;
    organizationId = c.organizationId;
  }

  let group: MessageGroup;
  if (actor.isStaff) {
    assertCan(actor, "messages:write");
    group = "CLIENT";
  } else {
    assertOrgAction(actor, organizationId, "message");
    group = input.recipientGroup && input.recipientGroup !== "CLIENT" ? input.recipientGroup : projectId ? "PROJECT_MANAGER" : "SUPPORT";
  }

  if (input.attachmentAssetIds?.length) {
    const ok = await db.asset.count({ where: { id: { in: input.attachmentAssetIds }, uploadedById: actor.userId, deletedAt: null, status: "READY", ...(projectId ? { projectId } : {}) } });
    if (ok !== input.attachmentAssetIds.length) throw badRequest("One of the attachments isn't available.");
  }
  // mentions must be people who can actually see this conversation
  let mentions: string[] = [];
  if (input.mentionUserIds?.length && actor.isStaff) {
    const valid = await db.user.findMany({ where: { id: { in: input.mentionUserIds }, workspaceId: actor.workspaceId, isStaff: true }, select: { id: true } });
    mentions = valid.map((v) => v.id);
  }

  const m = await db.message.create({
    data: {
      workspaceId: actor.workspaceId,
      organizationId,
      clientId,
      projectId,
      senderId: actor.userId,
      recipientGroup: group,
      body,
      links: [...new Set(body.match(URL_RE) ?? [])].slice(0, 10),
      mentionUserIds: mentions,
      isDemo: actor.isDemo,
      attachments: input.attachmentAssetIds?.length ? { create: input.attachmentAssetIds.map((assetId) => ({ assetId })) } : undefined,
    },
    include: include(actor.userId),
  });
  await db.messageRead.create({ data: { messageId: m.id, userId: actor.userId } });

  const preview = body.slice(0, 140) || "Sent an attachment";
  if (actor.isStaff) {
    // notify the client's team (owners / managers / the assistant who wrote in)
    const members = await db.organizationMember.findMany({ where: { organizationId, role: { in: ["OWNER", "MANAGER"] } }, select: { userId: true } });
    await notify({ workspaceId: actor.workspaceId, userIds: members.map((x) => x.userId), category: "MESSAGE", type: "message.reply", title: `New message from ${actor.name}`, message: preview, link: projectId ? `/dashboard/projects/${projectId}?tab=messages` : "/dashboard/messages", email: true, emailTemplate: "new_message", emailVars: { message_preview: preview, project_name: projectName ?? "your account" } });
    if (mentions.length) await notify({ workspaceId: actor.workspaceId, userIds: mentions, exclude: [actor.userId], category: "MESSAGE", type: "message.mention", title: `${actor.name} mentioned you`, message: preview, link: projectId ? `/admin/projects/${projectId}` : "/admin/messages", email: false });
  } else {
    let staff: string[] = [];
    if (projectId) {
      const members = await db.projectMember.findMany({ where: { projectId }, select: { userId: true, role: true } });
      const p = await db.project.findUnique({ where: { id: projectId }, select: { managerId: true } });
      if (group === "PROJECT_MANAGER") staff = [p?.managerId, ...members.filter((x) => x.role === "MANAGER").map((x) => x.userId)].filter((x): x is string => !!x);
      else if (group === "EDITOR") staff = members.filter((x) => x.role === "EDITOR" || x.role === "MOTION_DESIGNER").map((x) => x.userId);
    }
    if (!staff.length) {
      const support = await db.user.findMany({ where: { workspaceId: actor.workspaceId, isStaff: true, status: { not: "SUSPENDED" }, roles: { some: { role: { key: { in: ["super_admin", "admin", "support", "project_manager"] } } } } }, select: { id: true } });
      staff = support.map((s) => s.id);
    }
    await notify({ workspaceId: actor.workspaceId, userIds: staff, category: "MESSAGE", type: "message.received", title: `${actor.name} sent a message${projectName ? ` on ${projectName}` : ""}`, message: preview, link: projectId ? `/admin/projects/${projectId}?tab=messages` : "/admin/messages", email: false });
    await emit("message.received", { workspaceId: actor.workspaceId, actorId: actor.userId, projectId: projectId ?? undefined, clientId, messageId: m.id });
    await db.client.update({ where: { id: clientId }, data: { lastContactAt: new Date() } });
  }
  return mDto(m, actor.userId);
}

export async function listMessages(actor: Actor, opts: { projectId?: string | null; clientId?: string | null; limit?: number; markRead?: boolean }) {
  const where: Prisma.MessageWhereInput = { AND: [messageScope(actor)] };
  if (opts.projectId) {
    await requireProject(actor, opts.projectId);
    (where.AND as Prisma.MessageWhereInput[]).push({ projectId: opts.projectId });
  } else if (opts.clientId) {
    (where.AND as Prisma.MessageWhereInput[]).push({ clientId: opts.clientId, projectId: null });
  } else if (!actor.isStaff) {
    (where.AND as Prisma.MessageWhereInput[]).push({ projectId: null });
  }
  const rows = await db.message.findMany({ where, orderBy: { createdAt: "asc" }, take: opts.limit ?? 200, include: include(actor.userId) });
  if (opts.markRead) {
    const unread = rows.filter((r) => r.senderId !== actor.userId && r.reads.length === 0).map((r) => r.id);
    if (unread.length) await db.messageRead.createMany({ data: unread.map((messageId) => ({ messageId, userId: actor.userId })), skipDuplicates: true });
  }
  return rows.map((r) => mDto(opts.markRead ? { ...r, reads: [1] } : r, actor.userId));
}

/** Conversation list for the Messages page: one thread per project plus the general support thread. */
export async function listThreads(actor: Actor) {
  const scope = messageScope(actor);
  const grouped = await db.message.groupBy({ by: ["projectId", "clientId"], where: scope, _max: { createdAt: true }, _count: { _all: true }, orderBy: { _max: { createdAt: "desc" } }, take: 60 });
  if (!grouped.length) return [];
  const projectIds = grouped.map((g) => g.projectId).filter((x): x is string => !!x);
  const clientIds = [...new Set(grouped.map((g) => g.clientId))];
  const [projects, clients, unread, lasts] = await Promise.all([
    db.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true, code: true } }),
    db.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, companyName: true, name: true } }),
    db.message.groupBy({ by: ["projectId", "clientId"], where: { AND: [scope, { senderId: { not: actor.userId }, reads: { none: { userId: actor.userId } } }] }, _count: { _all: true } }),
    Promise.all(grouped.map((g) => db.message.findFirst({ where: { AND: [scope, { projectId: g.projectId, clientId: g.clientId }] }, orderBy: { createdAt: "desc" }, select: { body: true, sender: { select: { name: true } } } }))),
  ]);
  const pm = new Map(projects.map((p) => [p.id, p]));
  const cm = new Map(clients.map((c) => [c.id, c]));
  const um = new Map(unread.map((u) => [`${u.projectId}|${u.clientId}`, u._count._all]));
  return grouped.map((g, i) => ({
    key: `${g.projectId ?? "general"}:${g.clientId}`,
    projectId: g.projectId,
    clientId: g.clientId,
    title: g.projectId ? pm.get(g.projectId)?.name ?? "Project" : "General & support",
    code: g.projectId ? pm.get(g.projectId)?.code ?? null : null,
    client: cm.get(g.clientId)?.companyName ?? null,
    lastAt: g._max.createdAt!,
    lastPreview: lasts[i] ? `${lasts[i]!.sender.name}: ${lasts[i]!.body.slice(0, 80)}` : "",
    unread: um.get(`${g.projectId}|${g.clientId}`) ?? 0,
    count: g._count._all,
  }));
}

export async function unreadMessageCount(actor: Actor) {
  return db.message.count({ where: { AND: [messageScope(actor), { senderId: { not: actor.userId }, reads: { none: { userId: actor.userId } } }] } });
}

export async function recentUnread(actor: Actor, limit = 5) {
  const rows = await db.message.findMany({ where: { AND: [messageScope(actor), { senderId: { not: actor.userId }, reads: { none: { userId: actor.userId } } }] }, orderBy: { createdAt: "desc" }, take: limit, include: { sender: { select: { name: true } }, project: { select: { id: true, name: true } } } });
  return rows.map((r) => ({ id: r.id, from: r.sender.name, body: r.body.slice(0, 120), at: r.createdAt, projectId: r.projectId, projectName: r.project?.name ?? null }));
}

export { projectScope, forbidden, can, formatTimecode };
