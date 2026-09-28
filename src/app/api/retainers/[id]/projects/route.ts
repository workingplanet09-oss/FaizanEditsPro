import { authRoute, z } from "@/server/api";
import { startRetainerProject } from "@/server/services/retainers";

export const POST = authRoute({ body: z.object({ name: z.string().trim().min(2).max(200), description: z.string().max(3000).optional(), kind: z.enum(["VIDEO", "SHORT"]).optional(), deadline: z.coerce.date().nullish() }), status: 201 }, async ({ actor, params, body }) => {
  const p = await startRetainerProject(actor, params.id, body);
  return { id: p.id, code: p.code };
});
