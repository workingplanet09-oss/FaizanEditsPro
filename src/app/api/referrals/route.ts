import { authRoute } from "@/server/api";
import { getMyReferrals } from "@/server/services/referrals";

export const GET = authRoute({}, async ({ actor }) => getMyReferrals(actor));
