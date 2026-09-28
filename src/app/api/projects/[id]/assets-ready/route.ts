import { authRoute } from "@/server/api";
import { markAssetsReady } from "@/server/services/projects";

export const POST = authRoute({}, async ({ actor, params }) => markAssetsReady(actor, params.id));
