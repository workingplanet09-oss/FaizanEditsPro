import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import { AppError, badRequest } from "../errors";
import { assertOrgAction, can, type Actor } from "../auth/actor";
import { emit } from "../events/bus";
import { audit, logActivity } from "./audit";
import { applyTransition, requireProject, DEFAULT_SCOPE, type Scope } from "./projects";
import { assertValid, displayAnswer, getFormDef, loadResponses, markDraftSubmitted, saveDraft, getDraft, saveResponses, validateSubmission } from "./onboarding";
import { getSetting } from "./settings";
import { formatDate } from "@/lib/format";
import { isAnswered, type Answers, type FormDef, type QuestionDef } from "@/lib/conditions";

export const PROJECT_FORM = "project_onboarding";

export const BRIEF_SECTIONS: { key: string; title: string }[] = [
  { key: "client", title: "Client information" },
  { key: "project", title: "Project information" },
  { key: "creative", title: "Creative direction" },
  { key: "technical", title: "Technical specifications" },
  { key: "deliverables", title: "Deliverables" },
  { key: "references", title: "References" },
  { key: "deadline", title: "Deadline & schedule" },
  { key: "brand", title: "Brand requirements" },
  { key: "revisions", title: "Revision policy" },
  { key: "special", title: "Special instructions" },
];

export interface BriefContent {
  sections: { key: string; title: string; items: { label: string; value: string }[] }[];
}

function findQuestions(form: FormDef | null): Map<string, QuestionDef> {
  const m = new Map<string, QuestionDef>();
  form?.sections.forEach((s) => s.questions.forEach((q) => m.set(q.key, q)));
  return m;
}

/** Composes the clean, editor-facing brief from the client record, brand kit, inquiry and onboarding answers. */
export async function generateBrief(projectId: string) {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { client: { include: { brandKit: true, organization: true } }, service: true, projectType: true, brief: true },
  });
  const ws = project.workspaceId;
  const [form, inquiry, projectAnswers, leadAnswers, wf, business] = await Promise.all([
    getFormDef(ws, PROJECT_FORM),
    getFormDef(ws, "inquiry"),
    loadResponses("PROJECT", projectId),
    (project.leadId ? Promise.resolve({ id: project.leadId }) : db.lead.findFirst({ where: { OR: [{ convertedClientId: project.clientId }, { existingClientId: project.clientId }] }, orderBy: { createdAt: "desc" }, select: { id: true } })).then((l) => (l ? loadResponses("LEAD", l.id) : { answers: {} as Answers })),
    getSetting(ws, "workflow"),
    getSetting(ws, "business"),
  ]);
  const scope = (project.scope ?? DEFAULT_SCOPE) as unknown as Scope;
  const qs = findQuestions(form);
  const iqs = findQuestions(inquiry);
  const sections = new Map<string, { label: string; value: string }[]>(BRIEF_SECTIONS.map((s) => [s.key, []]));
  const add = (key: string, label: string, value: string | null | undefined) => {
    if (value && String(value).trim()) sections.get(key)!.push({ label, value: String(value) });
  };
  const kit = project.client.brandKit;
  const c = project.client;
  add("client", "Name", c.name);
  add("client", "Company", c.companyName);
  add("client", "Email", c.email);
  add("client", "Phone", c.phone);
  add("client", "Website", c.website);
  const social = (c.socialLinks ?? {}) as Record<string, string>;
  Object.entries(social).forEach(([k, v]) => add("client", k[0].toUpperCase() + k.slice(1), v));

  add("project", "Project", `${project.name} (${project.code})`);
  add("project", "Service", project.service?.title);
  add("project", "Project type", project.projectType?.name);
  if (project.description) add("project", "Summary", project.description);

  // answers from the detailed onboarding form, placed by each question's `meta.briefSection`
  for (const [key, value] of Object.entries(projectAnswers.answers)) {
    const q = qs.get(key);
    if (!q || !isAnswered(value)) continue;
    add((q.meta?.briefSection as string) || "project", q.meta?.briefLabel || q.text, displayAnswer(q, value));
  }
  // carry over any useful inquiry answers that weren't asked again
  for (const key of ["project_description", "style"]) {
    const v = (leadAnswers.answers as Answers)[key];
    const q = iqs.get(key);
    if (isAnswered(v) && q && !(key in projectAnswers.answers)) add(key === "style" ? "creative" : "special", key === "style" ? "Preferred style" : "Original request", displayAnswer(q, v));
  }

  scope.deliverables.forEach((d) => add("deliverables", d.label, `× ${d.quantity}`));
  add("deadline", "Deadline", project.deadline ? formatDate(project.deadline) : null);
  add("deadline", "Turnaround", `${scope.turnaroundBusinessDays} business days from complete assets`);

  if (kit) {
    const colors = (kit.colors ?? []) as { name: string; hex: string }[];
    const fonts = (kit.fonts ?? []) as { name: string; usage?: string }[];
    if (colors.length) add("brand", "Brand colors", colors.map((x) => `${x.name} ${x.hex}`).join(", "));
    if (fonts.length) add("brand", "Fonts", fonts.map((f) => f.name + (f.usage ? ` (${f.usage})` : "")).join(", "));
    if (kit.typographyRules) add("brand", "Typography rules", kit.typographyRules);
    if (kit.musicPreference) add("brand", "Music preference", kit.musicPreference);
  }
  const overrides = (project.brandOverrides ?? {}) as Record<string, string>;
  Object.entries(overrides).forEach(([k, v]) => add("brand", `Project override · ${k}`, v));

  const refs = await db.asset.findMany({ where: { projectId, deletedAt: null, status: "READY", folder: { key: "references" } }, select: { displayName: true }, take: 20 });
  refs.forEach((r) => add("references", "Reference file", r.displayName));

  add("revisions", "Included revision rounds", String(scope.revisionRounds));
  add("revisions", "Policy", business.revisionPolicy);
  if (scope.notes) add("special", "Scope notes", scope.notes);

  const content: BriefContent = { sections: BRIEF_SECTIONS.map((s) => ({ ...s, items: sections.get(s.key)! })).filter((s) => s.items.length) };
  void wf;

  const existing = project.brief;
  const status = existing?.status === "LOCKED" ? "LOCKED" : "DRAFT";
  const brief = await db.projectBrief.upsert({
    where: { projectId },
    create: { projectId, content: content as unknown as Prisma.InputJsonValue, status: "DRAFT" },
    update: { content: content as unknown as Prisma.InputJsonValue, version: { increment: 1 }, status },
  });
  return brief;
}

