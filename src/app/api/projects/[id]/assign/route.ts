import { authRoute, z } from "@/server/api";
import { assignProject } from "@/server/services/projects";

export const POST = authRoute(
  { body: z.object({ managerId: z.string().nullish(), editorIds: z.array(z.string()).max(20).optional(), motionDesignerIds: z.array(z.string()).max(20).optional(), reviewerIds: z.array(z.string()).max(20).optional() }) },
  async ({ actor, params, body }) => assignProject(actor, params.id, body as any),
);
