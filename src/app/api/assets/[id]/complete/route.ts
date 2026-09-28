import { publicRoute, z } from "@/server/api";
import { completeUpload } from "@/server/services/assets";

/** Step 3: confirm the object landed in storage (size verified server-side), then version/scan/log. */
export const POST = publicRoute({ body: z.object({ draftToken: z.string().max(80).optional(), fileRequestId: z.string().optional(), durationMs: z.number().int().min(0).optional() }).default({}) }, async ({ actor, params, body }) => completeUpload(actor, params.id, body));
