import QRCode from "qrcode";
import type { User } from "@/generated/prisma/client";
import { db } from "../db";
import { env } from "../env";
import { AppError, badRequest } from "../errors";
import { decryptSecret, encryptSecret, hashPassword, randomToken, safeEqual, sha256, verifyPassword } from "../auth/crypto";
import { createSession, destroyAllSessions } from "../auth/session";
import { generateTotpSecret, otpauthUrl, verifyTotp } from "../auth/totp";
import { rateLimit, resetRateLimit } from "../security/ratelimit";
import { queueEmail, absoluteUrl } from "../email";
import { getSetting, getWorkspaceId } from "./settings";
import { audit, logActivity } from "./audit";
import { homeForRoles } from "@/lib/permissions";
import { slugify } from "@/lib/slug";
import type { Actor } from "../auth/actor";
import { createClientRecord } from "./clients";
import { safeRedirectPath } from "@/lib/safe-redirect";

const MIN_PASSWORD = 10;
export const DEMO_ACCOUNTS = {
  admin: { email: "admin@demo.faizaneditspro.test", label: "Admin Demo", role: "super_admin" },
  editor: { email: "editor@demo.faizaneditspro.test", label: "Editor Demo", role: "editor" },
  client: { email: "client@demo.faizaneditspro.test", label: "Client Demo", role: "client" },
} as const;
export const DEMO_PASSWORD = "demo-password-123";

export const normEmail = (e: string) => e.trim().toLowerCase();

export function assertPasswordStrength(pw: string) {
  if (pw.length < MIN_PASSWORD) throw badRequest(`Use at least ${MIN_PASSWORD} characters for your password.`, { password: `At least ${MIN_PASSWORD} characters.` });
  if (pw.length > 200) throw badRequest("That password is too long.", { password: "Too long." });
  if (/^(.)\1+$/.test(pw) || /^(password|12345678|qwertyuiop)/i.test(pw)) throw badRequest("That password is too easy to guess.", { password: "Too easy to guess." });
}

async function userWithRoles(id: string) {
  return db.user.findUniqueOrThrow({ where: { id }, include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } });
}

export async function landingPathFor(userId: string): Promise<string> {
  const u = await userWithRoles(userId);
  const perms = new Set<string>();
  if (u.isStaff) for (const ur of u.roles) for (const rp of ur.role.permissions) perms.add(rp.permission.key);
  return homeForRoles(u.roles.map((r) => r.role.key), perms);
}

/**
 * Connects a verified user to any existing (unlinked) Client records that share their email, so the
 * portal shows their projects, invoices, contracts, files and messages immediately.
 * ONLY call after the email address has been proven (magic link, invite, verify link, Google).
 */
export async function linkClientsForUser(user: Pick<User, "id" | "email" | "name">) {
  const clients = await db.client.findMany({ where: { email: user.email, userId: null } });
  for (const c of clients) {
    await db.$transaction([
      db.client.update({ where: { id: c.id }, data: { userId: user.id } }),
      db.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: c.organizationId, userId: user.id } },
        create: { organizationId: c.organizationId, userId: user.id, role: "OWNER", title: "Owner" },
        update: {},
      }),
    ]);
  }
  return clients.length;
}

async function clientRoleId() {
  const r = await db.role.findUniqueOrThrow({ where: { key: "client" } });
  return r.id;
}

/**
 * Anyone can register a password account for any email address before it has been verified. If the real owner later proves they
 * hold that address by another route (Google, a magic link), the account's password and sessions belong to whoever registered it,
 * not to them — so both are dropped. The owner can set a new password from the reset page.
 */
async function reclaimUnverified(user: { id: string; emailVerifiedAt: Date | null; passwordHash: string | null }) {
  if (user.emailVerifiedAt) return;
  if (user.passwordHash) await db.user.update({ where: { id: user.id }, data: { passwordHash: null } });
  await destroyAllSessions(user.id);
}

async function markVerified(userId: string) {
  await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date(), status: "ACTIVE", lastLoginAt: new Date() } });
}

// ───────────────────────────── registration ─────────────────────────────

