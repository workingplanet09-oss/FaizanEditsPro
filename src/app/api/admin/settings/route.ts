import { authRoute } from "@/server/api";
import { assertCan } from "@/server/auth/actor";
import { getAllSettings } from "@/server/services/settings";
import { integrationStatus } from "@/server/env";

/** All settings groups + which integrations are wired up (never their secrets). */
export const GET = authRoute({}, async ({ actor }) => {
  assertCan(actor, "settings:manage");
  return { settings: await getAllSettings(actor.workspaceId), integrations: integrationStatus() };
});
