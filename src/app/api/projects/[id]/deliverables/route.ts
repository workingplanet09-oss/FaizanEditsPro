import { authRoute } from "@/server/api";
import { listDeliverables } from "@/server/services/assets";

export const GET = authRoute({}, async ({ actor, params }) => listDeliverables(actor, params.id));
