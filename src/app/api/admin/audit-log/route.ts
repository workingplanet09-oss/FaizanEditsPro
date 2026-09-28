import { authRoute, z } from "@/server/api";
import { listAuditLog } from "@/server/services/admin";

export const GET = authRoute({ query: z.object({ q: z.string().optional(), entityType: z.string().optional(), actorId: z.string().optional(), action: z.string().optional(), page: z.coerce.number().optional(), pageSize: z.coerce.number().optional() }) }, async ({ actor, query }) => listAuditLog(actor, query));