export async function register(input: { name: string; email: string; password: string; company?: string; ip: string; ua?: string; referralCode?: string }) {
  rateLimit(`register:${input.ip}`, 6, 60 * 60_000);
  const email = normEmail(input.email);
  assertPasswordStrength(input.password);
  const ws = await getWorkspaceId();

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) throw new AppError("CONFLICT", "An account with this email already exists. Sign in, or request a magic link.", { fields: { email: "Already registered." } });

  const pendingClient = await db.client.findFirst({ where: { email, userId: null } });
  const passwordHash = await hashPassword(input.password);
  const user = await db.user.create({
    data: { workspaceId: ws, name: input.name.trim(), email, passwordHash, isStaff: false, status: "ACTIVE", roles: { create: { roleId: await clientRoleId() } } },
  });

  // A brand-new email gets its own company + client profile right away. An email that matches an
  // existing (admin-created) client is linked ONLY after they verify the address — never on trust.
  if (!pendingClient) {
    await createClientRecord({
      workspaceId: ws,
      name: user.name,
      email,
      companyName: input.company?.trim() || user.name,
      status: "PROSPECT",
      source: "portal_signup",
      userId: user.id,
      referralCode: input.referralCode,
    });
  }

  await sendVerifyEmail(user);
  await audit({ system: true, label: "Sign-up" }, { workspaceId: ws, action: "auth.register", entityType: "user", entityId: user.id, message: `${user.name} registered` });
  const s = await createSession(user.id, { ip: input.ip, ua: input.ua });
  return { user, session: s, needsVerification: !!pendingClient, redirect: "/dashboard" };
}

export async function sendVerifyEmail(user: Pick<User, "id" | "email" | "name" | "workspaceId">) {
  const token = randomToken(32);
  await db.authToken.create({ data: { userId: user.id, email: user.email, type: "EMAIL_VERIFY", tokenHash: sha256(token), expiresAt: new Date(Date.now() + 48 * 3600_000) } });
  await queueEmail({
    workspaceId: user.workspaceId,
    toEmail: user.email,
    toUserId: user.id,
    templateKey: "welcome",
    vars: { client_name: user.name, verify_url: absoluteUrl(`/auth/verify?type=verify&token=${token}`), dashboard_url: absoluteUrl("/dashboard") },
  });
}

async function consumeToken(token: string, type: "MAGIC_LINK" | "PASSWORD_RESET" | "INVITE" | "EMAIL_VERIFY") {
  const row = await db.authToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.type !== type || row.usedAt || row.expiresAt < new Date()) throw new AppError("BAD_REQUEST", "This link has expired or was already used. Request a new one.");
  const claimed = await db.authToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count !== 1) throw new AppError("BAD_REQUEST", "This link has expired or was already used. Request a new one.");
  return row;
}

export async function verifyEmail(token: string, meta: { ip?: string; ua?: string }) {
  const row = await consumeToken(token, "EMAIL_VERIFY");
  const user = await db.user.findUnique({ where: { id: row.userId! } });
  if (!user) throw new AppError("NOT_FOUND", "Account not found.");
  await markVerified(user.id);
  const linked = await linkClientsForUser(user);
  const s = await createSession(user.id, meta);
  return { session: s, linked, redirect: await landingPathFor(user.id) };
}

// ───────────────────────────── password login ─────────────────────────────

export async function login(input: { email: string; password: string; ip: string; ua?: string }) {
  const email = normEmail(input.email);
  rateLimit(`login:${input.ip}`, 30, 15 * 60_000);
  rateLimit(`login-user:${email}`, 8, 15 * 60_000, "Too many sign-in attempts for this account. Try again in a few minutes or use a magic link.");

  const user = await db.user.findUnique({ where: { email } });
  const ok = await verifyPassword(input.password, user?.passwordHash);
  if (!user || !ok || user.status === "SUSPENDED") throw new AppError("UNAUTHENTICATED", "Incorrect email or password.");
  resetRateLimit(`login-user:${email}`);

  if (user.twoFactorEnabled) {
    const s = await createSession(user.id, { ip: input.ip, ua: input.ua, twoFactorPending: true });
    return { requires2fa: true as const, session: s, userId: user.id };
  }
  const s = await createSession(user.id, { ip: input.ip, ua: input.ua });
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  if (user.emailVerifiedAt) await linkClientsForUser(user);
  await audit(null, { workspaceId: user.workspaceId, action: "auth.login", entityType: "user", entityId: user.id, message: `${user.name} signed in` });
  return { requires2fa: false as const, session: s, userId: user.id, redirect: await landingPathFor(user.id) };
}

