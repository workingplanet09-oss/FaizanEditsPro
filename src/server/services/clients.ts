import type { ClientStatus, OrgMemberRole, Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "../db";
import { AppError, badRequest, notFound } from "../errors";
import { randomToken } from "../auth/crypto";
import { assertCan, assertOrgAction, can, orgIdsOf, type Actor } from "../auth/actor";
import { clientScope } from "../auth/access";
import { audit, logActivity } from "./audit";
import { pageArgs, paged, type PageInput } from "./common";
import { slugify } from "@/lib/slug";

const genReferralCode = () => `FE-${randomToken(5).replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase()}`;

export interface CreateClientInput {
  workspaceId: string;
  name: string;
  email: string;
  companyName: string;
  phone?: string | null;
  industry?: string | null;
  website?: string | null;
  socialLinks?: Record<string, string> | null;
  country?: string | null;
  timezone?: string | null;
  status?: ClientStatus;
  source?: string | null;
  userId?: string | null;
  referralCode?: string | null;
  managerId?: string | null;
  tags?: string[];
  isDemo?: boolean;
}

async function uniqueOrgSlug(tx: Tx | typeof db, workspaceId: string, base: string) {
  const root = slugify(base) || "client";
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? root : `${root}-${i + 1}`;
    if (!(await tx.organization.findUnique({ where: { workspaceId_slug: { workspaceId, slug } } }))) return slug;
  }
  return `${root}-${randomToken(3).toLowerCase()}`;
}

/** Creates the company (organization), client record, profile, brand kit and referral code as one unit. */
export async function createClientRecord(input: CreateClientInput) {
  return db.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        workspaceId: input.workspaceId,
        name: input.companyName,
        slug: await uniqueOrgSlug(tx, input.workspaceId, input.companyName),
        website: input.website ?? undefined,
        billingEmail: input.email,
        isDemo: input.isDemo ?? false,
      },
    });
    const client = await tx.client.create({
      data: {
        workspaceId: input.workspaceId,
        organizationId: org.id,
        userId: input.userId ?? undefined,
        name: input.name,
        email: input.email,
        phone: input.phone ?? undefined,
        companyName: input.companyName,
        industry: input.industry ?? undefined,
        website: input.website ?? undefined,
        socialLinks: (input.socialLinks ?? undefined) as Prisma.InputJsonValue | undefined,
        country: input.country ?? undefined,
        timezone: input.timezone ?? undefined,
        status: input.status ?? "PROSPECT",
        source: input.source ?? undefined,
        managerId: input.managerId ?? undefined,
        tags: input.tags ?? [],
        referralCode: genReferralCode(),
        isDemo: input.isDemo ?? false,
        profile: { create: {} },
        brandKit: { create: { websiteUrl: input.website ?? undefined } },
      },
    });
    if (input.userId) {
      await tx.organizationMember.create({ data: { organizationId: org.id, userId: input.userId, role: "OWNER", title: "Owner" } });
    }
    if (input.referralCode) {
      const referrer = await tx.client.findFirst({ where: { workspaceId: input.workspaceId, referralCode: input.referralCode.toUpperCase() } });
      if (referrer) {
        await tx.referral.create({ data: { workspaceId: input.workspaceId, code: referrer.referralCode!, referrerClientId: referrer.id, referredClientId: client.id, status: "PENDING" } });
      }
    }
    return { ...client, organization: org };
  });
}

// ───────────────────────────── lists & detail (staff) ─────────────────────────────

export interface ClientListQuery extends PageInput {
  q?: string;
  status?: string;
  section?: "active" | "inactive" | "retainers" | "prospects";
  sort?: string;
}

