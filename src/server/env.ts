/**
 * Central, typed access to environment variables. Secrets are only ever read here (server side).
 * Nothing in this file may be imported from a client component.
 */
const e = process.env;
const isProd = e.NODE_ENV === "production";

function required(name: string, devFallback: string): string {
  const v = e[name];
  if (v && v.length > 0) return v;
  if (isProd) throw new Error(`Missing required environment variable ${name}`);
  return devFallback;
}

const bool = (v: string | undefined, d = false) => (v === undefined || v === "" ? d : v === "true" || v === "1");

export const env = {
  isProd,
  databaseUrl: required("DATABASE_URL", "postgresql://faizan:faizan_dev@127.0.0.1:5432/faizaneditspro"),
  authSecret: required("AUTH_SECRET", "dev-only-insecure-secret-do-not-use-in-production-0000"),
  appUrl: (e.APP_URL || "http://localhost:3000").replace(/\/$/, ""),
  demoMode: bool(e.DEMO_MODE, !isProd),
  cronSecret: e.CRON_SECRET || "",
  jobsInline: bool(e.JOBS_INLINE, true),

  storage: {
    provider: (e.STORAGE_PROVIDER || "local") as "local" | "s3",
    localDir: e.STORAGE_LOCAL_DIR || ".storage",
    bucket: e.STORAGE_BUCKET || "",
    region: e.STORAGE_REGION || "auto",
    endpoint: e.STORAGE_ENDPOINT || "",
    accessKey: e.STORAGE_ACCESS_KEY || "",
    secretKey: e.STORAGE_SECRET_KEY || "",
    forcePathStyle: bool(e.STORAGE_FORCE_PATH_STYLE, false),
    maxUploadBytes: Math.floor(Number(e.STORAGE_MAX_UPLOAD_GB || "20") * 1024 ** 3),
  },
  payments: {
    provider: (e.PAYMENT_PROVIDER || "demo") as "demo" | "stripe",
    secretKey: e.PAYMENT_SECRET_KEY || "",
    webhookSecret: e.PAYMENT_WEBHOOK_SECRET || "",
  },
  email: {
    provider: (e.EMAIL_PROVIDER || "console") as "console" | "resend" | "postmark" | "sendgrid",
    apiKey: e.EMAIL_API_KEY || "",
    from: e.EMAIL_FROM || "Studio <hello@example.com>",
  },
  google: { clientId: e.GOOGLE_CLIENT_ID || "", clientSecret: e.GOOGLE_CLIENT_SECRET || "" },
  turnstileSecret: e.TURNSTILE_SECRET_KEY || "",
  scan: { provider: (e.SCAN_PROVIDER || "none") as "none" | "clamav-http", url: e.CLAMAV_URL || "" },
  calendar: { provider: e.CALENDAR_PROVIDER || "internal", meetingUrlTemplate: e.MEETING_URL_TEMPLATE || "" },
} as const;

/** Which optional integrations are wired up — surfaced in Admin → Settings → Integrations (never the secrets). */
export function integrationStatus() {
  return {
    storage: { provider: env.storage.provider, configured: env.storage.provider === "local" || !!(env.storage.bucket && env.storage.accessKey && env.storage.secretKey) },
    payments: { provider: env.payments.provider, configured: env.payments.provider === "demo" || !!env.payments.secretKey },
    email: { provider: env.email.provider, configured: env.email.provider === "console" || !!env.email.apiKey },
    google: { configured: !!(env.google.clientId && env.google.clientSecret) },
    turnstile: { configured: !!env.turnstileSecret },
    scan: { provider: env.scan.provider, configured: env.scan.provider === "none" || !!env.scan.url },
    calendar: { provider: env.calendar.provider, configured: true },
    demoMode: env.demoMode,
  };
}
