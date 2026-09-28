import { authRoute, z } from "@/server/api";
import { cmsDelete, cmsGet, cmsUpdate } from "@/server/services/cms";

export const GET = authRoute({}, async ({ actor, params }) => cmsGet(actor, params.resource, params.id));
export const PATCH = authRoute({ body: z.record(z.string(), z.any()) }, async ({ actor, params, body }) => cmsUpdate(actor, params.resource, params.id, body));
export const DELETE = authRoute({}, async ({ actor, params }) => cmsDelete(actor, params.resource, params.id));
