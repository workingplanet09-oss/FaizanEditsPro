import type { Prisma } from "@/generated/prisma/client";
import { can, orgIdsOf, type Actor } from "./actor";

/**
 * OWNERSHIP SCOPES — the single place that decides "which rows may this actor see?".
 * Every read/write of projects, assets, quotes, invoices, contracts, messages, versions and comments is
 * filtered through one of these, so tampering with an ID in a URL can never reach another client's data.
 * A row outside scope is indistinguishable from a missing row (404, never 403) to avoid leaking existence.
 */
const DENY = "__deny__";

export function projectScope(a: Actor): Prisma.ProjectWhereInput {
  const base: Prisma.ProjectWhereInput = { workspaceId: a.workspaceId };
  if (!a.isStaff) return { ...base, organizationId: { in: orgIdsOf(a) }, clientVisible: true };
  if (can(a, "projects:read_all")) return base;
  if (can(a, "projects:read_assigned")) {
    return { ...base, OR: [{ managerId: a.userId }, { members: { some: { userId: a.userId } } }] };
  }
  return { ...base, id: DENY };
}

export const projectWhere = (a: Actor, id: string): Prisma.ProjectWhereInput => ({ AND: [{ id }, projectScope(a)] });

export function clientScope(a: Actor): Prisma.ClientWhereInput {
  const base: Prisma.ClientWhereInput = { workspaceId: a.workspaceId };
  if (!a.isStaff) return { ...base, organizationId: { in: orgIdsOf(a) } };
  if (can(a, "clients:read")) return base;
  return { ...base, id: DENY };
}

export function leadScope(a: Actor): Prisma.LeadWhereInput {
  const base: Prisma.LeadWhereInput = { workspaceId: a.workspaceId };
  if (!a.isStaff || !can(a, "leads:read")) return { ...base, id: DENY };
  return base;
}

export function quoteScope(a: Actor): Prisma.QuoteWhereInput {
  const base: Prisma.QuoteWhereInput = { workspaceId: a.workspaceId };
  if (!a.isStaff) return { ...base, organizationId: { in: orgIdsOf(a) }, status: { not: "DRAFT" } };
  if (can(a, "quotes:read")) return base;
  return { ...base, id: DENY };
}

export function contractScope(a: Actor): Prisma.ContractWhereInput {
  const base: Prisma.ContractWhereInput = { workspaceId: a.workspaceId };
  if (!a.isStaff) return { ...base, organizationId: { in: orgIdsOf(a) }, status: { not: "DRAFT" } };
  if (can(a, "contracts:read")) return base;
  return { ...base, id: DENY };
}

export function invoiceScope(a: Actor): Prisma.InvoiceWhereInput {
  const base: Prisma.InvoiceWhereInput = { workspaceId: a.workspaceId };
  if (!a.isStaff) return { ...base, organizationId: { in: orgIdsOf(a) }, status: { not: "DRAFT" } };
  if (can(a, "invoices:read")) return base;
  return { ...base, id: DENY };
}

export function paymentScope(a: Actor): Prisma.PaymentWhereInput {
  const base: Prisma.PaymentWhereInput = { workspaceId: a.workspaceId };
  if (!a.isStaff) return { ...base, organizationId: { in: orgIdsOf(a) } };
  if (can(a, "payments:read")) return base;
  return { ...base, id: DENY };
}

export function retainerScope(a: Actor): Prisma.RetainerWhereInput {
  const base: Prisma.RetainerWhereInput = { workspaceId: a.workspaceId };
  if (!a.isStaff) return { ...base, organizationId: { in: orgIdsOf(a) } };
  if (can(a, "retainers:manage") || can(a, "clients:read")) return base;
  return { ...base, id: DENY };
}

export function assetScope(a: Actor): Prisma.AssetWhereInput {
  const base: Prisma.AssetWhereInput = { workspaceId: a.workspaceId, deletedAt: null };
  if (!a.isStaff) {
    return {
      ...base,
      visibleToClient: true,
      status: { in: ["READY", "PROCESSING", "UPLOADING"] },
      OR: [
        { project: { organizationId: { in: orgIdsOf(a) }, clientVisible: true } },
        { projectId: null, client: { organizationId: { in: orgIdsOf(a) } } },
      ],
    };
  }
  if (!can(a, "files:read")) return { ...base, id: DENY };
  const or: Prisma.AssetWhereInput[] = [{ project: projectScope(a) }];
  if (can(a, "clients:read") || can(a, "leads:read")) or.push({ projectId: null });
  return { ...base, OR: or };
}

export function versionScope(a: Actor): Prisma.VideoVersionWhereInput {
  const base: Prisma.VideoVersionWhereInput = { workspaceId: a.workspaceId, project: projectScope(a) };
  if (!a.isStaff) return { ...base, releasedAt: { not: null } };
  if (!can(a, "files:read") && !can(a, "versions:upload") && !can(a, "projects:read_all")) return { ...base, id: DENY };
  return base;
}

export function commentScope(a: Actor): Prisma.VideoCommentWhereInput {
  return { workspaceId: a.workspaceId, version: versionScope(a) };
}

export function messageScope(a: Actor): Prisma.MessageWhereInput {
  const base: Prisma.MessageWhereInput = { workspaceId: a.workspaceId };
  if (!a.isStaff) return { ...base, organizationId: { in: orgIdsOf(a) } };
  if (!can(a, "messages:read")) return { ...base, id: DENY };
  if (can(a, "projects:read_all")) return base;
  return { ...base, project: projectScope(a) };
}

export function taskScope(a: Actor): Prisma.TaskWhereInput {
  const base: Prisma.TaskWhereInput = { workspaceId: a.workspaceId };
  if (!a.isStaff || !can(a, "tasks:read")) return { ...base, id: DENY };
  if (can(a, "projects:read_all")) return base;
  return { ...base, OR: [{ assigneeId: a.userId }, { project: projectScope(a) }] };
}

export function changeRequestScope(a: Actor): Prisma.ChangeRequestWhereInput {
  return { workspaceId: a.workspaceId, project: projectScope(a) };
}

export function fileRequestScope(a: Actor): Prisma.FileRequestWhereInput {
  return { workspaceId: a.workspaceId, project: projectScope(a) };
}
