import type { Asset, AssetStatus, Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import { env } from "../env";
import { AppError, badRequest, forbidden, notFound } from "../errors";
import { assertCan, assertOrgAction, can, type Actor } from "../auth/actor";
import { assetScope, projectWhere } from "../auth/access";
import { randomToken } from "../auth/crypto";
import { getStorage } from "../storage";
import { contentProblem, sniffContent } from "../storage/sniff";
import { emit } from "../events/bus";
import { enqueueJob } from "../jobs/queue";
import { rateLimit } from "../security/ratelimit";
import { audit, logActivity } from "./audit";
import { ensureFolders, requireProject } from "./projects";
import { fulfilFileRequest } from "./requests";
import { getSetting } from "./settings";
import { notify } from "./notifications";
import { parseVersionedName } from "@/lib/slug";
import { DEFAULT_PROJECT_FOLDERS } from "@/lib/site-defaults";

// ───────────────────────────── validation ─────────────────────────────

const BLOCKED_EXT = /\.(exe|msi|bat|cmd|com|scr|pif|ps1|psm1|sh|bash|jar|dll|so|apk|app|vbs|vbe|wsf|lnk|reg|hta|cpl|dmg|pkg|deb|rpm|iso)$/i;
const ALLOWED_PREFIX = ["video/", "audio/", "image/"];
const ALLOWED_EXACT = new Set([
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "text/vtt",
  "application/x-subrip",
  "application/json",
  "font/otf",
  "font/ttf",
  "font/woff",
  "font/woff2",
  "application/x-7z-compressed",
  "application/vnd.rar",
  "application/x-rar-compressed",
]);
/** Creative project files browsers report as octet-stream. */
const EXT_ALLOW = /\.(prproj|aep|aepx|drp|fcpxml|fcpbundle|mogrt|psd|ai|indd|srt|vtt|ass|lut|cube|otf|ttf|woff2?|braw|r3d|mxf|wav|aif|aiff|flac|mkv|mov|mp4|m4v|webm|avi|zip|7z|rar|pdf|docx?|xlsx?|pptx?|png|jpe?g|webp|gif|heic|svg|txt|csv|json)$/i;
const LEAD_ALLOWED = /\.(pdf|docx?|png|jpe?g|webp|gif|heic|zip|mp4|mov|m4v|webm|mkv|avi|mp3|wav|m4a|aac|flac|txt)$/i;

export function safeFilename(name: string): string {
  const base = name.replace(/[\\/]/g, "_").replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/\.{2,}/g, ".").replace(/^\.+/, "");
  return (base || "file").slice(-120);
}

function assertFileAllowed(filename: string, mime: string, size: number, opts: { lead?: boolean; maxBytes: number }) {
  if (!filename || filename.length > 255) throw badRequest("File name is missing or too long.");
  if (BLOCKED_EXT.test(filename)) throw new AppError("UNSUPPORTED", "That file type isn't allowed for security reasons.");
  const allowedType = ALLOWED_PREFIX.some((p) => mime.startsWith(p)) || ALLOWED_EXACT.has(mime) || EXT_ALLOW.test(filename);
  if (!allowedType) throw new AppError("UNSUPPORTED", "That file type isn't supported. Upload video, audio, images, PDFs, documents or ZIP archives.");
  if (opts.lead && !LEAD_ALLOWED.test(filename)) throw new AppError("UNSUPPORTED", "Attach PDF, DOCX, image, ZIP, video or audio files.");
  if (!Number.isFinite(size) || size <= 0) throw badRequest("The file appears to be empty.");
  if (size > opts.maxBytes) throw new AppError("BAD_REQUEST", `That file is larger than the ${(opts.maxBytes / 1024 ** 3).toFixed(opts.maxBytes >= 1024 ** 3 ? 0 : 1)} GB limit.`);
}

