import { authRoute, z } from "@/server/api";
import { autosaveProjectOnboarding, getProjectOnboarding, submitProjectOnboarding } from "@/server/services/briefs";

export const GET = authRoute({}, async ({ actor, params }) => getProjectOnboarding(actor, params.id));
/** Debounced autosave from the setup wizard. */
export const PUT = authRoute({ body: z.object({ answers: z.record(z.string(), z.any()), step: z.number().int().min(0).max(50) }) }, async ({ actor, params, body }) => autosaveProjectOnboarding(actor, params.id, body));
export const POST = authRoute({ body: z.object({ answers: z.record(z.string(), z.any()) }) }, async ({ actor, params, body }) => submitProjectOnboarding(actor, params.id, body));
