import { authRoute, z } from "@/server/api";
import { previousAnswersForProject } from "@/server/services/leads";

/** Answers from an earlier project, so a returning client can start a new request from the same settings. */
export const GET = authRoute({ query: z.object({ projectId: z.string().min(1) }) }, async ({ actor, query }) => ({ answers: await previousAnswersForProject(actor, query.projectId) }));
