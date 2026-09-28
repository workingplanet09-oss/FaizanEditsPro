import { authRoute } from "@/server/api";
import { convertContactToLead } from "@/server/services/leads";

export const POST = authRoute({}, async ({ actor, params }) => convertContactToLead(actor, params.id));
