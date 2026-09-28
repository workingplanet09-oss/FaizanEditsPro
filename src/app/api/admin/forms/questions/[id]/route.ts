import { authRoute } from "@/server/api";
import { deleteQuestion, updateQuestion } from "@/server/services/onboarding";
import { questionBody } from "../route";

export const PATCH = authRoute({ body: questionBody.partial() }, async ({ actor, params, body }) => updateQuestion(actor, params.id, body as any));
export const DELETE = authRoute({}, async ({ actor, params }) => deleteQuestion(actor, params.id));
