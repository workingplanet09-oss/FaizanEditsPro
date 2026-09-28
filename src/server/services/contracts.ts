import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import { AppError, badRequest, notFound } from "../errors";
import { assertCan, assertOrgAction, type Actor } from "../auth/actor";
import { contractScope, projectWhere } from "../auth/access";
import { emit } from "../events/bus";
import { getRequestMeta } from "../request-context";
import { audit, logActivity } from "./audit";
import { nextNumber, pageArgs, paged, type PageInput } from "./common";
import { applyTransition, DEFAULT_SCOPE, isActor, type Scope, type Who } from "./projects";
import { getSetting } from "./settings";
import { CONTRACT_TEMPLATE } from "@/lib/site-defaults";
import { fillVars } from "../email/render";
import { formatMoney } from "@/lib/money";

export interface ContractSection {
  key: string;
  title: string;
  body: string;
}

const hashSections = (sections: ContractSection[]) => createHash("sha256").update(JSON.stringify(sections)).digest("hex");

async function buildSections(projectId: string, quoteId?: string | null): Promise<{ sections: ContractSection[]; vars: Record<string, string> }> {
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId }, include: { client: true } });
  const [business, quote] = await Promise.all([getSetting(project.workspaceId, "business"), quoteId ? db.quote.findUnique({ where: { id: quoteId } }) : db.quote.findFirst({ where: { projectId, status: "ACCEPTED" }, orderBy: { createdAt: "desc" } })]);
  const scope = (project.scope ?? DEFAULT_SCOPE) as unknown as Scope;
  const cur = quote?.currency ?? project.currency;
  const deliverables = scope.deliverables.length ? scope.deliverables.map((d) => `• ${d.quantity} × ${d.label}`).join("\n") : "• As described in the accepted quote";
  const vars: Record<string, string> = {
    studio_name: business.legalName || business.name,
    client_name: project.client.name,
    company: project.client.companyName,
    project_name: project.name,
    scope: project.description || scope.notes || "As described in the accepted quote and project brief.",
    deliverables,
    turnaround: `${scope.turnaroundBusinessDays} business days`,
    total: quote ? formatMoney(quote.total, cur) : "as per the accepted quote",
    deposit: quote ? formatMoney(quote.deposit, cur) : "as per the accepted quote",
    balance: quote ? formatMoney(quote.balance, cur) : "as per the accepted quote",
    revision_rounds: String(scope.revisionRounds),
  };
  return { sections: CONTRACT_TEMPLATE.map((s) => ({ key: s.key, title: s.title, body: fillVars(s.body, vars) })), vars };
}

export async function createContractDraft(who: Who, projectId: string, quoteId?: string | null) {
  const project = await db.project.findFirst({ where: isActor(who) ? projectWhere(who, projectId) : { id: projectId }, include: { client: true } });
  if (!project) throw notFound("Project");
  if (isActor(who)) assertCan(who, "contracts:write");
  const existing = await db.contract.findFirst({ where: { projectId, status: { in: ["DRAFT", "SENT", "VIEWED", "SIGNED"] } } });
  if (existing) return existing;
  const { sections, vars } = await buildSections(projectId, quoteId);
  const number = `C-${await nextNumber(project.workspaceId, "contract", 1000)}`;
  const contract = await db.contract.create({
    data: {
      workspaceId: project.workspaceId,
      organizationId: project.organizationId,
      clientId: project.clientId,
      projectId,
      quoteId: quoteId ?? undefined,
      number,
      title: `Editing agreement — ${project.name}`,
      createdById: isActor(who) ? who.userId : undefined,
      isDemo: project.isDemo,
      versions: { create: { version: 1, sections: sections as unknown as Prisma.InputJsonValue, variables: vars as Prisma.InputJsonValue, contentHash: hashSections(sections), createdById: isActor(who) ? who.userId : undefined } },
    },
  });
  await audit(who, { workspaceId: project.workspaceId, action: "contract.created", entityType: "contract", entityId: contract.id, message: `Contract ${number} drafted for ${project.code}` });
  return contract;
}