const dto = (a: Asset & { uploadedBy?: { name: string } | null; folder?: { key: string; name: string } | null }) => ({
  id: a.id,
  projectId: a.projectId,
  clientId: a.clientId,
  folderKey: a.folder?.key ?? null,
  folderName: a.folder?.name ?? null,
  filename: a.filename,
  displayName: a.displayName,
  mimeType: a.mimeType,
  sizeBytes: Number(a.sizeBytes),
  version: a.version,
  status: a.status,
  isDeliverable: a.isDeliverable,
  deliverableLabel: a.deliverableLabel,
  visibleToClient: a.visibleToClient,
  hasThumbnail: !!a.thumbnailKey,
  durationMs: a.durationMs,
  shared: !!a.sharedToken,
  uploadedBy: a.uploadedBy?.name ?? null,
  createdAt: a.createdAt,
});
export type AssetDTO = ReturnType<typeof dto>;

// ───────────────────────────── upload lifecycle ─────────────────────────────

export type UploadPurpose = "asset" | "version" | "deliverable" | "brand" | "lead_reference";

export interface RequestUploadInput {
  purpose?: UploadPurpose;
  projectId?: string;
  clientId?: string;
  draftToken?: string;
  folderKey?: string;
  filename: string;
  size: number;
  mimeType: string;
  fileRequestId?: string;
  label?: string;
}

async function folderId(projectId: string, key: string) {
  const known = DEFAULT_PROJECT_FOLDERS.find((f) => f.key === key);
  const name = known?.name ?? (key === "drafts" ? "Drafts" : key);
  const f = await db.assetFolder.upsert({ where: { projectId_key: { projectId, key } }, create: { projectId, key, name, sortOrder: known ? DEFAULT_PROJECT_FOLDERS.indexOf(known) : 99 }, update: {} });
  return f.id;
}

