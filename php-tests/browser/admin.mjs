// Admin console + editor workspace, driven through the real UI. Run: node php-tests/browser/admin.mjs   (server: /tmp/start-php.sh, FEP_STRICT=1)
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
const S = scenario("review");
const { page, ctx } = await login(S.adminEmail, S.password);

console.log("Command center + navigation");
check("admin signs in to the command center", page.url().endsWith("/admin"));
let t = await text(page);
check("command center shows greeting, pipeline and stats", /Good (morning|afternoon|evening)/.test(t) && t.includes("Project pipeline") && t.includes("Active clients"), t.slice(0, 200));
const links = await page.$$eval("aside nav a", (as) => [...new Set(as.map((a) => a.getAttribute("href")))]);
check("sidebar lists every admin area", links.length >= 22, String(links.length));
const badLinks = [];
for (const href of links) {
  const r = await page.goto(BASE + href, { waitUntil: "load" });
  if (r.status() !== 200) badLinks.push(`${href}:${r.status()}`);
  const h1 = await page.locator("h1").first().innerText().catch(() => "");
  if (!h1) badLinks.push(`${href}:no-h1`);
}
check("every sidebar link opens a page with a heading", badLinks.length === 0, badLinks.join(", "));

console.log("Projects list, board and filters");
await page.goto(BASE + "/admin/projects", { waitUntil: "load" });
check("project table lists the scenario project", (await text(page)).includes("Scenario Project"));
await page.fill('input[name="q"]', "Scenario Project"); await page.click('form[action="/admin/projects"] button[type=submit]'); await page.waitForLoadState("load");
check("search narrows the list", page.url().includes("q=Scenario") && (await text(page)).includes("Scenario Project"));
await page.goto(BASE + "/admin/projects?view=board", { waitUntil: "load" });
check("board view shows pipeline columns and cards", /production/i.test(await text(page)) && (await page.locator("section[aria-label] ul li a").count()) > 0);

console.log("New project");
await page.goto(BASE + "/admin/projects/new", { waitUntil: "load" });
await page.selectOption("#f-clientId", S.clientId);
await page.fill("#f-name", "Browser-made project");
await page.fill("#f-description", "Created through the admin form");
await page.selectOption("#f-priority", "HIGH");
await page.click('form[data-fe-form="/api/projects"] button[type=submit]');
await page.waitForURL(/\/admin\/projects\/(?!new)[a-z0-9]+$/, { timeout: 10000 });
const newId = page.url().split("/").pop();
t = await text(page);
check("creating a project opens its workspace", t.includes("Browser-made project") && t.includes("Awaiting Quote") && t.includes("High"), t.slice(0, 200));

console.log("Workspace: edit, duplicate, team");
await page.getByRole("button", { name: "Edit project" }).click();
await page.fill("#project-edit-form #f-name", "Browser-made project (edited)");
await page.selectOption("#project-edit-form #f-priority", "URGENT");
await page.fill("#project-edit-form #f-deadline", "2031-05-20");
await page.click('#project-edit-form-submit, dialog#project-edit button[form="project-edit-form"]');
await page.waitForLoadState("load"); await page.waitForTimeout(600);
t = await text(page);
check("edited name, priority and deadline are saved", t.includes("(edited)") && t.includes("Urgent") && t.includes("May 20"), t.slice(0, 300));
await page.locator("#team-editorIds").selectOption({ label: "Scenario Editor" });
await page.getByRole("button", { name: "Save team" }).click();
await page.waitForTimeout(800);
check("assigning the editor shows a confirmation", (await page.locator("body").innerText()).includes("Team updated"));

