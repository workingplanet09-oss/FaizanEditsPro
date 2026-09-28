import { authRoute, z } from "@/server/api";
import { getClientOrThrow, updateClient, clientLifetime } from "@/server/services/clients";

export const GET = authRoute({}, async ({ actor, params }) => {
  const c = await getClientOrThrow(actor, params.id);
  return { ...c, lifetime: await clientLifetime(c.id) };
});

export const PATCH = authRoute(
  {
    body: z.object({
      name: z.string().trim().min(2).max(100).optional(),
      email: z.string().email().max(200).optional(),
      phone: z.string().max(40).nullish(),
      companyName: z.string().trim().min(1).max(120).optional(),
      industry: z.string().max(80).nullish(),
      website: z.string().max(300).nullish(),
      country: z.string().max(60).nullish(),
      timezone: z.string().max(60).nullish(),
      status: z.enum(["LEAD", "PROSPECT", "ONBOARDING", "ACTIVE", "RETAINER", "INACTIVE", "ARCHIVED"]).optional(),
      tags: z.array(z.string().max(40)).max(20).optional(),
      managerId: z.string().nullish(),
      socialLinks: z.record(z.string(), z.string().max(300)).optional(),
    }),
  },
  async ({ actor, params, body }) => updateClient(actor, params.id, body as any),
);