export async function completeTwoFactor(sessionToken: string, code: string, ip: string) {
  rateLimit(`2fa:${ip}`, 12, 15 * 60_000);
  const session = await db.session.findUnique({ where: { tokenHash: sha256(sessionToken) }, include: { user: true } });
  if (!session || !session.twoFactorPending || session.expiresAt < new Date()) throw new AppError("UNAUTHENTICATED", "Your sign-in expired. Please start again.");
  const user = session.user;
  rateLimit(`2fa-user:${user.id}`, 8, 15 * 60_000);
  const secret = user.twoFactorSecret ? decryptSecret(user.twoFactorSecret) : "";
  let ok = !!secret && verifyTotp(secret, code);
  if (!ok) {
    const h = sha256(code.replace(/\s|-/g, "").toLowerCase());
    if (user.recoveryCodes.includes(h)) {
      ok = true;
      await db.user.update({ where: { id: user.id }, data: { recoveryCodes: user.recoveryCodes.filter((c) => c !== h) } });
    }
  }
  if (!ok) throw new AppError("UNAUTHENTICATED", "That code isn't right. Check your authenticator app and try again.");
  await db.session.update({ where: { id: session.id }, data: { twoFactorPending: false } });
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  if (user.emailVerifiedAt) await linkClientsForUser(user);
  await audit(null, { workspaceId: user.workspaceId, action: "auth.login_2fa", entityType: "user", entityId: user.id, message: `${user.name} signed in with 2FA` });
  return { redirect: await landingPathFor(user.id) };
}

// ───────────────────────────── magic link ─────────────────────────────

export async function requestMagicLink(input: { email: string; ip: string; next?: string }) {
  const email = normEmail(input.email);
  rateLimit(`magic:${input.ip}`, 10, 15 * 60_000);
  rateLimit(`magic-user:${email}`, 4, 15 * 60_000, "A link was just sent. Check your inbox (and spam) before requesting another.");
  const ws = await getWorkspaceId();

  let user = await db.user.findUnique({ where: { email } });
  if (!user) {
    // An admin-created client with no portal user yet can claim access by proving email ownership.
    const client = await db.client.findFirst({ where: { email, userId: null } });
    if (client) {
      user = await db.user.create({ data: { workspaceId: ws, name: client.name, email, isStaff: false, status: "INVITED", roles: { create: { roleId: await clientRoleId() } } } });
    }
  }
  if (!user || user.status === "SUSPENDED") return { sent: true }; // never reveal whether the account exists

  const token = randomToken(32);
  await db.authToken.create({ data: { userId: user.id, email, type: "MAGIC_LINK", tokenHash: sha256(token), meta: { next: input.next ?? null }, expiresAt: new Date(Date.now() + 15 * 60_000) } });
  await queueEmail({
    workspaceId: user.workspaceId,
    toEmail: email,
    toUserId: user.id,
    templateKey: "magic_link",
    vars: { client_name: user.name, magic_url: absoluteUrl(`/auth/verify?type=magic&token=${token}`) },
  });
  return { sent: true };
}

export async function verifyMagicLink(token: string, meta: { ip?: string; ua?: string }) {
  const row = await consumeToken(token, "MAGIC_LINK");
  const user = await db.user.findUnique({ where: { id: row.userId! } });
  if (!user || user.status === "SUSPENDED") throw new AppError("UNAUTHENTICATED", "Account unavailable.");
  await reclaimUnverified(user);
  await markVerified(user.id);
  await linkClientsForUser(user);
  // Magic link proves email ownership; 2FA users still complete their second factor.
  const s = await createSession(user.id, { ...meta, twoFactorPending: user.twoFactorEnabled });
  await audit(null, { workspaceId: user.workspaceId, action: "auth.magic_link", entityType: "user", entityId: user.id, message: `${user.name} signed in with a magic link` });
  const next = (row.meta as { next?: string | null } | null)?.next;
  return { session: s, requires2fa: user.twoFactorEnabled, redirect: safeRedirectPath(next, await landingPathFor(user.id)) };
}

