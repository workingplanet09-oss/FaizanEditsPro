import type { ChangeClassification } from "@/generated/prisma/client";
import { db } from "../db";
import { badRequest, notFound } from "../errors";
import { assertCan, assertOrgAction, can, type Actor } from "../auth/actor";
import { changeRequestScope, fileRequestScope } from "../auth/access";
import { emit } from "../events/bus";
import { audit, logActivity } from "./audit";
import { requireProject } from "./projects";
import { notify } from "./notifications";

// ───────────────────────────── change requests (scope control after production starts) ─────────────────────────────

export async function createChangeRequest(actor: Actor, projectId: string, input: { whatChanged: string; why?: string; additionalRequirements?: string; referenceAssetIds?: string[] }) {
  const project = await requireProject(actor, projectId);
  assertOrgAction(actor, project.organizationId, "manage_projects");
  if (input.referenceAssetIds?.length) {
    const ok = await db.asset.count({ where: { id: { in: input.referenceAssetIds }, projectId, deletedAt: null } });
    if (ok !== input.referenceAssetIds.length) throw badRequest("One of the attached files doesn't belong to this project.");
  }
  const cr = await db.changeRequest.create({ data: { workspaceId: actor.workspaceId, projectId, submittedById: actor.userId, whatChanged: input.whatChanged, why: input.why, additionalRequirements: input.additionalRequirements, referenceAssetIds: input.referenceAssetIds ?? [] } });
  await logActivity(actor, { workspaceId: actor.workspaceId, type: "change_request.created", message: `${actor.name} submitted a change request`, projectId, clientId: project.clientId, visibility: "CLIENT" });
  await emit("change_request.created", { workspaceId: actor.workspaceId, actorId: actor.userId, projectId, clientId: project.clientId, changeRequestId: cr.id });
  return cr;
}

export async function listChangeRequests(actor: Actor, projectId: string) {
  await requireProject(actor, projectId);
  const rows = await db.changeRequest.findMany({ where: { AND: [{ projectId }, changeRequestScope(actor)] }, orderBy: { createdAt: "desc" }, include: { submittedBy: { select: { name: true } } } });
  // staff-only note stays internal
  return rows.map((r) => ({ ...r, staffNote: actor.isStaff ? r.staffNote : r.classification === "PENDING" ? null : r.staffNote }));
}

export async function classifyChangeRequest(actor: Actor, id: string, input: { classification: ChangeClassification; staffNote?: string; createQuote?: { title: string; amount: number; description?: string } }) {
  assertCan(actor, "projects:write");
  const cr = await db.changeRequest.findFirst({ where: { AND: [{ id }, changeRequestScope(actor)] }, include: { project: true } });
  if (!cr) throw notFound("Change request");
  let quoteId: string | undefined;
  if (input.classification === "ADDITIONAL_COST" && input.createQuote) {
    const { createChangeOrderQuote } = await import("./quotes");
    const q = await createChangeOrderQuote(actor, cr.projectId, { changeRequestId: id, title: input.createQuote.title, amount: input.createQuote.amount, description: input.createQuote.description ?? cr.whatChanged });
    quoteId = q.id;
  }
  const updated = await db.changeRequest.update({ where: { id }, data: { classification: input.classification, staffNote: input.staffNote, resolvedById: input.classification === "PENDING" ? null : actor.userId, resolvedAt: input.classification === "PENDING" ? null : new Date(), quoteId } });
  await audit(actor, { workspaceId: actor.workspaceId, action: "change_request.classified", entityType: "change_request", entityId: id, message: `${actor.name} classified a change request as ${input.classification.replace("_", " ").toLowerCase()}` });
  const owner = await db.user.findUnique({ where: { id: cr.submittedById }, select: { id: true } });
  if (owner) {
    const label = input.classification === "INCLUDED" ? "Included in your scope" : input.classification === "OUT_OF_SCOPE" ? "Out of scope" : "Needs an additional quote";
    await notify({ workspaceId: actor.workspaceId, userIds: [owner.id], category: "PROJECT", type: "change_request.reviewed", title: `Your change request was reviewed: ${label}`, message: input.staffNote ?? cr.project.name, link: quoteId ? `/dashboard/quotes/${quoteId}` : `/dashboard/projects/${cr.projectId}`, email: true });
  }
  return updated;
}

// ───────────────────────────── file requests ("Action required" for the client) ─────────────────────────────

export async function createFileRequest(actor: Actor, projectId: string, input: { title: string; description?: string; acceptedTypes?: string[] }) {
  assertCan(actor, "files:write");
  const project = await requireProject(actor, projectId);
  const fr = await db.fileRequest.create({ data: { workspaceId: actor.workspaceId, projectId, requestedById: actor.userId, title: input.title, description: input.description, acceptedTypes: input.acceptedTypes ?? [] } });
  await logActivity(actor, { workspaceId: actor.workspaceId, type: "file_request.created", message: `${actor.name} requested: ${input.title}`, projectId, clientId: project.clientId, visibility: "CLIENT" });
  await emit("file_request.created", { workspaceId: actor.workspaceId, actorId: actor.userId, projectId, clientId: project.clientId, fileRequestId: fr.id, data: { detail: input.title } });
  return fr;
}

export async function listFileRequests(actor: Actor, projectId: string, opts: { openOnly?: boolean } = {}) {
  await requireProject(actor, projectId);
  return db.fileRequest.findMany({
    where: { AND: [{ projectId }, fileRequestScope(actor), opts.openOnly ? { status: "OPEN" } : {}] },
    orderBy: { createdAt: "desc" },
    include: { requestedBy: { select: { name: true } } },
  });
}

export async function cancelFileRequest(actor: Actor, id: string) {
  assertCan(actor, "files:write");
  const fr = await db.fileRequest.findFirst({ where: { AND: [{ id }, fileRequestScope(actor)] } });
  if (!fr) throw notFound("Request");
  return db.fileRequest.update({ where: { id }, data: { status: "CANCELLED" } });
}

/** Called by the asset pipeline once the requested file has been uploaded. */
export async function fulfilFileRequest(actor: Actor, fileRequestId: string, assetId: string) {
  const fr = await db.fileRequest.findFirst({ where: { AND: [{ id: fileRequestId }, fileRequestScope(actor)], status: "OPEN" } });
  if (!fr) throw notFound("Request");
  await db.fileRequest.update({ where: { id: fr.id }, data: { status: "COMPLETED", fulfilledAssetId: assetId, fulfilledAt: new Date() } });
  await logActivity(actor, { workspaceId: actor.workspaceId, type: "file_request.completed", message: `${actor.name} provided: ${fr.title}`, projectId: fr.projectId, visibility: "CLIENT" });
  await notify({ workspaceId: fr.workspaceId, userIds: [fr.requestedById], exclude: [actor.userId], category: "PROJECT", type: "file_request.completed", title: `Requested file received: ${fr.title}`, link: `/admin/projects/${fr.projectId}`, email: false });
  return { ok: true };
}

export { can };
