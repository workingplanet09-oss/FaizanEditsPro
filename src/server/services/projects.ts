import type { Prisma, Priority, ProjectMemberRole, ProjectStatus } from "@/generated/prisma/client";
import { db } from "../db";
import { AppError, badRequest, forbidden, notFound } from "../errors";
import { assertCan, assertOrgAction, can, type Actor } from "../auth/actor";
import { projectScope, projectWhere } from "../auth/access";
import { emit } from "../events/bus";
import { audit, logActivity, whoName } from "./audit";
import { addBusinessDays, nextNumber, pageArgs, paged, type PageInput } from "./common";
import { getSetting } from "./settings";
import { DEFAULT_PROJECT_FOLDERS } from "@/lib/site-defaults";
import { canTransition, PRODUCTION_STARTED, STATUS_META, TRANSITIONS, type ProjectStatusKey } from "@/lib/statuses";

export type Who = Actor | { system: true; label?: string };
export const isActor = (w: Who): w is Actor => "userId" in w;

export interface Scope {
  deliverables: { label: string; quantity: number }[];
  revisionRounds: number;
  turnaroundBusinessDays: number;
  notes?: string;
  requiredAssets?: string[];
  /** onboarding categories chosen at inquiry — drives the specialised project questions */
  categories?: string[];
}

export const DEFAULT_SCOPE: Scope = { deliverables: [], revisionRounds: 2, turnaroundBusinessDays: 5 };

const workspaceOf = (w: Who, fallback?: string) => (isActor(w) ? w.workspaceId : fallback!);
const actorId = (w: Who) => (isActor(w) ? w.userId : null);

// ───────────────────────────── create ─────────────────────────────

export interface CreateProjectInput {
  clientId: string;
  name: string;
  description?: string | null;
  serviceId?: string | null;
  projectTypeKey?: string | null;
  priority?: Priority;
  deadline?: Date | null;
  managerId?: string | null;
  scope?: Partial<Scope>;
  templateId?: string | null;
  currency?: string;
  status?: ProjectStatus;
  clientVisible?: boolean;
  sourceProjectId?: string | null;
  retainerId?: string | null;
  leadId?: string | null;
  tags?: string[];
  revisionLimit?: number;
  isDemo?: boolean;
  workspaceId?: string;
}

export async function ensureFolders(projectId: string, tx: Prisma.TransactionClient | typeof db = db) {
  for (const [i, f] of DEFAULT_PROJECT_FOLDERS.entries()) {
    await tx.assetFolder.upsert({ where: { projectId_key: { projectId, key: f.key } }, create: { projectId, key: f.key, name: f.name, sortOrder: i }, update: {} });
  }
}

