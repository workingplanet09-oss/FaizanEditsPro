// Admin console, part 2: billing builders, CRM, calendar, content, forms, automations, team, settings, exports, RBAC, mobile.
import { BASE, check, launch, done } from "./lib.mjs";
import { execFileSync } from "node:child_process";

const scenario = (stage) => JSON.parse(execFileSync("php", ["php-tests/scenario.php", stage], { env: { ...process.env, FEP_STRICT: "1", FEP_DISABLE_RATE_LIMIT: "1" }, cwd: process.cwd() }).toString().trim().split("\n").pop());
const { browser, errors } = await launch();
async function login(email, password, width = 1280, expect = "**/admin") {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource.*(4\d\d)/.test(m.text())) errors.push("console: " + m.text()); });
  await page.goto(BASE + "/login", { waitUntil: "load" });
  await page.fill("#f-email", email); await page.fill("#f-password", password);
  await page.click("form[data-mode-form=password] button[type=submit]");
  await page.waitForURL(expect, { timeout: 10000 });
  return { ctx, page };
}
const text = async (page) => await page.locator("body").innerText();
const settle = async (page, ms = 800) => { await page.waitForLoadState("load"); await page.waitForTimeout(ms); };
const S = scenario("quote");
const { page, ctx } = await login(S.adminEmail, S.password);

console.log("Quote builder");
await page.goto(`${BASE}/admin/quotes/new?clientId=${S.clientId}&projectId=${S.projectId}`, { waitUntil: "load" });
check("builder preselects the client and project", (await page.locator('[data-doc="clientId"]').inputValue()) === S.clientId && (await page.locator('[data-doc="projectId"]').inputValue()) === S.projectId);
check("save buttons are disabled until there is a line item", await page.locator('[data-doc-save="send"]').isDisabled());
await page.fill('[data-k="description"]', "Brand film edit");
await page.fill('[data-k="quantity"]', "2");
await page.fill('[data-k="price"]', "400");
await page.fill('[data-doc="discount"]', "100");
await page.fill('[data-doc="tax"]', "10");
await page.fill('[data-doc="deposit"]', "50");
await page.waitForTimeout(200);
let t = await page.locator("[data-preview]").innerText();
check("live preview computes subtotal, discount, tax and total", t.includes("$800.00") && t.includes("$100.00") && t.includes("$770.00"), t);
check("deposit and balance are shown for quotes", t.includes("$385.00"), t);
await page.getByRole("button", { name: "Add line" }).click();
await page.locator('[data-row="1"] [data-k="description"]').fill("Motion graphics pack");
await page.locator('[data-row="1"] [data-k="price"]').fill("150");
await page.waitForTimeout(150);
t = await page.locator("[data-preview]").innerText();
check("a second line updates the totals", t.includes("$950.00"), t);
await page.getByRole("button", { name: "Save as draft" }).click();
await page.waitForURL(/\/admin\/quotes\/(?!new)[a-z0-9]+$/, { timeout: 10000 });
t = await text(page);
check("saving as a draft opens the quote (Draft badge, line items)", t.includes("Draft") && t.includes("Brand film edit") && t.includes("Motion graphics pack"), t.slice(0, 200));
const quoteUrl = page.url();
await page.getByRole("button", { name: "Send to client" }).click(); await settle(page);
check("sending moves it to Sent", (await text(page)).includes("Sent"));
await page.goto(quoteUrl + "?edit=1", { waitUntil: "load" });
check("editing reopens the builder with the saved lines", (await page.locator('[data-row="0"] [data-k="description"]').inputValue()) === "Brand film edit");

console.log("Invoice builder, send and offline payment");
await page.goto(`${BASE}/admin/invoices/new?clientId=${S.clientId}&projectId=${S.projectId}`, { waitUntil: "load" });
await page.fill('[data-k="description"]', "Extra 9:16 cut-down");
await page.fill('[data-k="price"]', "250");
await page.waitForTimeout(150);
await page.getByRole("button", { name: "Send to client" }).click();
await page.waitForURL(/\/admin\/invoices\/(?!new)[a-z0-9]+$/, { timeout: 10000 });
t = await text(page);
check("invoice is created and sent", t.includes("Sent") && t.includes("$250.00"), t.slice(0, 200));
await page.getByRole("button", { name: "Record payment" }).click();
await page.fill("#record-payment-form #f-amount", "100");
await page.fill("#record-payment-form #f-reference", "TX-42");
await page.click('dialog#record-payment button[form="record-payment-form"]'); await settle(page, 1000);
t = await text(page);
check("offline payment marks the invoice partially paid", t.includes("Partially paid") && t.includes("$150.00 outstanding"), t.slice(0, 300));
await page.goto(`${BASE}/admin/payments`, { waitUntil: "load" });
check("payments list shows the recorded payment", (await text(page)).includes("$100.00"));

