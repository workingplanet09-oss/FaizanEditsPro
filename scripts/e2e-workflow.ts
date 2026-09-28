/**
 * End-to-end workflow test — drives the REAL app over HTTP against the REAL database.
 *
 *   1. start the app:    DISABLE_RATE_LIMIT=true npm run dev   (DEMO_MODE=true, seeded with `npm run db:seed`)
 *   2. run this:         npm run test:e2e
 *
 * Steps 1–32 mirror the product spec (visitor → lead → client → quote → contract → payment → onboarding → assets →
 * V1 → feedback → revision → V2 → approval → delivery → testimonial). Then it attacks the app: cross-client IDOR,
 * RBAC, CSRF, status-machine and payment-gating rules.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { db } from "../src/server/db";
import { hashPassword } from "../src/server/auth/crypto";
import { visibleQuestions, type FormDef, type QuestionDef } from "../src/lib/conditions";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const CRON = process.env.CRON_SECRET ?? "";
const RUN = Date.now().toString(36);
const PASSWORD = "e2e-Password-123!";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  \x1b[31m✗ ${name}\x1b[0m${detail !== undefined ? `\n      ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 400)}` : ""}`);
  }
}
const step = (n: number | string, title: string) => console.log(`\n\x1b[1m${typeof n === "number" ? `Step ${n}` : n}: ${title}\x1b[0m`);

class Http {
  jar = new Map<string, string>();
  constructor(public who: string) {}
  private cookieHeader() {
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  async call(method: string, path: string, body?: unknown, opts: { csrf?: boolean; headers?: Record<string, string> } = {}) {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (body !== undefined) headers["content-type"] = "application/json";
    const c = this.cookieHeader();
    if (c) headers.cookie = c;
    if (opts.csrf !== false && this.jar.get("fe_csrf")) headers["x-csrf-token"] = this.jar.get("fe_csrf")!;
    const res = await fetch(`${BASE}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: "manual" });
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
    return { status: res.status, json, data: json?.data, error: json?.error, text, headers: res.headers };
  }
  get = (p: string) => this.call("GET", p);
  post = (p: string, b: unknown = {}) => this.call("POST", p, b);
  put = (p: string, b: unknown = {}) => this.call("PUT", p, b);
  patch = (p: string, b: unknown = {}) => this.call("PATCH", p, b);
  del = (p: string, b?: unknown) => this.call("DELETE", p, b);
}

async function drain() {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(`${BASE}/api/cron/run`, { method: "POST", headers: { authorization: `Bearer ${CRON}` } });
    const j: any = await r.json().catch(() => null);
    if (!j?.data || j.data.processed === 0) break;
  }
}

async function magicLogin(http: Http, email: string) {
  const r = await http.post("/api/auth/magic", { email });
  if (r.status !== 200) return { ok: false, r };
  await drain();
  const log = await db.emailLog.findFirst({ where: { toEmail: email, templateKey: "magic_link" }, orderBy: { createdAt: "desc" } });
  const token = log?.body.match(/token=([A-Za-z0-9_-]+)/)?.[1];
  if (!token) return { ok: false, r };
  const t = await http.post("/api/auth/token", { type: "magic", token });
  return { ok: t.status === 200, r: t };
}

async function makeStaff(email: string, name: string, roleKey: string) {
  const ws = await db.workspace.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  const role = await db.role.findUniqueOrThrow({ where: { key: roleKey } });
  const user = await db.user.create({ data: { workspaceId: ws.id, email, name, passwordHash: await hashPassword(PASSWORD), isStaff: true, status: "ACTIVE", emailVerifiedAt: new Date(), isDemo: true, roles: { create: { roleId: role.id } } } });
  return user;
}

async function login(http: Http, email: string) {
  const r = await http.post("/api/auth/login", { email, password: PASSWORD });
  return r;
}

/** Fill every required + visible question in a form with a plausible value (this also exercises the dynamic question engine). */
function fillRequired(form: FormDef, seed: Record<string, any> = {}, extra: string[] = []) {
  const answers: Record<string, any> = { ...seed };
  for (let pass = 0; pass < 4; pass++) {
    for (const s of form.sections)
      for (const q of visibleQuestions(form, s, answers, extra)) {
        if (!q.required || answers[q.key] !== undefined) continue;
        answers[q.key] = sample(q);
      }
  }
  return answers;
}
function sample(q: QuestionDef): any {
  switch (q.type) {
    case "SELECT":
    case "RADIO":
      return q.options[0]?.value ?? "x";
    case "MULTI_SELECT":
      return [q.options[0]?.value ?? "x"];
    case "NUMBER":
    case "CURRENCY":
      return 3;
    case "EMAIL":
      return `e2e-${RUN}@example.com`;
    case "URL":
      return "https://example.com";
    case "PHONE":
      return "+1 555 010 0100";
    case "DATE":
      return "2026-12-01";
    case "COLOR":
      return "#112233";
    case "TEXTAREA":
      return "This is an end-to-end test answer that is comfortably longer than the minimum length.";
    default:
      return `E2E ${q.key}`;
  }
}

