import { publicRoute, z } from "@/server/api";
import { availableSlots } from "@/server/services/booking";

export const GET = publicRoute({ query: z.object({ type: z.enum(["DISCOVERY_CALL", "PROJECT_CONSULTATION", "CLIENT_REVIEW_CALL", "STRATEGY_CALL"]).default("DISCOVERY_CALL"), days: z.coerce.number().min(1).max(60).optional() }) }, async ({ query }) => availableSlots({ type: query.type, days: query.days }));