console.log("Contact form → submissions → lead → convert");
const csrf = (await ctx.cookies()).find((c) => c.name === "fe_csrf")?.value ?? "";
const uniq = Date.now();
const sub = await page.request.post(`${BASE}/api/contact`, { data: { name: "Lena Lead", email: `lena.${uniq}@example.com`, company: "Lead Co", reason: "PROJECT", message: "I need a weekly YouTube edit for my channel", t: Date.now() - 9000 }, headers: { "x-csrf-token": csrf } });
check("contact form message is accepted", sub.status() === 201, String(sub.status()));
await page.goto(`${BASE}/admin/submissions`, { waitUntil: "load" });
check("submission is listed as New", (await text(page)).includes("Lena Lead") && (await text(page)).includes("I need a weekly YouTube edit"));
await page.locator('li:has-text("Lena Lead")').first().getByRole("button", { name: "Create lead" }).click(); await settle(page, 900);
check("creating the lead removes it from 'To handle'", !(await text(page)).includes("Lena Lead"));
await page.goto(`${BASE}/admin/submissions?tab=all`, { waitUntil: "load" });
await page.locator('li:has-text("Lena Lead")').first().getByRole("link", { name: "Open lead" }).click(); await page.waitForLoadState("load");
check("lead page shows details and the activity timeline", (await text(page)).includes("Lena Lead") && (await text(page)).includes("Activity timeline"), (await text(page)).slice(0, 200));
await page.selectOption("#lc-status", "CONTACTED"); await page.waitForTimeout(700);
await page.reload({ waitUntil: "load" });
check("changing lead status saves", (await page.locator("#lc-status").inputValue()) === "CONTACTED");
await page.selectOption("#lc-temperatureOverride", "HOT"); await page.waitForTimeout(700); await page.reload({ waitUntil: "load" });
check("temperature can be overridden (and is marked)", (await text(page)).includes("Hot ✎"));
await page.fill("#f-title", "Called — wants a quote");
await page.getByRole("button", { name: "Log activity" }).click(); await settle(page);
check("activity is logged on the timeline", (await text(page)).includes("Called — wants a quote"));
await page.getByRole("button", { name: "Convert to client" }).click();
await page.click('dialog#lead-convert button[form="lead-convert-form"]');
await page.waitForURL(/\/admin\/projects\/(?!new)[a-z0-9]+$/, { timeout: 10000 }).catch(() => {});
check("converting creates the client + project and opens the project", /\/admin\/projects\/[a-z0-9]+$/.test(page.url()), page.url());

console.log("Clients");
await page.goto(`${BASE}/admin/clients/new`, { waitUntil: "load" });
await page.fill("#f-name", "Nadia Newclient"); await page.fill("#f-email", `nadia.${Date.now()}@example.com`); await page.fill("#f-companyName", "Newclient Studio");
await page.click('form[data-fe-form="/api/clients"] button[type=submit]');
await page.waitForURL(/\/admin\/clients\/(?!new)[a-z0-9]+$/, { timeout: 10000 });
check("new client opens its detail page", (await text(page)).includes("Newclient Studio"));
await page.selectOption("#client-status", "ACTIVE"); await page.waitForTimeout(700);
await page.reload({ waitUntil: "load" });
check("client status change saves", (await page.locator("#client-status").inputValue()) === "ACTIVE");
await page.getByRole("button", { name: "Edit", exact: true }).click();
await page.fill("#client-edit-form #f-industry", "Podcasting");
await page.click('dialog#client-edit button[form="client-edit-form"]'); await settle(page, 900);
await page.goto(page.url().split("?")[0], { waitUntil: "load" });
check("edited client details are saved", (await text(page)).includes("Podcasting"));
for (const tab of ["projects", "billing", "files", "messages", "notes"]) { const r = await page.goto(page.url().split("?")[0] + "?tab=" + tab, { waitUntil: "load" }); check(`client tab ${tab} renders`, r.status() === 200); }

