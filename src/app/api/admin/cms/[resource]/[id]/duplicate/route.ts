import { authRoute } from "@/server/api";
import { cmsDuplicate } from "@/server/services/cms";

export const POST = authRoute({ status: 201 }, async ({ actor, params }) => cmsDuplicate(actor, params.resource, params.id));
