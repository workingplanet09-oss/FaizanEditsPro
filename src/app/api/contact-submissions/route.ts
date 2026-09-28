import { authRoute, z } from "@/server/api";
import { listContactSubmissions } from "@/server/services/leads";

export const GET = authRoute({ query: z.object({ handled: z.string().optional(), page: z.coerce.number().optional() }) }, async ({ actor, query }) => listContactSubmissions(actor, query));
