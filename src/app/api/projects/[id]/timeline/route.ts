import { authRoute } from "@/server/api";
import { projectMilestones, projectTimeline } from "@/server/services/projects";

export const GET = authRoute({}, async ({ actor, params }) => ({ milestones: await projectMilestones(actor, params.id), events: await projectTimeline(actor, params.id) }));
