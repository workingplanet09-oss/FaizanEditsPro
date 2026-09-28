import { requirePageActor } from "@/server/auth/actor";
import { getBrandKit, listBrandAssets, primaryClientFor } from "@/server/services/clients";
import { PageHeader, Card, EmptyState } from "@/components/ui/primitives";
import { BrandKitEditor } from "@/components/portal/brand-kit-editor";
import { orgRoleCan } from "@/lib/permissions";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Brand kit", path: "/dashboard/brand-kit", noindex: true });

export default async function BrandKitPage() {
  const actor = await requirePageActor("client", "/dashboard/brand-kit");
  const client = await primaryClientFor(actor);
  if (!client) return <Card><EmptyState icon="palette" title="No company linked yet" description="Once your account is linked to a company you can save its brand kit here." /></Card>;
  const [kit, assets] = await Promise.all([getBrandKit(actor, client.id), listBrandAssets(actor, client.id)]);
  const canEdit = actor.orgs.some((o) => o.organizationId === client.organizationId && orgRoleCan(o.role, "manage_projects"));
  return (
    <>
      <PageHeader title="Brand kit" description="Save your logo, colours, fonts and style once. Editors see it on every project, so you never send it twice." />
      <BrandKitEditor
        clientId={client.id}
        canEdit={canEdit}
        assets={assets}
        kit={{
          colors: (kit.colors as any[]) ?? [],
          fonts: (kit.fonts as any[]) ?? [],
          typographyRules: kit.typographyRules ?? "",
          musicPreference: kit.musicPreference ?? "",
          websiteUrl: kit.websiteUrl ?? "",
          socialHandles: (kit.socialHandles as Record<string, string>) ?? {},
          logoAssetId: kit.logoAssetId,
          guidelinesAssetId: kit.guidelinesAssetId,
          introAssetId: kit.introAssetId,
          outroAssetId: kit.outroAssetId,
          watermarkAssetId: kit.watermarkAssetId,
          altLogoAssetIds: kit.altLogoAssetIds,
          lowerThirdAssetIds: kit.lowerThirdAssetIds,
        }}
      />
    </>
  );
}
