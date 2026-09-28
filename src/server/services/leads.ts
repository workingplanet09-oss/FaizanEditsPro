import type { LeadStatus, LeadTemperature, Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import { AppError, badRequest, notFound } from "../errors";
import { assertCan, can, type Actor } from "../auth/actor";
import { leadScope, projectScope } from "../auth/access";
import { emit } from "../events/bus";
import { queueEmail, absoluteUrl } from "../email";
import { rateLimit } from "../security/ratelimit";
import { audit, logActivity } from "./audit";
import { createClientRecord } from "./clients";
import { nextNumber, pageArgs, paged, type PageInput } from "./common";
import { assertValid, displayAnswer, getFormDef, markDraftSubmitted, saveResponses, validateSubmission } from "./onboarding";
import { attachDraftAssetsToLead } from "./assets";
import { createProject } from "./projects";
import { getSetting, getWorkspaceId } from "./settings";
import { activeCategories, type Answers, type FormDef } from "@/lib/conditions";
import { scoreLead } from "@/lib/lead-score";
import { BUDGET_RANGES, SERVICE_TO_LOOKING_FOR } from "@/lib/site-defaults";

export interface InquiryInput {
  answers: Answers;
  serviceSlug?: string | null;
  draftToken?: string | null;
  utm?: { source?: string; medium?: string; campaign?: string; term?: string; content?: string };
  referrer?: string | null;
  referralCode?: string | null;
  ip: string;
  /** a signed-in client submitting a new request from the portal */
  actor?: Actor | null;
}

const LEAD_FIELDS = ["name", "email", "phone", "company", "website", "instagram", "youtube", "linkedin", "budgetRange", "clientType", "lookingFor", "industry", "description", "stylePrefs"] as const;
type LeadField = (typeof LEAD_FIELDS)[number];

function extractLeadFields(form: FormDef, clean: Answers): Partial<Record<LeadField, any>> {
  const out: Partial<Record<LeadField, any>> = {};
  for (const s of form.sections) {
    for (const q of s.questions) {
      const f = q.meta?.leadField as LeadField | undefined;
      if (f && LEAD_FIELDS.includes(f) && clean[q.key] !== undefined) out[f] = clean[q.key];
    }
  }
  return out;
}

const SOURCE_HINTS: [RegExp, string][] = [
  [/instagram|^ig$/i, "instagram"],
  [/linkedin/i, "linkedin"],
  [/youtube|^yt$/i, "youtube"],
  [/google|adwords/i, "google"],
  [/newsletter|email|mailchimp/i, "email"],
  [/facebook|meta|tiktok|ads?$|cpc|paid/i, "advertisement"],
];

function detectSource(input: InquiryInput): string {
  if (input.actor) return "portal";
  if (input.referralCode) return "referral";
  const raw = `${input.utm?.source ?? ""} ${input.utm?.medium ?? ""}`;
  for (const [re, key] of SOURCE_HINTS) if (re.test(raw)) return key;
  if (input.utm?.source) return "other";
  const ref = input.referrer ?? "";
  if (ref) {
    let host = "";
    try {
      host = new URL(ref).hostname;
    } catch {
      /* ignore */
    }
    for (const [re, key] of SOURCE_HINTS) if (host && re.test(host)) return key;
    if (host) return "website";
  }
  return "direct";
}

/**
 * Public inquiry submission (the Start Project wizard). Validates against the DB-defined form, scores the lead,
 * stores every answer, attaches uploads and notifies the studio. Nothing internal is returned to the visitor.
 */
export async function submitInquiry(input: InquiryInput) {
  rateLimit(`inquiry:${input.ip}`, 6, 15 * 60_000, "You've sent several requests recently. Please wait a few minutes or email us directly.");
  const ws = await getWorkspaceId();
  const form = await getFormDef(ws, "inquiry");
  if (!form) throw new AppError("NOT_CONFIGURED", "The inquiry form isn't configured yet.");

  // signed-in clients don't re-enter contact details
  let answers = { ...input.answers };
  let existingClientId: string | null = null;
  const skip: string[] = [];
  if (input.actor && !input.actor.isStaff) {
    const client = await db.client.findFirst({ where: { organizationId: { in: input.actor.orgs.map((o) => o.organizationId) } }, orderBy: { createdAt: "asc" } });
    if (client) {
      existingClientId = client.id;
      skip.push("contact");
      const fields: Record<string, string | null | undefined> = { name: client.name, email: client.email, phone: client.phone, company: client.companyName, website: client.website };
      for (const s of form.sections)
        for (const q of s.questions) {
          const f = q.meta?.leadField as string | undefined;
          if (f && fields[f]) answers[q.key] = fields[f];
        }
    }
  }

  const { clean, errors } = validateSubmission(form, answers, { skipSections: skip.filter((s) => s !== "contact") });
  // attachments are validated by the asset pipeline, so an unanswered optional FILE is fine
  assertValid(errors);

  const f = extractLeadFields(form, clean);
  if (!f.name || !f.email) throw new AppError("VALIDATION", "Name and email are required.", { fields: { name: f.name ? "" : "Required", email: f.email ? "" : "Required" } });

  const budgetKey = String(Array.isArray(f.budgetRange) ? f.budgetRange[0] : f.budgetRange ?? "");
  const budget = BUDGET_RANGES.find((b) => b.value === budgetKey);
  const scoreInput: Answers = { ...clean, budget: budgetKey, client_type: f.clientType ?? clean.client_type, looking_for: f.lookingFor ?? clean.looking_for, company: f.company, website: f.website };
  const scored = scoreLead(scoreInput);

  const sourceKey = detectSource(input);
  const source = await db.leadSource.findUnique({ where: { key: sourceKey } });
  const year = new Date().getFullYear();
  const seq = await nextNumber(ws, `lead-${year}`, 0);
  const requestCode = `REQ-${year}-${String(seq).padStart(4, "0")}`;

  const serviceSlug = input.serviceSlug ?? null;
  const lead = await db.lead.create({
    data: {
      workspaceId: ws,
      requestCode,
      name: String(f.name).trim(),
      email: String(f.email).trim().toLowerCase(),
      phone: f.phone ?? undefined,
      company: f.company ?? undefined,
      website: f.website ?? undefined,
      instagram: f.instagram ?? undefined,
      youtube: f.youtube ?? undefined,
      linkedin: f.linkedin ?? undefined,
      industry: f.industry ? String(f.industry) : undefined,
      clientType: f.clientType ? String(f.clientType) : undefined,
      lookingFor: f.lookingFor ? String(f.lookingFor) : undefined,
      serviceSlug: serviceSlug ?? undefined,
      projectType: f.lookingFor ? String(f.lookingFor) : undefined,
      budgetRange: budgetKey || undefined,
      budgetMax: budget ? budget.maxUsd * 100 : undefined,
      stylePrefs: Array.isArray(f.stylePrefs) ? f.stylePrefs.map(String) : f.stylePrefs ? [String(f.stylePrefs)] : [],
      description: f.description ? String(f.description) : undefined,
      answers: clean as Prisma.InputJsonValue,
      sourceId: source?.id,
      utmSource: input.utm?.source?.slice(0, 120),
      utmMedium: input.utm?.medium?.slice(0, 120),
      utmCampaign: input.utm?.campaign?.slice(0, 120),
      utmTerm: input.utm?.term?.slice(0, 120),
      utmContent: input.utm?.content?.slice(0, 120),
      referrer: input.referrer?.slice(0, 300),
      referralCode: input.referralCode?.toUpperCase().slice(0, 24),
      existingClientId,
      status: existingClientId ? "QUALIFIED" : "NEW",
      score: scored.score,
      scoreBreakdown: scored.breakdown,
      temperature: scored.temperature,
    },
  });

  await saveResponses({ workspaceId: ws, formKey: "inquiry", subjectType: "LEAD", subjectId: lead.id, form, answers: clean });
  if (input.draftToken) {
    await attachDraftAssetsToLead(input.draftToken, lead.id);
    await markDraftSubmitted(input.draftToken);
  }
  await db.leadActivity.create({ data: { leadId: lead.id, type: "inquiry_submitted", title: "Inquiry submitted", metadata: { source: sourceKey, requestCode } } });

  if (input.referralCode) {
    const referrer = await db.client.findFirst({ where: { workspaceId: ws, referralCode: input.referralCode.toUpperCase() } });
    if (referrer) await db.referral.create({ data: { workspaceId: ws, code: referrer.referralCode!, referrerClientId: referrer.id, referredLeadId: lead.id } });
  }

  // confirmation email to the visitor (fire-and-forget through the queue)
  const looking = form.sections.flatMap((s) => s.questions).find((q) => q.key === "looking_for");
  const projectLabel = looking ? displayAnswer(looking, clean.looking_for) : "Video editing";
  await queueEmail({
    workspaceId: ws,
    toEmail: lead.email,
    templateKey: "lead_received",
    vars: { client_name: lead.name, request_id: requestCode, project_type: projectLabel, response_time: (await getSetting(ws, "contactInfo")).responseTime, dashboard_url: absoluteUrl("/dashboard") },
  });
  await emit("lead.created", { workspaceId: ws, leadId: lead.id, data: { temperature: scored.temperature } });

  const contact = await getSetting(ws, "contactInfo");
  return { requestCode, projectType: projectLabel, responseTime: contact.responseTime, nextStep: existingClientId ? "We'll prepare a quote and share it in your portal." : "We'll review your request and reply by email with next steps — usually a short call or a quote." };
}

// ───────────────────────────── wizard helpers (signed-in clients) ─────────────────────────────

/** Contact details a signed-in client doesn't need to retype, plus their earlier projects to start from. */
export async function inquiryPrefill(actor: Actor | null) {
  const empty = { skipContact: false, answers: {} as Answers, previousProjects: [] as { id: string; name: string }[] };
  if (!actor || actor.isStaff) return empty;
  const client = await db.client.findFirst({ where: { organizationId: { in: actor.orgs.map((o) => o.organizationId) } }, orderBy: { createdAt: "asc" } });
  if (!client) return empty;
  const form = await getFormDef(actor.workspaceId, "inquiry");
  const answers: Answers = {};
  const fields: Record<string, string | null | undefined> = { name: client.name, email: client.email, phone: client.phone, company: client.companyName, website: client.website };
  for (const s of form?.sections ?? []) for (const q of s.questions) {
    const f = q.meta?.leadField as string | undefined;
    if (f && fields[f]) answers[q.key] = fields[f];
  }
  const projects = await db.project.findMany({ where: { organizationId: { in: actor.orgs.map((o) => o.organizationId) }, clientVisible: true, leadId: { not: null } }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, name: true } });
  return { skipContact: true, answers, previousProjects: projects };
}