console.log("Calendar: schedule a call");
await page.goto(`${BASE}/admin/calendar`, { waitUntil: "load" });
await page.getByRole("button", { name: "Schedule call" }).click();
await page.fill("#schedule-call-form #f-title", "Kickoff call with Nadia");
const when = new Date(Date.now() + 2 * 86400000); when.setHours(15, 0, 0, 0);
const localValue = new Date(when.getTime() - when.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
await page.fill("#schedule-call-form #f-when", localValue);
await page.click('dialog#schedule-call button[form="schedule-call-form"]'); await settle(page, 900);
const ymd = localValue.slice(0, 10);
await page.goto(`${BASE}/admin/calendar?view=day&date=${ymd}`, { waitUntil: "load" });
check("the call shows on its day", (await text(page)).includes("Kickoff call with Nadia"), (await text(page)).slice(0, 200));

console.log("Website content (CMS)");
await page.goto(`${BASE}/admin/content?r=faqs`, { waitUntil: "load" });
await page.getByRole("button", { name: "Add faq" }).first().click();
await page.locator("dialog[open] input").first().fill("Do you offer rush delivery?");
await page.locator("dialog[open] textarea").first().fill("Yes — 24-hour turnaround for an extra fee.");
await page.locator("dialog[open]").getByRole("button", { name: "Create faq" }).click(); await settle(page, 900);
check("new FAQ appears in the list", (await text(page)).includes("Do you offer rush delivery?"), (await text(page)).slice(0, 300));
await page.getByRole("button", { name: /Unpublish|Publish/ }).first().click(); await settle(page, 800);
await page.getByRole("button", { name: "Delete" }).first().click();
await page.getByRole("button", { name: "Delete", exact: true }).last().click(); await settle(page, 900);
for (const r of ["services", "pricing-plans", "portfolio", "case-studies", "testimonials", "blog-posts", "blog-categories", "kb-articles", "project-types", "project-templates", "email-templates"]) {
  const resp = await page.goto(`${BASE}/admin/content?r=${r}`, { waitUntil: "load" });
  check(`content type ${r} lists`, resp.status() === 200 && (await page.locator("[data-fe-component=cms-manager] > div").count()) > 0);
}
await page.goto(`${BASE}/admin/content?r=services`, { waitUntil: "load" });
await page.getByRole("button", { name: "Edit" }).first().click();
check("editor dialog lists the service fields", (await page.locator("dialog[open] label").count()) > 8);
await page.keyboard.press("Escape");

console.log("Project form builder");
await page.goto(`${BASE}/admin/forms`, { waitUntil: "load" });
const before = await page.locator("[data-fe-component=form-builder] li[data-id]").count();
await page.getByRole("button", { name: "Add question" }).click();
await page.locator("dialog[open] input").first().fill("What is your favourite editing style?");
await page.locator("dialog[open]").getByRole("button", { name: "Add question" }).click(); await settle(page, 900);
check("a new question is added to the section", (await page.locator("[data-fe-component=form-builder] li[data-id]").count()) === before + 1 && (await text(page)).includes("What is your favourite editing style?"));
await page.locator('li[data-id]:has-text("favourite editing style") [data-act="del"]').click();
await page.getByRole("button", { name: "Delete question" }).click(); await settle(page, 900);
check("the question can be deleted again", !(await text(page)).includes("favourite editing style"));

console.log("Automations");
await page.goto(`${BASE}/admin/automations`, { waitUntil: "load" });
await page.getByRole("button", { name: "New automation" }).click();
await page.locator("dialog[open] input").first().fill("Notify team of approvals");
await page.locator('dialog[open] select[aria-label="Action type"]').selectOption("ADMIN_ALERT");
await page.locator("dialog[open]").getByLabel("Title").fill("A project was approved");
await page.locator("dialog[open]").getByRole("button", { name: "Create automation" }).click(); await settle(page, 900);
check("automation is created and listed", (await text(page)).includes("Notify team of approvals"), (await text(page)).slice(0, 300));
const sw = page.locator('li:has-text("Notify team of approvals") [data-act="toggle"]');
const was = await sw.getAttribute("aria-checked"); await sw.click(); await settle(page, 700);
check("automation can be switched off/on", (await page.locator('li:has-text("Notify team of approvals") [data-act="toggle"]').getAttribute("aria-checked")) !== was);
await page.locator('li:has-text("Notify team of approvals") [data-act="del"]').click();
await page.getByRole("button", { name: "Delete", exact: true }).last().click(); await settle(page, 900);
check("automation can be deleted", !(await text(page)).includes("Notify team of approvals"));

console.log("Team");
await page.goto(`${BASE}/admin/team`, { waitUntil: "load" });
await page.getByRole("button", { name: "Invite teammate" }).click();
await page.locator("dialog[open] input").nth(0).fill("Tess Teammate"); await page.locator("dialog[open] input[type=email]").fill(`tess.${Date.now()}@example.com`);
await page.locator("dialog[open]").getByRole("button", { name: "Send invite" }).click(); await settle(page, 900);
check("invited teammate appears as Invited", (await text(page)).includes("Tess Teammate") && (await text(page)).includes("Invited"));

console.log("Settings");
await page.goto(`${BASE}/admin/settings?g=business`, { waitUntil: "load" });
const tag = page.locator("[data-fe-component=settings-editor] input").nth(2);
const newTag = "Video editing for creators — " + Date.now();
await page.getByLabel("Tagline").fill(newTag);
check("unsaved changes are flagged", (await text(page)).includes("unsaved changes"));
await page.getByRole("button", { name: "Save settings" }).click(); await page.waitForTimeout(900);
await page.reload({ waitUntil: "load" });
check("saved setting persists after reload", (await page.getByLabel("Tagline").inputValue()) === newTag);
await page.goto(`${BASE}/admin/settings`, { waitUntil: "load" });
check("integrations board lists storage, payments and email", /Payments/.test(await text(page)) && /Email/.test(await text(page)));

console.log("Exports, audit log, emails, analytics");
const csv = await page.request.get(`${BASE}/api/admin/exports/leads`);
check("CSV export downloads as text/csv", csv.status() === 200 && (csv.headers()["content-type"] || "").includes("text/csv"), String(csv.status()));
await page.goto(`${BASE}/admin/audit-log`, { waitUntil: "load" });
check("audit log lists recorded actions", (await page.locator("table tbody tr").count()) > 0);
await page.goto(`${BASE}/admin/emails`, { waitUntil: "load" });
check("email outbox page renders", (await text(page)).includes("Email outbox"));
await page.goto(`${BASE}/admin/analytics`, { waitUntil: "load" });
check("analytics renders charts or an honest empty state", (await page.locator("svg[role=img]").count()) > 0 || (await text(page)).includes("No data available yet"));

await ctx.close();

console.log("Access control");
const ed = await login(S.editorEmail, S.password, 1280, "**/editor");
await ed.page.goto(`${BASE}/admin`, { waitUntil: "load" });
check("editor is sent away from the admin console", ed.page.url().endsWith("/editor"), ed.page.url());
for (const p of ["/admin/settings", "/admin/invoices", "/admin/team", "/admin/clients"]) { await ed.page.goto(BASE + p, { waitUntil: "load" }); check(`editor cannot open ${p}`, !ed.page.url().includes(p), ed.page.url()); }
const api1 = await ed.page.request.get(`${BASE}/api/admin/exports/clients`); check("editor cannot export clients", api1.status() === 403, String(api1.status()));
const api2 = await ed.page.request.get(`${BASE}/api/invoices`); check("editor cannot list invoices", [401, 403].includes(api2.status()), String(api2.status()));
await ed.page.goto(`${BASE}/editor/projects/${S.projectId}`, { waitUntil: "load" });
check("editor cannot open a project they aren't assigned to", (await text(ed.page)).includes("couldn't find") || ed.page.url() !== `${BASE}/editor/projects/${S.projectId}`, ed.page.url());
await ed.ctx.close();

console.log("Mobile (375px)");
const m = await login(S.adminEmail, S.password, 375);
for (const p of ["/admin", "/admin/projects", `/admin/projects/${S.projectId}`, "/admin/leads", "/admin/quotes/new", "/admin/calendar", "/admin/settings?g=business", "/admin/content"]) {
  await m.page.goto(BASE + p, { waitUntil: "load" });
  const over = await m.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`no horizontal scroll at 375px on ${p}`, over <= 1, `overflow ${over}px`);
}
await m.page.goto(BASE + "/admin", { waitUntil: "load" });
check("sidebar is hidden and the menu button opens a drawer", !(await m.page.locator("aside").first().isVisible()) );
await m.page.getByRole("button", { name: "Open menu" }).click(); await m.page.waitForTimeout(400);
check("drawer lists navigation", (await m.page.locator("#mobile-nav a").count()) > 15);
await m.ctx.close();
await browser.close();
done(errors);
