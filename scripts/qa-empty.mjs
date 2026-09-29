/**
 * Empty-database check: every public and admin page must render without errors, and must not show broken values
 * ("NaN", "undefined", "[object Object]", "Infinity") that usually signal a divide-by-zero or missing data.
 *
 *   npm run db:clear-demo && npm run admin:create -- qa@example.com "QA Admin" "qa-password-123"
 *   node scripts/qa-empty.mjs qa@example.com qa-password-123
 */
import { chromium } from "playwright-core";
const [email, password] = process.argv.slice(2);
if (!email || !password) throw new Error("Usage: node scripts/qa-empty.mjs <admin-email> <admin-password>");
const base = process.env.BASE ?? "http://localhost:3000";
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });

const PUBLIC = ["/", "/services", "/work", "/case-studies", "/process", "/pricing", "/about", "/blog", "/faq", "/contact", "/book", "/help", "/start-project", "/login", "/register", "/forgot-password", "/privacy", "/terms", "/sitemap.xml", "/robots.txt"];
const ADMIN = ["/admin", "/admin/leads", "/admin/clients", "/admin/clients/new", "/admin/projects", "/admin/projects?view=board", "/admin/projects/new", "/admin/quotes", "/admin/quotes/new", "/admin/invoices", "/admin/invoices/new", "/admin/payments", "/admin/contracts", "/admin/retainers", "/admin/calendar", "/admin/tasks", "/admin/files", "/admin/messages", "/admin/revisions", "/admin/content", "/admin/forms", "/admin/submissions", "/admin/audit-log", "/admin/emails", "/admin/analytics", "/admin/exports", "/admin/automations", "/admin/team", "/admin/settings", "/admin/account"];
const BROKEN = /\b(NaN|undefined|Infinity)\b|\[object Object\]|\bnull\b(?!\s*[:,])/;

let problems = 0;
async function sweep(label, who, paths) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  if (who) {
    const r = await page.request.post(`${base}/api/auth/login`, { data: { email, password }, headers: { "content-type": "application/json" } });
    if (!r.ok()) throw new Error(`login failed (${r.status()}): ${(await r.text()).slice(0, 200)}`);
  }
  for (const p of paths) {
    const errs = [];
    const h1 = (e) => errs.push("pageerror: " + e.message.slice(0, 160));
    const h2 = (m) => { if (m.type() === "error") errs.push("console: " + m.text().slice(0, 160)); };
    page.on("pageerror", h1); page.on("console", h2);
    const resp = await page.goto(base + p, { waitUntil: "networkidle" }).catch(() => null);
    await page.waitForTimeout(250);
    page.off("pageerror", h1); page.off("console", h2);
    const issues = [];
    if (!resp || resp.status() >= 400) issues.push(`HTTP ${resp?.status() ?? "no response"}`);
    else if (!/xml|plain/.test(resp.headers()["content-type"] ?? "")) {
      const text = await page.locator("body").innerText();
      const m = text.match(BROKEN);
      if (m) issues.push(`shows "${m[0]}" → …${text.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, " ")}…`);
    }
    issues.push(...errs);
    if (issues.length) { problems += issues.length; console.log(`[${label}] ${p}\n   - ${issues.join("\n   - ")}`); }
  }
  await ctx.close();
}
await sweep("public", false, PUBLIC);
await sweep("admin", true, ADMIN);
await browser.close();
console.log(problems ? `\n${problems} problem(s) on an empty database` : "\nEmpty database: every page renders cleanly");
process.exit(problems ? 1 : 0);
