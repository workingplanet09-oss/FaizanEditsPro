import { authRoute } from "@/server/api";
import { cancelFileRequest } from "@/server/services/requests";

export const DELETE = authRoute({}, async ({ actor, params }) => cancelFileRequest(actor, params.id));
