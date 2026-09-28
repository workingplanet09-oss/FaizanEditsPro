import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

function origin(url?: string) {
  try {
    return url ? new URL(url).origin : "";
  } catch {
    return "";
  }
}

// Object storage (S3/R2/…) is uploaded to and streamed from directly by the browser, so its origin must be allowed.
const storageOrigins = process.env.STORAGE_PROVIDER === "s3" ? [origin(process.env.STORAGE_ENDPOINT), "https://*.amazonaws.com", "https://*.r2.cloudflarestorage.com"].filter(Boolean) : [];
const turnstile = process.env.TURNSTILE_SECRET_KEY ? ["https://challenges.cloudflare.com"] : [];

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"} ${turnstile.join(" ")}`.trim(),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  `media-src 'self' blob: https: ${storageOrigins.join(" ")}`.trim(),
  `connect-src 'self' ${storageOrigins.join(" ")} ${isProd ? "" : "ws: wss:"} ${turnstile.join(" ")}`.trim(),
  "font-src 'self' data:",
  `frame-src https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com ${turnstile.join(" ")}`.trim(),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

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
          { key: "Content-Security-Policy", value: csp },
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
