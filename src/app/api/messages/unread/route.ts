import { authRoute } from "@/server/api";
import { unreadMessageCount } from "@/server/services/messages";

export const GET = authRoute({}, async ({ actor }) => ({ count: await unreadMessageCount(actor) }));
