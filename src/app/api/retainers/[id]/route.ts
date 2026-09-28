import { authRoute, z } from "@/server/api";
import { updateRetainer, getRetainerUsage } from "@/server/services/retainers";

export const GET = authRoute({}, async ({ actor, params }) => getRetainerUsage(actor, params.id));
export const PATCH = authRoute(
  { body: z.object({ name: z.string().max(120).optional(), monthlyPrice: z.number().int().min(0).optional(), videosIncluded: z.number().int().min(0).optional(), shortsIncluded: z.number().int().min(0).optional(), hoursIncluded: z.number().int().min(0).optional(), turnaroundDays: z.number().int().min(1).optional(), revisionsIncluded: z.number().int().min(0).optional(), renewalDate: z.coerce.date().optional(), status: z.enum(["ACTIVE", "PAUSED", "CANCELLED", "EXPIRED"]).optional(), notes: z.string().max(1000).nullish() }) },
  async ({ actor, params, body }) => updateRetainer(actor, params.id, body as any),
);
