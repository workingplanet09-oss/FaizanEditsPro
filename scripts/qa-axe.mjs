/**
 * Automated accessibility audit with axe-core (WCAG 2.1 A/AA rules) across key pages.
 *   node scripts/qa-axe.mjs [--dark]      (app on :3000, demo data loaded)
 */
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
const base = process.env.BASE ?? "http://localhost:3000";
const dark = process.argv.includes("--dark");
const axeSource = readFileSync(new URL("../node_modules/axe-core/axe.min.js", import.meta.url), "utf8");
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });

const SETS = [
  ["public", null, ["/", "/services", "/work", "/pricing", "/about", "/blog", "/faq", "/contact", "/book", "/help", "/process", "/start-project", "/login", "/register"]],
  ["client", "client", ["/dashboard", "/dashboard/projects", "/dashboard/quotes", "/dashboard/invoices", "/dashboard/files", "/dashboard/messages", "/dashboard/settings"]],
  ["admin", "admin", ["/admin", "/admin/leads", "/admin/clients", "/admin/projects", "/admin/invoices", "/admin/forms", "/admin/automations", "/admin/settings", "/admin/analytics", "/admin/team"]],
  ["editor", "editor", ["/editor", "/editor/projects", "/editor/tasks"]],
];
const seen = new Map();
let total = 0;
for (const [label, who, paths] of SETS) {
  for (const [vname, w, h] of [["desktop", 1440, 900], ["mobile", 390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: dark ? "dark" : "light" });
    const page = await ctx.newPage();
    if (dark) await page.addInitScript(() => { try { localStorage.setItem("fe-theme", "dark"); } catch {} });
    if (who) await page.request.post(`${base}/api/auth/demo`, { data: { kind: who } });
    for (const p of paths) {
      await page.goto(base + p, { waitUntil: "networkidle" }).catch(() => {});
      await page.waitForTimeout(400);
      await page.evaluate(axeSource);
      const res = await page.evaluate(() => window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] }).then((r) => r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => ({ target: n.target.join(" "), summary: (n.failureSummary || "").split("\n").slice(1, 3).join(" ").slice(0, 200) })), count: v.nodes.length }))));
      for (const v of res) {
        const key = `${v.id}`;
        const e = seen.get(key) ?? { ...v, pages: new Set(), total: 0 };
        e.pages.add(`${label}/${vname}${p}`); e.total += v.count; if (!seen.has(key)) seen.set(key, e); else e.nodes = e.nodes.length < 3 ? [...e.nodes, ...v.nodes].slice(0, 3) : e.nodes;
        total += v.count;
      }
    }
    await ctx.close();
  }
}
await browser.close();
for (const e of [...seen.values()].sort((a, b) => b.total - a.total)) {
  console.log(`\n[${e.impact}] ${e.id} — ${e.help}  (${e.total} nodes on ${e.pages.size} page views)`);
  for (const n of e.nodes.slice(0, 3)) console.log(`   ${n.target}\n     ${n.summary}`);
  console.log(`   e.g. ${[...e.pages].slice(0, 3).join(", ")}`);
}
console.log(total ? `\n${total} violation node(s)` : "\nNo axe violations");
process.exit(total ? 1 : 0);