// ───────────────────────────── password reset / invite ─────────────────────────────

export async function requestPasswordReset(input: { email: string; ip: string }) {
  const email = normEmail(input.email);
  rateLimit(`reset:${input.ip}`, 8, 60 * 60_000);
  rateLimit(`reset-user:${email}`, 3, 60 * 60_000);
  const user = await db.user.findUnique({ where: { email } });
  if (user && user.status !== "SUSPENDED") {
    const token = randomToken(32);
    await db.authToken.create({ data: { userId: user.id, email, type: "PASSWORD_RESET", tokenHash: sha256(token), expiresAt: new Date(Date.now() + 60 * 60_000) } });
    await queueEmail({ workspaceId: user.workspaceId, toEmail: email, toUserId: user.id, templateKey: "password_reset", vars: { client_name: user.name, reset_url: absoluteUrl(`/auth/verify?type=reset&token=${token}`) } });
  }
  return { sent: true };
}

export async function resetPassword(input: { token: string; password: string }) {
  assertPasswordStrength(input.password);
  const row = await consumeToken(input.token, "PASSWORD_RESET");
  const passwordHash = await hashPassword(input.password);
  const user = await db.user.update({ where: { id: row.userId! }, data: { passwordHash, emailVerifiedAt: new Date(), status: "ACTIVE" } });
  await destroyAllSessions(user.id);
  await linkClientsForUser(user);
  await audit(null, { workspaceId: user.workspaceId, action: "auth.password_reset", entityType: "user", entityId: user.id, message: `${user.name} reset their password` });
  return { ok: true };
}

/** Creates a portal (client) user for a Client record and emails an invite link to set a password. */
export async function inviteClientUser(actor: Actor, clientId: string) {
  const client = await db.client.findFirst({ where: { id: clientId, workspaceId: actor.workspaceId } });
  if (!client) throw new AppError("NOT_FOUND", "Client not found.");
  return inviteUserByEmail({ workspaceId: actor.workspaceId, email: client.email, name: client.name, kind: "client", clientId: client.id, invitedBy: actor });
}

export async function inviteUserByEmail(input: {
  workspaceId: string;
  email: string;
  name: string;
  kind: "client" | "staff";
  roleKeys?: string[];
  clientId?: string;
  invitedBy: Actor | { system: true; label?: string };
}) {
  const email = normEmail(input.email);
  let user = await db.user.findUnique({ where: { email } });
  if (!user) {
    const roleKeys = input.kind === "client" ? ["client"] : input.roleKeys ?? ["editor"];
    const roles = await db.role.findMany({ where: { key: { in: roleKeys } } });
    user = await db.user.create({
      data: { workspaceId: input.workspaceId, name: input.name, email, isStaff: input.kind === "staff", status: "INVITED", roles: { create: roles.map((r) => ({ roleId: r.id })) } },
    });
  }
  if (input.kind === "client" && input.clientId) {
    const client = await db.client.findUnique({ where: { id: input.clientId } });
    if (client && !client.userId) {
      await db.client.update({ where: { id: client.id }, data: { userId: user.id } });
      await db.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: client.organizationId, userId: user.id } },
        create: { organizationId: client.organizationId, userId: user.id, role: "OWNER", title: "Owner" },
        update: {},
      });
    }
  }
  const token = randomToken(32);
  await db.authToken.create({ data: { userId: user.id, email, type: "INVITE", tokenHash: sha256(token), expiresAt: new Date(Date.now() + 7 * 86400_000) } });
  const business = await getSetting(input.workspaceId, "business");
  await queueEmail({
    workspaceId: input.workspaceId,
    toEmail: email,
    toUserId: user.id,
    templateKey: "invite",
    vars: { client_name: user.name, business_name: business.name, invite_url: absoluteUrl(`/auth/verify?type=invite&token=${token}`) },
  });
  return { userId: user.id, email, inviteToken: env.demoMode ? token : undefined };
}

