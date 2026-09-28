import { authRoute, z } from "@/server/api";
import { createFileRequest, listFileRequests } from "@/server/services/requests";

export const GET = authRoute({ query: z.object({ open: z.string().optional() }) }, async ({ actor, params, query }) => listFileRequests(actor, params.id, { openOnly: query.open === "1" }));
export const POST = authRoute(
  { body: z.object({ title: z.string().trim().min(3).max(200), description: z.string().max(1000).optional(), acceptedTypes: z.array(z.string().max(20)).max(10).optional() }), status: 201 },
  async ({ actor, params, body }) => createFileRequest(actor, params.id, body),
);
