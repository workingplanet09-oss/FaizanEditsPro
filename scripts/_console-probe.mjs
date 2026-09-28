import { chromium } from "playwright-core";
const [as, ...paths] = process.argv.slice(2);
const base = "http://localhost:3000";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.request.post(`${base}/api/auth/demo`, { data: { kind: as } });
for (const p of paths) {
  const msgs = [];
  page.removeAllListeners("console");
  page.on("console", async (m) => { if (m.type() === "error" || m.type() === "warning") { const args = await Promise.all(m.args().map((a) => a.jsonValue().catch(() => "?"))); msgs.push(args.map(String).join(" ").slice(0, 300)); } });
  page.on("pageerror", (e) => msgs.push("pageerror: " + e.message));
  await page.goto(base + p, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  console.log(p, msgs.length ? "\n  " + msgs.join("\n  ") : "clean");
}
await browser.close();
