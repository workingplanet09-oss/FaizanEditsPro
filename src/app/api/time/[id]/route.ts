import { authRoute } from "@/server/api";
import { deleteTime } from "@/server/services/time";

export const DELETE = authRoute({}, async ({ actor, params }) => deleteTime(actor, params.id));
