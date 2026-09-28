import { authRoute } from "@/server/api";
import { confirmThumbnail, getThumbnailUrl, requestThumbnailUpload } from "@/server/services/assets";

export const GET = authRoute({}, async ({ actor, params }) => getThumbnailUrl(actor, params.id));
export const POST = authRoute({}, async ({ actor, params }) => requestThumbnailUpload(actor, params.id));
export const PUT = authRoute({}, async ({ actor, params }) => confirmThumbnail(actor, params.id));
