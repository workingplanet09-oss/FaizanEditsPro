import { authRoute, z } from "@/server/api";
import { classifyChangeRequest } from "@/server/services/requests";

export const PATCH = authRoute(
  { body: z.object({ classification: z.enum(["PENDING", "INCLUDED", "OUT_OF_SCOPE", "ADDITIONAL_COST"]), staffNote: z.string().max(2000).optional(), createQuote: z.object({ title: z.string().max(200), amount: z.number().int().min(1), description: z.string().max(1000).optional() }).optional() }) },
  async ({ actor, params, body }) => classifyChangeRequest(actor, params.id, body),
);
