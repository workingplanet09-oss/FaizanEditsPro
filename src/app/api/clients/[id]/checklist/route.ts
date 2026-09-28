import { authRoute } from "@/server/api";
import { onboardingChecklist } from "@/server/services/clients";

export const GET = authRoute({}, async ({ actor, params }) => onboardingChecklist(actor, params.id));
