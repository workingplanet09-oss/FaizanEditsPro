import { authRoute, z } from "@/server/api";
import { createQuote, listQuotes } from "@/server/services/quotes";

export const quoteBody = z.object({
  clientId: z.string(),
  projectId: z.string().nullish(),
  leadId: z.string().nullish(),
  title: z.string().max(200).optional(),
  currency: z.string().length(3).optional(),
  items: z.array(z.object({ description: z.string().trim().min(1).max(300), serviceId: z.string().nullish(), quantity: z.number().positive().max(10000), unitPrice: z.number().int().min(0) })).min(1).max(40),
  discount: z.number().int().min(0).optional(),
  taxRateBps: z.number().int().min(0).max(10000).optional(),
  depositPercent: z.number().int().min(0).max(100).optional(),
  validUntil: z.coerce.date().nullish(),
  notes: z.string().max(3000).nullish(),
  terms: z.string().max(6000).nullish(),
  projectName: z.string().max(200).optional(),
  serviceId: z.string().nullish(),
  projectTypeKey: z.string().max(60).nullish(),
});

export const GET = authRoute({ query: z.object({ q: z.string().optional(), status: z.string().optional(), clientId: z.string().optional(), page: z.coerce.number().optional(), pageSize: z.coerce.number().optional() }) }, async ({ actor, query }) => listQuotes(actor, query));
export const POST = authRoute({ body: quoteBody, status: 201 }, async ({ actor, body }) => createQuote(actor, body as any));
