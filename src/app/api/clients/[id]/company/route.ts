import { authRoute, z } from "@/server/api";
import { updateOwnCompany } from "@/server/services/clients";

export const PATCH = authRoute(
  {
    body: z.object({
      name: z.string().trim().min(2).max(100).optional(),
      phone: z.string().max(40).nullish(),
      companyName: z.string().trim().min(1).max(120).optional(),
      industry: z.string().max(80).nullish(),
      website: z.string().max(300).nullish(),
      country: z.string().max(60).nullish(),
      timezone: z.string().max(60).nullish(),
      socialLinks: z.record(z.string(), z.string().max(300)).optional(),
      billingEmail: z.string().email().max(200).nullish(),
      billingAddress: z.string().max(500).nullish(),
      taxId: z.string().max(60).nullish(),
    }),
  },
  async ({ actor, params, body }) => updateOwnCompany(actor, params.id, body as any),
);
