import { authRoute } from "@/server/api";
import { stopTimer } from "@/server/services/time";

export const POST = authRoute({}, async ({ actor }) => stopTimer(actor));
