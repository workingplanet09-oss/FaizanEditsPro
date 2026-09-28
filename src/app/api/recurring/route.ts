import { authRoute, z } from "@/server/api";
import { createSchedule, listSchedules } from "@/server/services/recurring";

export const GET = authRoute({ query: z.object({ clientId: z.string().optional() }) }, async ({ actor, query }) => listSchedules(actor, query.clientId));
export const POST = authRoute({ body: z.object({ clientId: z.string(), templateId: z.string(), name: z.string().trim().max(120), cadence: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]), firstRunAt: z.coerce.date() }), status: 201 }, async ({ actor, body }) => createSchedule(actor, body));
