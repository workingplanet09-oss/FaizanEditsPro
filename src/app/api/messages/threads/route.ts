import { authRoute } from "@/server/api";
import { listThreads } from "@/server/services/messages";

export const GET = authRoute({}, async ({ actor }) => listThreads(actor));
