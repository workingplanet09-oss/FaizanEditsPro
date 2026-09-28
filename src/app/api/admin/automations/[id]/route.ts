import { authRoute } from "@/server/api";
import { deleteAutomation, getAutomation, saveAutomation } from "@/server/services/automations";
import { automationBody } from "../route";

export const GET = authRoute({}, async ({ actor, params }) => getAutomation(actor, params.id));
export const PUT = authRoute({ body: automationBody }, async ({ actor, params, body }) => saveAutomation(actor, params.id, body as any));
export const DELETE = authRoute({}, async ({ actor, params }) => deleteAutomation(actor, params.id));
