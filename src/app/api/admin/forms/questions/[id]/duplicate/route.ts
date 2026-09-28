import { authRoute } from "@/server/api";
import { duplicateQuestion } from "@/server/services/onboarding";

export const POST = authRoute({ status: 201 }, async ({ actor, params }) => duplicateQuestion(actor, params.id));
