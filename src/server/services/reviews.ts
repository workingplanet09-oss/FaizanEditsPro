import type { Prisma, ProjectStatus, RevisionStatus } from "@/generated/prisma/client";
import { db } from "../db";
import { AppError, badRequest, forbidden, notFound } from "../errors";
import { assertCan, assertOrgAction, can, type Actor } from "../auth/actor";
import { commentScope, projectScope, versionScope } from "../auth/access";
import { getStorage } from "../storage";
import { emit } from "../events/bus";
import { audit, logActivity } from "./audit";
import { applyTransition, requireProject } from "./projects";
import { ensureBalanceInvoice } from "./invoices";
import { notify } from "./notifications";
import { getSetting } from "./settings";
import type { ProjectStatusKey } from "@/lib/statuses";
import { formatTimecode } from "@/lib/format";

// ───────────────────────────── versions ─────────────────────────────

export interface CreateVersionInput {
  assetId?: string;
  videoUrl?: string;
  notes?: string;
  changeSummary?: string;
  durationMs?: number;
  /** completes this revision request when the new version is released */
  revisionId?: string;
  /** "draft" keeps it private to the team; "auto" follows the internal-review setting */
  release?: "auto" | "client" | "internal" | "draft";
  final?: boolean;
}

const vDto = (v: any) => ({
  id: v.id,
  projectId: v.projectId,
  versionNumber: v.versionNumber,
  label: v.label,
  notes: v.notes,
  changeSummary: v.changeSummary,
  durationMs: v.durationMs,
  reviewStatus: v.reviewStatus,
  isFinal: v.isFinal,
  releasedAt: v.releasedAt,
  approvedAt: v.approvedAt,
  approvedBy: v.approvedBy?.name ?? null,
  approvalNotes: v.approvalNotes,
  createdAt: v.createdAt,
  createdBy: v.createdBy?.name ?? null,
  hasThumbnail: !!(v.thumbnailKey || v.asset?.thumbnailKey),
  hasVideo: !!(v.assetId || v.videoUrl),
  externalUrl: v.videoUrl ?? null,
  counts: v._counts ?? undefined,
});
export type VersionDTO = ReturnType<typeof vDto>;

