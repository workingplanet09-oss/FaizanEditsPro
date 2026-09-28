import { cookies } from "next/headers";
import { db } from "../db";
import { env } from "../env";
import { hmac, randomToken, sha256 } from "./crypto";

export const SESSION_COOKIE = "fe_session";
export const CSRF_COOKIE = "fe_csrf";
const TTL_MS = 30 * 24 * 3600 * 1000;

const cookieBase = () => ({
  path: "/",
  sameSite: "lax" as const,
  secure: env.isProd || env.appUrl.startsWith("https://"),
});

/** CSRF token bound to this session — the browser echoes it back in `x-csrf-token` on every mutation. */
export const csrfFor = (tokenHash: string) => hmac(tokenHash, "csrf");

export async function createSession(userId: string, meta: { ip?: string; ua?: string; twoFactorPending?: boolean } = {}) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + TTL_MS);
  await db.session.create({
    data: { userId, tokenHash: sha256(token), ip: meta.ip, userAgent: meta.ua, expiresAt, twoFactorPending: !!meta.twoFactorPending },
  });
  return { token, expiresAt };
}

export async function setSessionCookies(token: string, expiresAt: Date) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { ...cookieBase(), httpOnly: true, expires: expiresAt });
  jar.set(CSRF_COOKIE, csrfFor(sha256(token)), { ...cookieBase(), httpOnly: false, expires: expiresAt });
}

export async function clearSessionCookies() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(CSRF_COOKIE);
}

export async function readSessionToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}

export async function destroySessionByToken(token: string) {
  await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
}

export async function destroyAllSessions(userId: string, exceptHash?: string) {
  await db.session.deleteMany({ where: { userId, ...(exceptHash ? { tokenHash: { not: exceptHash } } : {}) } });
}