export async function createProject(who: Who, input: CreateProjectInput) {
  if (isActor(who)) assertCan(who, "projects:write");
  const workspaceId = workspaceOf(who, input.workspaceId);
  const client = await db.client.findFirst({ where: { id: input.clientId, workspaceId } });
  if (!client) throw notFound("Client");

  const [service, ptype, template] = await Promise.all([
    input.serviceId ? db.service.findFirst({ where: { id: input.serviceId, workspaceId } }) : null,
    input.projectTypeKey ? db.projectType.findUnique({ where: { workspaceId_key: { workspaceId, key: input.projectTypeKey } } }) : null,
    input.templateId ? db.projectTemplate.findFirst({ where: { id: input.templateId, workspaceId } }) : null,
  ]);
  const business = await getSetting(workspaceId, "business");

  const number = await nextNumber(workspaceId, "project", 1000);
  const templateDeliverables = ((template?.deliverables ?? []) as { label: string; quantity: number }[]) ?? [];
  const scope: Scope = {
    ...DEFAULT_SCOPE,
    revisionRounds: input.revisionLimit ?? template?.defaultRevisionLimit ?? ptype?.defaultRevisionLimit ?? DEFAULT_SCOPE.revisionRounds,
    turnaroundBusinessDays: template?.defaultTurnaroundDays ?? ptype?.defaultTurnaroundDays ?? DEFAULT_SCOPE.turnaroundBusinessDays,
    deliverables: templateDeliverables.length ? templateDeliverables : service?.deliverables?.map((d) => ({ label: d, quantity: 1 })) ?? [],
    requiredAssets: template?.requiredAssets ?? [],
    categories: [...(ptype?.onboardingCategories ?? []), ...(service?.onboardingCategories ?? [])],
    ...(input.scope ?? {}),
  };

  const project = await db.$transaction(async (tx) => {
    const p = await tx.project.create({
      data: {
        workspaceId,
        organizationId: client.organizationId,
        clientId: client.id,
        code: `P-${number}`,
        serviceId: service?.id,
        projectTypeId: ptype?.id,
        templateId: template?.id,
        sourceProjectId: input.sourceProjectId ?? undefined,
        retainerId: input.retainerId ?? undefined,
        leadId: input.leadId ?? undefined,
        name: input.name,
        description: input.description ?? undefined,
        status: input.status ?? "INQUIRY",
        priority: input.priority ?? "NORMAL",
        deadline: input.deadline ?? undefined,
        managerId: input.managerId ?? undefined,
        clientVisible: input.clientVisible ?? false,
        scope: scope as unknown as Prisma.InputJsonValue,
        revisionLimit: scope.revisionRounds,
        currency: input.currency ?? business.defaultCurrency,
        tags: input.tags ?? [],
        isDemo: input.isDemo ?? client.isDemo,
      },
    });
    await ensureFolders(p.id, tx);
    if (input.managerId) await tx.projectMember.create({ data: { projectId: p.id, userId: input.managerId, role: "MANAGER" } });
    if (template?.tasks && Array.isArray(template.tasks)) {
      let order = 0;
      for (const t of template.tasks as { title: string; offsetDays?: number; subtasks?: string[]; role?: string }[]) {
        const parent = await tx.task.create({
          data: { workspaceId, projectId: p.id, title: t.title, sortOrder: order++, createdById: actorId(who), dueDate: t.offsetDays ? addBusinessDays(new Date(), t.offsetDays) : undefined },
        });
        for (const [i, st] of (t.subtasks ?? []).entries()) await tx.task.create({ data: { workspaceId, projectId: p.id, parentId: parent.id, title: st, sortOrder: i, createdById: actorId(who) } });
      }
    }
    return p;
  });

  if (input.retainerId) {
    const { recordRetainerUsage } = await import("./retainers");
    await recordRetainerUsage({ retainerId: input.retainerId, projectId: project.id, kind: ptype?.key === "short_form" ? "SHORT" : "VIDEO" });
  }
  await audit(who, { workspaceId, action: "project.created", entityType: "project", entityId: project.id, message: `${whoName(who)} created project ${project.code} “${project.name}”` });
  await logActivity(who, { workspaceId, type: "project.created", message: `Project created`, projectId: project.id, clientId: client.id, visibility: "CLIENT" });
  await emit("project.created", { workspaceId, actorId: actorId(who), projectId: project.id, clientId: client.id });
  return project;
}

// ───────────────────────────── list / detail ─────────────────────────────

export type PaymentState = "NONE" | "UNPAID" | "PARTIAL" | "PAID" | "OVERDUE";

export function paymentStateOf(invoices: { status: string; total: number; amountPaid: number }[]): PaymentState {
  const live = invoices.filter((i) => !["DRAFT", "CANCELLED"].includes(i.status));
  if (!live.length) return "NONE";
  if (live.every((i) => i.status === "PAID")) return "PAID";
  if (live.some((i) => i.status === "OVERDUE")) return "OVERDUE";
  if (live.some((i) => i.amountPaid > 0)) return "PARTIAL";
  return "UNPAID";
}

export interface ProjectListQuery extends PageInput {
  q?: string;
  status?: string;
  clientId?: string;
  editorId?: string;
  type?: string;
  priority?: string;
  payment?: string;
  deadline?: string;
  sort?: string;
  view?: "open" | "all";
}