export async function listClients(actor: Actor, query: ClientListQuery = {}) {
  assertCan(actor, "clients:read");
  const { page, pageSize, skip, take } = pageArgs(query);
  const where: Prisma.ClientWhereInput = { ...clientScope(actor), archivedAt: null };
  if (query.status) where.status = query.status as ClientStatus;
  if (query.section === "active") where.status = { in: ["ACTIVE", "ONBOARDING"] };
  if (query.section === "inactive") where.status = { in: ["INACTIVE", "ARCHIVED"] };
  if (query.section === "retainers") where.status = "RETAINER";
  if (query.section === "prospects") where.status = { in: ["LEAD", "PROSPECT"] };
  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: "insensitive" } },
      { companyName: { contains: query.q, mode: "insensitive" } },
      { email: { contains: query.q, mode: "insensitive" } },
    ];
  }
  const orderBy: Prisma.ClientOrderByWithRelationInput = query.sort === "oldest" ? { createdAt: "asc" } : query.sort === "name" ? { companyName: "asc" } : { updatedAt: "desc" };
  const [rows, total] = await Promise.all([
    db.client.findMany({
      where,
      orderBy,
      skip,
      take,
      include: { _count: { select: { projects: true } }, projects: { where: { status: { notIn: ["DELIVERED", "ARCHIVED", "CANCELLED"] } }, select: { id: true } }, manager: { select: { name: true } } },
    }),
    db.client.count({ where }),
  ]);
  return paged(
    rows.map((c) => ({ ...c, activeProjects: c.projects.length, totalProjects: c._count.projects, projects: undefined, _count: undefined })),
    total,
    page,
    pageSize,
  );
}

export async function getClientOrThrow(actor: Actor, id: string) {
  const c = await db.client.findFirst({ where: { AND: [{ id }, clientScope(actor)] }, include: { organization: true, profile: true, brandKit: true, manager: { select: { id: true, name: true } }, user: { select: { id: true, name: true, email: true, lastLoginAt: true, status: true } } } });
  if (!c) throw notFound("Client");
  return c;
}

