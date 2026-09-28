import { authRoute } from "@/server/api";
import { publishDeliverables } from "@/server/services/assets";

export const POST = authRoute({}, async ({ actor, params }) => publishDeliverables(actor, params.id));
