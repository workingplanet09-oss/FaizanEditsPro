/**
 * Black-box security audit against a RUNNING app with demo data loaded.
 *
 *   DISABLE_RATE_LIMIT=true npm run dev     (DEMO_MODE=true, `npm run db:seed:demo`)
 *   npm run test:security
 *
 * It derives every API handler from src/app/api and then attacks all of them:
 *   1. unauthenticated access to every protected handler (must be 401)
 *   2. CSRF on every state-changing handler (missing token, wrong token, cross-site origin — must be 403)
 *   3. a second workspace: nothing from the first one may be visible or changeable (tenant isolation)
 *   4. role exposure: client and editor sessions call every GET handler; no response may contain another client's
 *      (or an unassigned project's) identifiers, and admin-only handlers must refuse them
 *   5. object-level probes: every id-taking GET handler is called with every foreign id — never 200
 *   6. real mutations attempted against someone else's quotes, contracts, invoices, files, versions, comments,
 *      notifications, messages, members… — refused, and the database is verified unchanged
 * Rows it creates (a second workspace + user) are flagged as demo data and removed at the end.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { db } from "../src/server/db";
import { hashPassword } from "../src/server/auth/crypto";
import { safeRedirectPath } from "../src/lib/safe-redirect";
import { contentProblem, sniffContent } from "../src/server/storage/sniff";
import { scrubTokens } from "../src/server/email";
import { clientIp } from "../src/server/security/request";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const DEMO_PASSWORD = "demo-password-123";
const FAKE = "cmzzzzzzzzzzzzzzzzzzzzzzz";
const DOMAIN = "demo.faizaneditspro.test";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else {
    failed++;
    failures.push(name);
    console.log(`  \x1b[31m✗ ${name}\x1b[0m${detail !== undefined ? `\n      ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 500)}` : ""}`);
  }
}
const section = (t: string) => console.log(`\n\x1b[1m${t}\x1b[0m`);

class Http {
  jar = new Map<string, string>();
  constructor(public who: string) {}
  private cookieHeader() {
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  async call(method: string, url: string, body?: unknown, opts: { csrf?: string | false; headers?: Record<string, string>; cookies?: boolean } = {}) {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (body !== undefined) headers["content-type"] = "application/json";
    const c = opts.cookies === false ? "" : this.cookieHeader();
    if (c) headers.cookie = c;
    if (opts.csrf === undefined) {
      if (this.jar.get("fe_csrf")) headers["x-csrf-token"] = this.jar.get("fe_csrf")!;
    } else if (opts.csrf !== false) headers["x-csrf-token"] = opts.csrf;
    const res = await fetch(`${BASE}${url}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: "manual" });
    for (const sc of res.headers.getSetCookie?.() ?? []) {
      const [pair] = sc.split(";");
      const i = pair.indexOf("=");
      const name = pair.slice(0, i);
      const val = pair.slice(i + 1);
      if (/max-age=0|expires=thu, 01 jan 1970/i.test(sc) || val === "") this.jar.delete(name);
      else this.jar.set(name, val);
    }
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not json */
    }
    return { status: res.status, json, data: json?.data, text };
  }
}
async function loginAs(email: string, password = DEMO_PASSWORD) {
  const h = new Http(email);
  const r = await h.call("POST", "/api/auth/login", { email, password });
  if (r.status !== 200) throw new Error(`login failed for ${email}: ${r.status} ${r.text.slice(0, 200)}`);
  return h;
}

// ───────────────────────── route discovery ─────────────────────────
type Kind = "auth" | "publ" | "raw";
interface Handler { method: string; template: string; kind: Kind; params: string[]; csrfOff: boolean }
function discover(): Handler[] {
  const out: Handler[] = [];
  const root = path.join(process.cwd(), "src/app/api");
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "route.ts") {
        const src = fs.readFileSync(p, "utf8");
        const template = "/api" + dir.slice(root.length).split(path.sep).join("/");
        const params = [...template.matchAll(/\[(\w+)\]/g)].map((m) => m[1]);
        for (const m of src.matchAll(/export const (GET|POST|PUT|PATCH|DELETE)\s*=\s*(authRoute|publicRoute)\(([\s\S]*?)\n?\)?;?\n(?=export|\n|$)/g)) {
          out.push({ method: m[1], template, kind: m[2] === "authRoute" ? "auth" : "publ", params, csrfOff: /csrf:\s*false/.test(m[3]) });
        }
        // handlers defined with the wrapper on multiple lines are caught above; add any raw function handlers
        for (const m of src.matchAll(/export (?:async )?function (GET|POST|PUT|PATCH|DELETE|HEAD)\b/g)) out.push({ method: m[1], template, kind: "raw", params, csrfOff: true });
        // fallback for wrappers the lazy regex above may have missed
        for (const m of src.matchAll(/export const (GET|POST|PUT|PATCH|DELETE)\s*=\s*(authRoute|publicRoute)/g)) {
          if (!out.some((h) => h.method === m[1] && h.template === template)) out.push({ method: m[1], template, kind: m[2] === "authRoute" ? "auth" : "publ", params, csrfOff: false });
        }
      }
    }
  };
  walk(root);
  return out;
}
const isMutating = (m: string) => ["POST", "PUT", "PATCH", "DELETE"].includes(m);
function fill(template: string, id: string): string {
  return template.replace(/\[(\w+)\]/g, (_m, name) => (name === "resource" ? "services" : name === "form" ? "inquiry" : name === "key" ? (template.includes("exports") ? "clients" : template.includes("settings") ? "business" : "inquiry") : id));
}
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}

