import { authRoute, z } from "@/server/api";
import { deleteTask, updateTask } from "@/server/services/tasks";

export const PATCH = authRoute(
  { body: z.object({ title: z.string().trim().min(1).max(200).optional(), description: z.string().max(3000).nullish(), assigneeId: z.string().nullish(), priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(), dueDate: z.coerce.date().nullish(), status: z.enum(["TODO", "IN_PROGRESS", "REVIEW", "BLOCKED", "COMPLETE"]).optional(), sortOrder: z.number().int().optional() }) },
  async ({ actor, params, body }) => updateTask(actor, params.id, body as any),
);
export const DELETE = authRoute({}, async ({ actor, params }) => deleteTask(actor, params.id));
