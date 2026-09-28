/**
 * Conditional logic shared by the browser (live show/hide) and the server (validation, automations).
 * Stored in DB as JSON:  { all?: Cond[], any?: Cond[] }
 */
export type CondOp = "eq" | "neq" | "in" | "nin" | "contains" | "not_contains" | "exists" | "empty" | "gt" | "lt" | "truthy";

export interface Cond {
  field: string;
  op: CondOp;
  value?: unknown;
}

export interface Logic {
  all?: Cond[];
  any?: Cond[];
}

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null || v === "" ? [] : [v]);

function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

export function evalCond(c: Cond, ctx: Record<string, unknown>): boolean {
  const actual = ctx[c.field];
  const a = asArray(actual);
  switch (c.op) {
    case "eq":
      return a.some((x) => String(x) === String(c.value));
    case "neq":
      return !a.some((x) => String(x) === String(c.value));
    case "in": {
      const wanted = asArray(c.value).map(String);
      return a.some((x) => wanted.includes(String(x)));
    }
    case "nin": {
      const wanted = asArray(c.value).map(String);
      return !a.some((x) => wanted.includes(String(x)));
    }
    case "contains":
      if (typeof actual === "string") return actual.toLowerCase().includes(String(c.value ?? "").toLowerCase());
      return a.some((x) => String(x) === String(c.value));
    case "not_contains":
      if (typeof actual === "string") return !actual.toLowerCase().includes(String(c.value ?? "").toLowerCase());
      return !a.some((x) => String(x) === String(c.value));
    case "exists":
      return !isEmpty(actual);
    case "empty":
      return isEmpty(actual);
    case "gt":
      return Number(actual) > Number(c.value);
    case "lt":
      return Number(actual) < Number(c.value);
    case "truthy":
      return !!actual && actual !== "false" && actual !== "no";
    default:
      return false;
  }
}

export function evalLogic(logic: Logic | null | undefined, ctx: Record<string, unknown>): boolean {
  if (!logic) return true;
  const all = logic.all ?? [];
  const any = logic.any ?? [];
  if (all.length === 0 && any.length === 0) return true;
  const allOk = all.every((c) => evalCond(c, ctx));
  const anyOk = any.length === 0 ? true : any.some((c) => evalCond(c, ctx));
  return allOk && anyOk;
}

// ─────────────────────────── onboarding form definition (DTO shared by API + UI) ───────────────────────────

export type QuestionTypeKey =
  | "TEXT"
  | "TEXTAREA"
  | "SELECT"
  | "MULTI_SELECT"
  | "RADIO"
  | "CHECKBOX"
  | "DATE"
  | "TIME"
  | "NUMBER"
  | "CURRENCY"
  | "FILE"
  | "URL"
  | "EMAIL"
  | "PHONE"
  | "COLOR"
  | "RATING";

export interface QuestionOptionDef {
  label: string;
  value: string;
  categoryKeys: string[];
  icon?: string | null;
  description?: string | null;
}

export interface QuestionDef {
  id: string;
  key: string;
  text: string;
  helpText?: string | null;
  placeholder?: string | null;
  type: QuestionTypeKey;
  required: boolean;
  categoryKeys: string[];
  conditionalLogic: Logic | null;
  meta: Record<string, any> | null;
  options: QuestionOptionDef[];
  sectionKey: string;
  sortOrder: number;
}

export interface SectionDef {
  key: string;
  title: string;
  description?: string | null;
  questions: QuestionDef[];
}

export interface FormDef {
  key: string;
  name: string;
  sections: SectionDef[];
}

export type Answers = Record<string, any>;

/**
 * Which question categories are currently in play. COMMON is always on; every selected option can add
 * categories (e.g. picking "Real Estate" adds REAL_ESTATE). Iterates to a fixed point because a category
 * can reveal further questions whose options add more categories.
 */
