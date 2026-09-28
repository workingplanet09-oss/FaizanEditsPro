import { authRoute } from "@/server/api";
import { adminOverview } from "@/server/services/onboarding";

/** Form builder: every section, question (including disabled ones), option and category. */
export const GET = authRoute({}, async ({ actor, params }) => adminOverview(actor, params.form));
