import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/manrope";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { OfflineBanner } from "@/components/shell/offline-banner";
import { getSiteContext } from "@/server/services/public";
import { accentForText, contrastOn } from "@/lib/color";
import { SETTING_DEFAULTS } from "@/lib/site-defaults";
import { env } from "@/server/env";

/** Everything here is driven by database content and per-request settings, so nothing is prerendered at build time (builds need no database). */
export const dynamic = "force-dynamic";

async function safeSite() {
  try {
    return await getSiteContext();
  } catch {
    return null; // DB unreachable or not seeded yet — render with defaults instead of crashing the whole app
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const site = await safeSite();
  const name = site?.business.name ?? SETTING_DEFAULTS.business.name;
  return {
    metadataBase: new URL(env.appUrl),
    title: { default: name, template: (site?.seo.titleTemplate ?? "%s | " + name).replace("%s", "%s") },
    description: site?.seo.defaultDescription ?? SETTING_DEFAULTS.seo.defaultDescription,
    applicationName: name,
    icons: site?.business.faviconUrl ? { icon: site.business.faviconUrl } : { icon: "/favicon.svg" },
    openGraph: { type: "website", siteName: name, images: site?.seo.ogImage ? [site.seo.ogImage] : undefined },
    twitter: { card: "summary_large_image" },
  };
}

export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#09090b" }, { media: "(prefers-color-scheme: light)", color: "#f6f5f1" }], width: "device-width", initialScale: 1 };

// Runs before paint so there is no light/dark flash. Preference persists in localStorage (falls back to system).
// Also records the browser's time zone in a cookie so server-rendered greetings can use the visitor's local hour.
const themeScript = `(function(){try{var t=localStorage.getItem('fe-theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}try{document.cookie='fe_tz='+encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)+';path=/;max-age=31536000;samesite=lax';}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const site = await safeSite();
  const accent = /^#[0-9a-f]{6}$/i.test(site?.theme.accent ?? "") ? site!.theme.accent : SETTING_DEFAULTS.theme.accent;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <style
          dangerouslySetInnerHTML={{
            // darkest light surface is --surface-2 (#efeee8); darkest-contrast dark surface is --surface-2 (#18181c)
            __html: `:root{--accent:${accent};--accent-fg:${contrastOn(accent)};--accent-text:${accentForText(accent, "#efeee8", "black")}}.dark,.dark-zone{--accent-text:${accentForText(accent, "#18181c", "white")}}`,
          }}
        />
      </head>
      <body className="min-h-dvh antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded-lg focus:bg-fg focus:px-4 focus:py-2 focus:text-bg">
          Skip to content
        </a>
        <ToastProvider>{children}</ToastProvider>
        <OfflineBanner />
      </body>
    </html>
  );
}
