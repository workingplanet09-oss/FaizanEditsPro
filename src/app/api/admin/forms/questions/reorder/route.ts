import { authRoute, z } from "@/server/api";
import { reorderQuestions } from "@/server/services/onboarding";

export const POST = authRoute({ body: z.object({ ids: z.array(z.string()).min(1).max(300) }) }, async ({ actor, body }) => reorderQuestions(actor, body.ids));
