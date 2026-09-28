import { authRoute, z } from "@/server/api";
import { listReferrals, updateReferral } from "@/server/services/referrals";

export const GET = authRoute({}, async ({ actor }) => listReferrals(actor));
export const PATCH = authRoute({ body: z.object({ id: z.string(), status: z.enum(["PENDING", "QUALIFIED", "REWARDED", "EXPIRED"]).optional(), reward: z.string().max(200).optional() }) }, async ({ actor, body }) => updateReferral(actor, body.id, { status: body.status, reward: body.reward }));
