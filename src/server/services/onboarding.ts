import { Prisma, type QuestionType } from "@/generated/prisma/client";
import { db } from "../db";
import { cached, invalidate } from "../cache";
import { AppError, badRequest, notFound } from "../errors";
import { assertCan, type Actor } from "../auth/actor";
import { randomToken } from "../auth/crypto";
import { audit } from "./audit";
import { isAnswered, validateAnswer, visibleQuestions, type Answers, type FormDef, type QuestionDef } from "@/lib/conditions";

// ───────────────────────────── form definitions (DB → DTO) ─────────────────────────────

async function buildForm(workspaceId: string, key: string, includeInactive: boolean): Promise<FormDef | null> {
  const form = await db.onboardingForm.findUnique({
    where: { workspaceId_key: { workspaceId, key } },
    include: {
      sections: { orderBy: { sortOrder: "asc" } },
      questions: {
        where: includeInactive ? {} : { active: true },
        orderBy: [{ sortOrder: "asc" }],
        include: { options: { orderBy: { sortOrder: "asc" } }, categories: true, section: true },
      },
    },
  });
  if (!form) return null;
  return {
    key: form.key,
    name: form.name,
    sections: form.sections.map((s) => ({
      key: s.key,
      title: s.title,
      description: s.description,
      questions: form.questions
        .filter((q) => q.sectionId === s.id)
        .map<QuestionDef>((q) => ({
          id: q.id,
          key: q.key,
          text: q.text,
          helpText: q.helpText,
          placeholder: q.placeholder,
          type: q.type,
          required: q.required,
          categoryKeys: q.categories.map((c) => c.key),
          conditionalLogic: (q.conditionalLogic as any) ?? null,
          meta: (q.meta as any) ?? null,
          sectionKey: s.key,
          sortOrder: q.sortOrder,
          options: q.options.map((o) => ({ label: o.label, value: o.value, categoryKeys: o.categoryKeys, icon: o.icon, description: o.description })),
        })),
    })),
  };
}

/** Public, cached definition of an onboarding form (active questions only). */
export const getFormDef = (workspaceId: string, key: string) => cached(`form:${workspaceId}:${key}`, 30_000, () => buildForm(workspaceId, key, false));
export const getFormDefFresh = (workspaceId: string, key: string) => buildForm(workspaceId, key, true);
export const invalidateForms = () => invalidate("form:");

// ───────────────────────────── validation ─────────────────────────────

/**
 * Validates a submission against the DB-defined form. Only questions that are VISIBLE for the given answers
 * are required/validated, so hidden conditional questions never block a submit. Returns a cleaned answers map
 * containing only known, visible questions.
 */
export function validateSubmission(form: FormDef, answers: Answers, opts: { skipSections?: string[]; extraCategories?: string[] } = {}): { clean: Answers; errors: Record<string, string> } {
  const clean: Answers = {};
  const errors: Record<string, string> = {};
  for (const section of form.sections) {
    if (opts.skipSections?.includes(section.key)) continue;
    for (const q of visibleQuestions(form, section, answers, opts.extraCategories ?? [])) {
      const v = answers[q.key];
      if (q.type === "FILE") {
        // file answers are attachment ids validated by the caller
        if (isAnswered(v)) clean[q.key] = v;
        else if (q.required) errors[q.key] = "This field is required.";
        continue;
      }
      const err = validateAnswer(q, v);
      if (err) errors[q.key] = err;
      else if (isAnswered(v)) clean[q.key] = typeof v === "string" ? v.trim() : v;
    }
  }
  return { clean, errors };
}

export function assertValid(errors: Record<string, string>) {
  if (Object.keys(errors).length) throw new AppError("VALIDATION", "Please check the highlighted fields.", { fields: errors });
}

// ───────────────────────────── drafts (autosave / resume) ─────────────────────────────

