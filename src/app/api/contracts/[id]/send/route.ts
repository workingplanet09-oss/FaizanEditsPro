import { authRoute } from "@/server/api";
import { sendContract } from "@/server/services/contracts";

export const POST = authRoute({}, async ({ actor, params }) => sendContract(actor, params.id));
