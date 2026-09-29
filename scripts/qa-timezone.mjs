/**
 * Hydration check under a different browser timezone than the server (the classic "Oct 4 vs Oct 5" mismatch).
 *   TZ_ID=Asia/Karachi node scripts/qa-timezone.mjs
 */
import { chromium } from "playwright-core";
const base = process.env.BASE ?? "http://localhost:3000";
const timezoneId = process.env.TZ_ID ?? "Asia/Karachi";
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const SETS = [
  [null, ["/", "/work", "/pricing", "/blog", "/book", "/case-studies"]],
  ["client", ["/dashboard", "/dashboard/projects", "/dashboard/quotes", "/dashboard/invoices", "/dashboard/contracts", "/dashboard/messages", "/dashboard/retainers", "/dashboard/files", "/dashboard/settings"]],
  ["admin", ["/admin", "/admin/leads", "/admin/clients", "/admin/projects", "/admin/quotes", "/admin/invoices", "/admin/payments", "/admin/contracts", "/admin/calendar", "/admin/tasks", "/admin/messages", "/admin/audit-log", "/admin/emails", "/admin/account", "/admin/analytics"]],
  ["editor", ["/editor", "/editor/projects", "/editor/tasks", "/editor/revisions", "/editor/account"]],
];
let bad = 0;
for (const [who, paths] of SETS) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId, locale: "en-US" });
  const page = await ctx.newPage();
  if (who) await page.request.post(`${base}/api/auth/demo`, { data: { kind: who } });
  const extra = [];
  if (who === "admin") { const l = await (await page.request.get(`${base}/api/projects?pageSize=3`)).json(); for (const p of l.data.items.slice(0, 3)) for (const t of ["", "?tab=activity", "?tab=notes", "?tab=tasks", "?tab=messages", "?tab=time", "?tab=revisions"]) extra.push(`/admin/projects/${p.id}${t}`); }
  if (who === "client") { const l = await (await page.request.get(`${base}/api/projects?pageSize=3`)).json(); for (const p of l.data.items.slice(0, 3)) extra.push(`/dashboard/projects/${p.id}`); }
  for (const p of [...paths, ...extra]) {
    const msgs = [];
    const h1 = (e) => msgs.push(e.message); const h2 = (m) => { if (m.type() === "error") msgs.push(m.text()); };
    page.on("pageerror", h1); page.on("console", h2);
    await page.goto(base + p, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(350);
    page.off("pageerror", h1); page.off("console", h2);
    const hyd = msgs.filter((m) => /hydrat/i.test(m));
    if (hyd.length) { bad++; console.log(`✗ ${p}\n    ${hyd[0].replace(/\s+/g, " ").slice(0, 260)}`); }
  }
  await ctx.close();
}
await browser.close();
console.log(bad ? `\n${bad} page(s) with hydration errors in ${timezoneId}` : `\nNo hydration errors in ${timezoneId}`);
process.exit(bad ? 1 : 0);
