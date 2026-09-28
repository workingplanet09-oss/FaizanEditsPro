import { authRoute } from "@/server/api";
import { listAssignable } from "@/server/services/projects";

export const GET = authRoute({}, async ({ actor }) => listAssignable(actor));