export async function saveDraft(input: { workspaceId: string; token?: string | null; userId?: string | null; formKey: string; data: Answers; step: number; subjectType?: string; subjectId?: string }) {
  const data = input.data as Prisma.InputJsonValue;
  if (input.token) {
    const existing = await db.onboardingDraft.findUnique({ where: { token: input.token } });
    if (existing && !existing.submittedAt && existing.formKey === input.formKey && (!existing.userId || existing.userId === input.userId)) {
      const d = await db.onboardingDraft.update({ where: { id: existing.id }, data: { data, step: input.step, ...(input.userId && !existing.userId ? { userId: input.userId } : {}) } });
      return { token: d.token, step: d.step, updatedAt: d.updatedAt };
    }
  }
  // signed-in users keep one open draft per form/subject so "Continue setup" always finds it
  if (input.userId) {
    const open = await db.onboardingDraft.findFirst({ where: { userId: input.userId, formKey: input.formKey, submittedAt: null, subjectType: input.subjectType ?? null, subjectId: input.subjectId ?? null }, orderBy: { updatedAt: "desc" } });
    if (open) {
      const d = await db.onboardingDraft.update({ where: { id: open.id }, data: { data, step: input.step } });
      return { token: d.token, step: d.step, updatedAt: d.updatedAt };
    }
  }
  // The browser may mint its own unguessable token (used to tie file uploads to this draft); adopt it if well-formed.
  const token = input.token && /^[A-Za-z0-9_-]{16,64}$/.test(input.token) && !(await db.onboardingDraft.findUnique({ where: { token: input.token }, select: { id: true } })) ? input.token : randomToken(24);
  const d = await db.onboardingDraft.create({
    data: { workspaceId: input.workspaceId, token, userId: input.userId ?? null, formKey: input.formKey, data, step: input.step, subjectType: input.subjectType, subjectId: input.subjectId },
  });
  return { token: d.token, step: d.step, updatedAt: d.updatedAt };
}

export async function getDraft(input: { token?: string | null; userId?: string | null; formKey: string; subjectType?: string; subjectId?: string }) {
  let d = input.token ? await db.onboardingDraft.findUnique({ where: { token: input.token } }) : null;
  if (d && (d.formKey !== input.formKey || d.submittedAt || (d.userId && d.userId !== input.userId))) d = null;
  if (!d && input.userId) {
    d = await db.onboardingDraft.findFirst({ where: { userId: input.userId, formKey: input.formKey, submittedAt: null, subjectType: input.subjectType ?? null, subjectId: input.subjectId ?? null }, orderBy: { updatedAt: "desc" } });
  }
  return d ? { token: d.token, data: d.data as Answers, step: d.step, updatedAt: d.updatedAt } : null;
}

export async function markDraftSubmitted(token: string | null | undefined) {
  if (token) await db.onboardingDraft.updateMany({ where: { token }, data: { submittedAt: new Date() } });
}

// ───────────────────────────── stored responses ─────────────────────────────

export async function saveResponses(input: { workspaceId: string; formKey: string; subjectType: "LEAD" | "PROJECT"; subjectId: string; form: FormDef; answers: Answers }) {
  const byKey = new Map<string, QuestionDef>();
  for (const s of input.form.sections) for (const q of s.questions) byKey.set(q.key, q);
  const keys = Object.keys(input.answers).filter((k) => byKey.has(k));
  await db.$transaction([
    db.onboardingResponse.deleteMany({ where: { subjectType: input.subjectType, subjectId: input.subjectId, questionKey: { notIn: keys }, formKey: input.formKey } }),
    ...keys.map((k) =>
      db.onboardingResponse.upsert({
        where: { subjectType_subjectId_questionKey: { subjectType: input.subjectType, subjectId: input.subjectId, questionKey: k } },
        create: { workspaceId: input.workspaceId, formKey: input.formKey, subjectType: input.subjectType, subjectId: input.subjectId, questionKey: k, questionText: byKey.get(k)!.text, value: input.answers[k] as Prisma.InputJsonValue },
        update: { value: input.answers[k] as Prisma.InputJsonValue, questionText: byKey.get(k)!.text },
      }),
    ),
  ]);
}

export async function loadResponses(subjectType: "LEAD" | "PROJECT", subjectId: string, formKey?: string) {
  const rows = await db.onboardingResponse.findMany({ where: { subjectType, subjectId, ...(formKey ? { formKey } : {}) }, orderBy: { createdAt: "asc" } });
  const answers: Answers = {};
  for (const r of rows) answers[r.questionKey] = r.value;
  return { answers, rows };
}