/** Per-currency lifetime figures — we never add up amounts of different currencies. */
export async function clientLifetime(clientId: string) {
  const [projects, payments, retainer, lastMsg] = await Promise.all([
    db.project.findMany({ where: { clientId }, select: { id: true, status: true, name: true, createdAt: true, currency: true } }),
    db.payment.findMany({ where: { clientId, status: "SUCCEEDED" }, select: { amount: true, currency: true } }),
    db.retainer.findFirst({ where: { clientId, status: "ACTIVE" }, select: { id: true, name: true, monthlyPrice: true, currency: true, renewalDate: true } }),
    db.message.findFirst({ where: { clientId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  const revenue: Record<string, number> = {};
  for (const p of payments) revenue[p.currency] = (revenue[p.currency] ?? 0) + p.amount;
  const projectCount = projects.length;
  const avg: Record<string, number> = {};
  if (projectCount) for (const [cur, v] of Object.entries(revenue)) avg[cur] = Math.round(v / projectCount);
  const last = [...projects].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  return {
    totalProjects: projectCount,
    activeProjects: projects.filter((p) => !["DELIVERED", "ARCHIVED", "CANCELLED"].includes(p.status)).length,
    revenue,
    averageProjectValue: avg,
    lastProject: last ? { id: last.id, name: last.name, at: last.createdAt } : null,
    currentRetainer: retainer,
    lastContact: lastMsg?.createdAt ?? null,
  };
}

export async function updateClient(
  actor: Actor,
  id: string,
  patch: Partial<{ name: string; email: string; phone: string | null; companyName: string; industry: string | null; website: string | null; country: string | null; timezone: string | null; status: ClientStatus; tags: string[]; managerId: string | null; socialLinks: Record<string, string>; lastContactAt: Date }>,
) {
  assertCan(actor, "clients:write");
  const before = await getClientOrThrow(actor, id);
  const { socialLinks, ...rest } = patch;
  const updated = await db.client.update({ where: { id }, data: { ...rest, ...(socialLinks ? { socialLinks } : {}) } });
  if (patch.companyName && patch.companyName !== before.organization.name) await db.organization.update({ where: { id: before.organizationId }, data: { name: patch.companyName } });
  if (patch.status && patch.status !== before.status) {
    await audit(actor, { workspaceId: actor.workspaceId, action: "client.status_changed", entityType: "client", entityId: id, message: `${actor.name} changed ${before.companyName} from ${before.status} to ${patch.status}` });
    await logActivity(actor, { workspaceId: actor.workspaceId, type: "client.status_changed", message: `${actor.name} set client status to ${patch.status}`, clientId: id });
  }
  return updated;
}

// ───────────────────────────── portal helpers ─────────────────────────────

/** The client record a portal user acts on behalf of (their first / selected organization). */
export async function primaryClientFor(actor: Actor, organizationId?: string) {
  const orgIds = organizationId ? [organizationId] : orgIdsOf(actor);
  if (organizationId && !orgIdsOf(actor).includes(organizationId) && !actor.isStaff) throw notFound("Company");
  const client = await db.client.findFirst({ where: { organizationId: { in: orgIds }, workspaceId: actor.workspaceId }, orderBy: { createdAt: "asc" }, include: { organization: true, profile: true, brandKit: true } });
  return client;
}

// ───────────────────────────── organization members ─────────────────────────────

export async function listMembers(actor: Actor, organizationId: string) {
  assertOrgAction(actor, organizationId, "view");
  if (actor.isStaff) {
    assertCan(actor, "clients:read");
    if (!(await db.organization.count({ where: { id: organizationId, workspaceId: actor.workspaceId } }))) throw notFound("Company");
  }
  const rows = await db.organizationMember.findMany({ where: { organizationId }, include: { user: { select: { id: true, name: true, email: true, status: true, lastLoginAt: true, avatarUrl: true } } }, orderBy: { createdAt: "asc" } });
  return rows;
}

export async function addMember(actor: Actor, input: { organizationId: string; email: string; name: string; role: OrgMemberRole; title?: string }) {
  assertOrgAction(actor, input.organizationId, "manage_members");
  if (actor.isStaff) assertCan(actor, "clients:write");
  const { inviteUserByEmail } = await import("./auth");
  const org = await db.organization.findFirst({ where: { id: input.organizationId, workspaceId: actor.workspaceId } });
  if (!org) throw notFound("Company");
  const email = input.email.trim().toLowerCase();
  const existing = await db.user.findUnique({ where: { email }, select: { isStaff: true } });
  if (existing?.isStaff) throw badRequest("That email belongs to a studio team member and can't be added as a client.");
  const inv = await inviteUserByEmail({ workspaceId: actor.workspaceId, email, name: input.name, kind: "client", invitedBy: actor });
  await db.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: input.organizationId, userId: inv.userId } },
    create: { organizationId: input.organizationId, userId: inv.userId, role: input.role, title: input.title },
    update: { role: input.role, title: input.title },
  });
  await audit(actor, { workspaceId: actor.workspaceId, action: "org.member_added", entityType: "organization", entityId: input.organizationId, message: `${actor.name} added ${input.name} (${input.role}) to ${org.name}` });
  return { userId: inv.userId };
}

export async function updateMember(actor: Actor, memberId: string, patch: { role?: OrgMemberRole; title?: string }) {
  const m = await db.organizationMember.findUnique({ where: { id: memberId } });
  if (!m) throw notFound("Member");
  assertOrgAction(actor, m.organizationId, "manage_members");
  if (m.role === "OWNER" && patch.role && patch.role !== "OWNER") {
    const owners = await db.organizationMember.count({ where: { organizationId: m.organizationId, role: "OWNER" } });
    if (owners <= 1) throw badRequest("A company needs at least one owner.");
  }
  return db.organizationMember.update({ where: { id: memberId }, data: patch });
}

export async function removeMember(actor: Actor, memberId: string) {
  const m = await db.organizationMember.findUnique({ where: { id: memberId } });
  if (!m) throw notFound("Member");
  assertOrgAction(actor, m.organizationId, "manage_members");
  if (m.role === "OWNER") {
    const owners = await db.organizationMember.count({ where: { organizationId: m.organizationId, role: "OWNER" } });
    if (owners <= 1) throw badRequest("A company needs at least one owner.");
  }
  await db.organizationMember.delete({ where: { id: memberId } });
  return { ok: true };
}

// ───────────────────────────── brand kit ─────────────────────────────

export async function getBrandKit(actor: Actor, clientId: string) {
  const c = await db.client.findFirst({ where: { AND: [{ id: clientId }, clientScope(actor)] }, include: { brandKit: true } });
  if (!c) throw notFound("Client");
  return c.brandKit ?? (await db.clientBrandKit.create({ data: { clientId } }));
}

/** Files uploaded to the client's brand kit (not tied to any project). */
export async function listBrandAssets(actor: Actor, clientId: string) {
  const c = await db.client.findFirst({ where: { AND: [{ id: clientId }, clientScope(actor)] }, select: { id: true } });
  if (!c) throw notFound("Client");
  const rows = await db.asset.findMany({ where: { clientId, projectId: null, deletedAt: null, status: "READY" }, orderBy: { createdAt: "desc" }, select: { id: true, displayName: true, mimeType: true, sizeBytes: true, createdAt: true, thumbnailKey: true } });
  return rows.map((a) => ({ id: a.id, displayName: a.displayName, mimeType: a.mimeType, sizeBytes: Number(a.sizeBytes), createdAt: a.createdAt, hasThumbnail: !!a.thumbnailKey, status: "READY", version: 1, folderKey: null, folderName: null }));
}

export interface BrandKitPatch {
  logoAssetId?: string | null;
  altLogoAssetIds?: string[];
  colors?: { name: string; hex: string }[];
  fonts?: { name: string; usage?: string }[];
  typographyRules?: string | null;
  guidelinesAssetId?: string | null;
  introAssetId?: string | null;
  outroAssetId?: string | null;
  watermarkAssetId?: string | null;
  lowerThirdAssetIds?: string[];
  musicPreference?: string | null;
  socialHandles?: Record<string, string>;
  websiteUrl?: string | null;
}

export async function saveBrandKit(actor: Actor, clientId: string, patch: BrandKitPatch) {
  const c = await db.client.findFirst({ where: { AND: [{ id: clientId }, clientScope(actor)] } });
  if (!c) throw notFound("Client");
  if (actor.isStaff) assertCan(actor, "clients:write");
  else assertOrgAction(actor, c.organizationId, "manage_projects");

  // Any referenced asset must belong to this client (brand assets are uploaded against the client).
  const ids = [patch.logoAssetId, patch.guidelinesAssetId, patch.introAssetId, patch.outroAssetId, patch.watermarkAssetId, ...(patch.altLogoAssetIds ?? []), ...(patch.lowerThirdAssetIds ?? [])].filter((x): x is string => !!x);
  if (ids.length) {
    const ok = await db.asset.count({ where: { id: { in: ids }, clientId, projectId: null, deletedAt: null } });
    if (ok !== new Set(ids).size) throw badRequest("One of the selected brand assets doesn't belong to this account.");
  }
  const data: Prisma.ClientBrandKitUncheckedUpdateInput = { ...patch } as any;
  return db.clientBrandKit.upsert({ where: { clientId }, create: { clientId, ...(data as any) }, update: data });
}

// ───────────────────────────── onboarding checklist ─────────────────────────────

export interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
  href?: string;
  hint?: string;
}