export async function updateContract(actor: Actor, id: string, patch: { title?: string; sections?: ContractSection[] }) {
  assertCan(actor, "contracts:write");
  const c = await db.contract.findFirst({ where: { AND: [{ id }, contractScope(actor)] }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
  if (!c) throw notFound("Contract");
  if (c.status === "SIGNED") throw new AppError("CONFLICT", "A signed contract can't be edited.");
  if (patch.sections) {
    const latest = c.versions[0];
    const changed = hashSections(patch.sections) !== latest.contentHash;
    if (changed) {
      const wasSent = c.status !== "DRAFT";
      const version = wasSent ? c.currentVersion + 1 : c.currentVersion;
      if (wasSent) {
        await db.contractVersion.create({ data: { contractId: id, version, sections: patch.sections as unknown as Prisma.InputJsonValue, variables: (latest.variables ?? {}) as Prisma.InputJsonValue, contentHash: hashSections(patch.sections), createdById: actor.userId } });
      } else {
        await db.contractVersion.update({ where: { contractId_version: { contractId: id, version } }, data: { sections: patch.sections as unknown as Prisma.InputJsonValue, contentHash: hashSections(patch.sections) } });
      }
      await db.contract.update({ where: { id }, data: { currentVersion: version, status: "DRAFT", title: patch.title ?? c.title } });
    }
  } else if (patch.title) {
    await db.contract.update({ where: { id }, data: { title: patch.title } });
  }
  await audit(actor, { workspaceId: actor.workspaceId, action: "contract.updated", entityType: "contract", entityId: id, message: `${actor.name} edited contract ${c.number}` });
  return getContract(actor, id);
}

export async function sendContract(actor: Actor, id: string) {
  assertCan(actor, "contracts:write");
  const c = await db.contract.findFirst({ where: { AND: [{ id }, contractScope(actor)] } });
  if (!c) throw notFound("Contract");
  if (c.status === "SIGNED") throw new AppError("CONFLICT", "This contract is already signed.");
  const updated = await db.contract.update({ where: { id }, data: { status: "SENT", sentAt: new Date() } });
  await db.project.update({ where: { id: c.projectId }, data: { clientVisible: true } });
  await audit(actor, { workspaceId: actor.workspaceId, action: "contract.sent", entityType: "contract", entityId: id, message: `${actor.name} sent contract ${c.number}` });
  await logActivity(actor, { workspaceId: actor.workspaceId, type: "contract.sent", message: `Contract ${c.number} sent for signature`, projectId: c.projectId, clientId: c.clientId, visibility: "CLIENT" });
  const lead = await db.lead.findFirst({ where: { convertedClientId: c.clientId }, select: { id: true } });
  if (lead) await db.leadActivity.create({ data: { leadId: lead.id, type: "contract_sent", title: `Contract ${c.number} sent`, actorId: actor.userId } });
  await emit("contract.sent", { workspaceId: actor.workspaceId, actorId: actor.userId, projectId: c.projectId, clientId: c.clientId, contractId: id });
  return updated;
}

export async function getContract(actor: Actor, id: string, opts: { markViewed?: boolean } = {}) {
  const c = await db.contract.findFirst({
    where: { AND: [{ id }, contractScope(actor)] },
    include: {
      client: { select: { id: true, name: true, companyName: true, email: true } },
      project: { select: { id: true, name: true, code: true, status: true } },
      versions: { orderBy: { version: "desc" }, include: { signatures: true } },
    },
  });
  if (!c) throw notFound("Contract");
  if (opts.markViewed && !actor.isStaff && c.status === "SENT") {
    await db.contract.update({ where: { id }, data: { status: "VIEWED", viewedAt: new Date() } });
    await logActivity(actor, { workspaceId: actor.workspaceId, type: "contract.viewed", message: `${actor.name} viewed contract ${c.number}`, projectId: c.projectId, clientId: c.clientId, visibility: "INTERNAL" });
    c.status = "VIEWED";
  }
  const current = c.versions.find((v) => v.version === c.currentVersion) ?? c.versions[0];
  return {
    id: c.id,
    number: c.number,
    title: c.title,
    status: c.status,
    currentVersion: c.currentVersion,
    sentAt: c.sentAt,
    signedAt: c.signedAt,
    createdAt: c.createdAt,
    client: c.client,
    project: c.project,
    sections: current.sections as unknown as ContractSection[],
    contentHash: current.contentHash,
    versions: c.versions.map((v) => ({ version: v.version, createdAt: v.createdAt })),
    signatures: c.versions.flatMap((v) => v.signatures).map((s) => ({ id: s.id, signerName: s.signerName, signerEmail: s.signerEmail, signatureKind: s.signatureKind, signatureData: s.signatureKind === "typed" ? s.signatureData : s.signatureData, signedAt: s.signedAt, version: c.versions.find((v) => v.id === s.contractVersionId)?.version, ...(actor.isStaff ? { ip: s.ip, userAgent: s.userAgent, contentHash: s.contentHash } : {}) })),
  };
}

export async function listContracts(actor: Actor, query: PageInput & { status?: string; q?: string } = {}) {
  const { page, pageSize, skip, take } = pageArgs(query);
  const where: Prisma.ContractWhereInput = { AND: [contractScope(actor), query.status ? { status: query.status as any } : {}, query.q ? { OR: [{ number: { contains: query.q, mode: "insensitive" } }, { title: { contains: query.q, mode: "insensitive" } }, { client: { companyName: { contains: query.q, mode: "insensitive" } } }] } : {}] };
  const [rows, total] = await Promise.all([
    db.contract.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, include: { client: { select: { companyName: true, name: true } }, project: { select: { id: true, name: true, code: true } } } }),
    db.contract.count({ where }),
  ]);
  return paged(rows, total, page, pageSize);
}

