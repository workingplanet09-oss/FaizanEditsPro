import { authRoute, z } from "@/server/api";
import { markAllRead } from "@/server/services/notifications";

/** Mark all (optionally per category) as read. */
export const POST = authRoute({ body: z.object({ category: z.enum(["PROJECT", "MESSAGE", "PAYMENT", "REVIEW", "SYSTEM"]).optional() }).default({}) }, async ({ actor, body }) => markAllRead(actor, body.category));
