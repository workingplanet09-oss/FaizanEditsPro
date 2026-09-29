/**
 * Notification link check: signs in as each demo user, reads their real notifications and opens every link.
 * A link must load (no 404/403/500) and must not bounce the person to a different portal area.
 *   node scripts/qa-links.mjs      (app on :3000, demo data loaded)
 */
import { chromium } from "playwright-core";
const base = process.env.BASE ?? "http://localhost:3000";
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const USERS = ["admin", "pm", "editor", "motion", "client", "mia", "devon", "lena", "robert"].map((n) => `${n}@demo.faizaneditspro.test`);

let checked = 0;
let bad = 0;
for (const email of USERS) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const login = await page.request.post(`${base}/api/auth/login`, { data: { email, password: "demo-password-123" }, headers: { "content-type": "application/json" } });
  if (!login.ok()) { console.log(`- ${email}: login failed (${login.status()})`); continue; }
  const res = await (await page.request.get(`${base}/api/notifications?pageSize=50`)).json();
  const links = [...new Set((res.data?.items ?? []).map((n) => n.link).filter(Boolean))];
  const home = await page.goto(base + "/", { waitUntil: "domcontentloaded" }).then(() => null);
  void home;
  for (const link of links) {
    const r = await page.goto(base + link, { waitUntil: "domcontentloaded" });
    checked++;
    const finalPath = new URL(page.url()).pathname;
    const area = (p) => p.split("/")[1];
    const problems = [];
    if (r.status() >= 400) problems.push(`HTTP ${r.status()}`);
    if (area(finalPath) !== area(link)) problems.push(`redirected to ${finalPath}`);
    if (problems.length) { bad++; console.log(`✗ ${email.split("@")[0].padEnd(7)} ${link}  →  ${problems.join(", ")}`); }
  }
  console.log(`  ${email.split("@")[0].padEnd(7)} ${links.length} distinct link(s)`);
  await ctx.close();
}
await browser.close();
console.log(bad ? `\n${bad} of ${checked} notification links are broken` : `\nAll ${checked} notification links load in the recipient's own portal`);
process.exit(bad ? 1 : 0);