export async function onboardingChecklist(actor: Actor, clientId: string) {
  const c = await getClientOrThrow(actor, clientId);
  const [signed, paid, assets, briefs, projects] = await Promise.all([
    db.contract.count({ where: { clientId, status: "SIGNED" } }),
    db.payment.count({ where: { clientId, status: "SUCCEEDED" } }),
    db.asset.count({ where: { OR: [{ clientId }, { project: { clientId } }], deletedAt: null, status: "READY" } }),
    db.projectBrief.count({ where: { project: { clientId }, confirmedAt: { not: null } } }),
    db.project.count({ where: { clientId } }),
  ]);
  const kit = c.brandKit;
  const brandDone = !!(kit && (kit.logoAssetId || (Array.isArray(kit.colors) && (kit.colors as any[]).length) || (Array.isArray(kit.fonts) && (kit.fonts as any[]).length)));
  const items: ChecklistItem[] = [
    { key: "account", label: "Account created", done: !!c.userId },
    { key: "contact", label: "Contact information", done: !!(c.name && c.email && c.phone), href: "/dashboard/profile", hint: "Add a phone number so we can reach you." },
    { key: "company", label: "Company information", done: !!(c.companyName && (c.industry || c.website)), href: "/dashboard/profile", hint: "Add your industry or website." },
    { key: "brand", label: "Brand assets", done: brandDone, href: "/dashboard/brand-kit", hint: "Save your logo, colors and fonts once." },
    { key: "requirements", label: "Project requirements", done: projects > 0 && briefs > 0, href: "/dashboard/projects" },
    { key: "billing", label: "Billing information", done: !!(c.organization.billingEmail && c.organization.billingAddress), href: "/dashboard/settings", hint: "Add a billing address." },
    { key: "contract", label: "Contract signed", done: signed > 0, href: "/dashboard/contracts" },
    { key: "payment", label: "Initial payment received", done: paid > 0, href: "/dashboard/invoices" },
    { key: "files", label: "Files uploaded", done: assets > 0, href: "/dashboard/files" },
    { key: "brief", label: "Project brief approved", done: briefs > 0, href: "/dashboard/projects" },
  ];
  const manual = ((c.profile?.checklist ?? {}) as Record<string, boolean>) || {};
  for (const it of items) if (manual[it.key]) it.done = true;
  return { items, done: items.filter((i) => i.done).length, total: items.length };
}

