/**
 * Content-Security-Policy, built per request from the runtime environment.
 *
 * It must NOT live in next.config.ts: those headers are computed once at `next build`, so an image built without the storage
 * settings (the normal Docker flow) would ship a policy that blocks the browser's direct uploads to the bucket.
 */
type Env = Record<string, string | undefined>;

const originOf = (url?: string) => {
  try {
    return url ? new URL(url).origin : "";
  } catch {
    return "";
  }
};

/** Exactly the origins the browser talks to for object storage — the bucket, not every bucket on the provider. */
export function storageOrigins(e: Env): string[] {
  if (e.STORAGE_PROVIDER !== "s3") return [];
  const bucket = e.STORAGE_BUCKET ?? "";
  const endpoint = originOf(e.STORAGE_ENDPOINT);
  const pathStyle = e.STORAGE_FORCE_PATH_STYLE === "true" || e.STORAGE_FORCE_PATH_STYLE === "1";
  if (endpoint) {
    const u = new URL(endpoint);
    // virtual-hosted style puts the bucket in the host name: https://<bucket>.<endpoint host>
    return pathStyle || !bucket ? [endpoint] : [endpoint, `${u.protocol}//${bucket}.${u.host}`];
  }
  const region = e.STORAGE_REGION && e.STORAGE_REGION !== "auto" ? e.STORAGE_REGION : "";
  if (region && bucket) return [`https://${bucket}.s3.${region}.amazonaws.com`, `https://s3.${region}.amazonaws.com`];
  return ["https://*.amazonaws.com"]; // AWS without a region configured: the least-wide pattern that still works
}

export function contentSecurityPolicy(e: Env = process.env): string {
  const isProd = e.NODE_ENV === "production";
  const storage = storageOrigins(e).join(" ");
  const turnstile = e.TURNSTILE_SECRET_KEY && (e.TURNSTILE_SITE_KEY || e.NEXT_PUBLIC_TURNSTILE_SITE_KEY) ? "https://challenges.cloudflare.com" : "";
  const join = (...parts: string[]) => parts.filter(Boolean).join(" ");
  return [
    "default-src 'self'",
    join("script-src 'self' 'unsafe-inline'", isProd ? "" : "'unsafe-eval'", turnstile),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    join("media-src 'self' blob: https:", storage),
    join("connect-src 'self'", storage, isProd ? "" : "ws: wss:", turnstile),
    "font-src 'self' data:",
    join("frame-src https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com", turnstile),
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}
