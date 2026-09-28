import { authRoute, z } from "@/server/api";
import { createInvoice, listInvoices } from "@/server/services/invoices";

export const GET = authRoute({ query: z.object({ q: z.string().optional(), status: z.string().optional(), clientId: z.string().optional(), projectId: z.string().optional(), page: z.coerce.number().optional(), pageSize: z.coerce.number().optional() }) }, async ({ actor, query }) => listInvoices(actor, query));
export const POST = authRoute(
  {
    body: z.object({
      clientId: z.string(),
      projectId: z.string().nullish(),
      kind: z.enum(["DEPOSIT", "BALANCE", "FULL", "RETAINER", "CHANGE_ORDER", "OTHER"]).optional(),
      currency: z.string().length(3).optional(),
      items: z.array(z.object({ description: z.string().trim().min(1).max(300), quantity: z.number().positive().max(10000), unitPrice: z.number().int().min(0) })).min(1).max(40),
      discount: z.number().int().min(0).optional(),
      taxRateBps: z.number().int().min(0).max(10000).optional(),
      dueDate: z.coerce.date().nullish(),
      notes: z.string().max(2000).nullish(),
      send: z.boolean().optional(),
    }),
    status: 201,
  },
  async ({ actor, body }) => createInvoice(actor, body as any),
);
