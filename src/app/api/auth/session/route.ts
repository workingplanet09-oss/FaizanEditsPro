import { publicRoute } from "@/server/api";
import { db } from "@/server/db";
import { unreadCount } from "@/server/services/notifications";
import { integrationStatus } from "@/server/env";
import { googleConfigured } from "@/server/services/auth";

export const GET = publicRoute({}, async ({ actor }) => {
  if (!actor) return { user: null, providers: { google: googleConfigured(), demo: integrationStatus().demoMode } };
  const u = await db.user.findUnique({ where: { id: actor.userId }, select: { id: true, name: true, email: true, avatarUrl: true, twoFactorEnabled: true } });
  return { user: { ...u, isStaff: actor.isStaff, roles: actor.roleKeys, permissions: [...actor.permissions], orgs: actor.orgs, unreadNotifications: await unreadCount(actor) } };
});
