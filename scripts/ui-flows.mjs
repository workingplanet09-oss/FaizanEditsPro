/**
 * Browser-level checks for admin workflows that the API-only E2E can't see: forms, modals, redirects, toasts.
 * Needs the app on :3000 with demo data and DISABLE_RATE_LIMIT=true.   node scripts/ui-flows.mjs
 */
import { chromium } from "playwright-core";
const base = process.env.BASE ?? "http://localhost:3000";
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "  ✓" : "  ✗"} ${name}${cond ? "" : ` ${extra}`}`); };

/** Runs an action and waits for the mutation it triggers to finish (instead of guessing with sleeps). */
async function mutate(page, action, method, urlPart) {
  // urlPart narrows the wait to one endpoint — needed when other requests (an upload finishing, say) can complete while the action is still waiting to run
  const done = page.waitForResponse((r) => r.request().method() !== "GET" && r.url().includes("/api/") && (!method || r.request().method() === method) && (!urlPart || r.url().includes(urlPart)), { timeout: 60000 }).catch(() => null);
  await action();
  const r = await done;
  await page.waitForTimeout(300);
  return r;
}

async function as(who) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
  if (who.includes("@")) await page.request.post(`${base}/api/auth/login`, { data: { email: who, password: "demo-password-123" }, headers: { "content-type": "application/json" } });
  else await page.request.post(`${base}/api/auth/demo`, { data: { kind: who } });
  return { page, errors, ctx };
}

// ─── 1. Invoice: create → send → record offline payment → paid ───
{
  console.log("\nInvoice flow (admin)");
  const { page, errors, ctx } = await as("admin");
  await page.goto(`${base}/admin/invoices/new`, { waitUntil: "networkidle" });
  await page.getByLabel(/^Client/).selectOption({ label: "Arcadia Software" }).catch(async () => { const opts = await page.getByLabel(/^Client/).locator("option").allTextContents(); await page.getByLabel(/^Client/).selectOption({ index: opts.findIndex((o) => /Arcadia/.test(o)) }); });
  await page.getByLabel("Description").first().fill("Extra motion graphics pass");
  await page.getByLabel("Unit price").first().fill("300");
  ok("preview shows total", await page.getByText("$300.00").first().isVisible());
  await page.getByRole("button", { name: /Send to client/ }).click();
  await page.waitForURL(/\/admin\/invoices\/(?!new)[a-z0-9]+$/, { timeout: 15000 }).catch(() => {});
  ok("redirected to the invoice", /\/admin\/invoices\/(?!new)[a-z0-9]+$/.test(page.url()), page.url());
  await page.waitForLoadState("networkidle");
  ok("invoice shows as sent", await page.locator("main").getByText(/^Sent$/).first().isVisible().catch(() => false));
  await page.getByRole("button", { name: "Record payment" }).click();
  const dlg = page.getByRole("dialog");
  ok("payment dialog opens", await dlg.isVisible());
  await dlg.getByLabel(/Amount/).fill("300");
  await dlg.getByLabel(/Method/).fill("Bank transfer");
  await mutate(page, () => dlg.getByRole("button", { name: /Record|Save|Add/ }).last().click());
  await page.reload({ waitUntil: "networkidle" });
  ok("invoice is now paid", await page.locator("main").getByText(/^Paid$/).first().isVisible().catch(() => false));
  ok("no console errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// ─── 2. Form builder: add a question, see it listed, then delete it ───
{
  console.log("\nForm builder (admin)");
  const { page, errors, ctx } = await as("admin");
  await page.goto(`${base}/admin/forms`, { waitUntil: "networkidle" });
  ok("forms page lists questions", (await page.locator("main").innerText()).length > 200);
  const text = `UI test question ${Date.now().toString(36)}`;
  await page.getByRole("button", { name: /Add question/ }).first().click();
  const dlg = page.getByRole("dialog");
  ok("question editor opens", await dlg.isVisible());
  await dlg.getByLabel(/^Question/).fill(text);
  await mutate(page, () => dlg.getByRole("button", { name: /^(Save|Add question|Create)/ }).last().click());
  await page.reload({ waitUntil: "networkidle" });
  ok("new question is listed", await page.getByText(text).first().isVisible().catch(() => false));
  await page.getByRole("button", { name: "Delete" }).first().isVisible().catch(() => {});
  const row = page.locator("li", { hasText: text }).first();
  await row.getByRole("button", { name: "Delete" }).click();
  await mutate(page, () => page.getByRole("dialog").getByRole("button", { name: /Delete|Remove|Confirm/ }).last().click());
  await page.reload({ waitUntil: "networkidle" });
  const left = await page.getByText(text).count();
  ok("question can be deleted", left === 0, `${left} matches still on the page`);
  ok("no console errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// ─── 2b. Automations: create, toggle, delete ───
{
  console.log("\nAutomations (admin)");
  const { page, errors, ctx } = await as("admin");
  await page.goto(`${base}/admin/automations`, { waitUntil: "networkidle" });
  const name = `UI test automation ${Date.now().toString(36)}`;
  await page.getByRole("button", { name: "New automation" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel(/^Name/).fill(name);
  await dlg.getByLabel("Action type").selectOption("NOTIFICATION");
  await dlg.getByLabel(/^Title/).fill("Hello from a UI test");
  await mutate(page, () => dlg.getByRole("button", { name: /^(Save|Create)/ }).last().click());
  await page.reload({ waitUntil: "networkidle" });
  ok("automation is listed", await page.getByText(name).first().isVisible().catch(() => false));
  const sw = page.getByRole("switch", { name: new RegExp(`${name} enabled`) });
  const before = await sw.getAttribute("aria-checked");
  await mutate(page, () => sw.click());
  await page.reload({ waitUntil: "networkidle" });
  ok("toggle persists", (await page.getByRole("switch", { name: new RegExp(`${name} enabled`) }).getAttribute("aria-checked")) !== before);
  await page.getByRole("button", { name: `Delete ${name}` }).click();
  await mutate(page, () => page.getByRole("dialog").getByRole("button", { name: /Delete|Remove|Confirm/ }).last().click());
  await page.reload({ waitUntil: "networkidle" });
  ok("automation can be deleted", !(await page.getByText(name).first().isVisible().catch(() => false)));
  ok("no console errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// ─── 3. Quote → contract → signature, all in the client portal ───
{
  console.log("\nQuote, contract and signature (client)");
  const { page, errors, ctx } = await as("robert@demo.faizaneditspro.test");
  await page.goto(`${base}/dashboard/quotes`, { waitUntil: "networkidle" });
  await page.locator('a[href^="/dashboard/quotes/"]').first().click();
  await page.waitForURL(/\/dashboard\/quotes\/[a-z0-9]+$/);
  const accept = page.getByRole("button", { name: "Accept quote" });
  if (await accept.isVisible().catch(() => false)) {
    await accept.click();
    await page.waitForURL(/\/dashboard\/(contracts|projects)\//, { timeout: 20000 }).catch(() => {});
    ok("accepting the quote leads to the next step", /\/dashboard\/(contracts|projects)\//.test(page.url()), page.url());
  } else console.log("  · quote already accepted on an earlier run — continuing with its contract");
  await page.goto(`${base}/dashboard/projects`, { waitUntil: "networkidle" });
  await page.locator('a[href^="/dashboard/projects/"]').first().click();
  await page.waitForLoadState("networkidle");
  ok("client can see where the project stands", /agreement|contract|quote/i.test(await page.locator("main").innerText()));
  // the studio reviews the draft and sends it
  const adm = await as("admin");
  await adm.page.goto(`${base}/admin/contracts`, { waitUntil: "networkidle" });
  await adm.page.locator("tr", { hasText: "Meridian" }).first().locator("a").first().click();
  await adm.page.waitForURL(/\/admin\/contracts\/(?!new)[a-z0-9]+$/);
  const sendBtn = adm.page.getByRole("button", { name: "Send for signature" });
  if (await sendBtn.isVisible().catch(() => false)) {
    await mutate(adm.page, () => sendBtn.click());
    await adm.page.reload({ waitUntil: "networkidle" });
    ok("admin sent the contract", (await adm.page.locator("main").innerText()).includes("Awaiting signature"));
  } else console.log("  · contract already sent/signed on an earlier run (reseed to replay from scratch)");
  await adm.ctx.close();
  await page.goto(`${base}/dashboard/contracts`, { waitUntil: "networkidle" });
  await page.locator('a[href^="/dashboard/contracts/"]').first().click();
  await page.waitForURL(/\/dashboard\/contracts\/[a-z0-9]+$/);
  await page.waitForLoadState("networkidle");
  const signBtn = page.getByRole("button", { name: "Sign contract" });
  if (!(await signBtn.isVisible().catch(() => false))) { console.log("  · already signed — skipping the signature steps"); ok("contract shows as signed", await page.locator("main").getByText(/Signed/).first().isVisible()); await ctx.close(); } else {
  ok("contract offers a signature form", await signBtn.isVisible());
  ok("cannot sign before agreeing", await signBtn.isDisabled());
  await page.getByLabel("Full legal name").fill("Robert Hale");
  await page.getByLabel("Type your signature").fill("Robert Hale");
  await page.getByText("I have read and agree").click();
  ok("sign button enables when the form is complete", await signBtn.isEnabled());
  await mutate(page, () => signBtn.click());
  await page.reload({ waitUntil: "networkidle" });
  ok("contract now shows as signed", await page.locator("main").getByText(/Signed/).first().isVisible().catch(() => false));
  ok("no console errors", errors.length === 0, errors.join(" | "));
  await ctx.close(); }

  const a = await as("admin");
  await a.page.goto(`${base}/admin/contracts`, { waitUntil: "networkidle" });
  ok("admin sees the signed contract", (await a.page.locator("main").innerText()).includes("Meridian"));
  await a.ctx.close();
}

// ─── 4. Editor uploads a new version; the client can then see it ───
{
  console.log("\nVersion upload (editor → client)");
  const { page, errors, ctx } = await as("editor");
  await page.goto(`${base}/editor/projects`, { waitUntil: "networkidle" });
  await page.locator("tr", { hasText: "Episode 42" }).first().locator("a").first().click();
  await page.waitForURL(/\/editor\/projects\/[a-z0-9]+$/);
  const projectUrl = page.url();
  await page.goto(`${projectUrl}?tab=videos`, { waitUntil: "networkidle" });
  const before = await page.locator("main").getByText(/^V\d+$/).count();
  // the upload is finished when the app has confirmed it (signed PUT, then POST …/complete) — not when some text happens to appear
  const uploadDone = page.waitForResponse((r) => r.request().method() === "POST" && /\/api\/assets\/[^/]+\/complete$/.test(new URL(r.url()).pathname), { timeout: 60000 });
  await page.locator('input[type="file"]').first().setInputFiles("public/demo/podcast-clip.mp4");
  const uploaded = await uploadDone;
  ok("the upload is confirmed by the server", uploaded.ok(), `HTTP ${uploaded.status()}`);
  await page.getByLabel("What changed?").fill("Re-balanced guest audio and tightened the intro");
  const created = await mutate(page, () => page.getByRole("button", { name: "Create version" }).click(), "POST", "/versions");
  ok("the version request succeeded", !!created && created.ok(), created ? `HTTP ${created.status()}` : "no response");
  await page.reload({ waitUntil: "networkidle" });
  const after = await page.locator("main").getByText(/^V\d+$/).count();
  ok("a new version appears in the list", after > before, `before=${before} after=${after}`);
  const labels = (await page.locator("main").innerText()).match(/\bV(\d+)\b/g) ?? [];
  var newest = Math.max(0, ...labels.map((l) => Number(l.slice(1))));
  ok("no console errors", errors.length === 0, errors.join(" | "));
  await ctx.close();

  const c = await as("mia@demo.faizaneditspro.test");
  await c.page.goto(`${base}/dashboard/projects`, { waitUntil: "networkidle" });
  await c.page.locator('a[href^="/dashboard/projects/"]', { hasText: "Episode 42" }).first().click();
  await c.page.waitForURL(/\/dashboard\/projects\/[a-z0-9]{10,}/);
  await c.page.waitForLoadState("networkidle");
  ok(`client is asked to review the new version (V${newest})`, (await c.page.locator("main").innerText()).includes(`Review V${newest}`));
  await c.ctx.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
