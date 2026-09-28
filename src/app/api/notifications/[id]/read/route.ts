import { authRoute } from "@/server/api";
import { markRead } from "@/server/services/notifications";

export const POST = authRoute({}, async ({ actor, params }) => markRead(actor, params.id));
