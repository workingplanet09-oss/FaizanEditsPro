import { authRoute, z } from "@/server/api";
import { transitionProject } from "@/server/services/projects";
import { PROJECT_STATUSES } from "@/lib/statuses";

export const POST = authRoute(
  { body: z.object({ to: z.enum(PROJECT_STATUSES as unknown as [string, ...string[]]), comment: z.string().max(500).optional(), override: z.boolean().optional() }) },
  async ({ actor, params, body }) => {
    const p = await transitionProject(actor, params.id, body.to as any, { comment: body.comment, override: body.override });
    return { id: p.id, status: p.status };
  },
);
