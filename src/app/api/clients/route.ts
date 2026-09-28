import { authRoute, z, AppError } from "@/server/api";
import { assertCan } from "@/server/auth/actor";
import { createClientRecord, listClients } from "@/server/services/clients";
import { audit } from "@/server/services/audit";

export const GET = authRoute(
  { query: z.object({ q: z.string().optional(), status: z.string().optional(), section: z.enum(["active", "inactive", "retainers", "prospects"]).optional(), sort: z.string().optional(), page: z.coerce.number().optional(), pageSize: z.coerce.number().optional() }) },
  async ({ actor, query }) => listClients(actor, query),
);

/** Quick action: create a client directly (no lead). */
export const POST = authRoute(
  { body: z.object({ name: z.string().trim().min(2).max(100), email: z.string().email().max(200), companyName: z.string().trim().min(1).max(120), phone: z.string().max(40).optional(), industry: z.string().max(80).optional(), website: z.string().url().max(300).optional() }), status: 201 },
  async ({ actor, body }) => {
    assertCan(actor, "clients:write");
    const email = body.email.toLowerCase();
    const dup = await (await import("@/server/db")).db.client.findFirst({ where: { workspaceId: actor.workspaceId, email } });
    if (dup) throw new AppError("CONFLICT", "A client with that email already exists.", { fields: { email: "Already exists." } });
    const c = await createClientRecord({ workspaceId: actor.workspaceId, ...body, email, status: "PROSPECT", source: "manual" });
    await audit(actor, { workspaceId: actor.workspaceId, action: "client.created", entityType: "client", entityId: c.id, message: `${actor.name} created client ${c.companyName}` });
    return c;
  },
);
