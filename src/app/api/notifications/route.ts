import { authRoute, z } from "@/server/api";
import { listNotifications } from "@/server/services/notifications";

export const GET = authRoute({ query: z.object({ category: z.enum(["PROJECT", "MESSAGE", "PAYMENT", "REVIEW", "SYSTEM"]).optional(), unread: z.string().optional(), page: z.coerce.number().optional(), pageSize: z.coerce.number().optional() }) }, async ({ actor, query }) => listNotifications(actor, { category: query.category, unreadOnly: query.unread === "1", page: query.page, pageSize: query.pageSize }));
