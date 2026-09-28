import { authRoute, z } from "@/server/api";
import { signContract } from "@/server/services/contracts";

export const POST = authRoute(
  { body: z.object({ signerName: z.string().trim().min(2).max(120), signature: z.string().min(2).max(200_000), kind: z.enum(["typed", "drawn"]), accept: z.boolean(), version: z.number().int().min(1) }), rateLimit: { name: "sign", limit: 20, windowSec: 600, by: "user" } },
  async ({ actor, params, body }) => signContract(actor, params.id, body),
);
