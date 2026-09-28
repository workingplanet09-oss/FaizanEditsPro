import { authRoute } from "@/server/api";
import { listTime } from "@/server/services/time";

export const GET = authRoute({}, async ({ actor, params }) => listTime(actor, { projectId: params.id }));
