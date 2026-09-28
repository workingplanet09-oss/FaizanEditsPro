import { authRoute, z } from "@/server/api";
import { createQuestion } from "@/server/services/onboarding";

const TYPES = ["TEXT", "TEXTAREA", "SELECT", "MULTI_SELECT", "RADIO", "CHECKBOX", "DATE", "TIME", "NUMBER", "CURRENCY", "FILE", "URL", "EMAIL", "PHONE", "COLOR", "RATING"] as const;

const cond = z.object({ field: z.string().max(60), op: z.enum(["eq", "neq", "in", "nin", "contains", "not_contains", "exists", "empty", "gt", "lt", "truthy"]), value: z.any().optional() });
export const logicSchema = z.object({ all: z.array(cond).max(10).optional(), any: z.array(cond).max(10).optional() }).nullish();

export const questionBody = z.object({
  formKey: z.string().max(40),
  sectionKey: z.string().max(40),
  key: z.string().trim().regex(/^[a-z][a-z0-9_]{1,50}$/, "Use lowercase letters, numbers and underscores"),
  text: z.string().trim().min(3).max(300),
  helpText: z.string().max(500).nullish(),
  placeholder: z.string().max(200).nullish(),
  type: z.enum(TYPES),
  required: z.boolean().optional(),
  categoryKeys: z.array(z.string().max(40)).max(20).optional(),
  conditionalLogic: logicSchema,
  meta: z.record(z.string(), z.any()).nullish(),
  active: z.boolean().optional(),
  options: z.array(z.object({ label: z.string().trim().min(1).max(120), value: z.string().trim().min(1).max(80), categoryKeys: z.array(z.string().max(40)).max(10).optional(), icon: z.string().max(30).nullish(), description: z.string().max(200).nullish() })).max(60).optional(),
});

export const POST = authRoute({ body: questionBody, status: 201 }, async ({ actor, body }) => createQuestion(actor, body as any));