console.log("Status control (legal steps, gate, override)");
check("only legal next steps are offered", (await page.locator("[data-status-to]:visible").count()) >= 1 && (await page.locator('[data-group="normal"] [data-status-to]').count()) <= 4);
await page.locator('[data-group="normal"] [data-status-to]').first().click();
await page.fill("#status-comment", "Moving on from the browser test");
await page.locator("[data-move-go]").click();
await page.waitForTimeout(900);
const gateText = await page.locator("#status-modal [data-gate]").innerText().catch(() => "");
check("a gated step is refused with a plain-language reason (payment/approval gate)", /quote|contract|payment|deposit/i.test(gateText), gateText);
check("admins are offered an override from the gate message", await page.locator("[data-override-go]").isVisible());
await page.locator("[data-override-go]").click();
await page.waitForLoadState("load"); await page.waitForTimeout(900);
t = await text(page);
check("overriding moves the project and records it", t.includes("Status history") && t.includes("override"), t.slice(0, 300));
await page.getByRole("button", { name: "Admin override" }).click();
check("override mode lists every other status", (await page.locator('[data-group="override"] [data-status-to]').count()) >= 10);

console.log("Tasks, notes, time, messages on the project");
const pid = S.projectId;
await page.goto(`${BASE}/admin/projects/${pid}?tab=tasks`, { waitUntil: "load" });
await page.getByRole("button", { name: "Add task" }).click();
await page.fill("#task-new-form #f-title", "Cut the intro tighter");
await page.click('dialog#task-new button[form="task-new-form"]');
await page.waitForLoadState("load"); await page.waitForTimeout(600);
check("a new task appears in the list", (await text(page)).includes("Cut the intro tighter"));
await page.locator('select[aria-label="Status"]').first().selectOption("IN_PROGRESS");
await page.waitForTimeout(700);
await page.reload({ waitUntil: "load" });
check("changing a task's status saves", (await page.locator('select[aria-label="Status"]').first().inputValue()) === "IN_PROGRESS");
await page.getByRole("button", { name: "Mark complete" }).first().click();
await page.waitForLoadState("load"); await page.waitForTimeout(700);
check("ticking a task completes it", (await page.locator("li .line-through").count()) > 0);

await page.goto(`${BASE}/admin/projects/${pid}?tab=notes`, { waitUntil: "load" });
await page.fill('textarea[name="body"]', "Client prefers warm colour grading");
await page.getByRole("button", { name: "Add note" }).click();
await page.waitForLoadState("load"); await page.waitForTimeout(600);
check("internal note is added", (await text(page)).includes("Client prefers warm colour grading"));
await page.getByRole("button", { name: "Pin note" }).first().click(); await page.waitForLoadState("load"); await page.waitForTimeout(500);
check("note can be pinned", (await text(page)).includes("pinned"));

await page.goto(`${BASE}/admin/projects/${pid}?tab=time`, { waitUntil: "load" });
await page.fill('form[data-fe-form="/api/time"] >> nth=1 >> input[name=minutes]', "45");
await page.locator('form[data-fe-form="/api/time"] >> nth=1').getByRole("button", { name: "Add" }).click();
await page.waitForLoadState("load"); await page.waitForTimeout(600);
check("manual time entry is logged", (await text(page)).includes("0h 45m"));
await page.fill('input[name=note]', "Colour pass");
await page.getByRole("button", { name: "Start timer" }).click(); await page.waitForLoadState("load"); await page.waitForTimeout(600);
check("timer starts (Stop button + live clock)", (await page.getByRole("button", { name: /Stop/ }).count()) > 0);
await page.getByRole("button", { name: /Stop/ }).first().click(); await page.waitForLoadState("load"); await page.waitForTimeout(500);

await page.goto(`${BASE}/admin/projects/${pid}?tab=messages`, { waitUntil: "load" });
await page.fill("#msg-body", "Draft two is on the way");
await page.getByRole("button", { name: "Send message" }).click();
await page.waitForTimeout(900);
check("staff reply appears in the thread", (await text(page)).includes("Draft two is on the way"));

console.log("Workspace tabs all render");
for (const tab of ["overview", "brief", "files", "videos", "revisions", "tasks", "messages", "billing", "delivery", "time", "activity", "notes"]) {
  const r = await page.goto(`${BASE}/admin/projects/${pid}?tab=${tab}`, { waitUntil: "load" });
  check(`tab ${tab} renders`, r.status() === 200 && (await page.locator("h1").count()) > 0);
}

await ctx.close();
await browser.close();
done(errors);
