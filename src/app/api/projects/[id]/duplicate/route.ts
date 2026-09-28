import { authRoute, z } from "@/server/api";
import { duplicateProject } from "@/server/services/recurring";

export const POST = authRoute({ body: z.object({ name: z.string().max(200).optional(), copyOnboarding: z.boolean().optional() }).default({}), status: 201 }, async ({ actor, params, body }) => {
  const p = await duplicateProject(actor, params.id, body);
  return { id: p.id, code: p.code };
});