// ───────────────────────────── project onboarding (after payment) ─────────────────────────────

async function prefill(projectId: string): Promise<Answers> {
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId }, include: { client: { include: { brandKit: true } } } });
  const out: Answers = { project_name: project.name };
  const kit = project.client.brandKit;
  if (kit) {
    const colors = (kit.colors ?? []) as { name: string; hex: string }[];
    if (colors[0]) out.brand_color_primary = colors[0].hex;
    const fonts = (kit.fonts ?? []) as { name: string }[];
    if (fonts.length) out.fonts = fonts.map((f) => f.name).join(", ");
    if (kit.musicPreference) out.music_preference = kit.musicPreference;
  }
  const lead = project.leadId ? { id: project.leadId } : await db.lead.findFirst({ where: { OR: [{ convertedClientId: project.clientId }, { existingClientId: project.clientId }] }, orderBy: { createdAt: "desc" }, select: { id: true } });
  if (lead) {
    const { answers } = await loadResponses("LEAD", lead.id);
    for (const k of ["platforms", "target_audience", "cta", "video_length"]) if (answers[k] !== undefined) out[k] = answers[k];
  }
  return out;
}

export async function getProjectOnboarding(actor: Actor, projectId: string) {
  const project = await requireProject(actor, projectId);
  assertOrgAction(actor, project.organizationId, "view");
  const form = await getFormDef(actor.workspaceId, PROJECT_FORM);
  if (!form) throw new AppError("NOT_FOUND", "Project onboarding form isn't configured.");
  const stored = await loadResponses("PROJECT", projectId);
  const draft = await getDraft({ userId: actor.userId, formKey: PROJECT_FORM, subjectType: "PROJECT", subjectId: projectId });
  const seed = await prefill(projectId);
  const scope = (project.scope ?? DEFAULT_SCOPE) as unknown as Scope;
  const client = await db.client.findUnique({ where: { id: project.clientId }, select: { firstTime: true } });
  const brief = await db.projectBrief.findUnique({ where: { projectId } });
  return {
    form,
    answers: { ...seed, ...stored.answers, ...(draft?.data ?? {}) } as Answers,
    step: draft?.step ?? 0,
    draftToken: draft?.token ?? null,
    extraCategories: scope.categories ?? [],
    completed: !!brief,
    locked: brief?.status === "LOCKED",
    firstTime: client?.firstTime ?? true,
    project: { id: project.id, name: project.name, status: project.status, code: project.code },
  };
}

export async function autosaveProjectOnboarding(actor: Actor, projectId: string, input: { answers: Answers; step: number }) {
  const project = await requireProject(actor, projectId);
  assertOrgAction(actor, project.organizationId, "manage_projects");
  return saveDraft({ workspaceId: actor.workspaceId, userId: actor.userId, formKey: PROJECT_FORM, data: input.answers, step: input.step, subjectType: "PROJECT", subjectId: projectId });
}

