import { AppError } from "../errors";
import { env } from "../env";

export interface SpamFields {
  /** honeypot — real users never see or fill this */
  hp?: string;
  /** ms epoch when the form was first rendered */
  t?: number;
  turnstile?: string;
}

/**
 * Layered anti-spam for public forms: honeypot + minimum fill time + optional Cloudflare Turnstile.
 * Rate limiting is applied separately per IP by the route.
 */
export async function assertNotSpam(f: SpamFields, ip: string, opts: { minMs?: number } = {}) {
  if (f.hp && f.hp.trim().length > 0) throw new AppError("BAD_REQUEST", "Submission rejected.");
  const minMs = opts.minMs ?? 1500;
  if (typeof f.t === "number" && Date.now() - f.t < minMs) {
    throw new AppError("BAD_REQUEST", "That was a little too fast — please try again.");
  }
  if (env.turnstileSecret && env.turnstileSiteKey) {
    if (!f.turnstile) throw new AppError("BAD_REQUEST", "Please complete the spam check.");
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: env.turnstileSecret, response: f.turnstile, remoteip: ip }),
      signal: AbortSignal.timeout(8_000),
    }).catch(() => null); // unreachable or slow → treated as a failed check (fail closed)
    const json = res ? ((await res.json().catch(() => null)) as { success?: boolean } | null) : null;
    if (!json?.success) throw new AppError("BAD_REQUEST", "Spam check failed. Please retry.");
  }
}
