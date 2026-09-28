import { cache } from "react";
import { redirect, forbidden as nextForbidden } from "next/navigation";
import type { OrgMemberRole } from "@/generated/prisma/client";
import { db } from "../db";
import { AppError, forbidden } from "../errors";
import { sha256 } from "./crypto";
import { readSessionToken } from "./session";
import { homeForRoles, orgRoleCan, type OrgAction } from "@/lib/permissions";

export interface OrgMembership {
  organizationId: string;
  role: OrgMemberRole;
  orgName: string;
}

export interface Actor {
  userId: string;
  workspaceId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  isStaff: boolean;
  roleKeys: string[];
  permissions: Set<string>;
  orgs: OrgMembership[];
  twoFactorEnabled: boolean;
  sessionId: string;
  sessionHash: string;
  isDemo: boolean;
}

export async function actorFromToken(token: string | null | undefined): Promise<Actor | null> {
  if (!token) return null;
  const tokenHash = sha256(token);
  const s = await db.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: {
          roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
          memberships: { include: { organization: true } },
        },
      },
    },
  });
  if (!s || s.expiresAt < new Date() || s.twoFactorPending || s.user.status === "SUSPENDED") return null;

  // sliding expiry, written at most every 10 minutes
  if (Date.now() - s.lastUsedAt.getTime() > 10 * 60 * 1000) {
    void db.session.update({ where: { id: s.id }, data: { lastUsedAt: new Date(), expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000) } }).catch(() => {});
  }

  const u = s.user;
  const permissions = new Set<string>();
  for (const ur of u.roles) for (const rp of ur.role.permissions) permissions.add(rp.permission.key);
  return {
    userId: u.id,
    workspaceId: u.workspaceId,
    name: u.name,
    email: u.email,
    avatarUrl: u.avatarUrl,
    isStaff: u.isStaff,
    roleKeys: u.roles.map((r) => r.role.key),
    permissions: u.isStaff ? permissions : new Set<string>(),
    orgs: u.memberships.map((m) => ({ organizationId: m.organizationId, role: m.role, orgName: m.organization.name })),
    twoFactorEnabled: u.twoFactorEnabled,
    sessionId: s.id,
    sessionHash: tokenHash,
    isDemo: u.isDemo,
  };
}

/** Per-request memoised. Returns null when signed out. */
export const getActor = cache(async (): Promise<Actor | null> => actorFromToken(await readSessionToken()));

export async function requireActor(): Promise<Actor> {
  const a = await getActor();
  if (!a) throw new AppError("UNAUTHENTICATED", "Please sign in to continue.");
  return a;
}

export const can = (a: Actor, perm: string) => a.permissions.has(perm);
export const canAny = (a: Actor, perms: string[]) => perms.some((p) => a.permissions.has(p));

export function assertCan(a: Actor, ...perms: string[]) {
  if (!a.isStaff) throw forbidden();
  for (const p of perms) if (!a.permissions.has(p)) throw forbidden();
}
export function assertCanAny(a: Actor, ...perms: string[]) {
  if (!a.isStaff || !canAny(a, perms)) throw forbidden();
}

export const orgIdsOf = (a: Actor) => a.orgs.map((o) => o.organizationId);

/**
 * Client-side org authorization. Staff always pass here (their RBAC is checked separately);
 * portal users need a membership whose role allows the action.
 */
export function assertOrgAction(a: Actor, organizationId: string, action: OrgAction) {
  if (a.isStaff) return;
  const m = a.orgs.find((o) => o.organizationId === organizationId);
  if (!m) throw new AppError("NOT_FOUND", "Not found.");
  if (!orgRoleCan(m.role, action)) throw forbidden("Your role in this company doesn't allow that. Ask the account owner.");
}

// ─────────────────────────── page-level guards (Server Components / layouts) ───────────────────────────

export type Area = "admin" | "editor" | "client";

export async function requirePageActor(area: Area, nextPath?: string): Promise<Actor> {
  const a = await getActor();
  if (!a) redirect(`/login${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`);
  if (area === "admin" && !can(a, "admin:access")) {
    if (!a.isStaff) redirect("/dashboard");
    redirect(homeForRoles(a.roleKeys, a.permissions));
  }
  if (area === "editor" && !can(a, "editor:access")) {
    if (!a.isStaff) redirect("/dashboard");
    redirect(homeForRoles(a.roleKeys, a.permissions));
  }
  if (area === "client" && a.isStaff) redirect(homeForRoles(a.roleKeys, a.permissions));
  return a;
}

/** Use inside a page after loading data: renders the 403 page. */
export function denyPage(): never {
  nextForbidden();
}
