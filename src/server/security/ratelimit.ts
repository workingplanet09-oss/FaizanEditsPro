import { AppError } from "../errors";

/**
 * Fixed-window in-memory limiter. Good for a single node; the interface is deliberately tiny so a
 * Redis-backed implementation can replace `hit()` for multi-node deployments.
 */
interface Bucket {
  count: number;
  resetAt: number;
}
const g = globalThis as unknown as { __rl?: Map<string, Bucket> };
const buckets = (g.__rl ??= new Map<string, Bucket>());

let lastSweep = 0;
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}

export function hit(key: string, limit: number, windowMs: number): { ok: boolean; remaining: number; retryAfterSec: number } {
  const now = Date.now();
  sweep(now);
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count++;
  return { ok: b.count <= limit, remaining: Math.max(0, limit - b.count), retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
}

export function rateLimit(key: string, limit: number, windowMs: number, message = "Too many attempts. Please wait a moment and try again.") {
  // Test switch for local runs only — ignored in production so a stray variable can never turn protection off.
  if (process.env.NODE_ENV !== "production" && process.env.DISABLE_RATE_LIMIT === "true") return;
  const r = hit(key, limit, windowMs);
  if (!r.ok) throw new AppError("RATE_LIMITED", message, { retryAfterSec: r.retryAfterSec });
}

export function resetRateLimit(key: string) {
  buckets.delete(key);
}
