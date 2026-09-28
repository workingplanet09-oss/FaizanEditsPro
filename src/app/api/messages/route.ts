import { authRoute, z } from "@/server/api";
import { listMessages, sendMessage } from "@/server/services/messages";

export const GET = authRoute({ query: z.object({ projectId: z.string().optional(), clientId: z.string().optional(), markRead: z.string().optional() }) }, async ({ actor, query }) => listMessages(actor, { projectId: query.projectId, clientId: query.clientId, markRead: query.markRead !== "0" }));
export const POST = authRoute(
  { body: z.object({ projectId: z.string().nullish(), clientId: z.string().nullish(), body: z.string().max(5000), recipientGroup: z.enum(["PROJECT_MANAGER", "EDITOR", "SUPPORT", "CLIENT"]).optional(), mentionUserIds: z.array(z.string()).max(10).optional(), attachmentAssetIds: z.array(z.string()).max(10).optional() }), status: 201 },
  async ({ actor, body }) => sendMessage(actor, body),
);
