import { authRoute } from "@/server/api";
import { releaseVersion } from "@/server/services/reviews";

export const POST = authRoute({}, async ({ actor, params }) => releaseVersion(actor, params.id));