export function activeCategories(form: FormDef, answers: Answers, extra: string[] = []): Set<string> {
  const cats = new Set<string>(["COMMON", ...extra]);
  for (let i = 0; i < 6; i++) {
    const before = cats.size;
    for (const s of form.sections)
      for (const q of s.questions) {
        if (!q.options.length) continue;
        if (!isQuestionVisibleWith(q, answers, cats)) continue;
        const picked = asArray(answers[q.key]).map(String);
        for (const o of q.options) if (picked.includes(o.value)) o.categoryKeys.forEach((k) => cats.add(k));
      }
    if (cats.size === before) break;
  }
  return cats;
}

function isQuestionVisibleWith(q: QuestionDef, answers: Answers, cats: Set<string>): boolean {
  if (q.categoryKeys.length > 0 && !q.categoryKeys.some((k) => cats.has(k))) return false;
  return evalLogic(q.conditionalLogic, answers);
}

export function isQuestionVisible(form: FormDef, q: QuestionDef, answers: Answers, extra: string[] = []): boolean {
  return isQuestionVisibleWith(q, answers, activeCategories(form, answers, extra));
}

export function visibleQuestions(form: FormDef, section: SectionDef, answers: Answers, extra: string[] = []): QuestionDef[] {
  const cats = activeCategories(form, answers, extra);
  return section.questions.filter((q) => isQuestionVisibleWith(q, answers, cats));
}

/** Sections that have at least one visible question — used for step count / progress. */
export function visibleSections(form: FormDef, answers: Answers, extra: string[] = []): SectionDef[] {
  const cats = activeCategories(form, answers, extra);
  return form.sections.filter((s) => s.questions.some((q) => isQuestionVisibleWith(q, answers, cats)));
}

export function isAnswered(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "boolean") return true;
  return true;
}

const URL_RE = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[+()\-.\s\d]{6,24}$/;
const COLOR_RE = /^#?[0-9a-f]{3,8}$/i;

/** Validates ONE answer against its question definition. Returns an error message or null. Shared by UI + server. */
export function validateAnswer(q: QuestionDef, value: unknown): string | null {
  if (!isAnswered(value)) return q.required ? "This field is required." : null;
  const s = typeof value === "string" ? value.trim() : value;
  switch (q.type) {
    case "EMAIL":
      return EMAIL_RE.test(String(s)) ? null : "Enter a valid email address.";
    case "URL":
      return URL_RE.test(String(s)) ? null : "Enter a valid URL starting with http:// or https://";
    case "PHONE":
      return PHONE_RE.test(String(s)) ? null : "Enter a valid phone number.";
    case "COLOR":
      return COLOR_RE.test(String(s)) ? null : "Enter a valid color like #FF5B2E.";
    case "NUMBER":
    case "CURRENCY": {
      const n = Number(s);
      if (!Number.isFinite(n)) return "Enter a number.";
      if (q.meta?.min !== undefined && n < q.meta.min) return `Must be at least ${q.meta.min}.`;
      if (q.meta?.max !== undefined && n > q.meta.max) return `Must be at most ${q.meta.max}.`;
      return null;
    }
    case "DATE":
      return isNaN(Date.parse(String(s))) ? "Enter a valid date." : null;
    case "TIME":
      return /^\d{1,2}:\d{2}$/.test(String(s)) ? null : "Enter a valid time.";
    case "RATING": {
      const n = Number(s);
      return n >= 1 && n <= 5 ? null : "Choose a rating from 1 to 5.";
    }
    case "SELECT":
    case "RADIO":
      if (q.options.length && !q.options.some((o) => o.value === String(s))) return "Choose one of the options.";
      return null;
    case "MULTI_SELECT":
      if (!Array.isArray(value)) return "Choose one or more options.";
      if (q.options.length && !value.every((v) => q.options.some((o) => o.value === String(v)))) return "One of the selected options is not valid.";
      return null;
    case "TEXT":
    case "TEXTAREA": {
      const max = q.meta?.maxLength ?? (q.type === "TEXT" ? 300 : 8000);
      return String(s).length > max ? `Keep this under ${max} characters.` : null;
    }
    default:
      return null;
  }
}