/** Human-readable label for a stored answer (maps option values to option labels). */
export function displayAnswer(q: QuestionDef | undefined, value: unknown): string {
  const one = (v: unknown) => q?.options.find((o) => o.value === String(v))?.label ?? String(v);
  if (Array.isArray(value)) return value.map(one).join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return one(value);
}

// ───────────────────────────── admin form builder ─────────────────────────────

export interface QuestionInput {
  formKey: string;
  sectionKey: string;
  key: string;
  text: string;
  helpText?: string | null;
  placeholder?: string | null;
  type: QuestionType;
  required?: boolean;
  categoryKeys?: string[];
  conditionalLogic?: unknown;
  meta?: Record<string, unknown> | null;
  active?: boolean;
  options?: { label: string; value: string; categoryKeys?: string[]; icon?: string | null; description?: string | null }[];
}

async function categoryConnect(workspaceId: string, keys: string[]) {
  if (!keys.length) return [];
  const cats = await db.onboardingCategory.findMany({ where: { workspaceId, key: { in: keys } } });
  return cats.map((c) => ({ id: c.id }));
}

export async function adminOverview(actor: Actor, formKey: string) {
  assertCan(actor, "forms:manage");
  const [form, categories, forms] = await Promise.all([
    getFormDefFresh(actor.workspaceId, formKey),
    db.onboardingCategory.findMany({ where: { workspaceId: actor.workspaceId }, orderBy: { sortOrder: "asc" } }),
    db.onboardingForm.findMany({ where: { workspaceId: actor.workspaceId }, select: { key: true, name: true } }),
  ]);
  if (!form) throw notFound("Form");
  return { form, categories, forms };
}

export async function createQuestion(actor: Actor, input: QuestionInput) {
  assertCan(actor, "forms:manage");
  const form = await db.onboardingForm.findUnique({ where: { workspaceId_key: { workspaceId: actor.workspaceId, key: input.formKey } } });
  if (!form) throw notFound("Form");
  const section = await db.onboardingSection.findUnique({ where: { formId_key: { formId: form.id, key: input.sectionKey } } });
  if (!section) throw badRequest("Unknown section.");
  const dup = await db.onboardingQuestion.findUnique({ where: { formId_key: { formId: form.id, key: input.key } } });
  if (dup) throw new AppError("CONFLICT", "A question with that key already exists.", { fields: { key: "Key already in use." } });
  const max = await db.onboardingQuestion.aggregate({ where: { sectionId: section.id }, _max: { sortOrder: true } });
  const q = await db.onboardingQuestion.create({
    data: {
      formId: form.id,
      sectionId: section.id,
      key: input.key,
      text: input.text,
      helpText: input.helpText,
      placeholder: input.placeholder,
      type: input.type,
      required: input.required ?? false,
      conditionalLogic: (input.conditionalLogic ?? undefined) as Prisma.InputJsonValue | undefined,
      meta: (input.meta ?? undefined) as Prisma.InputJsonValue | undefined,
      active: input.active ?? true,
      sortOrder: (max._max.sortOrder ?? 0) + 10,
      categories: { connect: await categoryConnect(actor.workspaceId, input.categoryKeys ?? []) },
      options: { create: (input.options ?? []).map((o, i) => ({ label: o.label, value: o.value, categoryKeys: o.categoryKeys ?? [], icon: o.icon, description: o.description, sortOrder: i * 10 })) },
    },
  });
  invalidateForms();
  await audit(actor, { workspaceId: actor.workspaceId, action: "form.question_created", entityType: "onboarding_question", entityId: q.id, message: `${actor.name} added question “${q.text}”` });
  return q;
}

