import { authRoute, z } from "@/server/api";
import { listEmails } from "@/server/services/admin";

export const GET = authRoute({ query: z.object({ q: z.string().optional(), status: z.string().optional(), page: z.coerce.number().optional() }) }, async ({ actor, query }) => listEmails(actor, query));
