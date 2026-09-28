import { authRoute, z } from "@/server/api";
import { getProjectDetail, updateProject } from "@/server/services/projects";

export const GET = authRoute({}, async ({ actor, params }) => getProjectDetail(actor, params.id));

export const PATCH = authRoute(
  {
    body: z.object({
      name: z.string().trim().min(2).max(200).optional(),
      description: z.string().max(4000).nullish(),
      priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
      deadline: z.coerce.date().nullish(),
      revisionLimit: z.number().int().min(0).max(20).optional(),
      tags: z.array(z.string().max(40)).max(20).optional(),
      serviceId: z.string().nullish(),
      internalCost: z.number().int().min(0).nullish(),
      rushFee: z.number().int().min(0).nullish(),
      scope: z.object({ deliverables: z.array(z.object({ label: z.string().max(150), quantity: z.number().int().min(1).max(999) })).max(40).optional(), revisionRounds: z.number().int().min(0).max(20).optional(), turnaroundBusinessDays: z.number().int().min(1).max(120).optional(), notes: z.string().max(2000).optional() }).optional(),
    }),
  },
  async ({ actor, params, body }) => updateProject(actor, params.id, body as any),
);
