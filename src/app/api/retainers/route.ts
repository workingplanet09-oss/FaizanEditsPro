import { authRoute, z } from "@/server/api";
import { createRetainer, listRetainers } from "@/server/services/retainers";

export const GET = authRoute({ query: z.object({ status: z.string().optional(), clientId: z.string().optional() }) }, async ({ actor, query }) => listRetainers(actor, query));
export const POST = authRoute(
  { body: z.object({ clientId: z.string(), planId: z.string().nullish(), name: z.string().trim().min(2).max(120), monthlyPrice: z.number().int().min(0), currency: z.string().length(3).optional(), videosIncluded: z.number().int().min(0).max(1000).optional(), shortsIncluded: z.number().int().min(0).max(1000).optional(), hoursIncluded: z.number().int().min(0).max(1000).optional(), turnaroundDays: z.number().int().min(1).max(60).optional(), revisionsIncluded: z.number().int().min(0).max(20).optional(), startDate: z.coerce.date().optional(), notes: z.string().max(1000).nullish() }), status: 201 },
  async ({ actor, body }) => createRetainer(actor, body as any),
);
