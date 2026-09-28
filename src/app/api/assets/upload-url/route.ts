import { publicRoute, z } from "@/server/api";
import { requestUpload } from "@/server/services/assets";

/** Step 1 of a direct-to-storage upload: validates, records the asset, returns a signed PUT URL. */
export const POST = publicRoute(
  {
    body: z.object({
      purpose: z.enum(["asset", "version", "deliverable", "brand", "lead_reference"]).optional(),
      projectId: z.string().optional(),
      clientId: z.string().optional(),
      draftToken: z.string().max(80).optional(),
      folderKey: z.string().max(40).optional(),
      filename: z.string().min(1).max(255),
      size: z.number().int().min(1),
      mimeType: z.string().max(120),
      fileRequestId: z.string().optional(),
      label: z.string().max(80).optional(),
    }),
    status: 201,
  },
  async ({ actor, ip, body }) => requestUpload(actor, ip, body),
);
