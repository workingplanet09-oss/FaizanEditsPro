import { authRoute } from "@/server/api";
import { assertCan } from "@/server/auth/actor";
import { inviteClientUser } from "@/server/services/auth";

export const POST = authRoute({}, async ({ actor, params }) => {
  assertCan(actor, "clients:write");
  return inviteClientUser(actor, params.id);
});