export async function requestUpload(actor: Actor | null, ip: string, input: RequestUploadInput) {
  const purpose = input.purpose ?? "asset";
  const storage = getStorage();
  const id = randomToken(12).replace(/[^A-Za-z0-9]/g, "x");
  const name = safeFilename(input.filename);
  const mime = (input.mimeType || "application/octet-stream").toLowerCase().slice(0, 120);

  // ── anonymous inquiry attachments ──
  if (purpose === "lead_reference") {
    if (!input.draftToken || !/^[A-Za-z0-9_-]{16,64}$/.test(input.draftToken)) throw badRequest("Missing upload session.");
    rateLimit(`lead-upload:${ip}`, 40, 60 * 60_000, "Too many uploads. Please try again in a bit.");
    const count = await db.asset.count({ where: { draftToken: input.draftToken, deletedAt: null } });
    if (count >= 10) throw badRequest("You can attach up to 10 files to a request. Add more after we reply.");
    assertFileAllowed(name, mime, input.size, { lead: true, maxBytes: 500 * 1024 * 1024 });
    const ws = (await db.workspace.findFirstOrThrow({ orderBy: { createdAt: "asc" } })).id;
    const key = `ws/${ws}/inquiries/${input.draftToken}/${id}/${name}`;
    const asset = await db.asset.create({ data: { id, workspaceId: ws, draftToken: input.draftToken, filename: name, displayName: input.filename.slice(0, 200), storageKey: key, mimeType: mime, sizeBytes: BigInt(input.size), status: "UPLOADING" } });
    return { asset: dto(asset), upload: await storage.uploadTarget(key, { contentType: mime, size: input.size }) };
  }

  if (!actor) throw new AppError("UNAUTHENTICATED", "Please sign in to upload files.");
  const settings = await getSetting(actor.workspaceId, "workflow");
  const maxBytes = Math.min(env.storage.maxUploadBytes, settings.maxUploadMb * 1024 * 1024);
  assertFileAllowed(name, mime, input.size, { maxBytes });

  // ── brand kit assets (attached to the client, not a project) ──
  if (purpose === "brand") {
    if (!input.clientId) throw badRequest("clientId is required.");
    const client = await db.client.findFirst({ where: { id: input.clientId, workspaceId: actor.workspaceId } });
    if (!client) throw notFound("Client");
    if (actor.isStaff) assertCan(actor, "clients:write");
    else assertOrgAction(actor, client.organizationId, "manage_projects");
    const key = `ws/${actor.workspaceId}/clients/${client.id}/${id}/${name}`;
    const asset = await db.asset.create({ data: { id, workspaceId: actor.workspaceId, clientId: client.id, uploadedById: actor.userId, filename: name, displayName: input.filename.slice(0, 200), storageKey: key, mimeType: mime, sizeBytes: BigInt(input.size), status: "UPLOADING" } });
    return { asset: dto(asset), upload: await storage.uploadTarget(key, { contentType: mime, size: input.size }) };
  }

  // ── project files / versions / deliverables ──
  if (!input.projectId) throw badRequest("projectId is required.");
  const project = await requireProject(actor, input.projectId);
  if (actor.isStaff) {
    if (purpose === "version") assertCan(actor, "versions:upload");
    else assertCan(actor, "files:write");
    if (purpose === "deliverable" && !(can(actor, "files:write") && (can(actor, "projects:transition") || can(actor, "versions:upload")))) throw forbidden();
  } else {
    if (purpose !== "asset") throw forbidden();
    assertOrgAction(actor, project.organizationId, "upload");
    if (["DELIVERED", "ARCHIVED", "CANCELLED"].includes(project.status)) throw new AppError("GATED", "This project is closed. Start a new project to send more files.");
  }
  const fKey = purpose === "version" ? "drafts" : purpose === "deliverable" ? "final-exports" : input.folderKey || "raw-footage";
  await ensureFolders(project.id);
  const fid = await folderId(project.id, fKey);
  const key = `ws/${actor.workspaceId}/projects/${project.id}/${id}/${name}`;
  const isDeliverable = purpose === "deliverable";
  const asset = await db.asset.create({
    data: {
      id,
      workspaceId: actor.workspaceId,
      projectId: project.id,
      clientId: project.clientId,
      folderId: fid,
      uploadedById: actor.userId,
      filename: name,
      displayName: input.filename.slice(0, 200),
      storageKey: key,
      mimeType: mime,
      sizeBytes: BigInt(input.size),
      status: "UPLOADING",
      isDeliverable,
      deliverableLabel: isDeliverable ? input.label ?? null : null,
      // deliverables stay hidden until the studio publishes them
      visibleToClient: isDeliverable ? false : true,
    },
    include: { folder: true, uploadedBy: { select: { name: true } } },
  });
  return { asset: dto(asset), upload: await storage.uploadTarget(key, { contentType: mime, size: input.size }), fileRequestId: input.fileRequestId ?? null };
}

