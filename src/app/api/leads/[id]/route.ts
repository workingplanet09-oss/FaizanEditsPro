import { authRoute, z } from "@/server/api";
import { getLead, updateLead } from "@/server/services/leads";

export const GET = authRoute({}, async ({ actor, params }) => getLead(actor, params.id));

export const PATCH = authRoute(
  {
    body: z.object({
      status: z.enum(["NEW", "CONTACTED", "CALL_SCHEDULED", "QUALIFIED", "QUOTED", "CONVERTED", "LOST", "ARCHIVED"]).optional(),
      assignedToId: z.string().nullish(),
      nextFollowUpAt: z.coerce.date().nullish(),
      tags: z.array(z.string().max(40)).max(20).optional(),
      temperatureOverride: z.enum(["HOT", "WARM", "COLD", "NEEDS_REVIEW"]).nullish(),
      lostReason: z.string().max(300).nullish(),
      phone: z.string().max(40).nullish(),
      company: z.string().max(120).nullish(),
    }),
  },
  async ({ actor, params, body }) => updateLead(actor, params.id, body as any),
);
