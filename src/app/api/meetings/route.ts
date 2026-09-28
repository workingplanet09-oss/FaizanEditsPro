import { authRoute, z } from "@/server/api";
import { createMeeting, listMeetings } from "@/server/services/booking";

export const GET = authRoute({ query: z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional(), status: z.string().optional() }) }, async ({ actor, query }) => listMeetings(actor, query));
export const POST = authRoute({ body: z.object({ type: z.enum(["DISCOVERY_CALL", "PROJECT_CONSULTATION", "CLIENT_REVIEW_CALL", "STRATEGY_CALL"]), title: z.string().trim().min(2).max(200), startsAt: z.coerce.date(), minutes: z.number().int().min(10).max(240).optional(), clientId: z.string().nullish(), leadId: z.string().nullish(), projectId: z.string().nullish(), notes: z.string().max(1500).optional() }), status: 201 }, async ({ actor, body }) => createMeeting(actor, body));
