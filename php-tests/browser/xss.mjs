// Stored-XSS test in a real browser. Script payloads are stored through the API in every user-controlled field, then every page that can show
// them is opened as admin, client, editor and visitor. Nothing may execute (no dialog, no window.__xss), no inline handler or javascript: link
// may appear in the DOM, and the Content-Security-Policy must not have had to block anything (a violation would mean a payload reached the page
// unescaped even though the policy stopped it). Run: BASE=http://127.0.0.1:8092 node php-tests/browser/xss.mjs   (the demo data must be loaded)
import { BASE, check, launch, done } from "./lib.mjs";

const stamp = Date.now().toString(36);
const M = `XSS${stamp}`;
const PAY = [
  `"><img src=x onerror=window.__xss=1>`,
  `<script>window.__xss=1</script>`,
  `'><svg/onload=window.__xss=1>`,
  `</textarea></script><img src=x onerror=window.__xss=1>`,
  `<a href="javascript:window.__xss=1">click</a>`,
  `<iframe srcdoc="<script>parent.__xss=1</script>"></iframe>`,
  `{{constructor.constructor('window.__xss=1')()}}`,
  `\${window.__xss=1}`,
  `javascript:window.__xss=1`,
];
const { browser, errors } = await launch();

async function session(email, password = "demo-password-123") {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(e.violatedDirective + " " + (e.blockedURI || "") + " " + (e.sample || "")));
  });
  const page = await ctx.newPage();
  let dialogs = 0;
  page.on("dialog", async (d) => { dialogs++; await d.dismiss().catch(() => {}); });
  page.on("pageerror", (e) => errors.push(`pageerror ${email}: ${e.message}`));
  if (email) {
    const r = await ctx.request.post(BASE + "/api/auth/login", { data: { email, password } });
    if (r.status() !== 200) throw new Error(`login failed for ${email}: ${r.status()}`);
  }
  const csrf = async () => (await ctx.cookies()).find((c) => c.name === "fe_csrf")?.value ?? "";
  const call = async (method, path, data) => {
    const res = await ctx.request.fetch(BASE + path, { method, data, headers: { "x-csrf-token": await csrf(), "content-type": "application/json" } });
    let json = null; try { json = await res.json(); } catch {}
    return { status: res.status(), json, data: json?.data };
  };
  return { ctx, page, call, dialogs: () => dialogs };
}

const admin = await session("admin@demo.faizaneditspro.test");
const client = await session("client@demo.faizaneditspro.test");
const editor = await session("editor@demo.faizaneditspro.test");
const visitor = await session(null);

// ── find the fixtures ──
const projects = (await admin.call("GET", "/api/projects?pageSize=100")).data?.items ?? [];
const proj = projects.find((p) => p.status === "EDITING" && /client|Jordan|Northwind/i.test(JSON.stringify(p)) ) ?? projects.find((p) => p.status === "EDITING") ?? projects[0];
const me = (await client.call("GET", "/api/auth/session")).data.user;
const myProjects = (await client.call("GET", "/api/projects")).data?.items ?? [];
const myProj = myProjects.find((p) => p.status === "CLIENT_REVIEW") ?? myProjects.find((p) => p.status === "EDITING") ?? myProjects[0];
const versions = (await client.call("GET", `/api/projects/${myProj.id}/versions`)).data ?? [];
const myClient = (await admin.call("GET", "/api/clients?pageSize=100")).data?.items?.find((c) => JSON.stringify(c).includes(me.email) || JSON.stringify(c).includes(me.name)) ?? null;
console.log(`Fixtures: project ${myProj.id} (${myProj.status}), ${versions.length} version(s), client ${myClient?.id ?? "?"}`);

