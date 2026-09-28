import { authRoute, z } from "@/server/api";
import { assertCan } from "@/server/auth/actor";
import { createContractDraft, listContracts } from "@/server/services/contracts";

export const GET = authRoute({ query: z.object({ q: z.string().optional(), status: z.string().optional(), page: z.coerce.number().optional(), pageSize: z.coerce.number().optional() }) }, async ({ actor, query }) => listContracts(actor, query));
export const POST = authRoute({ body: z.object({ projectId: z.string(), quoteId: z.string().nullish() }), status: 201 }, async ({ actor, body }) => {
  assertCan(actor, "contracts:write");
  return createContractDraft(actor, body.projectId, body.quoteId);
});
