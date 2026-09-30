// Editor workspace through the real UI. Run: node php-tests/browser/editor.mjs
import { BASE, check, launch, done } from "./lib.mjs";
import { execFileSync } from "node:child_process";

const scenario = (stage) => JSON.parse(execFileSync("php", ["php-tests/scenario.php", stage], { env: { ...process.env, FEP_STRICT: "1", FEP_DISABLE_RATE_LIMIT: "1" }, cwd: process.cwd() }).toString().trim().split("\n").pop());
const { browser, errors } = await launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource.*(4\d\d)/.test(m.text())) errors.push("console: " + m.text()); });
const text = async () => await page.locator("body").innerText();
const settle = async (ms = 800) => { await page.waitForLoadState("load"); await page.waitForTimeout(ms); };
const S = scenario("review");

console.log("Sign in and home");
await page.goto(BASE + "/login", { waitUntil: "load" });
await page.fill("#f-email", S.editorEmail); await page.fill("#f-password", S.password);
await page.click("form[data-mode-form=password] button[type=submit]");
await page.waitForURL("**/editor", { timeout: 10000 });
let t = await text();
check("editor lands on 'My work'", t.includes("What's on your plate today") && t.includes("Active projects"), t.slice(0, 160));
check("the assigned project is listed", t.includes("Scenario"));
const links = await page.$$eval("aside nav a", (as) => [...new Set(as.map((a) => a.getAttribute("href")))]);
check("editor sidebar has only the editor areas (no admin links)", links.length === 5 && links.every((h) => h.startsWith("/editor")), links.join(","));
for (const href of [...links, "/editor/account"]) { const r = await page.goto(BASE + href, { waitUntil: "load" }); check(`${href} opens`, r.status() === 200 && (await page.locator("h1").count()) > 0); }

console.log("Project workspace (editor view)");
const base = `${BASE}/editor/projects/${S.projectId}`;
await page.goto(base, { waitUntil: "load" });
t = await text();
check("workspace shows the brief, files and video tabs", ["Brief", "Files", "Videos", "Revisions", "Tasks"].every((x) => t.includes(x)));
check("no Billing tab and no payment gate card for editors", !(await page.getByRole("link", { name: "Billing" }).count()) && !t.includes("Payment gates"));
check("editors can't reassign the team", (await page.locator("#team-editorIds").isDisabled()));
await page.goto(`${base}?tab=billing`, { waitUntil: "load" });
check("?tab=billing falls back to the overview (no billing data)", !(await text()).includes("New invoice"));

console.log("Upload a new version from a link");
await page.goto(`${base}?tab=videos`, { waitUntil: "load" });
const before = await page.locator('a[href*="/review/"]').count();
await page.fill("[data-vu-link]", "https://vimeo.com/76979871");
await page.fill("#vu-summary", "Tightened the intro");
await page.selectOption("#vu-rel", "draft");
await page.getByRole("button", { name: "Create version" }).click(); await settle(1200);
check("a new version is created", (await page.locator('a[href*="/review/"]').count()) > before, `${before} → ${await page.locator('a[href*="/review/"]').count()}`);

console.log("Review page");
await page.goto(`${base}/review`, { waitUntil: "load" });
t = await text();
check("review player page opens for the editor", t.includes("Notes") || t.includes("Comments") || (await page.locator("[data-fe-component=review]").count()) > 0, t.slice(0, 200));

console.log("Tasks and time");
await page.goto(`${BASE}/editor/tasks?new=1`, { waitUntil: "load" });
await page.waitForTimeout(400);
check("'new task' link opens the dialog", await page.locator("dialog#task-new[open]").count() > 0);
await page.fill("#task-new-form #f-title", "Export captions"); await page.click('dialog#task-new button[form="task-new-form"]'); await settle();
check("new task appears under My tasks", (await text()).includes("Export captions"));
await page.goto(`${base}?tab=time`, { waitUntil: "load" });
await page.fill("input[name=note]", "Rough cut"); await page.getByRole("button", { name: "Start timer" }).click(); await settle();
await page.goto(`${BASE}/editor`, { waitUntil: "load" });
check("running timer shows on 'My work'", (await page.locator("[data-timer]").count()) > 0);
await page.waitForTimeout(1500);
check("stopwatch ticks", !(await page.locator("[data-timer]").first().innerText()).startsWith("00:00:00"));
await page.getByRole("button", { name: "Stop" }).first().click(); await settle();
check("timer can be stopped", (await page.locator("[data-timer]").count()) === 0);

console.log("My account");
await page.goto(`${BASE}/editor/account`, { waitUntil: "load" });
await page.fill("#f-phone", "+92 300 1234567"); await page.getByRole("button", { name: "Save profile" }).click(); await page.waitForTimeout(900);
await page.reload({ waitUntil: "load" });
check("profile changes persist", (await page.locator("#f-phone").inputValue()) === "+92 300 1234567");

console.log("Mobile (375px)");
const mctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
const mp = await mctx.newPage();
await mp.goto(BASE + "/login", { waitUntil: "load" }); await mp.fill("#f-email", S.editorEmail); await mp.fill("#f-password", S.password);
await mp.click("form[data-mode-form=password] button[type=submit]"); await mp.waitForURL("**/editor");
for (const p of ["/editor", "/editor/projects", `/editor/projects/${S.projectId}`, "/editor/tasks", "/editor/revisions"]) {
  await mp.goto(BASE + p, { waitUntil: "load" });
  const over = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`no horizontal scroll at 375px on ${p}`, over <= 1, `overflow ${over}px`);
}
await browser.close();
done(errors);