export async function updateClientProfile(actor: Actor, clientId: string, patch: { brandSummary?: string | null; editingPreferences?: string | null; preferredContact?: string | null; communicationPrefs?: Record<string, unknown> }) {
  const c = await db.client.findFirst({ where: { AND: [{ id: clientId }, clientScope(actor)] } });
  if (!c) throw notFound("Client");
  if (actor.isStaff) assertCan(actor, "clients:write");
  else assertOrgAction(actor, c.organizationId, "manage_projects");
  const data: any = { ...patch };
  return db.clientProfile.upsert({ where: { clientId }, create: { clientId, ...data }, update: data });
}

/** Portal user edits their own company / contact details. */
export async function updateOwnCompany(actor: Actor, clientId: string, patch: { name?: string; phone?: string | null; companyName?: string; industry?: string | null; website?: string | null; country?: string | null; timezone?: string | null; socialLinks?: Record<string, string>; billingEmail?: string | null; billingAddress?: string | null; taxId?: string | null }) {
  const c = await db.client.findFirst({ where: { AND: [{ id: clientId }, clientScope(actor)] } });
  if (!c) throw notFound("Client");
  if (actor.isStaff) assertCan(actor, "clients:write");
  else assertOrgAction(actor, c.organizationId, patch.billingEmail !== undefined || patch.billingAddress !== undefined || patch.taxId !== undefined ? "billing" : "manage_projects");
  const { billingEmail, billingAddress, taxId, socialLinks, companyName, ...rest } = patch;
  await db.client.update({ where: { id: clientId }, data: { ...rest, ...(companyName ? { companyName } : {}), ...(socialLinks ? { socialLinks } : {}) } });
  await db.organization.update({
    where: { id: c.organizationId },
    data: { ...(companyName ? { name: companyName } : {}), ...(billingEmail !== undefined ? { billingEmail } : {}), ...(billingAddress !== undefined ? { billingAddress } : {}), ...(taxId !== undefined ? { taxId } : {}), ...(patch.website !== undefined ? { website: patch.website } : {}) },
  });
  return { ok: true };
}

export function assertClientAccess(actor: Actor, organizationId: string, action: Parameters<typeof assertOrgAction>[2]) {
  if (!actor.isStaff && !orgIdsOf(actor).includes(organizationId)) throw notFound();
  assertOrgAction(actor, organizationId, action);
}

export { can, AppError };
