import { authRoute, z } from "@/server/api";
import { listAssets, listFolders } from "@/server/services/assets";

export const GET = authRoute(
  { query: z.object({ folder: z.string().optional(), q: z.string().optional(), page: z.coerce.number().optional(), pageSize: z.coerce.number().optional(), folders: z.string().optional(), deliverables: z.string().optional() }) },
  async ({ actor, params, query }) => {
    const [assets, folders] = await Promise.all([listAssets(actor, params.id, { folderKey: query.folder, q: query.q, page: query.page, pageSize: query.pageSize, deliverablesOnly: query.deliverables === "1" }), query.folders === "0" ? [] : listFolders(actor, params.id)]);
    return { ...assets, folders };
  },
);
