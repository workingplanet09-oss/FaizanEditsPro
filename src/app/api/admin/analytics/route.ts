import { authRoute, z } from "@/server/api";
import { analyticsReport, profitability, teamWorkload } from "@/server/services/analytics";
import { can } from "@/server/auth/actor";

export const GET = authRoute({ query: z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }) }, async ({ actor, query }) => ({
  report: await analyticsReport(actor, query),
  workload: await teamWorkload(actor),
  profitability: can(actor, "profitability:read") ? await profitability(actor) : null,
}));
