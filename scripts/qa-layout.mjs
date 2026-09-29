/**
 * Layout QA across viewports: horizontal overflow, console errors, images without alt, unlabeled controls,
 * buttons/links with no accessible name, heading and landmark structure.
 *   node scripts/qa-layout.mjs [--dark]      (app on :3000, demo data loaded, DISABLE_RATE_LIMIT=true)
 */
import { chromium } from "playwright-core";
const base = process.env.BASE ?? "http://localhost:3000";
const dark = process.argv.includes("--dark");
const VIEWPORTS = [["mobile", 375, 800], ["tablet", 820, 1100], ["desktop", 1440, 900]];
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });

const PUBLIC = ["/", "/services", "/work", "/case-studies", "/process", "/pricing", "/about", "/blog", "/faq", "/contact", "/book", "/help", "/start-project", "/login", "/register", "/forgot-password", "/privacy", "/terms"];
const CLIENT = ["/dashboard", "/dashboard/projects", "/dashboard/quotes", "/dashboard/contracts", "/dashboard/invoices", "/dashboard/retainers", "/dashboard/files", "/dashboard/messages", "/dashboard/brand-kit", "/dashboard/settings"];
const ADMIN = ["/admin", "/admin/leads", "/admin/clients", "/admin/projects", "/admin/projects?view=board", "/admin/quotes", "/admin/invoices", "/admin/payments", "/admin/contracts", "/admin/retainers", "/admin/calendar", "/admin/tasks", "/admin/files", "/admin/messages", "/admin/revisions", "/admin/content", "/admin/forms", "/admin/submissions", "/admin/audit-log", "/admin/emails", "/admin/analytics", "/admin/exports", "/admin/automations", "/admin/team", "/admin/settings", "/admin/account"];
const EDITOR = ["/editor", "/editor/projects", "/editor/tasks", "/editor/revisions", "/editor/files", "/editor/account"];

async function detail(page, listPath, hrefPrefix) {
  await page.goto(base + listPath, { waitUntil: "networkidle" });
  return page.locator(`main a[href^="${hrefPrefix}"]`).evaluateAll((a, pre) => a.map((x) => x.getAttribute("href")).find((h) => h && h.length > pre.length + 5 && !h.includes("new")) ?? null, hrefPrefix);
}

const audit = () => {
  const out = [];
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 1) {
    const offenders = [...document.querySelectorAll("body *")].filter((el) => { const r = el.getBoundingClientRect(); return r.right > de.clientWidth + 1 && r.width > 0 && getComputedStyle(el).position !== "fixed"; }).slice(0, 3).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 3).join(".")}`);
    out.push(`horizontal overflow (${de.scrollWidth}px > ${de.clientWidth}px): ${offenders.join(", ")}`);
  }
  const noAlt = [...document.querySelectorAll("img")].filter((i) => !i.hasAttribute("alt")).length;
  if (noAlt) out.push(`${noAlt} <img> without alt`);
  const unlabeled = [...document.querySelectorAll("input:not([type=hidden]),select,textarea")].filter((el) => {
    if (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.closest("label")) return false;
    if (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }).length;
  if (unlabeled) out.push(`${unlabeled} visible form control(s) without a label`);
  const noName = [...document.querySelectorAll("button,a[href]")].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && !(el.textContent || "").trim() && !el.getAttribute("aria-label") && !el.getAttribute("title") && !el.querySelector("img[alt]:not([alt=''])");
  }).length;
  if (noName) out.push(`${noName} button/link(s) with no accessible name`);
  if (document.querySelectorAll("h1").length !== 1) out.push(`${document.querySelectorAll("h1").length} <h1> elements`);
  if (!document.querySelector("main,[role=main]")) out.push("no <main> landmark");
  if (!document.title || document.title.length < 3) out.push("missing <title>");
  return out;
};

let total = 0;
async function run(label, who, paths) {
  for (const [vname, w, h] of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: dark ? "dark" : "light" });
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push("pageerror: " + e.message.slice(0, 160)));
    page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
    if (who) await page.request.post(`${base}/api/auth/demo`, { data: { kind: who } });
    if (dark) await page.addInitScript(() => { try { localStorage.setItem("fe-theme", "dark"); } catch {} });
    const list = [...paths];
    if (label === "public") for (const [lp, pre] of [["/services", "/services/"], ["/blog", "/blog/"], ["/case-studies", "/case-studies/"]]) { const d = await detail(page, lp, pre); if (d) list.push(d); }
    if (label === "client") for (const [lp, pre] of [["/dashboard/projects", "/dashboard/projects/"], ["/dashboard/quotes", "/dashboard/quotes/"], ["/dashboard/invoices", "/dashboard/invoices/"]]) { const d = await detail(page, lp, pre); if (d) list.push(d); }
    if (label === "admin") for (const [lp, pre] of [["/admin/projects", "/admin/projects/"], ["/admin/clients", "/admin/clients/"], ["/admin/leads", "/admin/leads/"], ["/admin/invoices", "/admin/invoices/"], ["/admin/quotes", "/admin/quotes/"]]) { const d = await detail(page, lp, pre); if (d) { list.push(d); if (pre.includes("projects")) list.push(d + "?tab=files", d + "?tab=videos"); } }
    for (const p of list) {
      errs.length = 0;
      const resp = await page.goto(base + p, { waitUntil: "networkidle" }).catch(() => ({ status: () => 0 }));
      await page.waitForTimeout(250);
      const issues = resp.status() >= 400 ? [`HTTP ${resp.status()}`] : await page.evaluate(audit);
      issues.push(...errs.map((e) => `console: ${e}`));
      if (issues.length) { total += issues.length; console.log(`[${label}/${vname}] ${p}\n   - ${issues.join("\n   - ")}`); }
    }
    await ctx.close();
  }
}

await run("public", null, PUBLIC);
await run("client", "client", CLIENT);
await run("admin", "admin", ADMIN);
await run("editor", "editor", EDITOR);
await browser.close();
console.log(total ? `\n${total} issue(s) found` : "\nNo layout / a11y issues found");
process.exit(total ? 1 : 0);
