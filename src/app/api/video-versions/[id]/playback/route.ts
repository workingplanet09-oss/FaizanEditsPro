import { authRoute, z } from "@/server/api";
import { getVersionPlayback } from "@/server/services/reviews";

export const GET = authRoute({ query: z.object({ download: z.string().optional() }) }, async ({ actor, params, query }) => getVersionPlayback(actor, params.id, { download: query.download === "1" }));