/** The browser calls this after its direct upload finishes; we verify the object really exists and is the right size. */
export async function completeUpload(actor: Actor | null, assetId: string, input: { draftToken?: string; fileRequestId?: string; durationMs?: number } = {}) {
  const asset = await db.asset.findUnique({ where: { id: assetId }, include: { folder: true } });
  if (!asset) throw notFound("File");
  if (asset.status !== "UPLOADING") return dto(asset);

  // Authorisation mirrors request time: same anonymous token, or same actor with access to the project/client.
  if (asset.draftToken) {
    if (input.draftToken !== asset.draftToken) throw notFound("File");
  } else {
    if (!actor) throw new AppError("UNAUTHENTICATED", "Please sign in.");
    if (asset.uploadedById !== actor.userId && !(actor.isStaff && can(actor, "files:write"))) throw notFound("File");
    if (asset.workspaceId !== actor.workspaceId) throw notFound("File");
  }

  const head = await getStorage().head(asset.storageKey);
  if (!head) throw new AppError("BAD_REQUEST", "The upload didn't arrive. Please try again.");
  if (Math.abs(head.size - Number(asset.sizeBytes)) > 0 && head.size !== Number(asset.sizeBytes)) {
    await getStorage().remove(asset.storageKey).catch(() => {});
    await db.asset.update({ where: { id: asset.id }, data: { status: "FAILED" } });
    throw new AppError("BAD_REQUEST", "The uploaded file was incomplete. Please try again.");
  }

  // The declared type and extension come from the uploader. Look at the actual bytes: programs and web pages are refused.
  const problem = contentProblem(sniffContent(await getStorage().readHead(asset.storageKey, 512)), asset.mimeType, asset.filename);
  if (problem) {
    await getStorage().remove(asset.storageKey).catch(() => {});
    await db.asset.update({ where: { id: asset.id }, data: { status: "FAILED", scanStatus: "rejected" } });
    await audit(actor ?? { system: true, label: "Upload check" }, { workspaceId: asset.workspaceId, action: "asset.rejected", entityType: "asset", entityId: asset.id, message: `${asset.displayName} was rejected: ${problem}` });
    throw new AppError("UNSUPPORTED", `We couldn't accept ${asset.displayName}. ${problem}`);
  }

  // version detection: Interview_Final.mp4 / _V2 / _V3 are one file family
  const { group, version: parsed } = parseVersionedName(asset.displayName);
  let version = parsed;
  if (asset.projectId) {
    const latest = await db.asset.findFirst({ where: { projectId: asset.projectId, versionGroup: group, deletedAt: null, id: { not: asset.id }, folderId: asset.folderId }, orderBy: { version: "desc" }, select: { version: true } });
    if (latest) version = Math.max(latest.version + 1, parsed);
  }

  const scanNeeded = env.scan.provider !== "none";
  const updated = await db.asset.update({
    where: { id: asset.id },
    data: { status: scanNeeded ? "PROCESSING" : "READY", scanStatus: scanNeeded ? "pending" : "skipped", versionGroup: group, version, durationMs: input.durationMs ?? undefined },
    include: { folder: true, uploadedBy: { select: { name: true } } },
  });
  if (scanNeeded) await enqueueJob("asset.postprocess", { assetId: asset.id });

  if (asset.projectId && actor) {
    const project = await db.project.findUniqueOrThrow({ where: { id: asset.projectId } });
    if (input.fileRequestId) await fulfilFileRequest(actor, input.fileRequestId, asset.id).catch(() => {});
    const folderKey = asset.folder?.key;
    if (folderKey !== "drafts" && folderKey !== "final-exports") {
      const recent = await db.activityLog.findFirst({ where: { projectId: asset.projectId, type: "files.uploaded", actorId: actor.userId, createdAt: { gt: new Date(Date.now() - 10 * 60_000) } } });
      await logActivity(actor, { workspaceId: actor.workspaceId, type: "files.uploaded", message: `${actor.name} uploaded ${asset.displayName}`, projectId: asset.projectId, clientId: project.clientId, visibility: "CLIENT", entityType: "asset", entityId: asset.id });
      if (!recent && !actor.isStaff) await emit("files.uploaded", { workspaceId: actor.workspaceId, actorId: actor.userId, projectId: asset.projectId, clientId: project.clientId, data: { detail: asset.displayName } });
    }
  }
  return dto(updated);
}

/** Attach anonymous inquiry uploads to the lead that was just created. */
export async function attachDraftAssetsToLead(draftToken: string, leadId: string) {
  const r = await db.asset.updateMany({ where: { draftToken, leadId: null, deletedAt: null }, data: { leadId } });
  return r.count;
}

// thumbnails (captured client-side from the video, uploaded via a second signed URL)
export async function requestThumbnailUpload(actor: Actor, assetId: string) {
  const a = await getAssetOrThrow(actor, assetId);
  if (a.uploadedById !== actor.userId && !can(actor, "files:write")) throw forbidden();
  const key = `${a.storageKey}.thumb.jpg`;
  return { key, upload: await getStorage().uploadTarget(key, { contentType: "image/jpeg", size: 2 * 1024 * 1024 }) };
}

export async function confirmThumbnail(actor: Actor, assetId: string) {
  const a = await getAssetOrThrow(actor, assetId);
  const key = `${a.storageKey}.thumb.jpg`;
  const head = await getStorage().head(key);
  if (!head) throw badRequest("Thumbnail not uploaded.");
  await db.asset.update({ where: { id: assetId }, data: { thumbnailKey: key } });
  return { ok: true };
}

// ───────────────────────────── read ─────────────────────────────

