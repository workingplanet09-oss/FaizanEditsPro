import { db } from "../db";
import { AppError, badRequest, notFound } from "../errors";
import { assertCan, type Actor } from "../auth/actor";
import { destroyAllSessions } from "../auth/session";
import { audit } from "./audit";
import { inviteUserByEmail } from "./auth";

export async function listTeam(actor: Actor) {
  assertCan(actor, "team:manage");
  const users = await db.user.findMany({
    where: { workspaceId: actor.workspaceId, isStaff: true },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: { roles: { include: { role: true } }, _count: { select: { projectMemberships: true } } },
  });
  return users.map((u) => ({ id: u.id, name: u.name, email: u.email, status: u.status, roles: u.roles.map((r) => ({ key: r.role.key, name: r.role.name })), lastLoginAt: u.lastLoginAt, twoFactorEnabled: u.twoFactorEnabled, projects: u._count.projectMemberships, hourlyCost: u.hourlyCost }));
}

export async function listRoles(actor: Actor) {
  assertCan(actor, "team:manage");
  const roles = await db.role.findMany({ where: { isStaff: true }, orderBy: { rank: "desc" }, include: { permissions: { include: { permission: true } } } });
  return roles.map((r) => ({ key: r.key, name: r.name, description: r.description, rank: r.rank, permissions: r.permissions.map((p) => p.permission.key).sort() }));
}

async function assertCanGrant(actor: Actor, roleKeys: string[]) {
  const roles = await db.role.findMany({ where: { key: { in: roleKeys }, isStaff: true } });
  if (roles.length !== roleKeys.length) throw badRequest("Unknown role.");
  // only a super admin can create another super admin
  if (roleKeys.includes("super_admin") && !actor.roleKeys.includes("super_admin")) throw new AppError("FORBIDDEN", "Only a Super Admin can grant Super Admin.");
  return roles;
}

export async function inviteTeamMember(actor: Actor, input: { name: string; email: string; roleKeys: string[]; hourlyCost?: number | null }) {
  assertCan(actor, "team:manage");
  if (!input.roleKeys.length) throw badRequest("Choose at least one role.");
  await assertCanGrant(actor, input.roleKeys);
  const email = input.email.trim().toLowerCase();
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) throw new AppError("CONFLICT", "That email already has an account.", { fields: { email: "Already in use." } });
  const inv = await inviteUserByEmail({ workspaceId: actor.workspaceId, email, name: input.name.trim(), kind: "staff", roleKeys: input.roleKeys, invitedBy: actor });
  if (input.hourlyCost != null) await db.user.update({ where: { id: inv.userId }, data: { hourlyCost: input.hourlyCost } });
  await audit(actor, { workspaceId: actor.workspaceId, action: "team.invited", entityType: "user", entityId: inv.userId, message: `${actor.name} invited ${input.name} as ${input.roleKeys.join(", ")}` });
  return inv;
}

export async function updateTeamMember(actor: Actor, id: string, patch: { name?: string; roleKeys?: string[]; suspended?: boolean; hourlyCost?: number | null }) {
  assertCan(actor, "team:manage");
  const u = await db.user.findFirst({ where: { id, workspaceId: actor.workspaceId, isStaff: true }, include: { roles: { include: { role: true } } } });
  if (!u) throw notFound("Team member");
  const isSuper = u.roles.some((r) => r.role.key === "super_admin");
  if (isSuper && !actor.roleKeys.includes("super_admin")) throw new AppError("FORBIDDEN", "Only a Super Admin can change a Super Admin.");
  if (id === actor.userId && (patch.suspended || (patch.roleKeys && !patch.roleKeys.includes("super_admin") && isSuper))) throw badRequest("You can't lock yourself out.");
  if (patch.roleKeys) {
    if (!patch.roleKeys.length) throw badRequest("Choose at least one role.");
    const roles = await assertCanGrant(actor, patch.roleKeys);
    if (isSuper && !patch.roleKeys.includes("super_admin")) {
      const supers = await db.userRole.count({ where: { role: { key: "super_admin" }, user: { status: { not: "SUSPENDED" } } } });
      if (supers <= 1) throw badRequest("There must be at least one active Super Admin.");
    }
    await db.$transaction([db.userRole.deleteMany({ where: { userId: id } }), db.userRole.createMany({ data: roles.map((r) => ({ userId: id, roleId: r.id })) })]);
    await audit(actor, { workspaceId: actor.workspaceId, action: "team.roles_changed", entityType: "user", entityId: id, message: `${actor.name} set ${u.name}'s roles to ${patch.roleKeys.join(", ")}` });
  }
  if (patch.suspended !== undefined) {
    await db.user.update({ where: { id }, data: { status: patch.suspended ? "SUSPENDED" : "ACTIVE" } });
    if (patch.suspended) await destroyAllSessions(id);
    await audit(actor, { workspaceId: actor.workspaceId, action: patch.suspended ? "team.suspended" : "team.reactivated", entityType: "user", entityId: id, message: `${actor.name} ${patch.suspended ? "deactivated" : "reactivated"} ${u.name}` });
  }
  if (patch.name || patch.hourlyCost !== undefined) await db.user.update({ where: { id }, data: { ...(patch.name ? { name: patch.name } : {}), ...(patch.hourlyCost !== undefined ? { hourlyCost: patch.hourlyCost } : {}) } });
  return { ok: true };
}
