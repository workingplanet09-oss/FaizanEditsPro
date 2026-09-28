/**
 * Screenshot helper for visual QA:
 *   node scripts/shot.mjs <outDir> <width>x<height> [--full] [--dark] [--as=admin|editor|client] <path> [<path>…]
 * Uses the Chromium that ships in the container (PLAYWRIGHT_BROWSERS_PATH). Demo login is used for --as.
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const [outDir, size, ...rest] = process.argv.slice(2);
const flags = rest.filter((a) => a.startsWith("--"));
const paths = rest.filter((a) => !a.startsWith("--"));
const [w, h] = size.split("x").map(Number);
const full = flags.includes("--full");
const dark = flags.includes("--dark");
const as = flags.find((f) => f.startsWith("--as="))?.slice(5);
const base = process.env.E2E_BASE_URL ?? "http://localhost:3000";
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: dark ? "dark" : "light", reducedMotion: "no-preference" });
if (dark) await ctx.addInitScript(() => localStorage.setItem("fe-theme", "dark"));
else await ctx.addInitScript(() => localStorage.setItem("fe-theme", "light"));
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text().slice(0, 200)}`));

if (as) {
  const r = await page.request.post(`${base}/api/auth/demo`, { data: { kind: as }, headers: { "content-type": "application/json" } });
  if (!r.ok()) console.log(`demo login failed for ${as}: ${r.status()} ${(await r.text()).slice(0, 200)}`);
}

for (const p of paths) {
  const name = p.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home";
  try {
    const resp = await page.goto(`${base}${p}`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(700);
    // reveal-on-scroll content: scroll through once so full-page shots are populated
    if (full) {
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 700) {
          window.scrollTo({ top: y, behavior: 'instant' });
          await new Promise((r) => setTimeout(r, 60));
        }
        window.scrollTo({ top: 0, behavior: 'instant' });
      });
      await page.waitForTimeout(500);
    }
    const file = `${outDir}/${name}_${w}${dark ? "_dark" : ""}.png`;
    await page.screenshot({ path: file, fullPage: full });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(`${resp?.status()} ${p} → ${file}${overflow > 1 ? `  ⚠ horizontal overflow ${overflow}px` : ""}`);
  } catch (e) {
    console.log(`FAIL ${p}: ${e.message.split("\n")[0]}`);
  }
}
if (errors.length) console.log("browser errors:\n  " + [...new Set(errors)].slice(0, 10).join("\n  "));
await browser.close();
