import { authRoute, z } from "@/server/api";
import { getContract, updateContract } from "@/server/services/contracts";

export const GET = authRoute({}, async ({ actor, params }) => getContract(actor, params.id, { markViewed: true }));
export const PATCH = authRoute(
  { body: z.object({ title: z.string().trim().min(2).max(200).optional(), sections: z.array(z.object({ key: z.string().max(40), title: z.string().max(200), body: z.string().max(8000) })).min(1).max(30).optional() }) },
  async ({ actor, params, body }) => updateContract(actor, params.id, body),
);
