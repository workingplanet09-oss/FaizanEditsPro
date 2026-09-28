import { authRoute, z } from "@/server/api";
import { cmsCreate, cmsList } from "@/server/services/cms";

export const GET = authRoute({ query: z.object({ q: z.string().optional(), page: z.coerce.number().optional(), pageSize: z.coerce.number().optional() }) }, async ({ actor, params, query }) => cmsList(actor, params.resource, query));
export const POST = authRoute({ body: z.record(z.string(), z.any()), status: 201 }, async ({ actor, params, body }) => cmsCreate(actor, params.resource, body));
