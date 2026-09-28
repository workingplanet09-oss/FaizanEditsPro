import { authRoute, z } from "@/server/api";
import { addManualTime, listTime, myTimer, startTimer } from "@/server/services/time";

export const GET = authRoute({ query: z.object({ projectId: z.string().optional(), userId: z.string().optional() }) }, async ({ actor, query }) => ({ running: await myTimer(actor), entries: await listTime(actor, query) }));
export const POST = authRoute(
  { body: z.object({ projectId: z.string(), taskId: z.string().optional(), note: z.string().max(500).optional(), minutes: z.number().int().min(1).max(1440).optional(), date: z.coerce.date().optional() }), status: 201 },
  async ({ actor, body }) => (body.minutes ? addManualTime(actor, { projectId: body.projectId, minutes: body.minutes, note: body.note, date: body.date }) : startTimer(actor, body)),
);