export async function acceptInvite(input: { token: string; password: string; name?: string }, meta: { ip?: string; ua?: string }) {
  assertPasswordStrength(input.password);
  const row = await consumeToken(input.token, "INVITE");
  const passwordHash = await hashPassword(input.password);
  const user = await db.user.update({
    where: { id: row.userId! },
    data: { passwordHash, status: "ACTIVE", emailVerifiedAt: new Date(), lastLoginAt: new Date(), ...(input.name ? { name: input.name } : {}) },
  });
  await linkClientsForUser(user);
  const s = await createSession(user.id, meta);
  await audit(null, { workspaceId: user.workspaceId, action: "auth.invite_accepted", entityType: "user", entityId: user.id, message: `${user.name} accepted their invite` });
  return { session: s, redirect: await landingPathFor(user.id) };
}

// ───────────────────────────── 2FA ─────────────────────────────

export async function beginTwoFactorSetup(actor: Actor) {
  const secret = generateTotpSecret();
  await db.user.update({ where: { id: actor.userId }, data: { twoFactorSecret: encryptSecret(secret), twoFactorEnabled: false } });
  const business = await getSetting(actor.workspaceId, "business");
  const url = otpauthUrl(secret, actor.email, business.name);
  return { secret, otpauthUrl: url, qrDataUrl: await QRCode.toDataURL(url, { margin: 1, width: 220 }) };
}

export async function enableTwoFactor(actor: Actor, code: string) {
  const u = await db.user.findUniqueOrThrow({ where: { id: actor.userId } });
  if (!u.twoFactorSecret) throw badRequest("Start setup first.");
  if (!verifyTotp(decryptSecret(u.twoFactorSecret), code)) throw new AppError("BAD_REQUEST", "That code isn't right. Try the current code from your app.", { fields: { code: "Incorrect code." } });
  const recovery = Array.from({ length: 8 }, () => randomToken(6).toLowerCase().replace(/[^a-z0-9]/g, "x").slice(0, 10));
  await db.user.update({ where: { id: u.id }, data: { twoFactorEnabled: true, recoveryCodes: recovery.map((c) => sha256(c)) } });
  await audit(actor, { workspaceId: actor.workspaceId, action: "auth.2fa_enabled", entityType: "user", entityId: u.id, message: `${actor.name} enabled two-factor authentication` });
  return { recoveryCodes: recovery };
}

export async function disableTwoFactor(actor: Actor, input: { password: string; code: string }) {
  const u = await db.user.findUniqueOrThrow({ where: { id: actor.userId } });
  if (!(await verifyPassword(input.password, u.passwordHash))) throw new AppError("BAD_REQUEST", "Incorrect password.", { fields: { password: "Incorrect password." } });
  if (u.twoFactorSecret && !verifyTotp(decryptSecret(u.twoFactorSecret), input.code)) throw new AppError("BAD_REQUEST", "Incorrect code.", { fields: { code: "Incorrect code." } });
  await db.user.update({ where: { id: u.id }, data: { twoFactorEnabled: false, twoFactorSecret: null, recoveryCodes: [] } });
  await audit(actor, { workspaceId: actor.workspaceId, action: "auth.2fa_disabled", entityType: "user", entityId: u.id, message: `${actor.name} disabled two-factor authentication` });
  return { ok: true };
}

// ───────────────────────────── Google OAuth ─────────────────────────────

export const googleConfigured = () => !!(env.google.clientId && env.google.clientSecret);