// ── inject ──
console.log("Injecting payloads");
let accepted = 0, tried = 0;
const inj = async (what, r) => { tried++; if (r.status >= 200 && r.status < 300) accepted++; else console.log(`    (${what}: ${r.status} ${JSON.stringify(r.json?.error ?? "").slice(0, 120)})`); };
PAY.forEach(() => {});
for (let i = 0; i < PAY.length; i++) {
  const t = `${M}-${i} ${PAY[i]}`;
  await inj("message", await client.call("POST", "/api/messages", { projectId: myProj.id, body: t }));
  await inj("admin message", await admin.call("POST", "/api/messages", { projectId: myProj.id, body: t }));
  await inj("note", await admin.call("POST", "/api/notes", { entityType: "PROJECT", entityId: myProj.id, body: t }));
  await inj("task", await admin.call("POST", "/api/tasks", { projectId: myProj.id, title: t }));
  await inj("contact", await visitor.call("POST", "/api/contact", { name: t.slice(0, 95), email: `x${i}${stamp}@example.test`, reason: "GENERAL", message: t + " — a longer body so it validates", t: Date.now() - 20000 }));
  if (versions[0]) await inj("video comment", await client.call("POST", `/api/video-versions/${versions[0].id}/comments`, { timecodeMs: 1000 + i * 100, comment: t }));
}
await inj("account name", await client.call("PATCH", "/api/auth/account", { name: `${M}-name ${PAY[0]}` }));
if (myClient) {
  await inj("company", await admin.call("PATCH", `/api/clients/${myClient.id}/company`, { name: `${M}-co ${PAY[1]}` }));
  await inj("brand kit", await client.call("PUT", `/api/clients/${myClient.id}/brand-kit`, { colors: [{ name: PAY[2].slice(0, 40), hex: "#112233" }], fonts: [{ name: PAY[3].slice(0, 60), usage: PAY[4].slice(0, 60) }], typographyRules: PAY[0], musicPreference: PAY[1], websiteUrl: "javascript:window.__xss=1", socialHandles: { instagram: PAY[2] } }));
}
await inj("project name", await admin.call("PATCH", `/api/projects/${myProj.id}`, { name: `${M}-proj ${PAY[2]}` }));
const assets = (await admin.call("GET", `/api/projects/${myProj.id}/assets`)).data?.items ?? [];
if (assets[0]) await inj("file name", await admin.call("PATCH", `/api/assets/${assets[0].id}`, { displayName: `${M}-file ${PAY[0]}` }));
await inj("quote", await admin.call("POST", "/api/quotes", { clientId: myClient?.id, projectId: myProj.id, title: `${M}-quote ${PAY[1]}`, items: [{ description: PAY[2], quantity: 1, unitPrice: 12345 }], notes: PAY[3] }));
await inj("meeting", await admin.call("POST", "/api/meetings", { title: `${M}-meet ${PAY[0]}`, startsAt: new Date(Date.now() + 86400000).toISOString(), endsAt: new Date(Date.now() + 90000000).toISOString(), type: "KICKOFF", clientId: myClient?.id }));
// a public inquiry whose URL-type answers are hostile
const form = (await visitor.call("GET", "/api/forms/inquiry")).data;
const urlKeys = form.sections.flatMap((s) => s.questions).filter((q) => q.type === "URL").map((q) => q.key);
const answers = {};
for (const s of form.sections) for (const q of s.questions) {
  if (!q.required) continue;
  answers[q.key] = q.type === "EMAIL" ? `xss${stamp}@example.test` : q.type === "TEXTAREA" ? `${M}-lead ${PAY[0]} and some more text to be long enough` : q.type === "SELECT" || q.type === "RADIO" ? q.options?.[0]?.value : q.type === "MULTI_SELECT" ? [q.options?.[0]?.value] : q.type === "NUMBER" || q.type === "CURRENCY" ? 3 : q.type === "URL" ? "https://example.com" : q.type === "PHONE" ? "+1 555 010 0100" : q.type === "DATE" ? "2027-01-01" : q.type === "COLOR" ? "#112233" : `${M}-ans ${PAY[1]}`;
}
for (const k of urlKeys) answers[k] = "javascript:window.__xss=1";
const hostileUrl = await visitor.call("POST", "/api/leads", { answers, t: Date.now() - 30000 });
check("a javascript: link in a URL field of the public inquiry is refused", hostileUrl.status === 422 || urlKeys.length === 0, `${hostileUrl.status} ${JSON.stringify(hostileUrl.json?.error ?? "").slice(0, 160)}`);
for (const k of urlKeys) answers[k] = "https://example.com";
await inj("lead", await visitor.call("POST", "/api/leads", { answers, t: Date.now() - 30000 }));
check(`payloads were stored (${accepted}/${tried} accepted)`, accepted >= tried * 0.8, `${accepted}/${tried}`);

