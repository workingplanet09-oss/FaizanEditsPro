import { authRoute, z } from "@/server/api";
import { listAutomations, saveAutomation } from "@/server/services/automations";

export const automationBody = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(500).nullish(),
  event: z.string().max(60),
  enabled: z.boolean().optional(),
  conditions: z.any().optional(),
  actions: z.array(z.object({ type: z.enum(["EMAIL", "NOTIFICATION", "STATUS_UPDATE", "CREATE_TASK", "ADMIN_ALERT", "CLIENT_REMINDER"]), config: z.record(z.string(), z.any()), delayMinutes: z.number().int().min(0).optional() })).min(1).max(10),
});

export const GET = authRoute({}, async ({ actor }) => listAutomations(actor));
export const POST = authRoute({ body: automationBody, status: 201 }, async ({ actor, body }) => saveAutomation(actor, null, body as any));