export async function listProjects(actor: Actor, query: ProjectListQuery = {}) {
  if (!actor.isStaff) return listClientProjectsPaged(actor, query);
  if (!can(actor, "projects:read_all") && !can(actor, "projects:read_assigned")) throw forbidden();
  const { page, pageSize, skip, take } = pageArgs(query);
  const and: Prisma.ProjectWhereInput[] = [projectScope(actor)];
  if (query.status) and.push({ status: { in: query.status.split(",") as ProjectStatus[] } });
  else if (query.view === "open") and.push({ status: { notIn: ["DELIVERED", "ARCHIVED", "CANCELLED"] } });
  if (query.clientId) and.push({ clientId: query.clientId });
  if (query.editorId) and.push({ members: { some: { userId: query.editorId } } });
  if (query.type) and.push({ projectType: { key: query.type } });
  if (query.priority) and.push({ priority: query.priority as Priority });
  if (query.q) and.push({ OR: [{ name: { contains: query.q, mode: "insensitive" } }, { code: { contains: query.q, mode: "insensitive" } }, { client: { companyName: { contains: query.q, mode: "insensitive" } } }] });
  const now = new Date();
  if (query.deadline === "overdue") and.push({ deadline: { lt: now }, status: { notIn: ["DELIVERED", "ARCHIVED", "CANCELLED", "APPROVED"] } });
  if (query.deadline === "week") and.push({ deadline: { gte: now, lte: new Date(now.getTime() + 7 * 86400000) } });
  if (query.deadline === "month") and.push({ deadline: { gte: now, lte: new Date(now.getTime() + 31 * 86400000) } });
  if (query.deadline === "none") and.push({ deadline: null });
  if (query.payment === "paid") and.push({ invoices: { some: { status: "PAID" }, none: { status: { in: ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"] } } } });
  if (query.payment === "unpaid") and.push({ invoices: { some: { status: { in: ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"] } } } });
  if (query.payment === "none") and.push({ invoices: { none: {} } });
  const where: Prisma.ProjectWhereInput = { AND: and };

  const orderBy: Prisma.ProjectOrderByWithRelationInput[] =
    query.sort === "oldest" ? [{ createdAt: "asc" }]
    : query.sort === "deadline" ? [{ deadline: { sort: "asc", nulls: "last" } }]
    : query.sort === "priority" ? [{ priority: "desc" }, { deadline: { sort: "asc", nulls: "last" } }]
    : query.sort === "updated" ? [{ updatedAt: "desc" }]
    : [{ createdAt: "desc" }];

  const [rows, total] = await Promise.all([
    db.project.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        client: { select: { id: true, name: true, companyName: true } },
        manager: { select: { id: true, name: true } },
        projectType: { select: { key: true, name: true } },
        service: { select: { title: true } },
        members: { include: { user: { select: { id: true, name: true } } } },
        invoices: { select: { status: true, total: true, amountPaid: true } },
        _count: { select: { revisions: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } } } } },
      },
    }),
    db.project.count({ where }),
  ]);
  return paged(
    rows.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      status: p.status as ProjectStatusKey,
      priority: p.priority,
      deadline: p.deadline,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      client: p.client,
      manager: p.manager,
      type: p.projectType?.name ?? p.service?.title ?? null,
      editors: p.members.filter((m) => m.role !== "MANAGER").map((m) => ({ id: m.user.id, name: m.user.name })),
      paymentState: paymentStateOf(p.invoices),
      openRevisions: p._count.revisions,
      progress: STATUS_META[p.status as ProjectStatusKey].progress,
    })),
    total,
    page,
    pageSize,
  );
}

async function listClientProjectsPaged(actor: Actor, query: ProjectListQuery) {
  const rows = await listClientProjects(actor, { includeClosed: query.view === "all" });
  return { items: rows, total: rows.length, page: 1, pageSize: rows.length || 1, pages: 1 };
}

/** Portal: the client's projects, grouped for the dashboard. */
export async function listClientProjects(actor: Actor, opts: { includeClosed?: boolean } = {}) {
  const rows = await db.project.findMany({
    where: { AND: [projectScope(actor), opts.includeClosed ? {} : { status: { notIn: ["ARCHIVED", "CANCELLED"] } }] },
    orderBy: { updatedAt: "desc" },
    include: {
      manager: { select: { name: true } },
      members: { include: { user: { select: { name: true } } } },
      service: { select: { title: true } },
      versions: { where: { releasedAt: { not: null } }, orderBy: { versionNumber: "desc" }, take: 1, select: { id: true, label: true, reviewStatus: true } },
    },
  });
  return rows.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    status: p.status as ProjectStatusKey,
    deadline: p.deadline,
    updatedAt: p.updatedAt,
    service: p.service?.title ?? null,
    editor: p.members.find((m) => m.role === "EDITOR" || m.role === "MOTION_DESIGNER")?.user.name ?? p.manager?.name ?? null,
    latestVersion: p.versions[0] ?? null,
    progress: STATUS_META[p.status as ProjectStatusKey].progress,
  }));
}

const detailInclude = {
  client: { select: { id: true, name: true, email: true, companyName: true, organizationId: true, phone: true } },
  organization: { select: { id: true, name: true } },
  service: { select: { id: true, title: true, slug: true } },
  projectType: { select: { id: true, key: true, name: true, onboardingCategories: true } },
  manager: { select: { id: true, name: true, email: true, avatarUrl: true } },
  members: { include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } } },
  brief: true,
} satisfies Prisma.ProjectInclude;

export async function getProjectRow(actor: Actor, id: string) {
  const p = await db.project.findFirst({ where: projectWhere(actor, id), include: detailInclude });
  if (!p) throw notFound("Project");
  return p;
}

