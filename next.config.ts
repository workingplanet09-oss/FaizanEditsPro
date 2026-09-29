import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// The Content-Security-Policy is NOT set here: next.config.ts headers are frozen at build time, but the policy depends on the storage
// settings of the deployment. It is built per request in src/proxy.ts (see src/server/security/csp.ts).

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  experimental: { authInterrupts: true },
  serverExternalPackages: ["pg", "qrcode", "sanitize-html"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
        ],
      },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
