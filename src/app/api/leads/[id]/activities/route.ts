import { authRoute, z } from "@/server/api";
import { addLeadActivity } from "@/server/services/leads";

export const POST = authRoute(
  { body: z.object({ type: z.enum(["note", "email_sent", "call_made", "call_scheduled", "contacted", "meeting"]), title: z.string().trim().min(1).max(200), note: z.string().max(2000).optional(), nextFollowUpAt: z.coerce.date().nullish() }), status: 201 },
  async ({ actor, params, body }) => addLeadActivity(actor, params.id, body as any),
);
