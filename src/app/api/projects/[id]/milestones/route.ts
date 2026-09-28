import { authRoute } from "@/server/api";
import { projectMilestones } from "@/server/services/projects";

export const GET = authRoute({}, async ({ actor, params }) => projectMilestones(actor, params.id));
