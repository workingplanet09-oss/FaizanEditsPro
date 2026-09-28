import { authRoute, z } from "@/server/api";
import { confirmBrief, getBrief, updateBriefAnswers } from "@/server/services/briefs";

export const GET = authRoute({}, async ({ actor, params }) => getBrief(actor, params.id));
export const PATCH = authRoute({ body: z.object({ answers: z.record(z.string(), z.any()) }) }, async ({ actor, params, body }) => updateBriefAnswers(actor, params.id, body.answers));
export const POST = authRoute({}, async ({ actor, params }) => confirmBrief(actor, params.id));