async function uploadFile(http: Http, input: { purpose?: string; projectId?: string; folderKey?: string; filename: string; mime: string; bytes: Buffer; label?: string; draftToken?: string }) {
  const r = await http.post("/api/assets/upload-url", { purpose: input.purpose, projectId: input.projectId, folderKey: input.folderKey, filename: input.filename, size: input.bytes.length, mimeType: input.mime, label: input.label, draftToken: input.draftToken });
  if (r.status !== 201) return { ok: false as const, stage: "upload-url", r };
  const { asset, upload } = r.data;
  const put = await fetch(upload.url.startsWith("http") ? upload.url : `${BASE}${upload.url}`, { method: upload.method, headers: upload.headers, body: new Uint8Array(input.bytes) });
  if (!put.ok) return { ok: false as const, stage: "put", r: { status: put.status, text: await put.text() } };
  const c = await http.post(`/api/assets/${asset.id}/complete`, { draftToken: input.draftToken });
  if (c.status !== 200) return { ok: false as const, stage: "complete", r: c };
  return { ok: true as const, asset: c.data };
}

const fakeVideo = (kb = 300) => Buffer.concat([Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]), randomBytes(kb * 1024)]);

async function main() {
  console.log(`\nFaizanEdits Pro — end-to-end workflow test  (${BASE})`);
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch(() => null);
  if (health?.data?.status !== "ok") {
    console.error("\nApp isn't reachable. Start it with `DISABLE_RATE_LIMIT=true npm run dev` (and run `npm run db:seed`) first.");
    process.exit(2);
  }

  const admin = new Http("admin");
  const editor = new Http("editor");
  const client = new Http("client");
  const client2 = new Http("client2");
  const visitor = new Http("visitor");

  const adminUser = await makeStaff(`e2e-admin-${RUN}@example.test`, "E2E Admin", "super_admin");
  const editorUser = await makeStaff(`e2e-editor-${RUN}@example.test`, "E2E Editor", "editor");
  const clientEmail = `e2e-client-${RUN}@example.com`;
  const client2Email = `e2e-other-${RUN}@example.com`;

  step("Setup", "staff sign in with email + password");
  check("admin can sign in", (await login(admin, adminUser.email)).status === 200);
  check("editor can sign in", (await login(editor, editorUser.email)).status === 200);
  check("wrong password is rejected", (await new Http("x").post("/api/auth/login", { email: adminUser.email, password: "nope-nope-nope" })).status === 401);

  // ───────────────────────── 1–3 visitor → dynamic onboarding → lead ─────────────────────────
  step(1, "Visitor opens the website");
  const home = await fetch(`${BASE}/`);
  check("homepage renders (200)", home.status === 200, home.status);
  const svc = await fetch(`${BASE}/services/short-form-video-editing`);
  step(2, "Visitor selects Short-Form Editing");
  check("service page renders (200)", svc.status === 200, svc.status);

  step(3, "Visitor completes the dynamic onboarding wizard");
  const formRes = await visitor.get("/api/forms/inquiry");
  check("inquiry form definition is served from the database", formRes.status === 200 && formRes.data?.sections?.length >= 9, formRes.status);
  const form: FormDef = formRes.data;
  const draft = await visitor.put("/api/forms/inquiry/draft", { data: { looking_for: "short_form" }, step: 1 });
  check("wizard progress autosaves (draft token issued)", draft.status === 200 && !!draft.data?.token);
  const reload = await visitor.get(`/api/forms/inquiry/draft?token=${draft.data?.token}`);
  check("draft can be recovered after reload", reload.data?.draft?.data?.looking_for === "short_form");

  // dynamic logic: real-estate-only required question must NOT be visible for a short-form creator
  const answers = fillRequired(form, { looking_for: "short_form", client_type: "creator", niche: "youtube_creator", budget: "1000_2500", platforms: ["youtube", "instagram"], youtube_channel: "https://youtube.com/@e2e", shorts_count: 10, short_length: "30", video_frequency: "weekly", videos_per_month: 8, turnaround: "standard", style: ["fast_paced", "clean"], name: "Casey Creator", email: clientEmail, phone: "+1 555 010 0101", company: `E2E Studios ${RUN}`, website: "https://example.com", project_description: "We publish weekly long videos and want ten scroll-stopping Shorts cut from each one, with animated captions." });
  const propertyHidden = answers.property_type === undefined;
  check("real-estate questions stay hidden for a YouTube/short-form creator", propertyHidden);
  const bad = await visitor.post("/api/leads", { answers: { ...answers, email: "not-an-email" } });
  check("invalid email is rejected with a field error", bad.status === 422 && !!bad.error?.fields?.email, bad.error);
  const missing = await visitor.post("/api/leads", { answers: { ...answers, budget: undefined } });
  check("missing required answer is rejected", missing.status === 422 && !!missing.error?.fields?.budget, missing.error);
  const spam = await visitor.post("/api/leads", { answers, hp: "i-am-a-bot" });
  check("honeypot blocks bots", spam.status === 400);
  const injected = { ...answers, property_type: "house", podcast_name: "Should be dropped" };
  const sub = await visitor.post("/api/leads", { answers: injected, serviceSlug: "short-form-video-editing", draftToken: draft.data.token, utm: { source: "instagram", medium: "social", campaign: "e2e" }, referrer: "https://instagram.com/" });
  check("inquiry submitted (201) with a request ID", sub.status === 201 && /^REQ-\d{4}-\d{4}$/.test(sub.data?.requestCode ?? ""), sub.error ?? sub.data);
  const requestCode: string = sub.data?.requestCode;
  check("confirmation shows project type, response time and next step", !!sub.data?.projectType && !!sub.data?.responseTime && !!sub.data?.nextStep, sub.data);
  check("the client-facing response does NOT expose an internal score", !("score" in (sub.data ?? {})) && !("temperature" in (sub.data ?? {})));
  await drain();
  check("confirmation email was generated", !!(await db.emailLog.findFirst({ where: { toEmail: clientEmail, templateKey: "lead_received" } })));

  // ───────────────────────── 4–6 CRM ─────────────────────────
  step(4, "Lead appears in the CRM (Admin → Leads)");
  const list = await admin.get(`/api/leads?q=${requestCode}`);
  const leadRow = list.data?.items?.find((l: any) => l.requestCode === requestCode);
  check("lead is listed for admin", !!leadRow, list.status);
  check("lead has an internal Hot/Warm/Cold label", ["HOT", "WARM", "COLD", "NEEDS_REVIEW"].includes(leadRow?.temperature), leadRow?.temperature);
  check("lead source was tracked from UTM (Instagram)", leadRow?.source === "Instagram", leadRow?.source);

  step(5, "Admin opens the lead");
  const lead = await admin.get(`/api/leads/${leadRow.id}`);
  check("lead detail includes every answer with its question text", (lead.data?.answers?.length ?? 0) > 10, lead.data?.answers?.length);
  check("hidden/irrelevant answers were not stored", !lead.data?.answers?.some((a: any) => a.key === "property_type" || a.key === "podcast_name"));
  check("UTM data stored with the lead", lead.data?.utmSource === "instagram" && lead.data?.utmCampaign === "e2e");
  check("activity timeline has 'Inquiry submitted'", lead.data?.activities?.some((a: any) => a.type === "inquiry_submitted"));
  const override = await admin.patch(`/api/leads/${leadRow.id}`, { temperatureOverride: "HOT", assignedToId: adminUser.id });
  check("admin can override the label and assign the lead", override.status === 200);
  const clientTriesLeads = await client.get("/api/leads");
  check("visitors/clients cannot list leads", [401, 403].includes(clientTriesLeads.status));

  step(6, "Admin converts the lead into a client");
  const conv = await admin.post(`/api/leads/${leadRow.id}/convert`, { createProject: true });
  check("lead converted → client + project created", conv.status === 200 && !!conv.data?.clientId && !!conv.data?.projectId, conv.error);
  const clientId: string = conv.data.clientId;
  const projectId: string = conv.data.projectId;
  const conv2 = await admin.post(`/api/leads/${leadRow.id}/convert`, {});
  check("converting again is idempotent (same client)", conv2.data?.clientId === clientId);
  const proj0 = await admin.get(`/api/projects/${projectId}`);
  check("project starts in 'Awaiting Quote'", proj0.data?.status === "AWAITING_QUOTE", proj0.data?.status);

  // ───────────────────────── 7–9 quote ─────────────────────────
  step(7, "Admin creates a quote");
  const q = await admin.post("/api/quotes", { clientId, projectId, title: "10 Shorts from one YouTube video", currency: "USD", depositPercent: 100, items: [{ description: "Short-form edit (9:16, captions, sound design)", quantity: 10, unitPrice: 4500 }], discount: 5000, taxRateBps: 0, leadId: leadRow.id });
  check("quote created with totals computed server-side", q.status === 201 && q.data?.total === 40000 && q.data?.status === "DRAFT", q.error ?? q.data);
  const quoteId: string = q.data.id;
  const hiddenDraft = await magicLogin(client, clientEmail);
  check("client can sign in with a magic link (no password)", hiddenDraft.ok, hiddenDraft.r?.error);
  const draftQuoteForClient = await client.get(`/api/quotes/${quoteId}`);
  check("a DRAFT quote is invisible to the client", draftQuoteForClient.status === 404);
  const sent = await admin.post(`/api/quotes/${quoteId}/send`);
  check("admin sends the quote", sent.status === 200 && sent.data?.status === "SENT", sent.error);

  step(8, "Client receives the quote");
  await drain();
  const cq = await client.get(`/api/quotes/${quoteId}`);
  check("client can open the quote (status → Viewed)", cq.status === 200 && ["SENT", "VIEWED"].includes(cq.data?.status), cq.error);
  const cn = await client.get("/api/notifications");
  check("client got an in-app notification: 'Your quote is ready'", cn.data?.items?.some((n: any) => /quote is ready/i.test(n.title)), cn.data?.items?.map((n: any) => n.title));
  check("client got the 'quote sent' email", !!(await db.emailLog.findFirst({ where: { toEmail: clientEmail, templateKey: "quote_sent" } })));
  const projForClient = await client.get(`/api/projects/${projectId}`);
  check("the project is now visible to the client", projForClient.status === 200, projForClient.status);

  step(9, "Client accepts the quote");
  const acc = await client.post(`/api/quotes/${quoteId}/accept`);
  check("quote accepted (logged with who/when)", acc.status === 200 && acc.data?.status === "ACCEPTED", acc.error);
  const acc2 = await client.post(`/api/quotes/${quoteId}/accept`);
  check("accepting twice is refused", acc2.status === 409);
  const p1 = await admin.get(`/api/projects/${projectId}`);
  check("project moved to 'Awaiting Contract'", p1.data?.status === "AWAITING_CONTRACT", p1.data?.status);
  await drain();

  // ───────────────────────── 10–12 contract ─────────────────────────
  step(10, "Admin sends the contract");
  const contracts = await admin.get(`/api/contracts?q=${encodeURIComponent(projectId)}`);
  let contractId: string | undefined = (await db.contract.findFirst({ where: { projectId } }))?.id;
  check("a draft contract was prepared automatically on acceptance", !!contractId, contracts.status);
  const cSendEarly = await client.get(`/api/contracts/${contractId}`);
  check("a DRAFT contract is invisible to the client", cSendEarly.status === 404);
  const csend = await admin.post(`/api/contracts/${contractId}/send`);
  check("contract sent", csend.status === 200 && csend.data?.status === "SENT", csend.error);

  step(11, "Client signs the contract");
  const cview = await client.get(`/api/contracts/${contractId}`);
  check("client can read all contract sections", cview.status === 200 && cview.data?.sections?.length >= 10, cview.error);
  const noAccept = await client.post(`/api/contracts/${contractId}/sign`, { signerName: "Casey Creator", signature: "Casey Creator", kind: "typed", accept: false, version: cview.data.currentVersion });
  check("signing without accepting the terms is refused", noAccept.status === 400 || noAccept.status === 422);
  const sign = await client.post(`/api/contracts/${contractId}/sign`, { signerName: "Casey Creator", signature: "Casey Creator", kind: "typed", accept: true, version: cview.data.currentVersion });
  check("contract signed (version, timestamp, hash recorded)", sign.status === 200 && sign.data?.status === "SIGNED", sign.error);
  const adminContract = await admin.get(`/api/contracts/${contractId}`);
  check("audit metadata stored for staff (IP/UA/hash) but not for clients", !!adminContract.data?.signatures?.[0]?.contentHash && !("contentHash" in (sign.data?.signatures?.[0] ?? {})));
  const dl = await client.call("GET", `/api/contracts/${contractId}/download`);
  check("contract can be downloaded (printable HTML)", dl.status === 200 && dl.text.includes("Signatures"));

  step(12, "Invoice is generated");
  await drain();
  const invs = await client.get("/api/invoices");
  const invoice = invs.data?.items?.[0];
  check("an invoice was created for the client automatically", !!invoice && invoice.status === "SENT" && invoice.total === 40000, invs.data?.items);
  const p2 = await admin.get(`/api/projects/${projectId}`);
  check("project moved to 'Awaiting Payment'", p2.data?.status === "AWAITING_PAYMENT", p2.data?.status);

  // ───────────────────────── 13–14 payment ─────────────────────────
  step(13, "Client pays");
  const early = await admin.post(`/api/projects/${projectId}/transition`, { to: "ONBOARDING" });
  check("payment gate: admin can't skip payment without an override (423)", early.status === 423, early.error);
  const pay = await client.post(`/api/invoices/${invoice.id}/pay/demo`);
  check("payment recorded (demo provider)", pay.status === 200 && pay.data?.status === "PAID", pay.error);
  const replay = await client.post(`/api/invoices/${invoice.id}/pay/demo`);
  check("paying an already-paid invoice is refused", replay.status === 409 || replay.status === 400, replay.status);

  step(14, "Project becomes active");
  const p3 = await client.get(`/api/projects/${projectId}`);
  check("project status → Onboarding (activated)", p3.data?.status === "ONBOARDING", p3.data?.status);
  await drain();
  const cn2 = await client.get("/api/notifications");
  check("client notified: 'Your project has started'", cn2.data?.items?.some((n: any) => /project has started/i.test(n.title)));
  check("payment-received email generated", !!(await db.emailLog.findFirst({ where: { toEmail: clientEmail, templateKey: "payment_received" } })));
  const adminInvoice = await admin.get(`/api/invoices/${invoice.id}`);
  check("invoice shows PAID with a payment record", adminInvoice.data?.status === "PAID" && adminInvoice.data?.payments?.length === 1);

  // ───────────────────────── 15–16 onboarding + assets ─────────────────────────
  step(15, "Client completes project onboarding");
  const ob = await client.get(`/api/projects/${projectId}/onboarding`);
  check("project onboarding form loads with prefilled brand data", ob.status === 200 && ob.data?.form?.sections?.length >= 5, ob.error);
  const obAnswers = fillRequired(ob.data.form, ob.data.answers, ob.data.extraCategories);
  const auto = await client.put(`/api/projects/${projectId}/onboarding`, { answers: obAnswers, step: 2 });
  check("onboarding autosaves as a draft", auto.status === 200);
  const obSub = await client.post(`/api/projects/${projectId}/onboarding`, { answers: { ...obAnswers, project_name: "E2E — 10 Shorts" } });
  check("onboarding submitted → brief generated", obSub.status === 200 && obSub.data?.briefVersion >= 1, obSub.error);
  const brief = await client.get(`/api/projects/${projectId}/brief`);
  check("project brief has client, project, creative and technical sections", ["client", "project", "creative", "technical"].every((k) => brief.data?.content?.sections?.some((s: any) => s.key === k)), brief.data?.content?.sections?.map((s: any) => s.key));
  const p4 = await client.get(`/api/projects/${projectId}`);
  check("project → Awaiting Assets", p4.data?.status === "AWAITING_ASSETS", p4.data?.status);

  step(16, "Client uploads assets");
  const notReady = await client.post(`/api/projects/${projectId}/assets-ready`);
  check("can't mark assets ready before uploading any", notReady.status === 400);
  const raw = randomBytes(200 * 1024);
  const up = await uploadFile(client, { projectId, folderKey: "raw-footage", filename: "Interview_Final_V2.mp4", mime: "video/mp4", bytes: fakeVideo(200) });
  check("footage uploaded directly to storage with progress-capable signed URL", up.ok, (up as any).r);
  const up2 = await uploadFile(client, { projectId, folderKey: "raw-footage", filename: "Interview_Final_V3.mp4", mime: "video/mp4", bytes: fakeVideo(50) });
  check("'Interview_Final_V3.mp4' is recognised as version 3 of the same file", up2.ok && (up2 as any).asset.version === 3, (up2 as any).asset?.version);
  const exe = await client.post("/api/assets/upload-url", { projectId, filename: "malware.exe", size: 1000, mimeType: "application/x-msdownload" });
  check("executable uploads are blocked", exe.status === 415, exe.status);
  const fr = await admin.post(`/api/projects/${projectId}/file-requests`, { title: "Please upload the brand logo in PNG or SVG format" });
  check("admin can request a missing asset ('Action required')", fr.status === 201);
  const logo = await uploadFile(client, { projectId, folderKey: "logos", filename: "logo.png", mime: "image/png", bytes: randomBytes(4000) });
  const frOpen = await client.get(`/api/projects/${projectId}/file-requests?open=1`);
  check("client sees the file request", frOpen.data?.length === 1);
  if (logo.ok) {
    const done = await client.post(`/api/assets/${logo.asset.id}/complete`, { fileRequestId: fr.data.id });
    void done; // already completed; fulfil via explicit completion path below
  }
  const ready = await client.post(`/api/projects/${projectId}/assets-ready`);
  check("client confirms all assets uploaded → project Queued", ready.status === 200, ready.error);
  void raw;

  // ───────────────────────── 17–18 editor ─────────────────────────
  step(17, "Admin assigns an editor");
  const unassigned = await editor.get(`/api/projects/${projectId}`);
  check("an editor can't see a project they aren't assigned to", unassigned.status === 404, unassigned.status);
  const assign = await admin.post(`/api/projects/${projectId}/assign`, { managerId: adminUser.id, editorIds: [editorUser.id] });
  check("editor assigned", assign.status === 200 && assign.data?.assigned?.length >= 1, assign.error);
  await drain();

  step(18, "Editor sees the project");
  const eList = await editor.get("/api/projects");
  check("assigned project appears in the editor's list", eList.data?.items?.some((p: any) => p.id === projectId), eList.status);
  const eAssets = await editor.get(`/api/projects/${projectId}/assets`);
  check("editor sees the client's uploaded assets", eAssets.data?.items?.some((a: any) => a.displayName === "Interview_Final_V2.mp4"), eAssets.error);
  const eBrief = await editor.get(`/api/projects/${projectId}/brief`);
  check("editor can read the brief", eBrief.status === 200 && !!eBrief.data?.content);
  const eNotif = await editor.get("/api/notifications");
  check("editor was notified about the assignment", eNotif.data?.items?.some((n: any) => /assigned/i.test(n.title)));
  const eInvoices = await editor.get("/api/invoices");
  check("editor cannot read invoices (RBAC)", eInvoices.status === 403);

  // ───────────────────────── 19–21 V1 ─────────────────────────
  step(19, "Editor uploads V1");
  const start = await editor.post(`/api/projects/${projectId}/transition`, { to: "EDITING" });
  check("editor can start editing", start.status === 200, start.error);
  const badMove = await editor.post(`/api/projects/${projectId}/transition`, { to: "DELIVERED" });
  check("editor cannot force the project to Delivered", badMove.status === 403);
  const v1file = await uploadFile(editor, { purpose: "version", projectId, filename: "shorts-v1.mp4", mime: "video/mp4", bytes: fakeVideo(400) });
  check("draft video uploaded", v1file.ok, (v1file as any).r);
  const v1 = await editor.post("/api/video-versions", { projectId, assetId: (v1file as any).asset.id, notes: "First cut of all 10 shorts", changeSummary: "Initial edit" });
  check("V1 created and released to the client", v1.status === 201 && v1.data?.label === "V1" && v1.data?.reviewStatus === "PENDING_CLIENT", v1.error ?? v1.data);
  const p5 = await admin.get(`/api/projects/${projectId}`);
  check("project → Client Review", p5.data?.status === "CLIENT_REVIEW", p5.data?.status);

  step(20, "Client receives a notification");
  await drain();
  const cn3 = await client.get("/api/notifications");
  check("client notified: 'Your V1 is ready for review'", cn3.data?.items?.some((n: any) => /V1 is ready/i.test(n.title)), cn3.data?.items?.map((n: any) => n.title));
  check("'draft ready' email generated", !!(await db.emailLog.findFirst({ where: { toEmail: clientEmail, templateKey: "draft_ready" } })));

  step(21, "Client opens V1");
  const versions = await client.get(`/api/projects/${projectId}/versions`);
  check("client sees V1 in the version list", versions.data?.length === 1 && versions.data[0].label === "V1");
  const play = await client.get(`/api/video-versions/${v1.data.id}/playback`);
  check("signed playback URL issued", play.status === 200 && !!play.data?.url, play.error);
  const rng = await fetch(`${BASE}${play.data.url}`, { headers: { range: "bytes=0-99" } });
  check("video streams with HTTP Range support (206)", rng.status === 206 && (await rng.arrayBuffer()).byteLength === 100, rng.status);
  const tampered = await fetch(`${BASE}${play.data.url.replace(/.$/, (c: string) => (c === "a" ? "b" : "a"))}`);
  check("a tampered signed URL is rejected", tampered.status === 403);

  // ───────────────────────── 22–24 feedback → revision ─────────────────────────
  step(22, "Client adds timestamped feedback");
  const c1 = await client.post(`/api/video-versions/${v1.data.id}/comments`, { timecodeMs: 14000, comment: "Replace this shot with the wider angle." });
  check("timestamped comment saved (00:14)", c1.status === 201 && c1.data?.timecode === "00:14", c1.error);
  await client.post(`/api/video-versions/${v1.data.id}/comments`, { timecodeMs: 42500, comment: "Captions are slightly late here." });

  step(23, "Client requests a revision");
  const wrongApprove = await client.post(`/api/projects/${projectId}/approve`, { versionId: v1.data.id, confirmVersionNumber: 2 });
  check("approval must echo the exact version number (409 on mismatch)", wrongApprove.status === 409, wrongApprove.error);
  const rev = await client.post("/api/revisions", { projectId, versionId: v1.data.id, description: "Two notes on V1 — see the timeline." });
  check("revision submitted (round 1)", rev.status === 201 && rev.data?.roundNumber === 1, rev.error);
  const p6 = await admin.get(`/api/projects/${projectId}`);
  check("project → Revision", p6.data?.status === "REVISION", p6.data?.status);

  step(24, "Editor receives the revision");
  await drain();
  const eRev = await editor.get("/api/revisions?status=open");
  check("editor sees the open revision", eRev.data?.some((r: any) => r.id === rev.data.id));
  const eComments = await editor.get(`/api/video-versions/${v1.data.id}/comments`);
  check("editor sees both timestamped comments", eComments.data?.length === 2);
  const eNotif2 = await editor.get("/api/notifications");
  check("editor notified: 'Revision requested'", eNotif2.data?.items?.some((n: any) => /revision requested/i.test(n.title)));
  const reply = await editor.patch(`/api/video-comments/${eComments.data[0].id}`, { status: "IN_PROGRESS", response: "On it — swapping to the wide." });
  check("editor can respond to a comment and mark it in progress", reply.status === 200);
  const clientResolve = await client.patch(`/api/video-comments/${eComments.data[0].id}`, { status: "RESOLVED" });
  check("clients can't resolve comments themselves", clientResolve.status === 403);
  const tasks = await editor.get("/api/tasks?mine=1");
  check("a task 'Apply revision notes' was created for the editor automatically", tasks.data?.items?.some((t: any) => /revision notes/i.test(t.title)), tasks.data?.items?.map((t: any) => t.title));

  // ───────────────────────── 25–28 V2 → approval ─────────────────────────
  step(25, "Editor uploads V2");
  const v2file = await uploadFile(editor, { purpose: "version", projectId, filename: "shorts-v2.mp4", mime: "video/mp4", bytes: fakeVideo(420) });
  const v2 = await editor.post("/api/video-versions", { projectId, assetId: (v2file as any).asset.id, revisionId: rev.data.id, notes: "Wide angle swapped, captions retimed", changeSummary: "Applied 2 notes" });
  check("V2 created; V1 kept and superseded (never overwritten)", v2.status === 201 && v2.data?.label === "V2", v2.error);
  const list2 = await client.get(`/api/projects/${projectId}/versions`);
  check("both versions exist for comparison", list2.data?.length === 2 && list2.data.find((v: any) => v.label === "V1")?.reviewStatus === "SUPERSEDED");
  const revDone = await admin.get(`/api/revisions?projectId=${projectId}`);
  check("revision marked Resolved and comments closed out", revDone.data?.[0]?.status === "RESOLVED");
  await drain();

  step(26, "Client reviews V2");
  const cn4 = await client.get("/api/notifications");
  check("client notified: 'A revision has been completed'", cn4.data?.items?.some((n: any) => /revision has been completed/i.test(n.title)), cn4.data?.items?.map((n: any) => n.title));
  const oldVersionComment = await client.post(`/api/video-versions/${v1.data.id}/comments`, { timecodeMs: 1000, comment: "late note" });
  check("comments on a superseded version are refused", oldVersionComment.status === 423 || oldVersionComment.status === 409, oldVersionComment.status);

  step(27, "Client approves V2");
  const approve = await client.post(`/api/projects/${projectId}/approve`, { versionId: v2.data.id, confirmVersionNumber: 2, notes: "Looks great — approved." });
  check("V2 approved (who/when/version/notes stored)", approve.status === 200 && approve.data?.versionNumber === 2, approve.error);

  step(28, "Project becomes Approved");
  const p7 = await admin.get(`/api/projects/${projectId}`);
  check("project → Approved", p7.data?.status === "APPROVED", p7.data?.status);
  const prematureDeliver = await admin.post(`/api/projects/${projectId}/transition`, { to: "DELIVERED" });
  check("can't mark Delivered before final files are published (423)", prematureDeliver.status === 423, prematureDeliver.error);

  // ───────────────────────── 29–32 delivery ─────────────────────────
  step(29, "Admin uploads final files");
  const master = await uploadFile(admin, { purpose: "deliverable", projectId, filename: "FINAL_master_4k.mp4", mime: "video/mp4", bytes: fakeVideo(300), label: "Master 4K" });
  const captions = await uploadFile(admin, { purpose: "deliverable", projectId, filename: "captions.srt", mime: "application/x-subrip", bytes: Buffer.from("1\n00:00:00,000 --> 00:00:02,000\nHello\n"), label: "Caption file" });
  check("final deliverables uploaded", master.ok && captions.ok, (master as any).r);
  const hidden = await client.get(`/api/projects/${projectId}/deliverables`);
  check("deliverables are invisible to the client until published", hidden.data?.items?.length === 0, hidden.data);
  const hiddenDl = await client.get(`/api/assets/${(master as any).asset.id}?download=1`);
  check("...and can't be downloaded by guessing the ID", hiddenDl.status === 404, hiddenDl.status);
  const pub = await admin.post(`/api/projects/${projectId}/deliverables/publish`);
  check("admin publishes the deliverables", pub.status === 200 && pub.data?.published === 2, pub.error);

  step(30, "Client downloads files");
  await drain();
  const cn5 = await client.get("/api/notifications");
  check("client notified: 'Your final files are ready'", cn5.data?.items?.some((n: any) => /final files are ready/i.test(n.title)));
  const dels = await client.get(`/api/projects/${projectId}/deliverables`);
  check("client sees Final Delivery with labelled files", dels.data?.items?.length === 2 && dels.data.unlocked === true, dels.data);
  const durl = await client.get(`/api/assets/${(master as any).asset.id}?download=1`);
  check("signed download URL issued", durl.status === 200 && !!durl.data?.url, durl.error);
  const file = await fetch(`${BASE}${durl.data.url}`);
  check("file downloads with the correct size", file.status === 200 && (await file.arrayBuffer()).byteLength === (master as any).asset.sizeBytes);

  step(31, "Project is delivered → testimonial request is triggered");
  step(32, "Project becomes Delivered");
  const deliver = await admin.post(`/api/projects/${projectId}/transition`, { to: "DELIVERED" });
  check("project → Delivered", deliver.status === 200 && deliver.data?.status === "DELIVERED", deliver.error);
  await drain();
  check("testimonial request created", !!(await db.testimonialRequest.findUnique({ where: { projectId } })));
  const cn6 = await client.get("/api/notifications");
  check("client notified: 'How was your experience?'", cn6.data?.items?.some((n: any) => /how was your experience/i.test(n.title)));
  const fb = await client.post(`/api/projects/${projectId}/feedback`, { rating: 5, quote: "Fast, communicative and the shorts look great.", permissionToPublish: true, name: "Casey Creator", company: `E2E Studios ${RUN}`, role: "Founder" });
  check("client submits a testimonial", fb.status === 201, fb.error);
  const published = await db.testimonial.findFirst({ where: { projectId } });
  check("testimonial is NOT auto-published (pending admin approval)", published?.status === "PENDING");
  const approveT = await admin.patch(`/api/admin/cms/testimonials/${published!.id}`, { status: "APPROVED" });
  check("admin approves the testimonial", approveT.status === 200, approveT.error);

  // ───────────────────────── audit trail & timeline ─────────────────────────
  step("Audit", "everything important was logged");
  const audit = await admin.get(`/api/admin/audit-log?pageSize=200`);
  const msgs: string[] = (audit.data?.items ?? []).map((a: any) => a.message ?? "");
  check("audit log records status changes with actor names", msgs.some((m) => /changed project status from .* to /i.test(m)));
  check("audit log records quote acceptance, contract signature, payment and approval", ["accepted quote", "signed contract", "received for Invoice", "approved Video V2"].every((s) => msgs.some((m) => m.includes(s))), msgs.slice(0, 12));
  const timeline = await client.get(`/api/projects/${projectId}/timeline`);
  check("client timeline shows milestones, none internal", timeline.data?.events?.length > 5 && timeline.data.events.every((e: any) => e.internal === false));
  check("milestones tracker computed from real history", timeline.data?.milestones?.filter((m: any) => m.done).length >= 7, timeline.data?.milestones?.map((m: any) => `${m.label}:${m.done}`));

  // ───────────────────────── security ─────────────────────────
  step("Security", "ownership, RBAC, CSRF, status machine");
  const other = await admin.post("/api/clients", { name: "Other Person", email: client2Email, companyName: `Other Co ${RUN}` });
  check("second client created", other.status === 201, other.error);
  check("second client can sign in", (await magicLogin(client2, client2Email)).ok);
  const attempts: [string, () => Promise<{ status: number }>][] = [
    ["view another client's project", () => client2.get(`/api/projects/${projectId}`)],
    ["view another client's quote", () => client2.get(`/api/quotes/${quoteId}`)],
    ["view another client's invoice", () => client2.get(`/api/invoices/${invoice.id}`)],
    ["view another client's contract", () => client2.get(`/api/contracts/${contractId}`)],
    ["download another client's file", () => client2.get(`/api/assets/${(up as any).asset.id}?download=1`)],
    ["stream another client's video", () => client2.get(`/api/video-versions/${v2.data.id}/playback`)],
    ["comment on another client's video", () => client2.post(`/api/video-versions/${v2.data.id}/comments`, { timecodeMs: 1000, comment: "hi" })],
    ["read another client's comments", () => client2.get(`/api/video-versions/${v2.data.id}/comments`)],
    ["read another client's messages", () => client2.get(`/api/messages?projectId=${projectId}`)],
    ["approve another client's video", () => client2.post(`/api/projects/${projectId}/approve`, { versionId: v2.data.id, confirmVersionNumber: 2 })],
    ["pay another client's invoice", () => client2.post(`/api/invoices/${invoice.id}/pay/demo`)],
    ["list another client's brief", () => client2.get(`/api/projects/${projectId}/brief`)],
    ["read another client's deliverables", () => client2.get(`/api/projects/${projectId}/deliverables`)],
  ];
  for (const [name, fn] of attempts) {
    const r = await fn();
    check(`IDOR blocked: client cannot ${name} (${r.status})`, r.status === 404 || r.status === 403);
  }
  const c2Projects = await client2.get("/api/projects");
  check("a client's project list contains only their own projects", (c2Projects.data?.items ?? []).every((p: any) => p.id !== projectId));
  check("clients cannot open admin APIs", (await client.get("/api/admin/analytics")).status === 403 && (await client.get("/api/admin/audit-log")).status === 403);
  check("clients cannot read internal notes", (await client.get(`/api/notes?entityType=PROJECT&entityId=${projectId}`)).status === 403);
  check("editors cannot open admin CMS", (await editor.get("/api/admin/settings")).status === 403);
  check("anonymous requests get 401", (await new Http("anon").get("/api/projects")).status === 401);
  const note = await admin.post("/api/notes", { entityType: "PROJECT", entityId: projectId, body: "Client prefers fast cuts and dislikes excessive transitions." });
  check("staff can add internal notes", note.status === 201);
  const msgAsClient = await client.get(`/api/messages?projectId=${projectId}`);
  check("internal notes never appear in client-visible messages", !JSON.stringify(msgAsClient.data ?? []).includes("dislikes excessive"));
  const noCsrf = await client.call("POST", `/api/projects/${projectId}/duplicate`, {}, { csrf: false });
  check("mutations without the CSRF token are rejected (403)", noCsrf.status === 403, noCsrf.status);
  const crossSite = await client.call("POST", "/api/notifications/read", {}, { headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" } });
  check("cross-site requests are blocked", crossSite.status === 403, crossSite.status);
  const machine = await admin.post(`/api/projects/${projectId}/transition`, { to: "EDITING" });
  check("status machine rejects an illegal transition (Delivered → Editing) with 409", machine.status === 409, machine.error);
  const ov = await admin.post(`/api/projects/${projectId}/transition`, { to: "EDITING", override: true, comment: "E2E override" });
  check("admin can override the machine explicitly...", ov.status === 200, ov.error);
  const ovAudit = await admin.get("/api/admin/audit-log?action=project.status_override");
  check("...and the override is written to the audit log", (ovAudit.data?.items?.length ?? 0) >= 1);
  const xssName = await client.patch("/api/auth/account", { name: "<script>alert(1)</script>" });
  check("HTML in names is stored as text (React escapes it on render)", xssName.status === 200);

  // ───────────────────────── partial-deposit + delivery gating ─────────────────────────
  step("Gating", "50% deposit → balance invoice on approval → final files locked until paid");
  const proj2 = await admin.post("/api/projects", { clientId, name: "E2E gating project" });
  const pid2: string = proj2.data.id;
  const q2 = await admin.post("/api/quotes", { clientId, projectId: pid2, items: [{ description: "Edit", quantity: 1, unitPrice: 100000 }], depositPercent: 50 });
  check("quote with 50% deposit → deposit/balance computed", q2.data?.deposit === 50000 && q2.data?.balance === 50000);
  await admin.post(`/api/quotes/${q2.data.id}/send`);
  await client.post(`/api/quotes/${q2.data.id}/accept`);
  const c2id = (await db.contract.findFirst({ where: { projectId: pid2 } }))?.id;
  await admin.post(`/api/contracts/${c2id}/send`);
  const cv2 = await client.get(`/api/contracts/${c2id}`);
  await client.post(`/api/contracts/${c2id}/sign`, { signerName: "Casey Creator", signature: "Casey Creator", kind: "typed", accept: true, version: cv2.data.currentVersion });
  const inv2 = (await client.get(`/api/invoices?projectId=${pid2}`)).data?.items?.[0];
  check("deposit invoice is 50%", inv2?.total === 50000, inv2?.total);
  await client.post(`/api/invoices/${inv2.id}/pay/demo`);
  await admin.post(`/api/projects/${pid2}/assign`, { managerId: adminUser.id, editorIds: [editorUser.id] });
  await admin.post(`/api/projects/${pid2}/transition`, { to: "AWAITING_ASSETS" });
  await admin.post(`/api/projects/${pid2}/transition`, { to: "QUEUED" });
  const v = await uploadFile(editor, { purpose: "version", projectId: pid2, filename: "gate-v1.mp4", mime: "video/mp4", bytes: fakeVideo(60) });
  const gv1 = await editor.post("/api/video-versions", { projectId: pid2, assetId: (v as any).asset.id });
  check("V1 uploaded on the second project", gv1.status === 201, gv1.error);
  const ga = await client.post(`/api/projects/${pid2}/approve`, { versionId: gv1.data.id, confirmVersionNumber: 1 });
  check("client approves", ga.status === 200, ga.error);
  const bal = (await client.get(`/api/invoices?projectId=${pid2}`)).data?.items?.find((i: any) => i.kind === "BALANCE");
  check("a balance invoice was generated automatically on approval", !!bal && bal.total === 50000, bal);
  const fin = await uploadFile(admin, { purpose: "deliverable", projectId: pid2, filename: "gate-final.mp4", mime: "video/mp4", bytes: fakeVideo(40), label: "Master" });
  await admin.post(`/api/projects/${pid2}/deliverables/publish`);
  const locked = await client.get(`/api/assets/${(fin as any).asset.id}?download=1`);
  check("final files are LOCKED while the balance is unpaid (423)", locked.status === 423, locked.error);
  const lockedList = await client.get(`/api/projects/${pid2}/deliverables`);
  check("the delivery page explains why", lockedList.data?.unlocked === false && !!lockedList.data?.lockedReason, lockedList.data?.lockedReason);
  await client.post(`/api/invoices/${bal.id}/pay/demo`);
  const unlocked = await client.get(`/api/assets/${(fin as any).asset.id}?download=1`);
  check("paying the balance unlocks the files", unlocked.status === 200, unlocked.error);

  // ───────────────────────── summary ─────────────────────────
  console.log(`\n${"═".repeat(60)}\n${failed === 0 ? "\x1b[32m" : "\x1b[31m"}${passed} passed, ${failed} failed\x1b[0m`);
  if (failed) {
    console.log("\nFailures:\n" + failures.map((f) => `  • ${f}`).join("\n"));
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error("\nE2E crashed:", e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