export async function getAssetOrThrow(actor: Actor, id: string) {
  const a = await db.asset.findFirst({ where: { AND: [{ id }, assetScope(actor)] }, include: { folder: true, project: true, uploadedBy: { select: { name: true } } } });
  if (!a) throw notFound("File");
  return a;
}

export async function listFolders(actor: Actor, projectId: string) {
  await requireProject(actor, projectId);
  await ensureFolders(projectId);
  const [folders, counts] = await Promise.all([
    db.assetFolder.findMany({ where: { projectId, key: { not: "drafts" } }, orderBy: { sortOrder: "asc" } }),
    db.asset.groupBy({ by: ["folderId"], where: { AND: [{ projectId }, assetScope(actor)] }, _count: { _all: true } }),
  ]);
  const by = new Map(counts.map((c) => [c.folderId, c._count._all]));
  return folders.map((f) => ({ id: f.id, key: f.key, name: f.name, count: by.get(f.id) ?? 0 }));
}

export interface AssetListQuery {
  folderKey?: string;
  q?: string;
  page?: number;
  pageSize?: number;
  includeDrafts?: boolean;
  deliverablesOnly?: boolean;
}

export async function listAssets(actor: Actor, projectId: string, query: AssetListQuery = {}) {
  await requireProject(actor, projectId);
  const pageSize = Math.min(query.pageSize ?? 50, 100);
  const page = Math.max(query.page ?? 1, 1);
  const where: Prisma.AssetWhereInput = {
    AND: [
      { projectId },
      assetScope(actor),
      query.folderKey ? { folder: { key: query.folderKey } } : query.includeDrafts ? {} : { OR: [{ folder: null }, { folder: { key: { not: "drafts" } } }] },
      query.q ? { displayName: { contains: query.q, mode: "insensitive" } } : {},
      query.deliverablesOnly ? { isDeliverable: true } : {},
    ],
  };
  const [rows, total] = await Promise.all([
    db.asset.findMany({ where, orderBy: [{ createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize, include: { folder: true, uploadedBy: { select: { name: true } } } }),
    db.asset.count({ where }),
  ]);
  return { items: rows.map(dto), total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** All files across the actor's projects — used by the top-level Files pages. */
export async function listAllAssets(actor: Actor, query: { q?: string; projectId?: string; page?: number; pageSize?: number } = {}) {
  const pageSize = Math.min(query.pageSize ?? 40, 100);
  const page = Math.max(query.page ?? 1, 1);
  const where: Prisma.AssetWhereInput = {
    AND: [assetScope(actor), { projectId: { not: null } }, { OR: [{ folder: null }, { folder: { key: { not: "drafts" } } }] }, query.projectId ? { projectId: query.projectId } : {}, query.q ? { displayName: { contains: query.q, mode: "insensitive" } } : {}],
  };
  const [rows, total] = await Promise.all([
    db.asset.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { folder: true, uploadedBy: { select: { name: true } }, project: { select: { id: true, name: true, code: true } } } }),
    db.asset.count({ where }),
  ]);
  return { items: rows.map((r) => ({ ...dto(r), project: r.project })), total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function assetVersions(actor: Actor, id: string) {
  const a = await getAssetOrThrow(actor, id);
  if (!a.versionGroup || !a.projectId) return [dto(a)];
  const rows = await db.asset.findMany({ where: { AND: [{ projectId: a.projectId, versionGroup: a.versionGroup, folderId: a.folderId }, assetScope(actor)] }, orderBy: { version: "asc" }, include: { folder: true, uploadedBy: { select: { name: true } } } });
  return rows.map(dto);
}

// ───────────────────────────── delivery gating ─────────────────────────────

/** Final deliverables unlock only after approval AND payment conditions (or an explicit admin override). */
export async function deliverablesUnlocked(projectId: string, workspaceId: string): Promise<{ ok: boolean; reason?: string }> {
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  if (project.gateOverride) return { ok: true };
  if (!["APPROVED", "DELIVERED"].includes(project.status)) return { ok: false, reason: "Final files unlock once you approve the final version." };
  const wf = await getSetting(workspaceId, "workflow");
  if (wf.requirePaymentBeforeDelivery) {
    const unpaid = await db.invoice.count({ where: { projectId, status: { in: ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"] } } });
    if (unpaid) return { ok: false, reason: "Final files unlock once all invoices for this project are paid." };
  }
  return { ok: true };
}

/** A short-lived signed URL. Every access path (portal, share link) funnels through here. */
export async function getDownloadUrl(actor: Actor, id: string, opts: { inline?: boolean } = {}) {
  const a = await getAssetOrThrow(actor, id);
  if (a.status === "QUARANTINED") throw new AppError("GATED", "This file was quarantined by the malware scanner.");
  if (a.status !== "READY") throw new AppError("GATED", "This file is still processing.");
  if (a.isDeliverable && !actor.isStaff && a.projectId) {
    if (!a.visibleToClient) throw notFound("File");
    const gate = await deliverablesUnlocked(a.projectId, a.workspaceId);
    if (!gate.ok) throw new AppError("GATED", gate.reason ?? "Not available yet.");
  }
  const previewable = /^(video|audio)\//.test(a.mimeType) || (a.mimeType.startsWith("image/") && a.mimeType !== "image/svg+xml") || a.mimeType === "application/pdf";
  const url = await getStorage().downloadUrl(a.storageKey, { filename: a.displayName, contentType: a.mimeType, inline: !!opts.inline && previewable });
  if (a.isDeliverable) {
    await audit(actor, { workspaceId: a.workspaceId, action: "deliverable.downloaded", entityType: "asset", entityId: a.id, message: `${actor.name} downloaded ${a.displayName}` });
    if (!actor.isStaff && a.projectId) await logActivity(actor, { workspaceId: a.workspaceId, type: "deliverable.downloaded", message: `${actor.name} downloaded ${a.displayName}`, projectId: a.projectId, visibility: "CLIENT" });
  }
  return { url, filename: a.displayName, expiresInSec: 3600 };
}

export async function getThumbnailUrl(actor: Actor, id: string) {
  const a = await getAssetOrThrow(actor, id);
  if (a.thumbnailKey) return { url: await getStorage().downloadUrl(a.thumbnailKey, { inline: true, contentType: "image/jpeg", expiresSec: 3600 }) };
  if (a.mimeType.startsWith("image/") && a.mimeType !== "image/svg+xml" && a.status === "READY") return { url: await getStorage().downloadUrl(a.storageKey, { inline: true, contentType: a.mimeType, expiresSec: 3600 }) };
  return { url: null };
}

// ───────────────────────────── manage ─────────────────────────────

async function assertCanManage(actor: Actor, a: Awaited<ReturnType<typeof getAssetOrThrow>>, action: "edit" | "delete") {
  if (actor.isStaff) return assertCan(actor, action === "delete" ? "files:delete" : "files:write");
  // clients may manage only what they uploaded themselves, and only while the project is open
  if (a.uploadedById !== actor.userId) throw forbidden("You can only change files you uploaded.");
  if (a.project && ["DELIVERED", "ARCHIVED", "CANCELLED"].includes(a.project.status)) throw new AppError("GATED", "This project is closed.");
  if (a.project) assertOrgAction(actor, a.project.organizationId, "upload");
}

export async function renameAsset(actor: Actor, id: string, displayName: string) {
  const a = await getAssetOrThrow(actor, id);
  await assertCanManage(actor, a, "edit");
  const { group } = parseVersionedName(displayName);
  const updated = await db.asset.update({ where: { id }, data: { displayName: displayName.slice(0, 200), versionGroup: group }, include: { folder: true, uploadedBy: { select: { name: true } } } });
  return dto(updated);
}

export async function moveAsset(actor: Actor, id: string, folderKey: string) {
  const a = await getAssetOrThrow(actor, id);
  if (!a.projectId) throw badRequest("Only project files can be moved.");
  await assertCanManage(actor, a, "edit");
  if (!DEFAULT_PROJECT_FOLDERS.some((f) => f.key === folderKey)) throw badRequest("Unknown folder.");
  const fid = await folderId(a.projectId, folderKey);
  const updated = await db.asset.update({ where: { id }, data: { folderId: fid }, include: { folder: true, uploadedBy: { select: { name: true } } } });
  return dto(updated);
}

export async function deleteAsset(actor: Actor, id: string) {
  const a = await getAssetOrThrow(actor, id);
  await assertCanManage(actor, a, "delete");
  const inVersion = await db.videoVersion.count({ where: { assetId: id } });
  if (inVersion) throw new AppError("CONFLICT", "This file is used by a video version and can't be deleted.");
  await db.asset.update({ where: { id }, data: { deletedAt: new Date(), status: "DELETED", sharedToken: null } });
  await audit(actor, { workspaceId: actor.workspaceId, action: "asset.deleted", entityType: "asset", entityId: id, message: `${actor.name} deleted ${a.displayName}` });
  // physical removal happens off the request path
  void getStorage().remove(a.storageKey).catch(() => {});
  return { ok: true };
}

export async function shareAsset(actor: Actor, id: string, enable = true) {
  const a = await getAssetOrThrow(actor, id);
  if (!actor.isStaff && a.project) assertOrgAction(actor, a.project.organizationId, "view");
  if (a.isDeliverable && !a.visibleToClient) throw forbidden();
  const token = enable ? a.sharedToken ?? randomToken(24) : null;
  await db.asset.update({ where: { id }, data: { sharedToken: token } });
  await audit(actor, { workspaceId: actor.workspaceId, action: enable ? "asset.shared" : "asset.unshared", entityType: "asset", entityId: id, message: `${actor.name} ${enable ? "created a share link for" : "revoked the share link for"} ${a.displayName}` });
  return { url: token ? `${env.appUrl}/s/${token}` : null };
}

/** Resolves a public share token to a fresh signed URL (still honours delivery gating). */
export async function resolveShare(token: string) {
  const a = await db.asset.findFirst({ where: { sharedToken: token, deletedAt: null, status: "READY" }, include: { project: true } });
  if (!a) throw notFound("Shared file");
  if (a.isDeliverable && a.projectId) {
    const gate = await deliverablesUnlocked(a.projectId, a.workspaceId);
    if (!gate.ok) throw new AppError("GATED", gate.reason ?? "Not available yet.");
  }
  return { url: await getStorage().downloadUrl(a.storageKey, { filename: a.displayName, contentType: a.mimeType, inline: /^(video|audio|image)\//.test(a.mimeType) && a.mimeType !== "image/svg+xml", expiresSec: 900 }), filename: a.displayName, mimeType: a.mimeType };
}

// ───────────────────────────── deliverables (final delivery page) ─────────────────────────────

export async function setDeliverable(actor: Actor, id: string, input: { isDeliverable: boolean; label?: string | null; visibleToClient?: boolean }) {
  assertCan(actor, "files:write");
  const a = await getAssetOrThrow(actor, id);
  if (!a.projectId) throw badRequest("Only project files can be deliverables.");
  const updated = await db.asset.update({
    where: { id },
    data: { isDeliverable: input.isDeliverable, deliverableLabel: input.label ?? a.deliverableLabel, visibleToClient: input.visibleToClient ?? (input.isDeliverable ? false : true) },
    include: { folder: true, uploadedBy: { select: { name: true } } },
  });
  return dto(updated);
}

export async function listDeliverables(actor: Actor, projectId: string) {
  const project = await requireProject(actor, projectId);
  const rows = await db.asset.findMany({
    where: { AND: [{ projectId, isDeliverable: true }, assetScope(actor)] },
    orderBy: [{ deliverableLabel: "asc" }, { createdAt: "desc" }],
    include: { folder: true, uploadedBy: { select: { name: true } } },
  });
  const gate = await deliverablesUnlocked(projectId, actor.workspaceId);
  return { items: rows.map(dto), unlocked: gate.ok, lockedReason: gate.ok ? null : gate.reason ?? null, status: project.status };
}

export async function publishDeliverables(actor: Actor, projectId: string) {
  assertCan(actor, "files:write");
  const project = await requireProject(actor, projectId);
  if (!can(actor, "projects:transition") && !can(actor, "versions:upload")) throw forbidden();
  const r = await db.asset.updateMany({ where: { projectId, isDeliverable: true, status: "READY", visibleToClient: false, deletedAt: null }, data: { visibleToClient: true } });
  if (r.count === 0) throw badRequest("Upload at least one final deliverable first.");
  await audit(actor, { workspaceId: actor.workspaceId, action: "deliverables.published", entityType: "project", entityId: projectId, message: `${actor.name} published ${r.count} final deliverable(s) for ${project.code}` });
  await logActivity(actor, { workspaceId: actor.workspaceId, type: "deliverables.published", message: `Final deliverables are ready (${r.count} file${r.count === 1 ? "" : "s"})`, projectId, clientId: project.clientId, visibility: "CLIENT" });
  await emit("deliverables.published", { workspaceId: actor.workspaceId, actorId: actor.userId, projectId, clientId: project.clientId });
  return { published: r.count };
}

// ───────────────────────────── storage usage ─────────────────────────────

export async function storageUsage(actor: Actor, organizationId: string) {
  assertOrgAction(actor, organizationId, "view");
  const agg = await db.asset.aggregate({ where: { deletedAt: null, status: { in: ["READY", "PROCESSING"] }, OR: [{ project: { organizationId } }, { client: { organizationId } }] }, _sum: { sizeBytes: true }, _count: { _all: true } });
  const limit = 200 * 1024 ** 3;
  return { usedBytes: Number(agg._sum.sizeBytes ?? 0), limitBytes: limit, files: agg._count._all };
}

// ───────────────────────────── post-processing (background job) ─────────────────────────────

/** Largest file sent to the malware scanner in one request. */
const MAX_SCAN_BYTES = 200 * 1024 * 1024;

export async function postProcessAsset(assetId: string) {
  const a = await db.asset.findUnique({ where: { id: assetId } });
  if (!a || a.status === "DELETED") return;
  let status: AssetStatus = "READY";
  let scanStatus = "skipped";
  if (env.scan.provider === "clamav-http" && env.scan.url) {
    const size = Number(a.sizeBytes);
    if (size > MAX_SCAN_BYTES) {
      // Video masters are routinely far larger than a scanner can be sent in one request. They are released unscanned, and the record says so.
      scanStatus = "skipped_large";
    } else {
      const body = await getStorage().read(a.storageKey, MAX_SCAN_BYTES);
      const res = await fetch(env.scan.url, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: new Uint8Array(body), signal: AbortSignal.timeout(120_000) });
      const json = (await res.json().catch(() => ({}))) as { infected?: unknown };
      if (!res.ok) throw new Error(`Scanner returned ${res.status}`);
      // Anything other than an explicit true/false is treated as a failure (the job retries), never as "clean".
      if (typeof json.infected !== "boolean") throw new Error("Scanner returned an unreadable answer");
      scanStatus = json.infected ? "infected" : "clean";
      if (json.infected) status = "QUARANTINED";
    }
  }
  await db.asset.update({ where: { id: assetId }, data: { status, scanStatus } });
  if (status === "QUARANTINED") {
    await audit({ system: true, label: "Malware scanner" }, { workspaceId: a.workspaceId, action: "asset.quarantined", entityType: "asset", entityId: assetId, message: `${a.displayName} was quarantined by the malware scanner` });
    const admins = await db.user.findMany({ where: { workspaceId: a.workspaceId, isStaff: true, roles: { some: { role: { key: { in: ["super_admin", "admin"] } } } } }, select: { id: true } });
    await notify({ workspaceId: a.workspaceId, userIds: admins.map((u) => u.id), category: "SYSTEM", type: "asset.quarantined", title: "A file was quarantined", message: a.displayName, link: a.projectId ? `/admin/projects/${a.projectId}` : "/admin/files", email: true });
  }
}

export { projectWhere };