/** Client signs the CURRENT version. We keep who/when/from where, plus a hash of exactly what they saw. */
export async function signContract(actor: Actor, id: string, input: { signerName: string; signature: string; kind: "typed" | "drawn"; accept: boolean; version: number }) {
  const c = await db.contract.findFirst({ where: { AND: [{ id }, contractScope(actor)] }, include: { versions: true } });
  if (!c) throw notFound("Contract");
  assertOrgAction(actor, c.organizationId, "approve");
  if (c.status === "SIGNED") throw new AppError("CONFLICT", "This contract has already been signed.");
  if (!["SENT", "VIEWED"].includes(c.status)) throw new AppError("CONFLICT", "This contract isn't open for signature.");
  if (!input.accept) throw badRequest("Please confirm you agree to the terms.", { accept: "Required." });
  if (input.version !== c.currentVersion) throw new AppError("CONFLICT", "This contract was updated. Refresh the page to review the latest version before signing.");
  const v = c.versions.find((x) => x.version === c.currentVersion)!;
  if (input.kind === "drawn" && (!input.signature.startsWith("data:image/png;base64,") || input.signature.length > 200_000)) throw badRequest("Invalid signature image.");
  if (input.kind === "typed" && input.signature.trim().length < 2) throw badRequest("Type your full name to sign.", { signature: "Required." });

  const meta = getRequestMeta();
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.userId } });
  await db.$transaction([
    db.contractSignature.create({ data: { contractVersionId: v.id, signerUserId: actor.userId, signerName: input.signerName.trim(), signerEmail: user.email, signatureData: input.signature, signatureKind: input.kind, acceptedTerms: true, ip: meta.ip, userAgent: meta.userAgent, contentHash: v.contentHash } }),
    db.contract.update({ where: { id }, data: { status: "SIGNED", signedAt: new Date(), signedById: actor.userId } }),
  ]);
  await audit(actor, { workspaceId: actor.workspaceId, action: "contract.signed", entityType: "contract", entityId: id, message: `${actor.name} signed contract ${c.number} (v${c.currentVersion})`, metadata: { version: c.currentVersion, hash: v.contentHash, ip: meta.ip ?? null } });
  await logActivity(actor, { workspaceId: actor.workspaceId, type: "contract.signed", message: `${actor.name} signed contract ${c.number}`, projectId: c.projectId, clientId: c.clientId, visibility: "CLIENT" });
  const lead = await db.lead.findFirst({ where: { convertedClientId: c.clientId }, select: { id: true } });
  if (lead) await db.leadActivity.create({ data: { leadId: lead.id, type: "contract_signed", title: `Contract ${c.number} signed by ${actor.name}` } });

  const project = await db.project.findUniqueOrThrow({ where: { id: c.projectId } });
  if (project.status === "AWAITING_CONTRACT") await applyTransition(actor, c.projectId, "AWAITING_PAYMENT", { comment: `Contract ${c.number} signed`, quiet: true });

  const wf = await getSetting(actor.workspaceId, "workflow");
  if (wf.autoInvoiceOnContractSigned && c.quoteId) {
    const { createInvoiceFromQuote, sendInvoice } = await import("./invoices");
    const quote = await db.quote.findUnique({ where: { id: c.quoteId } });
    const exists = await db.invoice.count({ where: { quoteId: c.quoteId, kind: { in: ["DEPOSIT", "FULL"] }, status: { not: "CANCELLED" } } });
    if (quote && !exists) {
      const inv = await createInvoiceFromQuote({ system: true, label: "System" }, quote, quote.balance > 0 ? "DEPOSIT" : "FULL");
      await sendInvoice({ system: true, label: "System" }, inv.id);
    }
  }
  await emit("contract.signed", { workspaceId: actor.workspaceId, actorId: actor.userId, projectId: c.projectId, clientId: c.clientId, contractId: id });
  return getContract(actor, id);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Standalone, print-friendly HTML (users can "Save as PDF"). Everything is escaped. */
