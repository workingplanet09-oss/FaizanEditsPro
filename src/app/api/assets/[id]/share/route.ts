import { authRoute } from "@/server/api";
import { shareAsset } from "@/server/services/assets";

export const POST = authRoute({}, async ({ actor, params }) => shareAsset(actor, params.id, true));
export const DELETE = authRoute({}, async ({ actor, params }) => shareAsset(actor, params.id, false));
