import { authRoute } from "@/server/api";
import { jobStats, retryFailedJobs } from "@/server/services/admin";

export const GET = authRoute({}, async ({ actor }) => jobStats(actor));
export const POST = authRoute({}, async ({ actor }) => retryFailedJobs(actor));