export async function updateQuestion(actor: Actor, id: string, input: Partial<QuestionInput>) {
  assertCan(actor, "forms:manage");
  const existing = await db.onboardingQuestion.findFirst({ where: { id, form: { workspaceId: actor.workspaceId } }, include: { form: true } });
  if (!existing) throw notFound("Question");
  const data: Prisma.OnboardingQuestionUpdateInput = {};
  if (input.text !== undefined) data.text = input.text;
  if (input.helpText !== undefined) data.helpText = input.helpText;
  if (input.placeholder !== undefined) data.placeholder = input.placeholder;
  if (input.type !== undefined) data.type = input.type;
  if (input.required !== undefined) data.required = input.required;
  if (input.active !== undefined) data.active = input.active;
  if (input.conditionalLogic !== undefined) data.conditionalLogic = (input.conditionalLogic ?? Prisma_DbNull) as any;
  if (input.meta !== undefined) data.meta = (input.meta ?? Prisma_DbNull) as any;
  if (input.categoryKeys) data.categories = { set: await categoryConnect(actor.workspaceId, input.categoryKeys) };
  if (input.sectionKey) {
    const section = await db.onboardingSection.findUnique({ where: { formId_key: { formId: existing.formId, key: input.sectionKey } } });
    if (!section) throw badRequest("Unknown section.");
    data.section = { connect: { id: section.id } };
  }
  if (input.key && input.key !== existing.key) {
    const dup = await db.onboardingQuestion.findUnique({ where: { formId_key: { formId: existing.formId, key: input.key } } });
    if (dup) throw new AppError("CONFLICT", "A question with that key already exists.", { fields: { key: "Key already in use." } });
    data.key = input.key;
  }
  if (input.options) {
    await db.onboardingOption.deleteMany({ where: { questionId: id } });
    data.options = { create: input.options.map((o, i) => ({ label: o.label, value: o.value, categoryKeys: o.categoryKeys ?? [], icon: o.icon, description: o.description, sortOrder: i * 10 })) };
  }
  const q = await db.onboardingQuestion.update({ where: { id }, data });
  invalidateForms();
  await audit(actor, { workspaceId: actor.workspaceId, action: "form.question_updated", entityType: "onboarding_question", entityId: id, message: `${actor.name} edited question “${q.text}”` });
  return q;
}

const Prisma_DbNull = Prisma.DbNull;

export async function deleteQuestion(actor: Actor, id: string) {
  assertCan(actor, "forms:manage");
  const q = await db.onboardingQuestion.findFirst({ where: { id, form: { workspaceId: actor.workspaceId } } });
  if (!q) throw notFound("Question");
  await db.onboardingQuestion.delete({ where: { id } });
  invalidateForms();
  await audit(actor, { workspaceId: actor.workspaceId, action: "form.question_deleted", entityType: "onboarding_question", entityId: id, message: `${actor.name} deleted question “${q.text}”` });
  return { ok: true };
}

export async function duplicateQuestion(actor: Actor, id: string) {
  assertCan(actor, "forms:manage");
  const q = await db.onboardingQuestion.findFirst({ where: { id, form: { workspaceId: actor.workspaceId } }, include: { options: true, categories: true } });
  if (!q) throw notFound("Question");
  let key = `${q.key}_copy`;
  for (let i = 2; await db.onboardingQuestion.findUnique({ where: { formId_key: { formId: q.formId, key } } }); i++) key = `${q.key}_copy${i}`;
  const copy = await db.onboardingQuestion.create({
    data: {
      formId: q.formId,
      sectionId: q.sectionId,
      key,
      text: `${q.text} (copy)`,
      helpText: q.helpText,
      placeholder: q.placeholder,
      type: q.type,
      required: q.required,
      conditionalLogic: (q.conditionalLogic ?? undefined) as Prisma.InputJsonValue | undefined,
      meta: (q.meta ?? undefined) as Prisma.InputJsonValue | undefined,
      active: false,
      sortOrder: q.sortOrder + 1,
      categories: { connect: q.categories.map((c) => ({ id: c.id })) },
      options: { create: q.options.map((o) => ({ label: o.label, value: o.value, categoryKeys: o.categoryKeys, icon: o.icon, description: o.description, sortOrder: o.sortOrder })) },
    },
  });
  invalidateForms();
  return copy;
}

/** Persists a new order. `ids` is the complete ordered list of question ids within one section. */
export async function reorderQuestions(actor: Actor, ids: string[]) {
  assertCan(actor, "forms:manage");
  const owned = await db.onboardingQuestion.count({ where: { id: { in: ids }, form: { workspaceId: actor.workspaceId } } });
  if (owned !== ids.length) throw notFound("Question");
  await db.$transaction(ids.map((id, i) => db.onboardingQuestion.update({ where: { id }, data: { sortOrder: (i + 1) * 10 } })));
  invalidateForms();
  return { ok: true };
}
