import { ImageResponse } from "next/og";
import { getSiteContext } from "@/server/services/public";
import { SETTING_DEFAULTS } from "@/lib/site-defaults";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

/** Home-screen icon: the brand initial with the accent dot, matching the site logo. */
export default async function AppleIcon() {
  const site = await getSiteContext().catch(() => null);
  const name = site?.business.name ?? SETTING_DEFAULTS.business.name;
  const accent = /^#[0-9a-f]{6}$/i.test(site?.theme.accent ?? "") ? site!.theme.accent : SETTING_DEFAULTS.theme.accent;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#09090b" }}>
        <div style={{ position: "relative", width: 120, height: 120, borderRadius: 34, background: "#f4f3ef", color: "#09090b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 72, fontWeight: 800 }}>
          {name.trim().charAt(0).toUpperCase() || "F"}
          <div style={{ position: "absolute", right: 22, bottom: 22, width: 20, height: 20, borderRadius: 10, background: accent }} />
        </div>
      </div>
    ),
    size,
  );
}