/** Bare, scope-checked project (no relations) for other services to authorise against. */
export async function requireProject(actor: Actor, id: string) {
  const p = await db.project.findFirst({ where: projectWhere(actor, id) });
  if (!p) throw notFound("Project");
  return p;
}

export async function paymentGate(projectId: string) {
  const [quotes, contracts, invoices] = await Promise.all([
    db.quote.findMany({ where: { projectId, status: { not: "DRAFT" } }, select: { status: true } }),
    db.contract.findMany({ where: { projectId, status: { not: "DRAFT" } }, select: { status: true } }),
    db.invoice.findMany({ where: { projectId, status: { notIn: ["DRAFT", "CANCELLED"] } }, select: { status: true, kind: true, total: true, amountPaid: true } }),
  ]);
  return {
    quoteAccepted: quotes.some((q) => q.status === "ACCEPTED"),
    contractSigned: contracts.some((c) => c.status === "SIGNED"),
    depositPaid: invoices.some((i) => ["DEPOSIT", "FULL"].includes(i.kind) && i.status === "PAID"),
    allPaid: invoices.length > 0 && invoices.every((i) => i.status === "PAID"),
    outstanding: invoices.filter((i) => i.status !== "PAID").reduce((s, i) => s + (i.total - i.amountPaid), 0),
  };
}

