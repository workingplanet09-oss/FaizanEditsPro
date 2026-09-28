import { authRoute } from "@/server/api";
import { beginTwoFactorSetup } from "@/server/services/auth";

export const POST = authRoute({}, async ({ actor }) => beginTwoFactorSetup(actor));