export async function renderContractHtml(actor: Actor, id: string) {
  const c = await getContract(actor, id);
  const business = await getSetting(actor.workspaceId, "business");
  const sigs = c.signatures.filter((s) => s.version === c.currentVersion);
  const body = c.sections.map((s) => `<h2>${esc(s.title)}</h2>${s.body.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("")}`).join("");
  const sig = sigs.length
    ? sigs.map((s) => `<div class="sig"><div>${s.signatureKind === "drawn" ? `<img src="${esc(s.signatureData)}" alt="Signature" style="max-height:80px">` : `<div class="typed">${esc(s.signatureData)}</div>`}</div><div class="meta">Signed by ${esc(s.signerName)} (${esc(s.signerEmail)}) on ${new Date(s.signedAt).toUTCString()}</div></div>`).join("")
    : `<p class="meta">Not yet signed.</p>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(c.number)} — ${esc(c.title)}</title><style>body{font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;max-width:760px;margin:40px auto;padding:0 24px;color:#151517}h1{font-size:26px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 6px}.meta{color:#666;font-size:13px}.sig{margin-top:24px;border-top:1px solid #ddd;padding-top:12px}.typed{font:italic 30px Georgia,serif}@media print{body{margin:0}}</style></head><body><div class="meta">${esc(business.name)}</div><h1>${esc(c.title)}</h1><div class="meta">Contract ${esc(c.number)} · version ${c.currentVersion} · ${esc(c.status)}</div>${body}<h2>Signatures</h2>${sig}<p class="meta">Document fingerprint (SHA-256): ${esc(c.contentHash)}</p></body></html>`;
  return { html, filename: `${c.number}.html` };
}