export function googleAuthUrl(state: string) {
  const p = new URLSearchParams({
    client_id: env.google.clientId,
    redirect_uri: `${env.appUrl}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function handleGoogleCallback(code: string, meta: { ip?: string; ua?: string }) {
  if (!googleConfigured()) throw new AppError("NOT_CONFIGURED", "Google sign-in isn't configured.");
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: env.google.clientId, client_secret: env.google.clientSecret, redirect_uri: `${env.appUrl}/api/auth/google/callback`, grant_type: "authorization_code" }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {
    throw new AppError("UNAUTHENTICATED", "Google sign-in failed. Please try again.");
  });
  const tok: any = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tok.access_token) throw new AppError("UNAUTHENTICATED", "Google sign-in failed. Please try again.");
  const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${tok.access_token}` }, signal: AbortSignal.timeout(10_000) }).catch(() => {
    throw new AppError("UNAUTHENTICATED", "Google sign-in failed. Please try again.");
  });
  const info: any = await infoRes.json().catch(() => ({}));
  // Linking by email is only safe when Google vouches for the address; a missing flag is not a yes.
  if (!info.sub || !info.email || info.email_verified !== true) throw new AppError("UNAUTHENTICATED", "Your Google account email isn't verified.");
  const email = normEmail(info.email);
  const ws = await getWorkspaceId();

  const linked = await db.oAuthAccount.findUnique({ where: { provider_providerAccountId: { provider: "google", providerAccountId: info.sub } } });
  let user = linked ? await db.user.findUnique({ where: { id: linked.userId } }) : await db.user.findUnique({ where: { email } });
  if (!user) {
    user = await db.user.create({
      data: { workspaceId: ws, name: info.name || email.split("@")[0], email, avatarUrl: info.picture, isStaff: false, status: "ACTIVE", emailVerifiedAt: new Date(), roles: { create: { roleId: await clientRoleId() } } },
    });
    const pending = await db.client.findFirst({ where: { email, userId: null } });
    if (!pending) await createClientRecord({ workspaceId: ws, name: user.name, email, companyName: user.name, status: "PROSPECT", source: "google_signup", userId: user.id });
  }
  if (user.status === "SUSPENDED") throw new AppError("UNAUTHENTICATED", "Account unavailable.");
  await reclaimUnverified(user);
  if (!linked) await db.oAuthAccount.create({ data: { userId: user.id, provider: "google", providerAccountId: info.sub } });
  await markVerified(user.id);
  await linkClientsForUser(user);
  const s = await createSession(user.id, { ...meta, twoFactorPending: user.twoFactorEnabled });
  await audit(null, { workspaceId: user.workspaceId, action: "auth.google", entityType: "user", entityId: user.id, message: `${user.name} signed in with Google` });
  return { session: s, requires2fa: user.twoFactorEnabled, redirect: await landingPathFor(user.id) };
}

// ───────────────────────────── demo accounts ─────────────────────────────

export async function demoLogin(kind: keyof typeof DEMO_ACCOUNTS, meta: { ip?: string; ua?: string }) {
  if (!env.demoMode) throw new AppError("FORBIDDEN", "Demo accounts are disabled.");
  const acct = DEMO_ACCOUNTS[kind];
  if (!acct) throw badRequest("Unknown demo account.");
  const user = await db.user.findUnique({ where: { email: acct.email } });
  if (!user) throw new AppError("NOT_FOUND", "Demo data isn't installed. Run `npm run db:seed:demo`.");
  const s = await createSession(user.id, meta);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { session: s, redirect: await landingPathFor(user.id) };
}

// ───────────────────────────── account self-service ─────────────────────────────

export async function updateProfile(actor: Actor, input: { name?: string; phone?: string | null; timezone?: string | null; avatarUrl?: string | null }) {
  const u = await db.user.update({ where: { id: actor.userId }, data: input, select: { id: true, name: true, phone: true, timezone: true, avatarUrl: true } });
  return u;
}

export async function changePassword(actor: Actor, input: { current: string; next: string }) {
  const u = await db.user.findUniqueOrThrow({ where: { id: actor.userId } });
  if (u.passwordHash && !(await verifyPassword(input.current, u.passwordHash))) throw new AppError("BAD_REQUEST", "Your current password is incorrect.", { fields: { current: "Incorrect password." } });
  assertPasswordStrength(input.next);
  await db.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(input.next) } });
  await destroyAllSessions(u.id, actor.sessionHash);
  await audit(actor, { workspaceId: actor.workspaceId, action: "auth.password_changed", entityType: "user", entityId: u.id, message: `${actor.name} changed their password` });
  return { ok: true };
}

export async function listSessions(actor: Actor) {
  const rows = await db.session.findMany({ where: { userId: actor.userId, twoFactorPending: false, expiresAt: { gt: new Date() } }, orderBy: { lastUsedAt: "desc" } });
  return rows.map((s) => ({ id: s.id, ip: s.ip, userAgent: s.userAgent, lastUsedAt: s.lastUsedAt, createdAt: s.createdAt, current: s.id === actor.sessionId }));
}

export async function revokeSession(actor: Actor, id: string) {
  await db.session.deleteMany({ where: { id, userId: actor.userId } });
  return { ok: true };
}

export const constantTimeEq = safeEqual;
export { slugify, logActivity };