/** Answers from the request that started one of the client's earlier projects (minus one-off fields). */
export async function previousAnswersForProject(actor: Actor, projectId: string): Promise<Answers> {
  const project = await db.project.findFirst({ where: { AND: [{ id: projectId }, projectScope(actor)] }, select: { leadId: true } });
  const lead = project?.leadId ? await db.lead.findUnique({ where: { id: project.leadId }, select: { answers: true } }) : null;
  if (!lead) throw notFound("Project");
  const answers = { ...((lead.answers as Answers) ?? {}) };
  for (const k of ["project_description", "deadline", "special_requests", "reference_links", "reference_files", "examples", "deadline_date"]) delete answers[k];
  return answers;
}

// ───────────────────────────── admin CRM ─────────────────────────────

export interface LeadListQuery extends PageInput {
  q?: string;
  section?: "leads" | "prospects" | "lost" | "converted" | "all";
  status?: string;
  temperature?: string;
  source?: string;
  assignedTo?: string;
  sort?: string;
}

const SECTION_STATUSES: Record<string, LeadStatus[]> = {
  leads: ["NEW", "CONTACTED", "CALL_SCHEDULED"],
  prospects: ["QUALIFIED", "QUOTED"],
  lost: ["LOST", "ARCHIVED"],
  converted: ["CONVERTED"],
};