// ── look ──
const base = (id, extra = "") => `${BASE}${extra}`;
const lists = {
  admin: ["/admin", "/admin/projects", `/admin/projects/${myProj.id}`, "/admin/clients", ...(myClient ? [`/admin/clients/${myClient.id}`] : []), "/admin/submissions", "/admin/messages", "/admin/tasks", "/admin/audit-log", "/admin/files", "/admin/revisions", "/admin/leads", "/admin/quotes", "/admin/calendar", "/admin/analytics", "/admin/team", "/admin/emails", "/admin/content", "/admin/forms", "/admin/automations", "/admin/payments", "/admin/invoices", "/admin/settings", ...(versions[0] ? [`/admin/projects/${myProj.id}/review/${versions[0].id}`] : [])],
  client: ["/dashboard", "/dashboard/projects", `/dashboard/projects/${myProj.id}`, "/dashboard/messages", "/dashboard/files", "/dashboard/brand-kit", "/dashboard/settings", "/dashboard/quotes", "/dashboard/invoices", ...(versions[0] ? [`/dashboard/projects/${myProj.id}/review/${versions[0].id}`] : [])],
  editor: ["/editor", "/editor/projects", `/editor/projects/${myProj.id}`, "/editor/tasks", "/editor/revisions", "/editor/files", ...(versions[0] ? [`/editor/projects/${myProj.id}/review/${versions[0].id}`] : [])],
  visitor: ["/", "/work", "/case-studies", "/blog", "/contact", "/faq", "/pricing", "/start-project", "/book"],
};
const actors = { admin, client, editor, visitor };
let pagesChecked = 0, markerSeen = 0;
for (const [who, urls] of Object.entries(lists)) {
  console.log(`Pages as ${who}`);
  const a = actors[who];
  for (const u of urls) {
    const before = a.dialogs();
    const r = await a.page.goto(BASE + u, { waitUntil: "load" });
    await a.page.waitForTimeout(500);
    const res = await a.page.evaluate(() => ({
      xss: window.__xss ?? null,
      csp: window.__csp,
      handlers: document.querySelectorAll("[onerror],[onload],[onclick],[onmouseover],[onfocus]").length,
      js: [...document.querySelectorAll("a[href],form[action],iframe[src]")].filter((n) => /^\s*(javascript|vbscript|data):/i.test(n.getAttribute("href") || n.getAttribute("action") || n.getAttribute("src") || "")).length,
      inlineScripts: [...document.querySelectorAll("script")].filter((s) => !s.src && !/ld\+json/.test(s.type)).length,
      iframes: document.querySelectorAll("iframe[srcdoc]").length,
      injected: document.querySelectorAll("img[src='x'], svg[onload]").length,
      marker: document.body.innerText.includes("XSS"),
      text: document.body.innerText.length,
    }));
    pagesChecked++;
    if (res.marker) markerSeen++;
    const ok = r.status() === 200 && res.xss === null && a.dialogs() === before && res.csp.length === 0 && res.handlers === 0 && res.js === 0 && res.inlineScripts === 0 && res.iframes === 0 && res.injected === 0;
    check(`${who} ${u} is clean`, ok, JSON.stringify({ status: r.status(), ...res }));
  }
}
console.log("Interactive widgets");
// global search and the notification bell render server text through JS
for (const [who, a, path] of [["admin", admin, "/admin"], ["client", client, "/dashboard"]]) {
  await a.page.goto(BASE + path, { waitUntil: "load" });
  const bell = a.page.locator('[aria-label*="otification" i]').first();
  if (await bell.count()) { await bell.click().catch(() => {}); await a.page.waitForTimeout(600); }
  await a.page.keyboard.press("Escape");
  await a.page.keyboard.press("Control+k").catch(() => {});
  await a.page.waitForTimeout(300);
  const input = a.page.locator('input[type=search], input[placeholder*="earch" i]').first();
  if (await input.count()) { await input.fill(M).catch(() => {}); await a.page.waitForTimeout(900); }
  const st = await a.page.evaluate(() => ({ xss: window.__xss ?? null, csp: window.__csp, text: document.body.innerText.includes("XSS") }));
  check(`${who}: notification bell and search show the payload text without running it`, st.xss === null && st.csp.length === 0 && a.dialogs() === 0, JSON.stringify(st));
}
// the review page builds its comment list in JS
if (versions[0]) {
  await client.page.goto(`${BASE}/dashboard/projects/${myProj.id}/review/${versions[0].id}`, { waitUntil: "load" });
  await client.page.waitForTimeout(900);
  const txt = await client.page.locator("body").innerText();
  check("the review page lists the hostile comments as text", txt.includes(`${M}-0`), txt.slice(0, 200));
  const flags = await client.page.evaluate(() => ({ xss: window.__xss ?? null, csp: window.__csp, imgs: document.querySelectorAll("img[onerror]").length }));
  check("...without running any of them", flags.xss === null && flags.csp.length === 0 && flags.imgs === 0 && client.dialogs() === 0, JSON.stringify(flags));
}
check(`the payload text was actually visible on pages (${markerSeen} of ${pagesChecked}) — the test is not vacuous`, markerSeen >= 12, markerSeen);
// restore the names we changed
await client.call("PATCH", "/api/auth/account", { name: me.name });
for (const a of Object.values(actors)) await a.ctx.close();
await browser.close();
done(errors.filter((e) => !/Failed to load resource/.test(e)));
