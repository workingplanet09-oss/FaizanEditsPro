import type { MetadataRoute } from "next";
import { getSiteContext } from "@/server/services/public";
import { SETTING_DEFAULTS } from "@/lib/site-defaults";

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const site = await getSiteContext().catch(() => null);
  const name = site?.business.name ?? SETTING_DEFAULTS.business.name;
  const accent = /^#[0-9a-f]{6}$/i.test(site?.theme.accent ?? "") ? site!.theme.accent : SETTING_DEFAULTS.theme.accent;
  return {
    name,
    short_name: name.length > 14 ? name.split(/\s+/)[0] : name,
    description: site?.business.tagline ?? SETTING_DEFAULTS.business.tagline,
    start_url: "/",
    display: "standalone",
    background_color: "#09090b",
    theme_color: accent,
    icons: [
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