export async function createVersion(actor: Actor, projectId: string, input: CreateVersionInput) {
  assertCan(actor, "versions:upload");
  const project = await requireProject(actor, projectId);
  if (!["QUEUED", "EDITING", "INTERNAL_REVIEW", "REVISION", "AWAITING_ASSETS", "CLIENT_REVIEW", "FINAL_REVIEW"].includes(project.status)) {
    throw new AppError("GATED", "This project isn't in production yet — versions can be uploaded once it's queued or being edited.");
  }
  if (!input.assetId && !input.videoUrl) throw badRequest("Attach a video file or paste a video link.");
  if (input.videoUrl && !/^https?:\/\//i.test(input.videoUrl)) throw badRequest("The video link must start with http:// or https://", { videoUrl: "Invalid URL." });
  if (input.assetId) {
    const a = await db.asset.findFirst({ where: { id: input.assetId, projectId, deletedAt: null, status: "READY" } });
    if (!a) throw badRequest("That video file isn't available. Finish the upload first.");
    if (!a.mimeType.startsWith("video/")) throw badRequest("The attached file isn't a video.");
    const used = await db.videoVersion.count({ where: { assetId: a.id } });
    if (used) throw badRequest("That file is already attached to another version.");
  }
  const wf = await getSetting(actor.workspaceId, "workflow");
  const releaseMode = input.release ?? "auto";
  const toInternal = releaseMode === "internal" || (releaseMode === "auto" && wf.requireInternalReview);
  const draftOnly = releaseMode === "draft";

  const last = await db.videoVersion.aggregate({ where: { projectId }, _max: { versionNumber: true } });
  const n = (last._max.versionNumber ?? 0) + 1;
  const label = input.final ? "Final" : `V${n}`;
  const now = new Date();

  const version = await db.$transaction(async (tx) => {
    const v = await tx.videoVersion.create({
      data: {
        workspaceId: actor.workspaceId,
        projectId,
        versionNumber: n,
        label,
        assetId: input.assetId,
        videoUrl: input.videoUrl,
        notes: input.notes,
        changeSummary: input.changeSummary,
        durationMs: input.durationMs,
        createdById: actor.userId,
        isFinal: !!input.final,
        reviewStatus: draftOnly ? "DRAFT" : toInternal ? "INTERNAL_REVIEW" : "PENDING_CLIENT",
        releasedAt: draftOnly || toInternal ? null : now,
        isDemo: project.isDemo,
      },
      include: { createdBy: { select: { name: true } }, asset: true },
    });
    if (!draftOnly && !toInternal) {
      await tx.videoVersion.updateMany({ where: { projectId, id: { not: v.id }, reviewStatus: { in: ["PENDING_CLIENT", "CHANGES_REQUESTED"] } }, data: { reviewStatus: "SUPERSEDED" } });
    }
    return v;
  });

  // walk the project through the legal states rather than jumping
  let status = project.status as ProjectStatus;
  const step = async (to: ProjectStatus) => {
    if (status !== to) {
      await applyTransition(actor, projectId, to, { comment: `${label} uploaded`, quiet: true });
      status = to;
    }
  };
  if (!draftOnly) {
    if (status === "AWAITING_ASSETS") await step("QUEUED");
    if (status === "QUEUED") await step("EDITING");
    if (toInternal) {
      if (status === "EDITING" || status === "REVISION") await step("INTERNAL_REVIEW");
    } else {
      if (status === "EDITING" || status === "REVISION" || status === "INTERNAL_REVIEW") await step("CLIENT_REVIEW");
    }
  } else if (status === "QUEUED") {
    await step("EDITING");
  }

  if (input.revisionId) await completeRevisionInternal(actor, input.revisionId, version.id, { quiet: true });

  await audit(actor, { workspaceId: actor.workspaceId, action: "version.uploaded", entityType: "video_version", entityId: version.id, message: `${actor.name} uploaded ${label} to ${project.code}` });
  await logActivity(actor, { workspaceId: actor.workspaceId, type: "version.uploaded", message: `${actor.name} uploaded ${label}${draftOnly ? " (team only)" : toInternal ? " for internal review" : ""}`, projectId, clientId: project.clientId, visibility: draftOnly || toInternal ? "INTERNAL" : "CLIENT", entityType: "video_version", entityId: version.id });
  if (!draftOnly && !toInternal) {
    // one clear notification per upload: "revision completed" when it answers a revision, otherwise "draft ready"
    if (input.revisionId) await emit("revision.completed", { workspaceId: actor.workspaceId, actorId: actor.userId, projectId, clientId: project.clientId, versionId: version.id, revisionId: input.revisionId });
    else await emit("draft.uploaded", { workspaceId: actor.workspaceId, actorId: actor.userId, projectId, clientId: project.clientId, versionId: version.id });
  } else if (toInternal) {
    const reviewers = await db.projectMember.findMany({ where: { projectId, role: { in: ["REVIEWER", "MANAGER"] } }, select: { userId: true } });
    await notify({ workspaceId: actor.workspaceId, userIds: reviewers.map((r) => r.userId), exclude: [actor.userId], category: "REVIEW", type: "version.internal_review", title: `${label} needs internal review`, message: `${project.name} (${project.code})`, link: `/admin/projects/${projectId}/review/${version.id}`, email: false });
  }
  return vDto(version);
}

/** Team-only → client. Used after internal review passes. */
export async function releaseVersion(actor: Actor, versionId: string) {
  assertCan(actor, "versions:review");
  const v = await db.videoVersion.findFirst({ where: { AND: [{ id: versionId }, versionScope(actor)] } });
  if (!v) throw notFound("Version");
  if (v.releasedAt) throw new AppError("CONFLICT", "This version has already been released.");
  const project = await requireProject(actor, v.projectId);
  await db.videoVersion.updateMany({ where: { projectId: v.projectId, id: { not: v.id }, reviewStatus: { in: ["PENDING_CLIENT", "CHANGES_REQUESTED"] } }, data: { reviewStatus: "SUPERSEDED" } });
  await db.videoVersion.update({ where: { id: versionId }, data: { reviewStatus: "PENDING_CLIENT", releasedAt: new Date() } });
  if (project.status === "INTERNAL_REVIEW") await applyTransition(actor, v.projectId, "CLIENT_REVIEW", { comment: `${v.label} approved internally`, quiet: true });
  await audit(actor, { workspaceId: actor.workspaceId, action: "version.released", entityType: "video_version", entityId: versionId, message: `${actor.name} released ${v.label} to the client` });
  await logActivity(actor, { workspaceId: actor.workspaceId, type: "version.released", message: `${v.label} is ready for client review`, projectId: v.projectId, clientId: project.clientId, visibility: "CLIENT" });
  await emit("draft.uploaded", { workspaceId: actor.workspaceId, actorId: actor.userId, projectId: v.projectId, clientId: project.clientId, versionId });
  return { ok: true };
}

export async function listVersions(actor: Actor, projectId: string) {
  await requireProject(actor, projectId);
  const rows = await db.videoVersion.findMany({
    where: { AND: [{ projectId }, versionScope(actor)] },
    orderBy: { versionNumber: "desc" },
    include: { createdBy: { select: { name: true } }, approvedBy: { select: { name: true } }, asset: { select: { thumbnailKey: true } }, comments: { where: { parentId: null }, select: { status: true } } },
  });
  return rows.map((v) => vDto({ ...v, _counts: { open: v.comments.filter((c) => ["OPEN", "IN_PROGRESS"].includes(c.status)).length, resolved: v.comments.filter((c) => c.status === "RESOLVED").length, total: v.comments.length } }));
}

export async function getVersionPlayback(actor: Actor, versionId: string, opts: { download?: boolean } = {}) {
  const v = await db.videoVersion.findFirst({ where: { AND: [{ id: versionId }, versionScope(actor)] }, include: { asset: true } });
  if (!v) throw notFound("Version");
  if (v.videoUrl && !v.asset) return { url: v.videoUrl, external: true, filename: null as string | null, mimeType: "text/html" };
  if (!v.asset || v.asset.status !== "READY") throw new AppError("GATED", "This video is still processing.");
  const url = await getStorage().downloadUrl(v.asset.storageKey, { filename: `${v.label}-${v.asset.displayName}`, contentType: v.asset.mimeType, inline: !opts.download });
  return { url, external: false, filename: v.asset.displayName, mimeType: v.asset.mimeType };
}

export async function getVersionPoster(actor: Actor, versionId: string) {
  const v = await db.videoVersion.findFirst({ where: { AND: [{ id: versionId }, versionScope(actor)] }, include: { asset: true } });
  if (!v) throw notFound("Version");
  const key = v.thumbnailKey ?? v.asset?.thumbnailKey;
  return { url: key ? await getStorage().downloadUrl(key, { inline: true, contentType: "image/jpeg" }) : null };
}

// ───────────────────────────── comments ─────────────────────────────

const cDto = (c: any) => ({
  id: c.id,
  versionId: c.versionId,
  parentId: c.parentId,
  timecodeMs: c.timecodeMs,
  timecode: formatTimecode(c.timecodeMs),
  comment: c.comment,
  status: c.status as RevisionStatus,
  isStaff: c.isStaff,
  author: c.user?.name ?? "Unknown",
  authorId: c.userId,
  revisionId: c.revisionId,
  createdAt: c.createdAt,
  resolvedAt: c.resolvedAt,
});
export type CommentDTO = ReturnType<typeof cDto>;

export async function listComments(actor: Actor, versionId: string) {
  const v = await db.videoVersion.findFirst({ where: { AND: [{ id: versionId }, versionScope(actor)] }, select: { id: true } });
  if (!v) throw notFound("Version");
  const rows = await db.videoComment.findMany({ where: { versionId }, orderBy: [{ timecodeMs: "asc" }, { createdAt: "asc" }], include: { user: { select: { name: true } } } });
  return rows.map(cDto);
}

export async function addComment(actor: Actor, versionId: string, input: { timecodeMs: number; comment: string; parentId?: string | null }) {
  const v = await db.videoVersion.findFirst({ where: { AND: [{ id: versionId }, versionScope(actor)] }, include: { project: true } });
  if (!v) throw notFound("Version");
  const project = v.project;
  if (actor.isStaff) {
    if (!can(actor, "revisions:manage") && !can(actor, "versions:review") && !can(actor, "messages:write")) throw forbidden();
  } else {
    assertOrgAction(actor, project.organizationId, "message");
    if (!["PENDING_CLIENT", "CHANGES_REQUESTED"].includes(v.reviewStatus)) throw new AppError("GATED", v.reviewStatus === "APPROVED" ? "This version is approved, so it's closed for new notes." : "This version has been replaced by a newer one. Add notes on the latest version.");
  }
  const text = input.comment.trim();
  if (!text) throw badRequest("Write a comment first.", { comment: "Required." });
  if (text.length > 2000) throw badRequest("Please keep comments under 2,000 characters.", { comment: "Too long." });
  if (input.timecodeMs < 0) throw badRequest("Invalid timecode.");
  let parent = null;
  if (input.parentId) {
    parent = await db.videoComment.findFirst({ where: { id: input.parentId, versionId } });
    if (!parent) throw notFound("Comment");
  }
  const c = await db.videoComment.create({
    data: { workspaceId: actor.workspaceId, projectId: v.projectId, versionId, userId: actor.userId, parentId: parent?.id, timecodeMs: parent?.timecodeMs ?? Math.round(input.timecodeMs), comment: text, isStaff: actor.isStaff, isDemo: project.isDemo },
    include: { user: { select: { name: true } } },
  });
  if (parent && parent.userId !== actor.userId) {
    await notify({ workspaceId: actor.workspaceId, userIds: [parent.userId], category: "REVIEW", type: "comment.reply", title: `${actor.name} replied to your note at ${formatTimecode(parent.timecodeMs)}`, message: text.slice(0, 140), link: `${actor.isStaff ? "/dashboard" : "/admin"}/projects/${v.projectId}/review/${versionId}`, email: false });
  }
  return cDto(c);
}

/** Editors/admins triage feedback; clients can withdraw (CLOSED) or reopen their own notes. */
export async function setCommentStatus(actor: Actor, commentId: string, status: RevisionStatus, response?: string) {
  const c = await db.videoComment.findFirst({ where: { AND: [{ id: commentId }, commentScope(actor)] }, include: { project: true, version: true } });
  if (!c) throw notFound("Comment");
  if (actor.isStaff) {
    if (!can(actor, "revisions:manage")) throw forbidden();
  } else {
    if (c.userId !== actor.userId) throw forbidden("You can only change your own notes.");
    if (!["OPEN", "CLOSED"].includes(status)) throw forbidden();
    if (c.version.reviewStatus === "APPROVED") throw new AppError("GATED", "This version is already approved.");
  }
  const resolved = status === "RESOLVED";
  const updated = await db.videoComment.update({
    where: { id: commentId },
    data: { status, resolvedAt: resolved ? new Date() : null, resolvedById: resolved ? actor.userId : null },
    include: { user: { select: { name: true } } },
  });
  if (response?.trim() && actor.isStaff) {
    await db.videoComment.create({ data: { workspaceId: actor.workspaceId, projectId: c.projectId, versionId: c.versionId, userId: actor.userId, parentId: c.parentId ?? c.id, timecodeMs: c.timecodeMs, comment: response.trim().slice(0, 2000), isStaff: true, status: "OPEN", isDemo: c.isDemo } });
  }
  return cDto(updated);
}

// ───────────────────────────── revisions ─────────────────────────────

const rDto = (r: any) => ({
  id: r.id,
  projectId: r.projectId,
  versionId: r.versionId,
  versionLabel: r.version?.label ?? null,
  description: r.description,
  status: r.status as RevisionStatus,
  priority: r.priority,
  roundNumber: r.roundNumber,
  submittedBy: r.submittedBy?.name ?? null,
  createdAt: r.createdAt,
  resolvedAt: r.resolvedAt,
  commentCount: r._count?.comments ?? undefined,
  project: r.project ? { id: r.project.id, name: r.project.name, code: r.project.code } : undefined,
});

/** Client sends their notes as a revision round. All open notes on that version are attached. */
export async function submitRevision(actor: Actor, projectId: string, input: { versionId: string; description?: string; priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT" }) {
  const project = await requireProject(actor, projectId);
  assertOrgAction(actor, project.organizationId, "approve");
  const v = await db.videoVersion.findFirst({ where: { AND: [{ id: input.versionId, projectId }, versionScope(actor)] } });
  if (!v) throw notFound("Version");
  if (v.reviewStatus !== "PENDING_CLIENT") throw new AppError("CONFLICT", v.reviewStatus === "CHANGES_REQUESTED" ? "You've already requested changes on this version." : "Revisions can only be requested on the version currently waiting for your review.");
  if (!["CLIENT_REVIEW", "FINAL_REVIEW"].includes(project.status)) throw new AppError("GATED", "This project isn't waiting for your review.");
  const open = await db.videoComment.findMany({ where: { versionId: v.id, parentId: null, revisionId: null, status: "OPEN" } });
  if (!open.length && !input.description?.trim()) throw badRequest("Add at least one timestamped note or describe what should change.", { description: "Required." });

  const round = project.revisionsUsed + 1;
  const rev = await db.$transaction(async (tx) => {
    const r = await tx.revisionRequest.create({
      data: { workspaceId: actor.workspaceId, projectId, versionId: v.id, submittedById: actor.userId, description: input.description?.trim() || `${open.length} timestamped note${open.length === 1 ? "" : "s"} on ${v.label}`, priority: input.priority ?? "NORMAL", roundNumber: round, isDemo: project.isDemo },
      include: { submittedBy: { select: { name: true } }, version: true },
    });
    await tx.videoComment.updateMany({ where: { id: { in: open.map((o) => o.id) } }, data: { revisionId: r.id } });
    await tx.videoVersion.update({ where: { id: v.id }, data: { reviewStatus: "CHANGES_REQUESTED" } });
    await tx.project.update({ where: { id: projectId }, data: { revisionsUsed: round } });
    return r;
  });
  await applyTransition(actor, projectId, "REVISION", { comment: `Revision ${round} requested on ${v.label}`, quiet: true });
  const over = round > project.revisionLimit;
  await audit(actor, { workspaceId: actor.workspaceId, action: "revision.submitted", entityType: "revision", entityId: rev.id, message: `${actor.name} requested revision ${round} on ${v.label}${over ? " (exceeds included rounds)" : ""}` });
  await logActivity(actor, { workspaceId: actor.workspaceId, type: "revision.submitted", message: `${actor.name} requested changes on ${v.label} (round ${round} of ${project.revisionLimit} included)`, projectId, clientId: project.clientId, visibility: "CLIENT" });
  await emit("revision.submitted", { workspaceId: actor.workspaceId, actorId: actor.userId, projectId, clientId: project.clientId, versionId: v.id, revisionId: rev.id, data: { round, over } });
  if (over) {
    const mgr = project.managerId ? [project.managerId] : [];
    await notify({ workspaceId: actor.workspaceId, userIds: mgr, category: "PROJECT", type: "scope.exceeded", title: `${project.code}: revision ${round} exceeds the ${project.revisionLimit} included rounds`, message: "Consider a change-order quote before doing extra work.", link: `/admin/projects/${projectId}`, email: false });
  }
  return rDto(rev);
}

async function completeRevisionInternal(actor: Actor, revisionId: string, resolvedInVersionId: string | null, opts: { quiet?: boolean } = {}) {
  const rev = await db.revisionRequest.findFirst({ where: { id: revisionId }, include: { project: true } });
  if (!rev) throw notFound("Revision");
  await db.$transaction([
    db.revisionRequest.update({ where: { id: revisionId }, data: { status: "RESOLVED", resolvedAt: new Date(), resolvedInVersionId: resolvedInVersionId ?? undefined } }),
    db.videoComment.updateMany({ where: { revisionId, status: { in: ["OPEN", "IN_PROGRESS"] } }, data: { status: "RESOLVED", resolvedAt: new Date(), resolvedById: actor.userId } }),
  ]);
  await logActivity(actor, { workspaceId: rev.workspaceId, type: "revision.completed", message: `${actor.name} completed revision ${rev.roundNumber}`, projectId: rev.projectId, clientId: rev.project.clientId, visibility: "CLIENT" });
  if (!opts.quiet) await emit("revision.completed", { workspaceId: rev.workspaceId, actorId: actor.userId, projectId: rev.projectId, clientId: rev.project.clientId, revisionId });
}

export async function setRevisionStatus(actor: Actor, revisionId: string, status: RevisionStatus) {
  assertCan(actor, "revisions:manage");
  const rev = await db.revisionRequest.findFirst({ where: { id: revisionId, project: projectScope(actor) } });
  if (!rev) throw notFound("Revision");
  if (status === "RESOLVED") {
    await completeRevisionInternal(actor, revisionId, null);
  } else {
    await db.revisionRequest.update({ where: { id: revisionId }, data: { status, resolvedAt: ["REJECTED", "CLOSED"].includes(status) ? new Date() : null } });
    if (status === "IN_PROGRESS") await db.videoComment.updateMany({ where: { revisionId, status: "OPEN" }, data: { status: "IN_PROGRESS" } });
  }
  await audit(actor, { workspaceId: actor.workspaceId, action: "revision.status_changed", entityType: "revision", entityId: revisionId, message: `${actor.name} set a revision to ${status}` });
  return db.revisionRequest.findUniqueOrThrow({ where: { id: revisionId }, include: { submittedBy: { select: { name: true } }, version: true } }).then(rDto);
}

export async function listRevisions(actor: Actor, opts: { projectId?: string; status?: string; page?: number } = {}) {
  const where: Prisma.RevisionRequestWhereInput = {
    AND: [{ project: projectScope(actor) }, opts.projectId ? { projectId: opts.projectId } : {}, opts.status === "open" ? { status: { in: ["OPEN", "IN_PROGRESS"] } } : opts.status ? { status: opts.status as RevisionStatus } : {}],
  };
  const rows = await db.revisionRequest.findMany({ where, orderBy: { createdAt: "desc" }, take: 100, include: { submittedBy: { select: { name: true } }, version: true, project: { select: { id: true, name: true, code: true } }, _count: { select: { comments: true } } } });
  return rows.map(rDto);
}

// ───────────────────────────── approval ─────────────────────────────

/**
 * Approval is pinned to a specific version and the caller must echo its number — the client can never
 * accidentally approve "whatever is latest". Records who/when/which version/notes.
 */
export async function approveVersion(actor: Actor, projectId: string, input: { versionId: string; confirmVersionNumber: number; notes?: string }) {
  const project = await requireProject(actor, projectId);
  assertOrgAction(actor, project.organizationId, "approve");
  const v = await db.videoVersion.findFirst({ where: { AND: [{ id: input.versionId, projectId }, versionScope(actor)] } });
  if (!v) throw notFound("Version");
  if (v.versionNumber !== input.confirmVersionNumber) throw new AppError("CONFLICT", `You confirmed Version ${input.confirmVersionNumber}, but this is Version ${v.versionNumber}. Please review and confirm again.`);
  if (v.reviewStatus !== "PENDING_CLIENT") throw new AppError("CONFLICT", v.reviewStatus === "APPROVED" ? "This version is already approved." : "Only the version currently waiting for your review can be approved.");
  if (!["CLIENT_REVIEW", "FINAL_REVIEW"].includes(project.status)) throw new AppError("GATED", "This project isn't waiting for your approval.");

  const now = new Date();
  await db.$transaction([
    db.videoVersion.update({ where: { id: v.id }, data: { reviewStatus: "APPROVED", approvedById: actor.userId, approvedAt: now, approvalNotes: input.notes?.trim() || null, isFinal: true } }),
    db.videoVersion.updateMany({ where: { projectId, id: { not: v.id }, reviewStatus: { in: ["PENDING_CLIENT", "CHANGES_REQUESTED"] } }, data: { reviewStatus: "SUPERSEDED" } }),
    db.revisionRequest.updateMany({ where: { projectId, status: { in: ["OPEN", "IN_PROGRESS"] } }, data: { status: "CLOSED", resolvedAt: now } }),
  ]);
  await audit(actor, { workspaceId: actor.workspaceId, action: "version.approved", entityType: "video_version", entityId: v.id, message: `${actor.name} approved Video ${v.label}`, metadata: { versionNumber: v.versionNumber, notes: input.notes ?? null } });
  await logActivity(actor, { workspaceId: actor.workspaceId, type: "version.approved", message: `${actor.name} approved ${v.label}`, projectId, clientId: project.clientId, visibility: "CLIENT" });
  await applyTransition(actor, projectId, "APPROVED", { comment: `${v.label} approved by ${actor.name}`, quiet: true });
  await ensureBalanceInvoice({ system: true, label: "System" }, projectId);
  await emit("project.status_changed", { workspaceId: actor.workspaceId, actorId: actor.userId, projectId, clientId: project.clientId, data: { from: project.status, to: "APPROVED", toStatus: "APPROVED", toStatusLabel: "Approved" } });
  return { approved: v.label, versionNumber: v.versionNumber };
}

// ───────────────────────────── review page payload ─────────────────────────────

export async function getReviewData(actor: Actor, projectId: string, versionId?: string) {
  const project = await requireProject(actor, projectId);
  const versions = await listVersions(actor, projectId);
  if (!versions.length) return { project: { id: project.id, name: project.name, code: project.code, status: project.status as ProjectStatusKey, revisionLimit: project.revisionLimit, revisionsUsed: project.revisionsUsed }, versions: [], current: null, comments: [], revisions: [], perms: { canComment: false, canApprove: false, canRequestRevision: false, canTriage: false } };
  const current = versions.find((v) => v.id === versionId) ?? versions[0];
  const [comments, revisions] = await Promise.all([listComments(actor, current.id), listRevisions(actor, { projectId })]);
  const orgOk = (action: Parameters<typeof assertOrgAction>[2]) => {
    try {
      assertOrgAction(actor, project.organizationId, action);
      return true;
    } catch {
      return false;
    }
  };
  const openForClient = ["PENDING_CLIENT", "CHANGES_REQUESTED"].includes(current.reviewStatus);
  const reviewable = ["CLIENT_REVIEW", "FINAL_REVIEW"].includes(project.status);
  return {
    project: { id: project.id, name: project.name, code: project.code, status: project.status as ProjectStatusKey, revisionLimit: project.revisionLimit, revisionsUsed: project.revisionsUsed },
    versions,
    current,
    comments,
    revisions,
    perms: {
      canComment: actor.isStaff ? can(actor, "revisions:manage") || can(actor, "versions:review") : orgOk("message") && openForClient,
      canApprove: !actor.isStaff && orgOk("approve") && current.reviewStatus === "PENDING_CLIENT" && reviewable,
      canRequestRevision: !actor.isStaff && orgOk("approve") && current.reviewStatus === "PENDING_CLIENT" && reviewable,
      canTriage: actor.isStaff && can(actor, "revisions:manage"),
      canRelease: actor.isStaff && can(actor, "versions:review") && !current.releasedAt,
    },
  };
}