const effectiveTemp = (l: { temperature: LeadTemperature; temperatureOverride: LeadTemperature | null }) => l.temperatureOverride ?? l.temperature;

export async function listLeads(actor: Actor, query: LeadListQuery = {}) {
  assertCan(actor, "leads:read");
  const { page, pageSize, skip, take } = pageArgs(query);
  const and: Prisma.LeadWhereInput[] = [leadScope(actor)];
  if (query.status) and.push({ status: query.status as LeadStatus });
  else if (query.section && query.section !== "all") and.push({ status: { in: SECTION_STATUSES[query.section] } });
  if (query.temperature) and.push({ OR: [{ temperatureOverride: query.temperature as LeadTemperature }, { temperatureOverride: null, temperature: query.temperature as LeadTemperature }] });
  if (query.source) and.push({ source: { key: query.source } });
  if (query.assignedTo === "me") and.push({ assignedToId: actor.userId });
  else if (query.assignedTo === "none") and.push({ assignedToId: null });
  else if (query.assignedTo) and.push({ assignedToId: query.assignedTo });
  if (query.q) and.push({ OR: [{ name: { contains: query.q, mode: "insensitive" } }, { company: { contains: query.q, mode: "insensitive" } }, { email: { contains: query.q, mode: "insensitive" } }, { requestCode: { contains: query.q, mode: "insensitive" } }] });
  const where: Prisma.LeadWhereInput = { AND: and };
  const orderBy: Prisma.LeadOrderByWithRelationInput[] = query.sort === "score" ? [{ score: "desc" }] : query.sort === "followup" ? [{ nextFollowUpAt: { sort: "asc", nulls: "last" } }] : query.sort === "oldest" ? [{ createdAt: "asc" }] : [{ createdAt: "desc" }];
  const [rows, total] = await Promise.all([
    db.lead.findMany({ where, orderBy, skip, take, include: { source: true, assignedTo: { select: { id: true, name: true } } } }),
    db.lead.count({ where }),
  ]);
  return paged(
    rows.map((l) => ({
      id: l.id,
      requestCode: l.requestCode,
      name: l.name,
      company: l.company,
      email: l.email,
      status: l.status,
      temperature: effectiveTemp(l),
      overridden: !!l.temperatureOverride,
      budgetRange: l.budgetRange,
      lookingFor: l.lookingFor,
      source: l.source?.label ?? null,
      assignedTo: l.assignedTo,
      nextFollowUpAt: l.nextFollowUpAt,
      lastContactAt: l.lastContactAt,
      createdAt: l.createdAt,
      tags: l.tags,
      existingClient: !!l.existingClientId,
    })),
    total,
    page,
    pageSize,
  );
}

