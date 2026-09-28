import { authRoute } from "@/server/api";
import { getVersionPoster } from "@/server/services/reviews";

export const GET = authRoute({}, async ({ actor, params }) => getVersionPoster(actor, params.id));
