import { authRoute, z } from "@/server/api";
import { listAllAssets } from "@/server/services/assets";

export const GET = authRoute({ query: z.object({ q: z.string().optional(), projectId: z.string().optional(), page: z.coerce.number().optional() }) }, async ({ actor, query }) => listAllAssets(actor, query));
