import { authRoute, z } from "@/server/api";
import { globalSearch } from "@/server/services/search";

export const GET = authRoute({ query: z.object({ q: z.string().max(100), kinds: z.string().optional() }), rateLimit: { name: "search", limit: 120, windowSec: 60, by: "user" } }, async ({ actor, query }) => ({ hits: await globalSearch(actor, query.q, query.kinds ? (query.kinds.split(",") as any) : undefined) }));
