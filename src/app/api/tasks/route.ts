import { authRoute, z } from "@/server/api";
import { createTask, listTasks } from "@/server/services/tasks";

export const GET = authRoute({ query: z.object({ projectId: z.string().optional(), assigneeId: z.string().optional(), status: z.string().optional(), mine: z.string().optional(), due: z.string().optional(), q: z.string().optional(), page: z.coerce.number().optional(), pageSize: z.coerce.number().optional() }) }, async ({ actor, query }) => listTasks(actor, query));
export const POST = authRoute(
  { body: z.object({ projectId: z.string().nullish(), parentId: z.string().nullish(), title: z.string().trim().min(1).max(200), description: z.string().max(3000).optional(), assigneeId: z.string().nullish(), priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(), dueDate: z.coerce.date().nullish(), status: z.enum(["TODO", "IN_PROGRESS", "REVIEW", "BLOCKED", "COMPLETE"]).optional() }), status: 201 },
  async ({ actor, body }) => createTask(actor, body as any),
);
