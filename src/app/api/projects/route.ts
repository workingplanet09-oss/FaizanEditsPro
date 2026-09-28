import { authRoute, z } from "@/server/api";
import { createProject, listProjects } from "@/server/services/projects";

export const GET = authRoute(
  { query: z.object({ q: z.string().optional(), status: z.string().optional(), clientId: z.string().optional(), editorId: z.string().optional(), type: z.string().optional(), priority: z.string().optional(), payment: z.string().optional(), deadline: z.string().optional(), sort: z.string().optional(), view: z.enum(["open", "all"]).optional(), page: z.coerce.number().optional(), pageSize: z.coerce.number().optional() }) },
  async ({ actor, query }) => listProjects(actor, query as any),
);

export const POST = authRoute(
  {
    body: z.object({
      clientId: z.string(),
      name: z.string().trim().min(2).max(200),
      description: z.string().max(4000).nullish(),
      serviceId: z.string().nullish(),
      projectTypeKey: z.string().max(60).nullish(),
      priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
      deadline: z.coerce.date().nullish(),
      managerId: z.string().nullish(),
      templateId: z.string().nullish(),
      currency: z.string().length(3).optional(),
      revisionLimit: z.number().int().min(0).max(20).optional(),
      clientVisible: z.boolean().optional(),
    }),
    status: 201,
  },
  async ({ actor, body }) => createProject(actor, { ...body, status: "AWAITING_QUOTE" }),
);