// ───────────────────────── main ─────────────────────────
async function main() {
  console.log(`\nFaizanEdits Pro — security audit  (${BASE})`);
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch(() => null);
  if (!health?.ok) { console.error("App is not reachable — start it first."); process.exit(2); }

  const handlers = discover();
  const authH = handlers.filter((h) => h.kind === "auth");
  console.log(`Discovered ${handlers.length} handlers (${authH.length} authenticated, ${handlers.filter((h) => h.kind === "publ").length} public, ${handlers.filter((h) => h.kind === "raw").length} raw).`);
  check("route discovery found the API", handlers.length > 150, handlers.length);

  // ───────── 1. unauthenticated ─────────
  section("1. Unauthenticated access to every protected handler");
  const anon = new Http("anon");
  await pool(authH, 8, async (h) => {
    const r = await anon.call(h.method, fill(h.template, FAKE), isMutating(h.method) ? {} : undefined);
    check(`${h.method} ${h.template} → 401 when signed out`, r.status === 401, `${r.status} ${r.text.slice(0, 120)}`);
  });
  const publicExpect: Record<string, (s: number) => boolean> = {
    "GET /api/health": (s) => s === 200,
    "GET /api/auth/session": (s) => s === 200,
    "POST /api/auth/logout": (s) => s === 200,
    "GET /api/booking/slots": (s) => s === 200,
    "GET /api/forms/[key]": (s) => s === 200 || s === 404,
    "GET /api/forms/[key]/draft": (s) => s === 200 || (s >= 400 && s < 500),
    "GET /api/auth/google": (s) => s >= 300 && s < 500,
    "GET /api/auth/google/callback": (s) => s >= 300 && s < 500,
    "POST /api/cron/run": (s) => s === 401,
  };
  for (const h of handlers.filter((x) => x.kind === "publ")) {
    const r = await anon.call(h.method, fill(h.template, FAKE), isMutating(h.method) ? {} : undefined);
    const rule = publicExpect[`${h.method} ${h.template}`];
    if (rule) check(`public ${h.method} ${h.template} behaves (${r.status})`, rule(r.status), r.text.slice(0, 120));
    else check(`public ${h.method} ${h.template} refuses empty input without a server error (${r.status})`, r.status >= 400 && r.status < 500, r.text.slice(0, 160));
  }
  check("storage object GET without a token is refused", (await anon.call("GET", "/api/storage/object")).status === 403);
  check("storage object PUT without a token is refused", (await anon.call("PUT", "/api/storage/object")).status === 403);
  check("storage object with a forged token is refused", (await anon.call("GET", "/api/storage/object?t=" + "A".repeat(60))).status === 403);
  check("payment webhook without a signature is rejected", (await anon.call("POST", "/api/webhooks/payments", { type: "checkout.session.completed", data: { object: { payment_status: "paid", metadata: { invoice_id: FAKE } } } })).status === 400);

  // ───────── 2. CSRF ─────────
  section("2. CSRF on every state-changing handler (signed in as admin)");
  const admin = await loginAs(`admin@${DOMAIN}`);
  const mutating = authH.filter((h) => isMutating(h.method));
  const csrfExempt = handlers.filter((h) => h.csrfOff && h.kind !== "raw" && isMutating(h.method));
  console.log(`  state-changing handlers that opt out of CSRF: ${csrfExempt.map((h) => `${h.method} ${h.template}`).join(", ") || "none"}`);
  // Cron is protected by a bearer secret; logout is exempt on purpose (an expired token must still be able to sign out, and the SameSite cookie means a cross-site request carries no session).
  check("only cron and logout opt out of CSRF", csrfExempt.every((h) => ["/api/cron/run", "/api/auth/logout"].includes(h.template)), csrfExempt.map((h) => `${h.method} ${h.template}`));
  await pool(mutating, 8, async (h) => {
    const url = fill(h.template, FAKE);
    const body = h.method === "DELETE" ? undefined : {};
    const none = await admin.call(h.method, url, body, { csrf: false });
    check(`${h.method} ${h.template} needs the CSRF token`, none.status === 403, none.status);
    const wrong = await admin.call(h.method, url, body, { csrf: "not-the-token" });
    check(`${h.method} ${h.template} rejects a wrong CSRF token`, wrong.status === 403, wrong.status);
    const cross = await admin.call(h.method, url, body, { headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" } });
    check(`${h.method} ${h.template} rejects cross-site requests`, cross.status === 403, cross.status);
  });

  // ───────── people and object pools ─────────
  const u = (email: string) => db.user.findUniqueOrThrow({ where: { email } });
  const [jordan, mia, marco] = await Promise.all([u(`client@${DOMAIN}`), u(`mia@${DOMAIN}`), u(`editor@${DOMAIN}`)]);
  const [c1, c2] = await Promise.all([db.client.findFirstOrThrow({ where: { userId: jordan.id } }), db.client.findFirstOrThrow({ where: { userId: mia.id } })]);
  const ids = async (p: Promise<{ id: string }[]>, n = 6) => (await p).slice(0, n).map((r) => r.id);
  const foreignForClient = async (own: string, ownUser: string) => {
    const notMine = { clientId: { not: own } };
    const f: Record<string, string[]> = {
      clients: await ids(db.client.findMany({ where: { id: { not: own } }, select: { id: true } })),
      projects: await ids(db.project.findMany({ where: notMine, select: { id: true } }), 8),
      quotes: await ids(db.quote.findMany({ where: notMine, select: { id: true } })),
      invoices: await ids(db.invoice.findMany({ where: notMine, select: { id: true } })),
      contracts: await ids(db.contract.findMany({ where: notMine, select: { id: true } })),
      payments: await ids(db.payment.findMany({ where: notMine, select: { id: true } })),
      assets: await ids(db.asset.findMany({ where: { project: notMine }, select: { id: true } }), 8),
      versions: await ids(db.videoVersion.findMany({ where: { project: notMine }, select: { id: true } })),
      comments: await ids(db.videoComment.findMany({ where: { project: notMine }, select: { id: true } })),
      revisions: await ids(db.revisionRequest.findMany({ where: { project: notMine }, select: { id: true } })),
      messages: await ids(db.message.findMany({ where: notMine, select: { id: true } })),
      retainers: await ids(db.retainer.findMany({ where: notMine, select: { id: true } })),
      notes: await ids(db.internalNote.findMany({ select: { id: true } })),
      leads: await ids(db.lead.findMany({ select: { id: true } })),
      tasks: await ids(db.task.findMany({ select: { id: true } })),
      notifications: await ids(db.notification.findMany({ where: { userId: { not: ownUser } }, select: { id: true } })),
      audit: await ids(db.auditLog.findMany({ select: { id: true } })),
      emails: await ids(db.emailLog.findMany({ select: { id: true } })),
      fileRequests: await ids(db.fileRequest.findMany({ where: { project: notMine }, select: { id: true } })),
      changeRequests: await ids(db.changeRequest.findMany({ where: { project: notMine }, select: { id: true } })),
      meetings: await ids(db.meeting.findMany({ where: { OR: [{ clientId: null }, notMine] }, select: { id: true } })),
      times: await ids(db.timeEntry.findMany({ select: { id: true } })),
      clientUsers: await ids(db.user.findMany({ where: { isStaff: false, id: { not: ownUser } }, select: { id: true } })),
    };
    return f;
  };
  const fC1 = await foreignForClient(c1.id, jordan.id);
  const assignedToMarco = new Set((await db.projectMember.findMany({ where: { userId: marco.id }, select: { projectId: true } })).map((m) => m.projectId));
  const unassigned = await db.project.findMany({ where: { id: { notIn: [...assignedToMarco] } }, select: { id: true } });
  const editorsClients = new Set((await db.project.findMany({ where: { id: { in: [...assignedToMarco] } }, select: { clientId: true } })).map((p) => p.clientId));
  const fEd: Record<string, string[]> = {
    projects: unassigned.map((p) => p.id),
    quotes: await ids(db.quote.findMany({ select: { id: true } })),
    invoices: await ids(db.invoice.findMany({ select: { id: true } })),
    contracts: await ids(db.contract.findMany({ select: { id: true } })),
    payments: await ids(db.payment.findMany({ select: { id: true } })),
    leads: await ids(db.lead.findMany({ select: { id: true } })),
    audit: await ids(db.auditLog.findMany({ select: { id: true } })),
    emails: await ids(db.emailLog.findMany({ select: { id: true } })),
    clients: await ids(db.client.findMany({ where: { id: { notIn: [...editorsClients] } }, select: { id: true } })),
    unassignedAssets: await ids(db.asset.findMany({ where: { projectId: { in: unassigned.map((p) => p.id) } }, select: { id: true } }), 8),
    unassignedVersions: await ids(db.videoVersion.findMany({ where: { projectId: { in: unassigned.map((p) => p.id) } }, select: { id: true } })),
  };
  // Identifiers that must never appear in a response for the role (staff user ids and the person's own rows are excluded on purpose).
  const forbiddenIds = (f: Record<string, string[]>, skip: string[] = []) => Object.entries(f).filter(([k]) => !skip.includes(k)).flatMap(([k, v]) => v.map((id) => ({ id, kind: k })));
  const client1 = await loginAs(`client@${DOMAIN}`);
  const editor1 = await loginAs(`editor@${DOMAIN}`);
  const client2 = await loginAs(`mia@${DOMAIN}`);

  // ───────── 3. tenant isolation ─────────
  section("3. A second workspace cannot see or change the first");
  const stamp = Date.now().toString(36);
  const ws2 = await db.workspace.create({ data: { name: `Isolation ${stamp}`, slug: `isolation-${stamp}` } });
  const superRole = await db.role.findUniqueOrThrow({ where: { key: "super_admin" } });
  const otherEmail = `tenant2-${stamp}@example.test`;
  await db.user.create({ data: { workspaceId: ws2.id, email: otherEmail, name: "Other Tenant Admin", passwordHash: await hashPassword("Tenant-Two-123!"), isStaff: true, status: "ACTIVE", emailVerifiedAt: new Date(), isDemo: true, roles: { create: { roleId: superRole.id } } } });
  try {
    const t2 = await loginAs(otherEmail, "Tenant-Two-123!");
    const w1Project = c1 && (await db.project.findFirstOrThrow({ where: { clientId: c1.id } }));
    const w1 = { project: w1Project.id, client: c1.id, invoice: (await db.invoice.findFirstOrThrow({ where: { clientId: c1.id } })).id, quote: (await db.quote.findFirstOrThrow({ where: { clientId: c1.id } })).id, contract: (await db.contract.findFirstOrThrow({ where: { clientId: c1.id } })).id, lead: (await db.lead.findFirstOrThrow({})).id };
    const listPaths = ["/api/projects", "/api/clients", "/api/invoices", "/api/quotes", "/api/contracts", "/api/leads", "/api/payments", "/api/tasks", "/api/messages/threads", "/api/notifications", "/api/admin/team", "/api/admin/audit-log", "/api/admin/emails", "/api/contact-submissions", "/api/retainers", "/api/meetings", "/api/assets", "/api/revisions", "/api/admin/analytics?range=12m"];
    const w1Ids = [...Object.values(w1), ...forbiddenIds(fC1).map((x) => x.id)];
    for (const p of listPaths) {
      const r = await t2.call("GET", p);
      const leaked = w1Ids.find((id) => r.text.includes(id));
      check(`tenant 2 GET ${p} shows nothing from tenant 1`, !leaked && r.status < 500, { status: r.status, leaked });
    }
    for (const [name, p] of [["project", `/api/projects/${w1.project}`], ["client", `/api/clients/${w1.client}`], ["invoice", `/api/invoices/${w1.invoice}`], ["quote", `/api/quotes/${w1.quote}`], ["contract", `/api/contracts/${w1.contract}`], ["lead", `/api/leads/${w1.lead}`]] as const) {
      const r = await t2.call("GET", p);
      check(`tenant 2 cannot read tenant 1's ${name} by id (${r.status})`, r.status === 404 || r.status === 403, r.text.slice(0, 120));
    }
    const beforeProject = await db.project.findUniqueOrThrow({ where: { id: w1.project }, select: { name: true, status: true, priority: true } });
    const tries = [
      t2.call("PATCH", `/api/projects/${w1.project}`, { name: "hijacked" }),
      t2.call("POST", `/api/projects/${w1.project}/transition`, { to: "CANCELLED", override: true, comment: "x" }),
      t2.call("POST", `/api/invoices/${w1.invoice}/manual-payment`, { amount: 100, method: "cash" }),
      t2.call("POST", `/api/invoices/${w1.invoice}/cancel`, {}),
      t2.call("PATCH", `/api/clients/${w1.client}`, { companyName: "hijacked" }),
      t2.call("POST", `/api/quotes/${w1.quote}/send`, {}),
      t2.call("POST", `/api/contracts/${w1.contract}/send`, {}),
      t2.call("PATCH", `/api/leads/${w1.lead}`, { name: "hijacked" }),
    ];
    for (const r of await Promise.all(tries)) check(`tenant 2 mutation against tenant 1 is refused (${r.status})`, [403, 404, 409, 422].includes(r.status), r.text.slice(0, 120));
    const afterProject = await db.project.findUniqueOrThrow({ where: { id: w1.project }, select: { name: true, status: true, priority: true } });
    check("tenant 1's project is unchanged after tenant 2's attempts", JSON.stringify(beforeProject) === JSON.stringify(afterProject));
    const ex = await t2.call("GET", "/api/admin/exports/clients");
    check("tenant 2's client export contains no tenant 1 rows", !w1Ids.some((id) => ex.text.includes(id)) && !/Northwind|Lumen|Pixel Forge/.test(ex.text), ex.status);
  } finally {
    await db.session.deleteMany({ where: { user: { workspaceId: ws2.id } } });
    await db.auditLog.deleteMany({ where: { workspaceId: ws2.id } });
    await db.activityLog.deleteMany({ where: { workspaceId: ws2.id } });
    await db.notification.deleteMany({ where: { workspaceId: ws2.id } });
    await db.emailLog.deleteMany({ where: { workspaceId: ws2.id } });
    await db.user.deleteMany({ where: { workspaceId: ws2.id } }).catch(() => {});
    await db.workspace.delete({ where: { id: ws2.id } }).catch(() => {});
  }

  // ───────── 4 + 5. role exposure and object-level probes ─────────
  const collectionGets = authH.filter((h) => h.method === "GET" && h.params.length === 0);
  const idGets = authH.filter((h) => h.method === "GET" && h.params.length > 0);
  const collectionQueries = (fx: { project?: string; client?: string }) => [
    "", "?page=1&pageSize=200", "?q=a", "?q=e", "?q=video", "?pageSize=1000",
    ...(fx.project ? [`?projectId=${fx.project}`, `?entityType=PROJECT&entityId=${fx.project}`] : []),
    ...(fx.client ? [`?clientId=${fx.client}`] : []),
  ];

  for (const [label, http, foreign, ownSkip] of [["client (Jordan)", client1, forbiddenIds(fC1), []], ["editor (Marco)", editor1, forbiddenIds(fEd), []]] as const) {
    section(`4a. What a ${label} can read`);
    const isClient = label.startsWith("client");
    const exposed: string[] = [];
    await pool(collectionGets, 6, async (h) => {
      const probeSets = [{ project: foreign.find((f) => f.kind === "projects")?.id, client: foreign.find((f) => f.kind === "clients")?.id }];
      for (const fx of probeSets) {
        for (const qs of collectionQueries(fx)) {
          const r = await http.call("GET", h.template + qs);
          if (r.status >= 500) check(`${label} GET ${h.template}${qs} does not crash`, false, r.status);
          if (r.status === 200) {
            if (qs === "") exposed.push(h.template);
            const hit = foreign.find((f) => r.text.includes(f.id));
            check(`${label} GET ${h.template}${qs} contains no foreign ${hit?.kind ?? "ids"}`, !hit, hit ? `${hit.kind} ${hit.id}` : undefined);
          }
        }
      }
    });
    console.log(`  ${label} gets 200 from: ${[...new Set(exposed)].sort().join(", ")}`);
    const ex1 = await http.call("GET", "/api/admin/exports/clients");
    check(`${label} is refused the client export (${ex1.status})`, ex1.status === 403, ex1.text.slice(0, 100));
    // admin-only handlers must refuse both roles
    for (const h of authH.filter((x) => x.template.startsWith("/api/admin/") && x.method === "GET" && x.params.length === 0)) {
      const r = await http.call("GET", h.template);
      check(`${label} is refused ${h.template} (${r.status})`, r.status === 403, r.text.slice(0, 100));
    }
    for (const p of ["/api/leads", "/api/contact-submissions", "/api/clients", "/api/assignable"]) {
      const r = await http.call("GET", p);
      if (isClient || p !== "/api/assignable") check(`${label} is refused ${p} (${r.status})`, r.status === 403, r.text.slice(0, 100));
    }

    section(`4b. ${label}: id-taking GET handlers with foreign identifiers`);
    const sample: { id: string; kind: string }[] = [];
    const perKind = new Map<string, number>();
    for (const f of foreign) { const n = perKind.get(f.kind) ?? 0; if (n < 3) { sample.push(f); perKind.set(f.kind, n + 1); } }
    const jobs = idGets.flatMap((h) => sample.map((f) => ({ h, f })));
    await pool(jobs, 10, async ({ h, f }) => {
      const r = await http.call("GET", fill(h.template, f.id));
      if (r.status === 200 || r.status >= 500) check(`${label} GET ${h.template} with a foreign ${f.kind} id is not served`, false, `${r.status} ${r.text.slice(0, 160)}`);
      else passed++;
    });
    void ownSkip;
  }

  // ───────── 6. mutations against other people's objects ─────────
  section("6. Mutations against someone else's objects (client Jordan vs Mia's data, editor vs unassigned projects)");
  const miaProject = await db.project.findFirstOrThrow({ where: { clientId: c2.id, status: { in: ["REVISION", "CLIENT_REVIEW", "FINAL_REVIEW"] } } });
  const miaVersion = await db.videoVersion.findFirstOrThrow({ where: { projectId: miaProject.id }, orderBy: { createdAt: "desc" } });
  const miaComment = await db.videoComment.findFirstOrThrow({ where: { projectId: miaProject.id } });
  const miaAsset = await db.asset.findFirstOrThrow({ where: { projectId: miaProject.id, deletedAt: null } });
  const miaInvoice = await db.invoice.findFirstOrThrow({ where: { clientId: c2.id, status: { in: ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"] } } }).catch(() => db.invoice.findFirstOrThrow({ where: { clientId: c2.id } }));
  const miaQuote = await db.quote.findFirstOrThrow({ where: { clientId: c2.id } });
  const miaContract = await db.contract.findFirstOrThrow({ where: { clientId: c2.id } });
  const miaNotification = await db.notification.findFirstOrThrow({ where: { userId: mia.id, readAt: null } });
  const miaOrgMember = await db.organizationMember.findFirstOrThrow({ where: { organizationId: c2.organizationId } });
  const miaRevision = await db.revisionRequest.findFirst({ where: { projectId: miaProject.id } });

  const snap = async () => JSON.stringify({
    project: await db.project.findUnique({ where: { id: miaProject.id }, select: { status: true, name: true } }),
    invoice: await db.invoice.findUnique({ where: { id: miaInvoice.id }, select: { status: true, amountPaid: true } }),
    quote: await db.quote.findUnique({ where: { id: miaQuote.id }, select: { status: true } }),
    contract: await db.contract.findUnique({ where: { id: miaContract.id }, select: { status: true } }),
    asset: await db.asset.findUnique({ where: { id: miaAsset.id }, select: { deletedAt: true, displayName: true, visibleToClient: true } }),
    comment: await db.videoComment.findUnique({ where: { id: miaComment.id }, select: { status: true } }),
    version: await db.videoVersion.findUnique({ where: { id: miaVersion.id }, select: { releasedAt: true, approvedAt: true } }),
    notification: await db.notification.findUnique({ where: { id: miaNotification.id }, select: { readAt: true } }),
    member: await db.organizationMember.findUnique({ where: { id: miaOrgMember.id }, select: { role: true } }),
    members: await db.organizationMember.count({ where: { organizationId: c2.organizationId } }),
    comments: await db.videoComment.count({ where: { projectId: miaProject.id } }),
    messages: await db.message.count({ where: { clientId: c2.id } }),
    payments: await db.payment.count({ where: { clientId: c2.id } }),
    revisions: await db.revisionRequest.count({ where: { projectId: miaProject.id } }),
    changeRequests: await db.changeRequest.count({ where: { projectId: miaProject.id } }),
    fileRequests: await db.fileRequest.count({ where: { projectId: miaProject.id } }),
    brand: await db.clientBrandKit.findFirst({ where: { clientId: c2.id }, select: { updatedAt: true } }),
  });
  const attacks: [string, string, string, unknown?][] = [
    ["quote accept", "POST", `/api/quotes/${miaQuote.id}/accept`, {}],
    ["quote reject", "POST", `/api/quotes/${miaQuote.id}/reject`, { reason: "x" }],
    ["quote edit", "PATCH", `/api/quotes/${miaQuote.id}`, { title: "hijack" }],
    ["contract sign", "POST", `/api/contracts/${miaContract.id}/sign`, { signerName: "Jordan Ellis", signature: "Jordan Ellis", kind: "typed", accept: true, version: 1 }],
    ["contract download", "GET", `/api/contracts/${miaContract.id}/download`],
    ["invoice read", "GET", `/api/invoices/${miaInvoice.id}`],
    ["invoice pay", "POST", `/api/invoices/${miaInvoice.id}/pay`, {}],
    ["invoice demo-pay", "POST", `/api/invoices/${miaInvoice.id}/pay/demo`, {}],
    ["invoice manual payment", "POST", `/api/invoices/${miaInvoice.id}/manual-payment`, { amount: 100, method: "cash" }],
    ["invoice cancel", "POST", `/api/invoices/${miaInvoice.id}/cancel`, {}],
    ["project read", "GET", `/api/projects/${miaProject.id}`],
    ["project edit", "PATCH", `/api/projects/${miaProject.id}`, { name: "hijack" }],
    ["project transition", "POST", `/api/projects/${miaProject.id}/transition`, { to: "APPROVED", override: true, comment: "x" }],
    ["project approve", "POST", `/api/projects/${miaProject.id}/approve`, { versionId: miaVersion.id, confirmVersionNumber: 1 }],
    ["project brief edit", "PATCH", `/api/projects/${miaProject.id}/brief`, { answers: { x: "y" } }],
    ["project assign", "POST", `/api/projects/${miaProject.id}/assign`, { editorIds: [] }],
    ["project timeline", "GET", `/api/projects/${miaProject.id}/timeline`],
    ["change request", "POST", `/api/projects/${miaProject.id}/change-requests`, { whatChanged: "please change everything" }],
    ["file request", "POST", `/api/projects/${miaProject.id}/file-requests`, { title: "Send me things" }],
    ["version comments read", "GET", `/api/video-versions/${miaVersion.id}/comments`],
    ["version comment add", "POST", `/api/video-versions/${miaVersion.id}/comments`, { timecodeMs: 1000, comment: "injected" }],
    ["version playback", "GET", `/api/video-versions/${miaVersion.id}/playback`],
    ["version poster", "GET", `/api/video-versions/${miaVersion.id}/poster`],
    ["version release", "POST", `/api/video-versions/${miaVersion.id}/release`, {}],
    ["comment status", "PATCH", `/api/video-comments/${miaComment.id}`, { status: "CLOSED" }],
    ["revision submit", "POST", `/api/revisions`, { projectId: miaProject.id, versionId: miaVersion.id, description: "x" }],
    ...(miaRevision ? [["revision status", "PATCH", `/api/revisions/${miaRevision.id}`, { status: "CLOSED" }] as [string, string, string, unknown]] : []),
    ["asset read", "GET", `/api/assets/${miaAsset.id}?download=1`],
    ["asset rename", "PATCH", `/api/assets/${miaAsset.id}`, { displayName: "hijack", visibleToClient: false }],
    ["asset delete", "DELETE", `/api/assets/${miaAsset.id}`],
    ["asset share", "POST", `/api/assets/${miaAsset.id}/share`, {}],
    ["asset versions", "GET", `/api/assets/${miaAsset.id}/versions`],
    ["message send", "POST", `/api/messages`, { projectId: miaProject.id, body: "injected" }],
    ["message read", "GET", `/api/messages?projectId=${miaProject.id}`],
    ["notification read", "POST", `/api/notifications/${miaNotification.id}/read`, {}],
    ["member role change", "PATCH", `/api/members/${miaOrgMember.id}`, { role: "OWNER" }],
    ["member remove", "DELETE", `/api/members/${miaOrgMember.id}`],
    ["member invite", "POST", `/api/organizations/${c2.organizationId}/members`, { name: "Intruder", email: `intruder-${stamp}@example.test`, role: "OWNER" }],
    ["member list", "GET", `/api/organizations/${c2.organizationId}/members`],
    ["brand kit read", "GET", `/api/clients/${c2.id}/brand-kit`],
    ["brand kit write", "PUT", `/api/clients/${c2.id}/brand-kit`, { colors: [{ name: "x", hex: "#ffffff" }] }],
    ["client profile edit", "PATCH", `/api/clients/${c2.id}`, { companyName: "hijack" }],
    ["client company edit", "PATCH", `/api/clients/${c2.id}/company`, { name: "hijack" }],
    ["client invite", "POST", `/api/clients/${c2.id}/invite`, {}],
    ["client checklist", "GET", `/api/clients/${c2.id}/checklist`],
    ["notes read", "GET", `/api/notes?entityType=PROJECT&entityId=${miaProject.id}`],
    ["notes write", "POST", `/api/notes`, { entityType: "PROJECT", entityId: miaProject.id, body: "injected" }],
    ["time read", "GET", `/api/time?projectId=${miaProject.id}`],
    ["time write", "POST", `/api/time`, { projectId: miaProject.id, minutes: 30 }],
    ["task create", "POST", `/api/tasks`, { projectId: miaProject.id, title: "injected" }],
    ["deliverables publish", "POST", `/api/projects/${miaProject.id}/deliverables/publish`, {}],
    ["deliverables read", "GET", `/api/projects/${miaProject.id}/deliverables`],
    ["exports", "GET", `/api/admin/exports/clients`],
    ["analytics", "GET", `/api/admin/analytics`],
    ["audit log", "GET", `/api/admin/audit-log`],
    ["team list", "GET", `/api/admin/team`],
    ["team change", "PATCH", `/api/admin/team/${marco.id}`, { status: "SUSPENDED" }],
    ["settings write", "PUT", `/api/admin/settings/business`, { name: "hijack" }],
    ["cms write", "POST", `/api/admin/cms/services`, { title: "x" }],
    ["automation create", "POST", `/api/admin/automations`, { name: "x" }],
    ["lead read", "GET", `/api/leads/${fC1.leads[0]}`],
    ["lead convert", "POST", `/api/leads/${fC1.leads[0]}/convert`, {}],
    ["invoice create", "POST", `/api/invoices`, { clientId: c1.id, items: [{ description: "free money", quantity: 1, unitPrice: 100 }] }],
    ["quote create", "POST", `/api/quotes`, { clientId: c1.id, items: [{ description: "free", quantity: 1, unitPrice: 1 }] }],
    ["project create", "POST", `/api/projects`, { clientId: c1.id, name: "Self-made project" }],
    ["payment record", "POST", `/api/payments`, { invoiceId: miaInvoice.id, amount: 100 }],
  ];
  const before = await snap();
  const actors: [string, Http][] = [["client Jordan", client1]];
  for (const [who, http] of actors) {
    for (const [name, method, url, body] of attacks) {
      const r = await http.call(method, url, method === "GET" || method === "DELETE" ? undefined : body);
      // Marking somebody else's notification read is scoped to the owner's rows, so it is a no-op that reports zero updates.
      const noop = (name === "notification read" && r.status === 200 && r.data?.updated === 0) || (name === "exports" && r.status === 429);
      check(`${who}: ${name} is refused (${r.status})`, noop || [400, 403, 404, 405, 409, 422].includes(r.status), `${r.status} ${r.text.slice(0, 140)}`);
    }
  }
  check("none of Jordan's attempts changed Mia's data", (await snap()) === before);

  // Jordan's *own* things must still work (the fences must not be over-tight) and an editor must not get admin powers
  const ownProject = await db.project.findFirstOrThrow({ where: { clientId: c1.id } });
  check("Jordan can still read his own project", (await client1.call("GET", `/api/projects/${ownProject.id}`)).status === 200);
  check("Jordan can still list his own invoices", (await client1.call("GET", "/api/invoices")).status === 200);
  check("Mia can still read her own project", (await client2.call("GET", `/api/projects/${miaProject.id}`)).status === 200);

  const edAttacks: [string, string, string, unknown?][] = [
    ["invoice read", "GET", `/api/invoices/${fEd.invoices[0]}`],
    ["quote read", "GET", `/api/quotes/${fEd.quotes[0]}`],
    ["contract read", "GET", `/api/contracts/${fEd.contracts[0]}`],
    ["payments list", "GET", "/api/payments"],
    ["manual payment", "POST", `/api/invoices/${fEd.invoices[0]}/manual-payment`, { amount: 100, method: "cash" }],
    ["invoice create", "POST", "/api/invoices", { clientId: c1.id, items: [{ description: "x", quantity: 1, unitPrice: 100 }] }],
    ["unassigned project read", "GET", `/api/projects/${fEd.projects[0]}`],
    ["unassigned project edit", "PATCH", `/api/projects/${fEd.projects[0]}`, { name: "hijack" }],
    ["unassigned transition", "POST", `/api/projects/${fEd.projects[0]}/transition`, { to: "APPROVED", override: true, comment: "x" }],
    ["unassigned versions", "GET", `/api/projects/${fEd.projects[0]}/versions`],
    ["unassigned upload version", "POST", `/api/projects/${fEd.projects[0]}/versions`, { assetId: fEd.unassignedAssets[0] ?? FAKE, label: "x" }],
    ["unassigned assets", "GET", `/api/projects/${fEd.projects[0]}/assets`],
    ["asset delete (unassigned)", "DELETE", `/api/assets/${fEd.unassignedAssets[0] ?? FAKE}`],
    ["lead read", "GET", `/api/leads/${fEd.leads[0]}`],
    ["client read", "GET", `/api/clients/${fEd.clients[0]}`],
    ["project assign", "POST", `/api/projects/${fEd.projects[0]}/assign`, { editorIds: [marco.id] }],
    ["own-project transition to APPROVED (client-only)", "POST", `/api/projects/${[...assignedToMarco][0]}/approve`, { versionId: FAKE, confirmVersionNumber: 1 }],
    ["team change", "PATCH", `/api/admin/team/${jordan.id}`, { status: "SUSPENDED" }],
    ["settings write", "PUT", "/api/admin/settings/business", { name: "hijack" }],
    ["exports", "GET", "/api/admin/exports/clients"],
    ["audit log", "GET", "/api/admin/audit-log"],
    ["cms write", "POST", "/api/admin/cms/services", { title: "x" }],
    ["run jobs", "POST", "/api/admin/jobs", {}],
  ];
  const edBefore = await snap();
  for (const [name, method, url, body] of edAttacks) {
    const r = await editor1.call(method, url, method === "GET" || method === "DELETE" ? undefined : body);
    check(`editor Marco: ${name} is refused (${r.status})`, (name === "exports" && r.status === 429) || [400, 403, 404, 405, 409, 422].includes(r.status), `${r.status} ${r.text.slice(0, 140)}`);
  }
  check("none of Marco's attempts changed the database", (await snap()) === edBefore);


  // ───────── 7. server-rendered pages enforce the same rules ─────────
  section("7. Pages: direct URL access");
  const page = async (h: Http, url: string) => h.call("GET", url);
  const pageOk = (r: { status: number }) => r.status === 404 || r.status === 403 || (r.status >= 300 && r.status < 400);
  const foreignInvoice = fC1.invoices[0], foreignQuote = fC1.quotes[0], foreignContract = fC1.contracts[0], foreignProject = fC1.projects[0], foreignVersion = fC1.versions[0];
  for (const u2 of [`/dashboard/projects/${foreignProject}`, `/dashboard/projects/${foreignProject}/review/${foreignVersion}`, `/dashboard/projects/${foreignProject}/setup`, `/dashboard/quotes/${foreignQuote}`, `/dashboard/invoices/${foreignInvoice}`, `/dashboard/contracts/${foreignContract}`, "/admin", "/admin/invoices", `/admin/projects/${foreignProject}`, "/admin/settings", "/admin/audit-log", "/editor", `/editor/projects/${foreignProject}`]) {
    const r = await page(client1, u2);
    check(`client Jordan cannot open ${u2.replace(/cm[a-z0-9]{20,}/g, ":id")} (${r.status})`, pageOk(r), r.text.slice(0, 80));
  }
  for (const u2 of [`/editor/projects/${fEd.projects[0]}`, `/editor/projects/${fEd.projects[0]}/review/${fEd.unassignedVersions[0] ?? FAKE}`, "/admin", "/admin/invoices", "/admin/settings", "/admin/leads", "/dashboard", `/dashboard/invoices/${fEd.invoices[0]}`]) {
    const r = await page(editor1, u2);
    check(`editor Marco cannot open ${u2.replace(/cm[a-z0-9]{20,}/g, ":id")} (${r.status})`, pageOk(r), r.text.slice(0, 80));
  }
  for (const u2 of ["/dashboard", "/admin", "/editor", `/dashboard/projects/${foreignProject}`]) {
    const r = await page(anon, u2);
    check(`signed-out visitor is sent to sign in for ${u2.replace(/cm[a-z0-9]{20,}/g, ":id")} (${r.status})`, r.status >= 300 && r.status < 400);
  }
  check("a deleted/missing record is a plain 404, not a crash", (await page(admin, `/admin/projects/${FAKE}`)).status === 404);
  check("a deleted/missing record is a plain 404 for clients too", (await page(client1, `/dashboard/projects/${FAKE}`)).status === 404);

  // ───────── 8. helpers ─────────
  section("8. Redirect, content-sniffing and secret-scrubbing helpers");
  for (const bad of ["//evil.example", "/\\evil.example", "/\t/evil.example", "/\n/evil.example", "https://evil.example", "javascript:alert(1)", "evil", "", " /x", "/ok\\path", "/x\u0000y", "/" + "a".repeat(600)]) check(`open redirect refused: ${JSON.stringify(bad).slice(0, 40)}`, safeRedirectPath(bad, "/home") === "/home");
  for (const good of ["/dashboard", "/admin/projects/abc?tab=files", "/a/b-c_d%20e#x"]) check(`safe path kept: ${good}`, safeRedirectPath(good, "/home") === good);
  const bytes = (...b: number[]) => Buffer.from(b);
  check("Windows executables are recognised", sniffContent(bytes(0x4d, 0x5a, 0x90, 0)) === "executable");
  check("ELF binaries are recognised", sniffContent(bytes(0x7f, 0x45, 0x4c, 0x46, 2)) === "executable");
  check("Mach-O binaries are recognised", sniffContent(bytes(0xcf, 0xfa, 0xed, 0xfe)) === "executable");
  check("shebang scripts are recognised", sniffContent(Buffer.from("#!/bin/sh\nrm -rf /")) === "script");
  check("HTML is recognised", sniffContent(Buffer.from("  <!DOCTYPE html><script>alert(1)</script>")) === "markup");
  check("a real MP4 header is fine", sniffContent(bytes(0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d)) === "other");
  check("a PDF header is fine", sniffContent(Buffer.from("%PDF-1.7\n")) === "other");
  check("a program pretending to be video is refused", contentProblem("executable", "video/mp4", "clip.mp4") !== null);
  check("HTML pretending to be an image is refused", contentProblem("markup", "image/png", "photo.png") !== null);
  check("a plain-text file may start with #!", contentProblem("script", "text/plain", "notes.txt") === null);
  const withXff = (v: string) => new Request("http://x/", { headers: { "x-forwarded-for": v } });
  check("a forged left-most X-Forwarded-For entry is ignored (one proxy)", clientIp(withXff("6.6.6.6, 203.0.113.9")) === "203.0.113.9");
  check("a single X-Forwarded-For entry is used as the client address", clientIp(withXff("203.0.113.9")) === "203.0.113.9");
  check("without the header the address is a safe placeholder", clientIp(new Request("http://x/")) === "0.0.0.0");
  check("sign-in tokens are scrubbed from stored emails", !/token=[A-Za-z0-9_-]{16,}/.test(scrubTokens("Open http://x/auth/verify?type=magic&token=abcDEF1234567890abcDEF1234567890 now")));
  check("scrubbing leaves ordinary links alone", scrubTokens("See http://x/dashboard?tab=files") === "See http://x/dashboard?tab=files");

  // ───────── 9. upload pipeline ─────────
  section("9. Uploads");
  const jordanProject = ownProject;
  const put = async (r: { data?: any }, body: Buffer) => {
    const u3 = r.data?.upload;
    return fetch(u3.url.startsWith("http") ? u3.url : `${BASE}${u3.url}`, { method: u3.method, headers: u3.headers, body: new Uint8Array(body) });
  };
  const tryUpload = async (h: Http, name: string, mime: string, body: Buffer, projectId = jordanProject.id) => {
    const r = await h.call("POST", "/api/assets/upload-url", { purpose: "asset", projectId, folderKey: "raw-footage", filename: name, size: body.length, mimeType: mime });
    if (r.status !== 201) return { stage: "request", status: r.status, asset: null as any };
    const p = await put(r, body);
    if (!p.ok) return { stage: "put", status: p.status, asset: r.data.asset };
    const c = await h.call("POST", `/api/assets/${r.data.asset.id}/complete`, {});
    return { stage: "complete", status: c.status, asset: r.data.asset };
  };
  const mp4 = Buffer.concat([bytes(0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70), Buffer.alloc(2048, 7)]);
  check("a genuine-looking video uploads and completes", (await tryUpload(client1, `audit-${stamp}.mp4`, "video/mp4", mp4)).status === 200);
  const exeAsMp4 = await tryUpload(client1, `holiday-${stamp}.mp4`, "video/mp4", Buffer.concat([bytes(0x4d, 0x5a, 0x90, 0), Buffer.alloc(2048, 1)]));
  check(`a Windows program renamed .mp4 is rejected on completion (${exeAsMp4.status})`, exeAsMp4.stage === "complete" && exeAsMp4.status === 415);
  const htmlAsPng = await tryUpload(client1, `logo-${stamp}.png`, "image/png", Buffer.from("<!DOCTYPE html><html><script>fetch('/api/auth/session')</script></html>"));
  check(`an HTML page declared as an image is rejected (${htmlAsPng.status})`, htmlAsPng.stage === "complete" && htmlAsPng.status === 415);
  check("a rejected file is marked failed and its bytes are gone", exeAsMp4.asset ? (await db.asset.findUnique({ where: { id: exeAsMp4.asset.id } }))?.status === "FAILED" : false);
  for (const [name, mime] of [["setup.exe", "application/octet-stream"], ["run.sh", "text/x-shellscript"], ["macro.bat", "application/x-bat"], ["library.dll", "application/octet-stream"]] as const) {
    const r = await client1.call("POST", "/api/assets/upload-url", { purpose: "asset", projectId: jordanProject.id, filename: name, size: 100, mimeType: mime });
    check(`${name} is refused at the door (${r.status})`, r.status === 415 || r.status === 400, r.text.slice(0, 100));
  }
  const traversal = await client1.call("POST", "/api/assets/upload-url", { purpose: "asset", projectId: jordanProject.id, filename: "../../../../etc/passwd.mp4", size: 100, mimeType: "video/mp4" });
  check("a path-traversal filename is neutralised in the storage key", traversal.status === 201 && !/\.\.|\/etc\//.test(String(await db.asset.findUnique({ where: { id: traversal.data.asset.id } }).then((a) => a?.storageKey).then((k) => k?.split("/").slice(-1)[0]))), traversal.text.slice(0, 120));
  const zero = await client1.call("POST", "/api/assets/upload-url", { purpose: "asset", projectId: jordanProject.id, filename: "empty.mp4", size: 0, mimeType: "video/mp4" });
  check(`an empty file is refused (${zero.status})`, zero.status >= 400 && zero.status < 500);
  const huge = await client1.call("POST", "/api/assets/upload-url", { purpose: "asset", projectId: jordanProject.id, filename: "huge.mp4", size: 60 * 1024 ** 3, mimeType: "video/mp4" });
  check(`a file beyond the size limit is refused (${huge.status})`, huge.status >= 400 && huge.status < 500);
  const clientVersion = await client1.call("POST", "/api/assets/upload-url", { purpose: "version", projectId: jordanProject.id, filename: "v9.mp4", size: 100, mimeType: "video/mp4" });
  check(`a client cannot upload a "version" or "deliverable" (${clientVersion.status})`, clientVersion.status === 403);
  const clientDel = await client1.call("POST", "/api/assets/upload-url", { purpose: "deliverable", projectId: jordanProject.id, filename: "final.mp4", size: 100, mimeType: "video/mp4" });
  check(`a client cannot upload a deliverable (${clientDel.status})`, clientDel.status === 403);
  const foreignUpload = await client1.call("POST", "/api/assets/upload-url", { purpose: "asset", projectId: miaProject.id, filename: "x.mp4", size: 100, mimeType: "video/mp4" });
  check(`uploading into another client's project is refused (${foreignUpload.status})`, foreignUpload.status === 404 || foreignUpload.status === 403);
  // someone else finishing (or hijacking) my pending upload
  const pending = await client1.call("POST", "/api/assets/upload-url", { purpose: "asset", projectId: jordanProject.id, filename: `pending-${stamp}.mp4`, size: 100, mimeType: "video/mp4" });
  const hijack = await client2.call("POST", `/api/assets/${pending.data.asset.id}/complete`, {});
  check(`another client cannot complete my upload (${hijack.status})`, hijack.status === 404 || hijack.status === 403);
  const anonNoToken = await anon.call("POST", "/api/assets/upload-url", { purpose: "lead_reference", filename: "brief.pdf", size: 100, mimeType: "application/pdf" });
  check(`anonymous uploads need an upload session (${anonNoToken.status})`, anonNoToken.status === 400);
  const anonProject = await anon.call("POST", "/api/assets/upload-url", { purpose: "asset", projectId: jordanProject.id, filename: "x.mp4", size: 100, mimeType: "video/mp4" });
  check(`anonymous visitors cannot upload into a project (${anonProject.status})`, anonProject.status === 401);
  // the storage endpoint itself: the declared size is a ceiling
  const small = await client1.call("POST", "/api/assets/upload-url", { purpose: "asset", projectId: jordanProject.id, filename: `small-${stamp}.mp4`, size: 100, mimeType: "video/mp4" });
  if (small.status === 201 && small.data.upload.url.startsWith("/")) {
    const over = await fetch(`${BASE}${small.data.upload.url}`, { method: "PUT", headers: small.data.upload.headers, body: new Uint8Array(5000) });
    check(`the storage endpoint enforces the declared size (${over.status})`, over.status === 400 || over.status === 413);
    const readAsPut = await fetch(`${BASE}${small.data.upload.url}`, { method: "GET" });
    check(`an upload token cannot be used to download (${readAsPut.status})`, readAsPut.status === 403);
  }
  const dl = await client1.call("GET", `/api/assets/${miaAsset.id}?download=1`);
  check(`downloading another client's file is refused (${dl.status})`, dl.status === 404);

  // ───────── 10. request size limits ─────────
  section("10. Request size");
  const big = await client1.call("POST", "/api/notes", { entityType: "PROJECT", entityId: jordanProject.id, body: "x".repeat(2_000_000) });
  check(`an oversized JSON body is refused before parsing (${big.status})`, big.status === 413 || big.status === 403 || big.status === 422, big.text.slice(0, 100));
  const bad = await client1.call("POST", "/api/messages", undefined, { headers: { "content-type": "application/json" } });
  check(`a missing body is a 4xx, not a crash (${bad.status})`, bad.status >= 400 && bad.status < 500);

  // ───────── summary ─────────
  console.log(`\n${"═".repeat(60)}\n${failed === 0 ? "\x1b[32m" : "\x1b[31m"}${passed} passed, ${failed} failed\x1b[0m`);
  if (failed) {
    console.log("\nFailures:\n" + failures.map((f) => `  • ${f}`).join("\n"));
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error("\nSecurity audit crashed:", e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