export async function getProjectDetail(actor: Actor, id: string) {
  const p = await getProjectRow(actor, id);
  const staff = actor.isStaff;
  const [gate, counts, history, invoices] = await Promise.all([
    paymentGate(id),
    Promise.all([
      db.asset.count({ where: { projectId: id, deletedAt: null, status: "READY", ...(staff ? {} : { visibleToClient: true }) } }),
      db.videoVersion.count({ where: { projectId: id, ...(staff ? {} : { releasedAt: { not: null } }) } }),
      db.revisionRequest.count({ where: { projectId: id, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
      staff ? db.task.count({ where: { projectId: id, status: { not: "COMPLETE" } } }) : Promise.resolve(0),
      db.fileRequest.count({ where: { projectId: id, status: "OPEN" } }),
    ]).then(([assets, versions, openRevisions, openTasks, openFileRequests]) => ({ assets, versions, openRevisions, openTasks, openFileRequests })),
    db.projectStatusChange.findMany({ where: { projectId: id }, orderBy: { createdAt: "asc" }, include: { actor: { select: { name: true } } } }),
    db.invoice.findMany({ where: { projectId: id, status: { not: "DRAFT" } }, select: { status: true, total: true, amountPaid: true } }),
  ]);
  const status = p.status as ProjectStatusKey;
  const canMove = staff && (can(actor, "projects:transition") || can(actor, "versions:upload"));
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    status,
    priority: p.priority,
    deadline: p.deadline,
    startDate: p.startDate,
    completionDate: p.completionDate,
    deliveredAt: p.deliveredAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    scope: (p.scope ?? DEFAULT_SCOPE) as unknown as Scope,
    revisionLimit: p.revisionLimit,
    revisionsUsed: p.revisionsUsed,
    currency: p.currency,
    client: p.client,
    organization: p.organization,
    service: p.service,
    projectType: p.projectType,
    manager: p.manager,
    members: p.members.map((m) => ({ id: m.id, role: m.role, user: m.user })),
    brief: p.brief ? { status: p.brief.status, version: p.brief.version, confirmedAt: p.brief.confirmedAt, lockedAt: p.brief.lockedAt, content: p.brief.content as any } : null,
    paymentState: paymentStateOf(invoices),
    gate,
    counts,
    history: history.map((h) => ({ id: h.id, from: h.fromStatus, to: h.toStatus, at: h.createdAt, by: h.actor?.name ?? "System", comment: h.comment, override: staff ? h.override : false })),
    allowedNext: canMove ? TRANSITIONS[status] : [],
    // internal-only:
    ...(staff && can(actor, "profitability:read") ? { internalCost: p.internalCost } : {}),
    ...(staff ? { rushFee: p.rushFee, gateOverride: p.gateOverride, tags: p.tags, retainerId: p.retainerId } : {}),
  };
}

// ───────────────────────────── update ─────────────────────────────

export async function updateProject(
  actor: Actor,
  id: string,
  patch: Partial<{ name: string; description: string | null; priority: Priority; deadline: Date | null; scope: Partial<Scope>; revisionLimit: number; tags: string[]; serviceId: string | null; internalCost: number | null; rushFee: number | null }>,
) {
  assertCan(actor, "projects:write");
  const before = await requireProject(actor, id);
  const { scope, ...rest } = patch;
  const data: Prisma.ProjectUpdateInput = { ...rest } as any;
  if (rest.serviceId !== undefined) {
    delete (data as any).serviceId;
    data.service = rest.serviceId ? { connect: { id: rest.serviceId } } : { disconnect: true };
  }
  if (scope) {
    data.scope = { ...((before.scope ?? DEFAULT_SCOPE) as object), ...scope } as unknown as Prisma.InputJsonValue;
    if (scope.revisionRounds !== undefined) data.revisionLimit = scope.revisionRounds;
  }
  if (patch.priority === "URGENT" && before.priority !== "URGENT" && before.rushFee == null) {
    const [{ rushFeePercent }, q] = await Promise.all([getSetting(actor.workspaceId, "workflow"), db.quote.findFirst({ where: { projectId: id, status: "ACCEPTED" }, orderBy: { createdAt: "desc" } })]);
    if (q) data.rushFee = Math.round((q.total * rushFeePercent) / 100);
  }
  const p = await db.project.update({ where: { id }, data });
  const changes: string[] = [];
  if (patch.priority && patch.priority !== before.priority) changes.push(`priority ${before.priority} → ${patch.priority}`);
  if (patch.deadline !== undefined && String(patch.deadline) !== String(before.deadline)) changes.push("deadline updated");
  if (changes.length) {
    await audit(actor, { workspaceId: actor.workspaceId, action: "project.updated", entityType: "project", entityId: id, message: `${actor.name} updated ${before.code}: ${changes.join(", ")}` });
    await logActivity(actor, { workspaceId: actor.workspaceId, type: "project.updated", message: `${actor.name} updated the project (${changes.join(", ")})`, projectId: id, visibility: patch.deadline !== undefined ? "CLIENT" : "INTERNAL" });
  }
  return p;
}

// ───────────────────────────── status machine ─────────────────────────────

/** Statuses an editor (without projects:transition) may set on assigned projects. */
const EDITOR_MOVES: ProjectStatus[] = ["EDITING", "INTERNAL_REVIEW", "CLIENT_REVIEW", "AWAITING_ASSETS"];

async function gateReason(projectId: string, from: ProjectStatus, to: ProjectStatus, workspaceId: string): Promise<string | null> {
  const g = await paymentGate(projectId);
  if (from === "AWAITING_QUOTE" && to === "AWAITING_CONTRACT" && !g.quoteAccepted) return "The client hasn't accepted a quote yet.";
  if (from === "AWAITING_CONTRACT" && to === "AWAITING_PAYMENT" && !g.contractSigned) return "The contract hasn't been signed yet.";
  if (from === "AWAITING_PAYMENT" && to === "ONBOARDING" && !g.depositPaid) return "The deposit/initial invoice hasn't been paid yet.";
  if (to === "APPROVED") {
    const approved = await db.videoVersion.count({ where: { projectId, reviewStatus: "APPROVED" } });
    if (!approved) return "No video version has been approved by the client yet.";
  }
  if (to === "DELIVERED") {
    const wf = await getSetting(workspaceId, "workflow");
    const deliverables = await db.asset.count({ where: { projectId, isDeliverable: true, visibleToClient: true, deletedAt: null, status: "READY" } });
    if (!deliverables) return "Publish at least one final deliverable to the client first.";
    if (wf.requirePaymentBeforeDelivery && !g.allPaid && g.outstanding > 0) return "There are unpaid invoices on this project.";
  }
  return null;
}

export interface TransitionOptions {
  comment?: string;
  override?: boolean;
  workspaceId?: string;
  /** skip the generic status_changed event (used when the caller emits a more specific one) */
  quiet?: boolean;
}

/**
 * The ONE place project status changes. Enforces the strict machine + payment/approval gates.
 * `override` (admin only) bypasses the machine/gates and is recorded on the status change and in the audit log.
 */
export async function applyTransition(who: Who, projectId: string, to: ProjectStatus, opts: TransitionOptions = {}) {
  const project = await db.project.findUnique({ where: { id: projectId }, include: { template: true } });
  if (!project) throw notFound("Project");
  const workspaceId = project.workspaceId;
  const from = project.status;
  if (from === to) return project;

  const legal = canTransition(from as ProjectStatusKey, to as ProjectStatusKey);
  const gate = legal || opts.override ? await gateReason(projectId, from, to, workspaceId) : null;
  let overridden = false;
  if (!legal || gate) {
    if (!opts.override) {
      if (!legal) {
        throw new AppError("INVALID_TRANSITION", `A project can't move from “${STATUS_META[from as ProjectStatusKey].label}” to “${STATUS_META[to as ProjectStatusKey].label}”. Allowed next steps: ${TRANSITIONS[from as ProjectStatusKey].map((s) => STATUS_META[s].label).join(", ") || "none"}.`);
      }
      throw new AppError("GATED", `${gate} An admin can override this if needed.`);
    }
    overridden = true;
  }

  const now = new Date();
  const data: Prisma.ProjectUpdateInput = { status: to };
  if (to === "ONBOARDING" && !project.startDate) data.startDate = now;
  if (to === "ONBOARDING" || to === "AWAITING_ASSETS" || to === "QUEUED") data.clientVisible = true;
  if (to === "EDITING" && !project.startDate) data.startDate = now;
  if (to === "APPROVED") data.completionDate = now;
  if (to === "DELIVERED") data.deliveredAt = now;
  if (overridden) data.gateOverride = true;
  if (to === "ONBOARDING" && !project.deadline) {
    const scope = (project.scope ?? DEFAULT_SCOPE) as unknown as Scope;
    data.deadline = addBusinessDays(now, scope.turnaroundBusinessDays || 5);
  }

  await db.$transaction([
    db.project.update({ where: { id: projectId }, data }),
    db.projectStatusChange.create({ data: { projectId, fromStatus: from, toStatus: to, actorId: actorId(who), comment: opts.comment, override: overridden } }),
  ]);

  // production has started → brief locks; further scope changes become Change Requests
  if (PRODUCTION_STARTED.includes(to as ProjectStatusKey)) {
    await db.projectBrief.updateMany({ where: { projectId, status: { not: "LOCKED" } }, data: { status: "LOCKED", lockedAt: now } });
  }

  const fromLabel = STATUS_META[from as ProjectStatusKey].label;
  const toLabel = STATUS_META[to as ProjectStatusKey].label;
  const who_ = whoName(who);
  await audit(who, {
    workspaceId,
    action: overridden ? "project.status_override" : "project.status_changed",
    entityType: "project",
    entityId: projectId,
    message: `${who_} changed project status from ${fromLabel} to ${toLabel}${overridden ? " (admin override)" : ""}`,
    metadata: { from, to, override: overridden, gate: gate ?? null },
  });
  await logActivity(who, {
    workspaceId,
    type: "project.status_changed",
    message: `${who_} moved the project to ${STATUS_META[to as ProjectStatusKey].clientLabel === toLabel ? toLabel : `${toLabel}`}${opts.comment ? ` — ${opts.comment}` : ""}`,
    projectId,
    clientId: project.clientId,
    visibility: to === "INTERNAL_REVIEW" ? "INTERNAL" : "CLIENT",
    metadata: { from, to },
  });

  // side effects of specific transitions
  if (to === "ONBOARDING") {
    await createRequiredAssetRequests(projectId, who);
    await emit("project.activated", { workspaceId, actorId: actorId(who), projectId, clientId: project.clientId });
  }
  if (to === "APPROVED") await emit("project.approved", { workspaceId, actorId: actorId(who), projectId, clientId: project.clientId });
  if (to === "DELIVERED") {
    await emit("project.delivered", { workspaceId, actorId: actorId(who), projectId, clientId: project.clientId });
    const wf = await getSetting(workspaceId, "workflow");
    if (wf.testimonialRequestOnDelivery) {
      const { requestTestimonial } = await import("./testimonials");
      await requestTestimonial(projectId);
    }
  }
  if (!opts.quiet) {
    await emit("project.status_changed", { workspaceId, actorId: actorId(who), projectId, clientId: project.clientId, data: { from, to, toStatus: to, toStatusLabel: toLabel } });
  }
  return db.project.findUniqueOrThrow({ where: { id: projectId } });
}

/** Public transition API for staff (PMs/admins; editors limited to their working states). */
export async function transitionProject(who: Who, projectId: string, to: ProjectStatus, opts: TransitionOptions = {}) {
  if (!isActor(who)) return applyTransition(who, projectId, to, opts);
  if (!who.isStaff) throw forbidden();
  await requireProject(who, projectId);
  const allowedFull = can(who, "projects:transition");
  const allowedEditor = can(who, "versions:upload") && EDITOR_MOVES.includes(to);
  if (!allowedFull && !allowedEditor) throw forbidden("You can't change this project's status.");
  if (opts.override && !can(who, "deliverables:override")) throw forbidden("Only admins can override status rules.");
  return applyTransition(who, projectId, to, opts);
}

async function createRequiredAssetRequests(projectId: string, who: Who) {
  const p = await db.project.findUnique({ where: { id: projectId }, select: { scope: true, workspaceId: true } });
  const required = ((p?.scope as any)?.requiredAssets ?? []) as string[];
  const by = isActor(who) ? who.userId : (await db.user.findFirst({ where: { workspaceId: p!.workspaceId, isStaff: true, roles: { some: { role: { key: { in: ["super_admin", "admin"] } } } } }, select: { id: true } }))?.id;
  if (!by) return;
  for (const title of required) {
    const exists = await db.fileRequest.count({ where: { projectId, title } });
    if (!exists) await db.fileRequest.create({ data: { workspaceId: p!.workspaceId, projectId, requestedById: by, title } });
  }
}

/** Client says "I've uploaded everything" → project can be queued for an editor. */
export async function markAssetsReady(actor: Actor, projectId: string) {
  const p = await requireProject(actor, projectId);
  assertOrgAction(actor, p.organizationId, "upload");
  if (!["ONBOARDING", "AWAITING_ASSETS"].includes(p.status)) throw badRequest("This project isn't waiting for files.");
  const ready = await db.asset.count({ where: { projectId, deletedAt: null, status: "READY", folder: { key: { in: ["raw-footage", "audio", "voiceovers"] } } } });
  if (!ready) throw badRequest("Upload at least one footage or audio file first.");
  await applyTransition(actor, projectId, "QUEUED", { comment: "Client confirmed all assets are uploaded", quiet: true });
  await emit("assets.ready", { workspaceId: actor.workspaceId, actorId: actor.userId, projectId, clientId: p.clientId });
  return { ok: true };
}

// ───────────────────────────── team assignment ─────────────────────────────

export async function assignProject(actor: Actor, projectId: string, input: { managerId?: string | null; editorIds?: string[]; motionDesignerIds?: string[]; reviewerIds?: string[] }) {
  assertCan(actor, "projects:assign");
  const p = await requireProject(actor, projectId);
  const wanted: { userId: string; role: ProjectMemberRole }[] = [];
  const push = (ids: string[] | undefined, role: ProjectMemberRole) => ids?.forEach((userId) => wanted.push({ userId, role }));
  push(input.editorIds, "EDITOR");
  push(input.motionDesignerIds, "MOTION_DESIGNER");
  push(input.reviewerIds, "REVIEWER");
  if (input.managerId) wanted.push({ userId: input.managerId, role: "MANAGER" });
  const ids = [...new Set(wanted.map((w) => w.userId))];
  const users = await db.user.findMany({ where: { id: { in: ids }, workspaceId: actor.workspaceId, isStaff: true, status: { not: "SUSPENDED" } }, select: { id: true, name: true } });
  if (users.length !== ids.length) throw badRequest("You can only assign active team members.");

  const rolesTouched: ProjectMemberRole[] = [];
  if (input.editorIds) rolesTouched.push("EDITOR");
  if (input.motionDesignerIds) rolesTouched.push("MOTION_DESIGNER");
  if (input.reviewerIds) rolesTouched.push("REVIEWER");
  if (input.managerId !== undefined) rolesTouched.push("MANAGER");

  const existing = await db.projectMember.findMany({ where: { projectId, role: { in: rolesTouched } } });
  const newOnes = wanted.filter((w) => !existing.some((e) => e.userId === w.userId && e.role === w.role));
  await db.$transaction([
    db.projectMember.deleteMany({ where: { projectId, role: { in: rolesTouched }, NOT: wanted.map((w) => ({ userId: w.userId, role: w.role })) } }),
    ...newOnes.map((w) => db.projectMember.create({ data: { projectId, userId: w.userId, role: w.role } })),
    ...(input.managerId !== undefined ? [db.project.update({ where: { id: projectId }, data: { managerId: input.managerId } })] : []),
  ]);
  const names = users.filter((u) => newOnes.some((n) => n.userId === u.id)).map((u) => u.name);
  if (newOnes.length) {
    await audit(actor, { workspaceId: actor.workspaceId, action: "project.assigned", entityType: "project", entityId: projectId, message: `${actor.name} assigned ${names.join(", ")} to ${p.code}` });
    await logActivity(actor, { workspaceId: actor.workspaceId, type: "project.assigned", message: `${actor.name} assigned ${names.join(", ")}`, projectId, visibility: "INTERNAL" });
    // notify only the people who were just added
    const { notify } = await import("./notifications");
    await notify({
      workspaceId: actor.workspaceId,
      userIds: newOnes.map((n) => n.userId),
      exclude: [actor.userId],
      category: "PROJECT",
      type: "project.assigned",
      title: `You've been assigned to ${p.name}`,
      message: `${p.code} · assigned by ${actor.name}`,
      link: `/editor/projects/${projectId}`,
      email: true,
      emailTemplate: "project_assigned",
      emailVars: { project_name: p.name, project_id: p.code, project_url: `${process.env.APP_URL ?? ""}/editor/projects/${projectId}` },
    });
    await emit("project.assigned", { workspaceId: actor.workspaceId, actorId: actor.userId, projectId, clientId: p.clientId });
  }
  return { assigned: names };
}

export async function listAssignable(actor: Actor) {
  assertCan(actor, "projects:assign");
  const users = await db.user.findMany({ where: { workspaceId: actor.workspaceId, isStaff: true, status: { not: "SUSPENDED" } }, select: { id: true, name: true, roles: { select: { role: { select: { key: true, name: true } } } } }, orderBy: { name: "asc" } });
  return users.map((u) => ({ id: u.id, name: u.name, roles: u.roles.map((r) => r.role.key), roleNames: u.roles.map((r) => r.role.name) }));
}

// ───────────────────────────── timeline & milestones ─────────────────────────────

export async function projectTimeline(actor: Actor, projectId: string, opts: { limit?: number } = {}) {
  await requireProject(actor, projectId);
  const rows = await db.activityLog.findMany({
    where: { projectId, ...(actor.isStaff ? {} : { visibility: "CLIENT" }) },
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 60,
    include: { actor: { select: { name: true } } },
  });
  return rows.map((r) => ({ id: r.id, type: r.type, message: r.message, at: r.createdAt, by: r.actor?.name ?? "System", internal: r.visibility === "INTERNAL" }));
}

export interface Milestone {
  key: string;
  label: string;
  done: boolean;
  at: Date | null;
  by: string | null;
  comment: string | null;
}

/** Visual milestone tracker, derived from real status history, versions and revision rounds. */
export async function projectMilestones(actor: Actor, projectId: string): Promise<Milestone[]> {
  await requireProject(actor, projectId);
  const [changes, versions, revisions, assetsFirst, project] = await Promise.all([
    db.projectStatusChange.findMany({ where: { projectId }, orderBy: { createdAt: "asc" }, include: { actor: { select: { name: true } } } }),
    db.videoVersion.findMany({ where: { projectId, ...(actor.isStaff ? {} : { releasedAt: { not: null } }) }, orderBy: { versionNumber: "asc" }, include: { createdBy: { select: { name: true } } } }),
    db.revisionRequest.findMany({ where: { projectId }, orderBy: { createdAt: "asc" }, include: { submittedBy: { select: { name: true } } } }),
    db.asset.findFirst({ where: { projectId, status: "READY", deletedAt: null, folder: { key: { in: ["raw-footage", "audio"] } } }, orderBy: { createdAt: "asc" }, include: { uploadedBy: { select: { name: true } } } }),
    db.project.findUniqueOrThrow({ where: { id: projectId }, select: { createdAt: true } }),
  ]);
  const firstTo = (s: ProjectStatus) => changes.find((c) => c.toStatus === s);
  const m = (key: string, label: string, at?: Date | null, by?: string | null, comment?: string | null): Milestone => ({ key, label, done: !!at, at: at ?? null, by: by ?? null, comment: comment ?? null });
  const started = firstTo("ONBOARDING") ?? firstTo("QUEUED");
  const editing = firstTo("EDITING");
  const firstDraft = versions.find((v) => v.releasedAt);
  const clientReview = firstTo("CLIENT_REVIEW");
  const approved = firstTo("APPROVED");
  const delivered = firstTo("DELIVERED");
  const out: Milestone[] = [
    m("started", "Project Started", started?.createdAt ?? null, started?.actor?.name ?? "System", started?.comment),
    m("assets", "Assets Received", assetsFirst?.createdAt ?? null, assetsFirst?.uploadedBy?.name ?? null),
    m("editing", "Editing Started", editing?.createdAt ?? null, editing?.actor?.name ?? "System", editing?.comment),
    m("draft", "First Draft", firstDraft?.releasedAt ?? null, firstDraft?.createdBy?.name ?? null, firstDraft?.notes),
    m("review", "Client Review", clientReview?.createdAt ?? null, clientReview?.actor?.name ?? "System"),
  ];
  revisions.forEach((r, i) => out.push(m(`rev-${r.id}`, `Revision ${i + 1}`, r.resolvedAt ?? r.createdAt, r.submittedBy.name, r.resolvedAt ? "Completed" : "Requested")));
  out.push(m("approved", "Approved", approved?.createdAt ?? null, approved?.actor?.name ?? null, approved?.comment));
  out.push(m("delivered", "Delivered", delivered?.createdAt ?? null, delivered?.actor?.name ?? "System"));
  void project;
  return out;
}
