import { authRoute } from "@/server/api";
import { assetVersions } from "@/server/services/assets";

export const GET = authRoute({}, async ({ actor, params }) => assetVersions(actor, params.id));