export async function leadCounts(actor: Actor) {
  const base = leadScope(actor);
  const groups = await db.lead.groupBy({ by: ["status"], where: base, _count: { _all: true } });
  const by = Object.fromEntries(groups.map((g) => [g.status, g._count._all]));
  const sum = (k: string) => SECTION_STATUSES[k].reduce((s, st) => s + (by[st] ?? 0), 0);
  return { leads: sum("leads"), prospects: sum("prospects"), lost: sum("lost"), converted: sum("converted") };
}

export async function getLead(actor: Actor, id: string) {
  const lead = await db.lead.findFirst({
    where: { AND: [{ id }, leadScope(actor)] },
    include: {
      source: true,
      assignedTo: { select: { id: true, name: true } },
      activities: { orderBy: { createdAt: "desc" }, include: { actor: { select: { name: true } } } },
      meetings: { orderBy: { startsAt: "desc" } },
      quotes: { select: { id: true, number: true, status: true, total: true, currency: true, createdAt: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!lead) throw notFound("Lead");
  const form = await getFormDef(lead.workspaceId, "inquiry");
  const qMap = new Map(form?.sections.flatMap((s) => s.questions).map((q) => [q.key, q]) ?? []);
  const answers = Object.entries((lead.answers ?? {}) as Answers)
    .filter(([k]) => qMap.has(k))
    .map(([k, v]) => ({ key: k, question: qMap.get(k)!.text, section: qMap.get(k)!.sectionKey, answer: displayAnswer(qMap.get(k), v) }));
  const attachments = await db.asset.findMany({ where: { leadId: id, deletedAt: null, status: "READY" }, select: { id: true, displayName: true, mimeType: true, sizeBytes: true, createdAt: true } });
  const client = lead.convertedClientId ? await db.client.findUnique({ where: { id: lead.convertedClientId }, select: { id: true, companyName: true, status: true } }) : lead.existingClientId ? await db.client.findUnique({ where: { id: lead.existingClientId }, select: { id: true, companyName: true, status: true } }) : null;
  const project = await db.project.findFirst({ where: { leadId: id }, select: { id: true, name: true, code: true, status: true } });
  return {
    ...lead,
    temperature: effectiveTemp(lead),
    computedTemperature: lead.temperature,
    overridden: !!lead.temperatureOverride,
    answers,
    attachments: attachments.map((a) => ({ ...a, sizeBytes: Number(a.sizeBytes) })),
    client,
    project,
  };
}

export async function updateLead(actor: Actor, id: string, patch: Partial<{ status: LeadStatus; assignedToId: string | null; nextFollowUpAt: Date | null; tags: string[]; temperatureOverride: LeadTemperature | null; lostReason: string | null; phone: string | null; company: string | null }>) {
  assertCan(actor, "leads:write");
  const before = await db.lead.findFirst({ where: { AND: [{ id }, leadScope(actor)] } });
  if (!before) throw notFound("Lead");
  if (before.status === "CONVERTED" && patch.status && patch.status !== "CONVERTED") throw new AppError("CONFLICT", "A converted lead can't change status.");
  if (patch.assignedToId) {
    const u = await db.user.findFirst({ where: { id: patch.assignedToId, workspaceId: actor.workspaceId, isStaff: true, status: { not: "SUSPENDED" } } });
    if (!u) throw badRequest("You can only assign leads to active team members.");
  }
  const updated = await db.lead.update({ where: { id }, data: patch });
  const log = (type: string, title: string, meta?: Prisma.InputJsonValue) => db.leadActivity.create({ data: { leadId: id, type, title, actorId: actor.userId, metadata: meta } });
  if (patch.status && patch.status !== before.status) {
    await log("status_changed", `Status changed from ${before.status.toLowerCase().replace("_", " ")} to ${patch.status.toLowerCase().replace("_", " ")}`);
    await audit(actor, { workspaceId: actor.workspaceId, action: "lead.status_changed", entityType: "lead", entityId: id, message: `${actor.name} moved lead ${before.requestCode} to ${patch.status}` });
  }
  if (patch.assignedToId !== undefined && patch.assignedToId !== before.assignedToId) {
    const name = patch.assignedToId ? (await db.user.findUnique({ where: { id: patch.assignedToId }, select: { name: true } }))?.name : null;
    await log("assigned", name ? `Assigned to ${name}` : "Unassigned");
    if (patch.assignedToId) await emit("lead.assigned", { workspaceId: actor.workspaceId, actorId: actor.userId, leadId: id });
  }
  if (patch.nextFollowUpAt !== undefined) await log("follow_up_set", patch.nextFollowUpAt ? `Follow-up set for ${patch.nextFollowUpAt.toDateString()}` : "Follow-up cleared");
  if (patch.temperatureOverride !== undefined) {
    await log("temperature_override", patch.temperatureOverride ? `Marked ${patch.temperatureOverride.replace("_", " ").toLowerCase()} (manual override)` : "Reverted to automatic score");
    await audit(actor, { workspaceId: actor.workspaceId, action: "lead.temperature_override", entityType: "lead", entityId: id, message: `${actor.name} overrode the score label on ${before.requestCode}` });
  }
  return updated;
}

const CONTACT_TYPES = new Set(["email_sent", "call_made", "call_scheduled", "contacted", "meeting"]);

export async function addLeadActivity(actor: Actor, id: string, input: { type: string; title: string; note?: string; nextFollowUpAt?: Date | null }) {
  assertCan(actor, "leads:write");
  const lead = await db.lead.findFirst({ where: { AND: [{ id }, leadScope(actor)] } });
  if (!lead) throw notFound("Lead");
  const allowed = new Set(["note", "email_sent", "call_made", "call_scheduled", "contacted", "meeting"]);
  if (!allowed.has(input.type)) throw badRequest("Unsupported activity type.");
  const a = await db.leadActivity.create({ data: { leadId: id, type: input.type, title: input.title.slice(0, 200), metadata: input.note ? { note: input.note.slice(0, 2000) } : undefined, actorId: actor.userId } });
  const patch: Prisma.LeadUpdateInput = {};
  if (CONTACT_TYPES.has(input.type)) {
    patch.lastContactAt = new Date();
    if (lead.status === "NEW") patch.status = input.type === "call_scheduled" ? "CALL_SCHEDULED" : "CONTACTED";
  }
  if (input.nextFollowUpAt !== undefined) patch.nextFollowUpAt = input.nextFollowUpAt;
  if (Object.keys(patch).length) await db.lead.update({ where: { id }, data: patch });
  return a;
}

const LOOKING_TO_TYPE: Record<string, string> = { short_form: "short_form", long_form: "long_form", podcast: "podcast", real_estate: "real_estate", motion_graphics: "motion_graphics", vsl: "vsl", ads: "ads", social_media: "short_form", video_editing: "long_form" };

/** Lead → client (+ project shell). Idempotent: converting twice returns the same client. */
export async function convertLead(actor: Actor, id: string, opts: { createProject?: boolean; invite?: boolean; projectName?: string } = {}) {
  assertCan(actor, "leads:convert");
  assertCan(actor, "clients:write");
  const lead = await db.lead.findFirst({ where: { AND: [{ id }, leadScope(actor)] } });
  if (!lead) throw notFound("Lead");
  if (["LOST", "ARCHIVED"].includes(lead.status)) throw new AppError("CONFLICT", "Reopen this lead before converting it.");

  let clientId = lead.convertedClientId ?? lead.existingClientId;
  let created = false;
  if (!clientId) {
    const client = await createClientRecord({
      workspaceId: actor.workspaceId,
      name: lead.name,
      email: lead.email,
      companyName: lead.company || lead.name,
      phone: lead.phone,
      industry: lead.industry,
      website: lead.website,
      socialLinks: { ...(lead.instagram ? { instagram: lead.instagram } : {}), ...(lead.youtube ? { youtube: lead.youtube } : {}), ...(lead.linkedin ? { linkedin: lead.linkedin } : {}) },
      status: "PROSPECT",
      source: lead.sourceId ? (await db.leadSource.findUnique({ where: { id: lead.sourceId } }))?.key : "website",
      tags: lead.tags,
      managerId: lead.assignedToId,
      isDemo: lead.isDemo,
      referralCode: lead.referralCode,
    });
    clientId = client.id;
    created = true;
  }

  let projectId: string | null = null;
  const existingProject = await db.project.findFirst({ where: { leadId: id }, select: { id: true } });
  if (existingProject) projectId = existingProject.id;
  else if (opts.createProject !== false) {
    const service = lead.serviceSlug ? await db.service.findFirst({ where: { workspaceId: actor.workspaceId, slug: lead.serviceSlug } }) : null;
    const form = await getFormDef(actor.workspaceId, "inquiry");
    const cats = form ? [...activeCategories(form, (lead.answers ?? {}) as Answers)].filter((c) => c !== "COMMON") : [];
    const lookingLabel = form?.sections.flatMap((s) => s.questions).find((q) => q.key === "looking_for")?.options.find((o) => o.value === lead.lookingFor)?.label;
    const company = lead.company || lead.name;
    const project = await createProject(actor, {
      clientId,
      name: opts.projectName || `${company} — ${service?.title ?? lookingLabel ?? "Video project"}`,
      description: lead.description,
      serviceId: service?.id,
      projectTypeKey: (lead.lookingFor && LOOKING_TO_TYPE[lead.lookingFor]) || null,
      status: "AWAITING_QUOTE",
      leadId: lead.id,
      managerId: lead.assignedToId ?? actor.userId,
      scope: { categories: cats },
    });
    projectId = project.id;
    await db.leadActivity.create({ data: { leadId: id, type: "project_created", title: `Project ${project.code} created`, actorId: actor.userId } });
  }

  await db.lead.update({ where: { id }, data: { status: "CONVERTED", convertedClientId: clientId, lastContactAt: new Date() } });
  await db.leadActivity.create({ data: { leadId: id, type: "converted", title: created ? "Converted to client" : "Linked to existing client", actorId: actor.userId } });
  await audit(actor, { workspaceId: actor.workspaceId, action: "lead.converted", entityType: "lead", entityId: id, message: `${actor.name} converted lead ${lead.requestCode} to a client`, metadata: { clientId, projectId } });

  if (opts.invite) {
    const { inviteClientUser } = await import("./auth");
    await inviteClientUser(actor, clientId);
  }
  return { clientId, projectId, created };
}

export async function rejectLead(actor: Actor, id: string, reason?: string) {
  assertCan(actor, "leads:write");
  const lead = await db.lead.findFirst({ where: { AND: [{ id }, leadScope(actor)] } });
  if (!lead) throw notFound("Lead");
  if (lead.status === "CONVERTED") throw new AppError("CONFLICT", "A converted lead can't be rejected.");
  await db.lead.update({ where: { id }, data: { status: "LOST", lostReason: reason } });
  await db.leadActivity.create({ data: { leadId: id, type: "rejected", title: `Marked as lost${reason ? `: ${reason}` : ""}`, actorId: actor.userId } });
  await audit(actor, { workspaceId: actor.workspaceId, action: "lead.rejected", entityType: "lead", entityId: id, message: `${actor.name} rejected lead ${lead.requestCode}` });
  return { ok: true };
}

export async function archiveLead(actor: Actor, id: string, archive = true) {
  assertCan(actor, "leads:write");
  const lead = await db.lead.findFirst({ where: { AND: [{ id }, leadScope(actor)] } });
  if (!lead) throw notFound("Lead");
  await db.lead.update({ where: { id }, data: { status: archive ? "ARCHIVED" : "NEW" } });
  await db.leadActivity.create({ data: { leadId: id, type: archive ? "archived" : "reopened", title: archive ? "Archived" : "Reopened", actorId: actor.userId } });
  return { ok: true };
}

// ───────────────────────────── contact form ─────────────────────────────

export async function submitContact(input: { name: string; email: string; phone?: string; company?: string; reason: "GENERAL" | "PROJECT" | "PARTNERSHIP" | "AGENCY" | "CAREER"; message: string; source?: string; utm?: Record<string, string>; ip: string }) {
  rateLimit(`contact:${input.ip}`, 5, 15 * 60_000, "Too many messages. Please wait a few minutes before sending another.");
  const ws = await getWorkspaceId();
  const row = await db.contactSubmission.create({
    data: { workspaceId: ws, name: input.name.trim(), email: input.email.trim().toLowerCase(), phone: input.phone || undefined, company: input.company || undefined, reason: input.reason, message: input.message.trim(), source: input.source, utm: input.utm as Prisma.InputJsonValue | undefined, ip: input.ip },
  });
  await queueEmail({ workspaceId: ws, toEmail: row.email, templateKey: "contact_received", vars: { client_name: row.name } });
  const admins = await db.user.findMany({ where: { workspaceId: ws, isStaff: true, roles: { some: { role: { key: { in: ["super_admin", "admin", "support"] } } } } }, select: { id: true } });
  const { notify } = await import("./notifications");
  await notify({ workspaceId: ws, userIds: admins.map((a) => a.id), category: "SYSTEM", type: "contact.received", title: `New ${input.reason.toLowerCase()} message from ${row.name}`, message: row.message.slice(0, 140), link: "/admin/leads?tab=contact", email: false });
  return { id: row.id };
}

export async function listContactSubmissions(actor: Actor, query: PageInput & { handled?: string } = {}) {
  assertCan(actor, "leads:read");
  const { page, pageSize, skip, take } = pageArgs(query);
  const where: Prisma.ContactSubmissionWhereInput = { workspaceId: actor.workspaceId, ...(query.handled === "yes" ? { handled: true } : query.handled === "no" ? { handled: false } : {}) };
  const [rows, total] = await Promise.all([db.contactSubmission.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }), db.contactSubmission.count({ where })]);
  return paged(rows, total, page, pageSize);
}

export async function convertContactToLead(actor: Actor, id: string) {
  assertCan(actor, "leads:write");
  const c = await db.contactSubmission.findFirst({ where: { id, workspaceId: actor.workspaceId } });
  if (!c) throw notFound("Message");
  if (c.leadId) return { leadId: c.leadId };
  const year = new Date().getFullYear();
  const seq = await nextNumber(actor.workspaceId, `lead-${year}`, 0);
  const source = await db.leadSource.findUnique({ where: { key: "website" } });
  const lead = await db.lead.create({
    data: { workspaceId: actor.workspaceId, requestCode: `REQ-${year}-${String(seq).padStart(4, "0")}`, name: c.name, email: c.email, phone: c.phone, company: c.company, description: c.message, sourceId: source?.id, status: "NEW", temperature: "NEEDS_REVIEW", isDemo: c.isDemo },
  });
  await db.leadActivity.create({ data: { leadId: lead.id, type: "inquiry_submitted", title: `Created from contact form (${c.reason.toLowerCase()})`, actorId: actor.userId } });
  await db.contactSubmission.update({ where: { id }, data: { leadId: lead.id, handled: true } });
  return { leadId: lead.id };
}

export async function markContactHandled(actor: Actor, id: string, handled = true) {
  assertCan(actor, "leads:write");
  await db.contactSubmission.updateMany({ where: { id, workspaceId: actor.workspaceId }, data: { handled } });
  return { ok: true };
}

/** Lead follow-ups that are due (sweep). */
export async function sweepLeadFollowUps() {
  const due = await db.lead.findMany({ where: { nextFollowUpAt: { lte: new Date() }, status: { notIn: ["CONVERTED", "LOST", "ARCHIVED"] } }, select: { id: true, workspaceId: true } });
  for (const l of due) {
    await emit("lead.follow_up_due", { workspaceId: l.workspaceId, leadId: l.id });
    await db.lead.update({ where: { id: l.id }, data: { nextFollowUpAt: null } });
  }
  return due.length;
}

export { LOOKING_TO_TYPE, SERVICE_TO_LOOKING_FOR, can, logActivity };
