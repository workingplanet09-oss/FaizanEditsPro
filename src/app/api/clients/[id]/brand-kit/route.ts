import { authRoute, z } from "@/server/api";
import { getBrandKit, saveBrandKit } from "@/server/services/clients";
import { getStorage } from "@/server/storage";
import { db } from "@/server/db";

const hex = z.string().regex(/^#?[0-9a-fA-F]{3,8}$/);

export const GET = authRoute({}, async ({ actor, params }) => {
  const kit = await getBrandKit(actor, params.id);
  const ids = [kit.logoAssetId, kit.guidelinesAssetId, kit.introAssetId, kit.outroAssetId, kit.watermarkAssetId, ...kit.altLogoAssetIds, ...kit.lowerThirdAssetIds].filter((x): x is string => !!x);
  const assets = ids.length ? await db.asset.findMany({ where: { id: { in: ids }, clientId: params.id, deletedAt: null }, select: { id: true, displayName: true, mimeType: true, storageKey: true } }) : [];
  const withUrls = await Promise.all(assets.map(async (a) => ({ id: a.id, name: a.displayName, mimeType: a.mimeType, url: await getStorage().downloadUrl(a.storageKey, { inline: a.mimeType.startsWith("image/") && a.mimeType !== "image/svg+xml", filename: a.displayName, contentType: a.mimeType }) })));
  return { kit, assets: withUrls };
});

export const PUT = authRoute(
  {
    body: z.object({
      logoAssetId: z.string().nullish(),
      altLogoAssetIds: z.array(z.string()).max(10).optional(),
      colors: z.array(z.object({ name: z.string().max(40), hex })).max(12).optional(),
      fonts: z.array(z.object({ name: z.string().max(60), usage: z.string().max(60).optional() })).max(8).optional(),
      typographyRules: z.string().max(2000).nullish(),
      guidelinesAssetId: z.string().nullish(),
      introAssetId: z.string().nullish(),
      outroAssetId: z.string().nullish(),
      watermarkAssetId: z.string().nullish(),
      lowerThirdAssetIds: z.array(z.string()).max(10).optional(),
      musicPreference: z.string().max(500).nullish(),
      socialHandles: z.record(z.string(), z.string().max(120)).optional(),
      websiteUrl: z.string().max(300).nullish(),
    }),
  },
  async ({ actor, params, body }) => saveBrandKit(actor, params.id, body as any),
);
