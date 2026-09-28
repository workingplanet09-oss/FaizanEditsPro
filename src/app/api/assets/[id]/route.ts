import { authRoute, z } from "@/server/api";
import { deleteAsset, getAssetOrThrow, getDownloadUrl, moveAsset, renameAsset, setDeliverable } from "@/server/services/assets";

export const GET = authRoute({ query: z.object({ download: z.string().optional(), inline: z.string().optional() }) }, async ({ actor, params, query }) => {
  if (query.download === "1" || query.inline === "1") return getDownloadUrl(actor, params.id, { inline: query.inline === "1" });
  const a = await getAssetOrThrow(actor, params.id);
  return { id: a.id, displayName: a.displayName, mimeType: a.mimeType, sizeBytes: Number(a.sizeBytes), status: a.status, version: a.version };
});

export const PATCH = authRoute(
  { body: z.object({ displayName: z.string().trim().min(1).max(200).optional(), folderKey: z.string().max(40).optional(), isDeliverable: z.boolean().optional(), deliverableLabel: z.string().max(80).nullish(), visibleToClient: z.boolean().optional() }) },
  async ({ actor, params, body }) => {
    let out: unknown = { ok: true };
    if (body.displayName) out = await renameAsset(actor, params.id, body.displayName);
    if (body.folderKey) out = await moveAsset(actor, params.id, body.folderKey);
    if (body.isDeliverable !== undefined || body.deliverableLabel !== undefined || body.visibleToClient !== undefined) out = await setDeliverable(actor, params.id, { isDeliverable: body.isDeliverable ?? true, label: body.deliverableLabel, visibleToClient: body.visibleToClient });
    return out;
  },
);
export const DELETE = authRoute({}, async ({ actor, params }) => deleteAsset(actor, params.id));
