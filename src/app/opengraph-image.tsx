import { ImageResponse } from "next/og";
import { getSiteContext } from "@/server/services/public";
import { SETTING_DEFAULTS } from "@/lib/site-defaults";
import { contrastOn } from "@/lib/color";
import { env } from "@/server/env";

export const alt = "Video editing studio";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

/** Default social-share card, generated from the brand name, tagline and accent colour set in Admin → Settings. */
export default async function OpengraphImage() {
  const site = await getSiteContext().catch(() => null);
  // An image uploaded in Admin → Settings → SEO wins over the generated card.
  if (site?.seo.ogImage) return Response.redirect(new URL(site.seo.ogImage, env.appUrl).toString(), 307);
  const name = site?.business.name ?? SETTING_DEFAULTS.business.name;
  const tagline = site?.business.tagline ?? SETTING_DEFAULTS.business.tagline;
  const accent = /^#[0-9a-f]{6}$/i.test(site?.theme.accent ?? "") ? site!.theme.accent : SETTING_DEFAULTS.theme.accent;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#09090b", color: "#f4f3ef" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: "#f4f3ef", color: "#09090b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, fontWeight: 800 }}>{name.trim().charAt(0).toUpperCase() || "F"}</div>
          <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: -1 }}>{name}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.02, letterSpacing: -3, maxWidth: 980 }}>{tagline}</div>
          <div style={{ marginTop: 36, width: 140, height: 10, borderRadius: 5, background: accent }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 26, color: "#a1a1aa" }}>
          <div style={{ padding: "10px 22px", borderRadius: 999, background: accent, color: contrastOn(accent), fontWeight: 700 }}>Start a project</div>
          <div>Fixed-scope quotes · Timestamped review · Clear turnaround</div>
        </div>
      </div>
    ),
    size,
  );
}