export async function submitProjectOnboarding(actor: Actor, projectId: string, input: { answers: Answers }) {
  const project = await requireProject(actor, projectId);
  assertOrgAction(actor, project.organizationId, "manage_projects");
  if (!["ONBOARDING", "AWAITING_ASSETS", "QUEUED"].includes(project.status)) {
    throw new AppError("GATED", "Project setup opens once your quote is accepted, the contract is signed and payment is received.");
  }
  const brief0 = await db.projectBrief.findUnique({ where: { projectId } });
  if (brief0?.status === "LOCKED") throw new AppError("GATED", "Production has started, so the brief is locked. Submit a change request instead.");
  const form = await getFormDef(actor.workspaceId, PROJECT_FORM);
  if (!form) throw badRequest("Onboarding form isn't configured.");
  const scope = (project.scope ?? DEFAULT_SCOPE) as unknown as Scope;
  const { clean, errors } = validateSubmission(form, input.answers, { extraCategories: scope.categories ?? [] });
  assertValid(errors);

  await saveResponses({ workspaceId: actor.workspaceId, formKey: PROJECT_FORM, subjectType: "PROJECT", subjectId: projectId, form, answers: clean });
  if (clean.project_name && clean.project_name !== project.name) await db.project.update({ where: { id: projectId }, data: { name: String(clean.project_name) } });
  if (clean.deadline_date) {
    const d = new Date(String(clean.deadline_date));
    if (!isNaN(d.getTime())) await db.project.update({ where: { id: projectId }, data: { deadline: d } });
  }
  const brief = await generateBrief(projectId);
  await db.client.update({ where: { id: project.clientId }, data: { firstTime: false, status: "ACTIVE" } });
  const draft = await getDraft({ userId: actor.userId, formKey: PROJECT_FORM, subjectType: "PROJECT", subjectId: projectId });
  await markDraftSubmitted(draft?.token);

  if (project.status === "ONBOARDING") await applyTransition(actor, projectId, "AWAITING_ASSETS", { comment: "Project brief submitted", quiet: true });
  await logActivity(actor, { workspaceId: actor.workspaceId, type: "onboarding.completed", message: `${actor.name} completed the project brief`, projectId, clientId: project.clientId, visibility: "CLIENT" });
  await emit("onboarding.completed", { workspaceId: actor.workspaceId, actorId: actor.userId, projectId, clientId: project.clientId });
  return { briefVersion: brief.version };
}

export async function getBrief(actor: Actor, projectId: string) {
  await requireProject(actor, projectId);
  const b = await db.projectBrief.findUnique({ where: { projectId } });
  return b ? { status: b.status, version: b.version, confirmedAt: b.confirmedAt, lockedAt: b.lockedAt, content: b.content as unknown as BriefContent } : null;
}

/** Client edits brief answers before production starts. After that, changes must go through a Change Request. */
export async function updateBriefAnswers(actor: Actor, projectId: string, answers: Answers) {
  const project = await requireProject(actor, projectId);
  if (!actor.isStaff) assertOrgAction(actor, project.organizationId, "manage_projects");
  else if (!can(actor, "projects:write")) throw new AppError("FORBIDDEN", "You can't edit briefs.");
  const brief = await db.projectBrief.findUnique({ where: { projectId } });
  if (brief?.status === "LOCKED") throw new AppError("GATED", "Production has started, so the brief is locked. Submit a change request and we'll review it.");
  const form = await getFormDef(actor.workspaceId, PROJECT_FORM);
  if (!form) throw badRequest("Onboarding form isn't configured.");
  const scope = (project.scope ?? DEFAULT_SCOPE) as unknown as Scope;
  const existing = await loadResponses("PROJECT", projectId);
  const merged = { ...existing.answers, ...answers };
  const { clean, errors } = validateSubmission(form, merged, { extraCategories: scope.categories ?? [] });
  assertValid(errors);
  await saveResponses({ workspaceId: actor.workspaceId, formKey: PROJECT_FORM, subjectType: "PROJECT", subjectId: projectId, form, answers: clean });
  const b = await generateBrief(projectId);
  await audit(actor, { workspaceId: actor.workspaceId, action: "brief.updated", entityType: "project", entityId: projectId, message: `${actor.name} updated the brief for ${project.code}` });
  return { version: b.version };
}

export async function confirmBrief(actor: Actor, projectId: string) {
  const project = await requireProject(actor, projectId);
  assertOrgAction(actor, project.organizationId, "approve");
  const b = await db.projectBrief.findUnique({ where: { projectId } });
  if (!b) throw badRequest("The brief hasn't been created yet.");
  await db.projectBrief.update({ where: { projectId }, data: { confirmedAt: new Date() } });
  await logActivity(actor, { workspaceId: actor.workspaceId, type: "brief.confirmed", message: `${actor.name} approved the project brief`, projectId, clientId: project.clientId, visibility: "CLIENT" });
  return { ok: true };
}
