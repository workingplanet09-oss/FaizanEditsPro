/**
 * Drives the public Start Project wizard like a visitor would (Playwright), then prints the resulting request ID.
 *   node scripts/wizard-smoke.mjs [outDir] [WxH] [looking_for-label-substring]
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";

const out = process.argv[2] ?? "/tmp/wizard-shots";
const [w, h] = (process.argv[3] ?? "1280x900").split("x").map(Number);
const pick = process.argv[4] ?? "Real estate";
const base = process.env.E2E_BASE_URL ?? "http://localhost:3000";
mkdirSync(out, { recursive: true });
writeFileSync(`${out}/sample.txt`, "reference notes");

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: w, height: h } });
await ctx.addInitScript(() => localStorage.setItem("fe-theme", "light"));
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text().slice(0, 200)}`));

await page.goto(`${base}/start-project`, { waitUntil: "networkidle" });
const stamp = Date.now();
let step = 0;
for (let guard = 0; guard < 20; guard++) {
  await page.waitForTimeout(350);
  const heading = (await page.locator("h1").first().textContent())?.trim();
  step++;
  console.log(`step ${step}: ${heading}`);
  await page.screenshot({ path: `${out}/step-${String(step).padStart(2, "0")}.png` });
  if (heading === "Review & submit") break;
  if (heading === "Request received") break;

  // radio / multi groups: choose the requested option on the first step, otherwise the first option of each group
  const groups = page.locator("[role=radiogroup], [role=group]");
  const gc = await groups.count();
  for (let i = 0; i < gc; i++) {
    const g = groups.nth(i);
    const label = (await g.getAttribute("aria-label")) ?? "";
    const btns = g.locator("button, label");
    const n = await btns.count();
    if (!n) continue;
    if (step === 1 && /looking/i.test(label)) {
      const m = g.locator("label", { hasText: pick }).first();
      if (await m.count()) await m.click({ force: true });
      else await btns.first().click({ force: true });
    } else {
      const already = await g.locator("[aria-checked=true], [aria-pressed=true], input:checked").count();
      if (!already) await btns.first().click({ force: true });
    }
  }
  for (const sel of ["input[name=name]", "input[name=email]"]) {
    const el = page.locator(sel);
    if (await el.count()) await el.fill(sel.includes("email") ? `smoke+${stamp}@example.test` : "Smoke Tester");
  }
  const texts = page.locator("input:not([type=file]):not([type=checkbox]):not([type=radio]):not([type=color]):not([tabindex='-1'])");
  const tc = await texts.count();
  for (let i = 0; i < tc; i++) {
    const t = texts.nth(i);
    if (!(await t.isVisible()) || (await t.inputValue())) continue;
    const type = (await t.getAttribute("type")) ?? "text";
    const name = (await t.getAttribute("name")) ?? "";
    const val = type === "email" ? `smoke+${stamp}@example.test` : type === "url" ? "https://example.com" : type === "tel" ? "+1 555 010 2030" : type === "number" ? "3" : type === "date" ? "2030-01-15" : type === "time" ? "10:00" : name === "company" ? "Smoke Realty" : "Smoke Tester";
    await t.fill(val).catch(() => {});
  }
  const areas = page.locator("textarea");
  for (let i = 0; i < (await areas.count()); i++) {
    const a = areas.nth(i);
    if ((await a.isVisible()) && !(await a.inputValue())) await a.fill("We produce weekly property tours and need them cut for YouTube and Reels. Footage is shot on a gimbal with ambient audio; we want music, captions and a clean, premium feel. Ten videos a month.");
  }
  const sels = page.locator("select");
  for (let i = 0; i < (await sels.count()); i++) {
    const s = sels.nth(i);
    if (!(await s.isVisible()) || (await s.inputValue())) continue;
    const opts = await s.locator("option").evaluateAll((o) => o.map((x) => x.value).filter(Boolean));
    if (opts.length) await s.selectOption(opts[0]);
  }
  const fileInput = page.locator("input[type=file]");
  if (step === 2 && (await fileInput.count())) await fileInput.first().setInputFiles(`${out}/sample.txt`).catch(() => {});
  await page.getByRole("button", { name: /^(Continue|Review)/ }).click();
  await page.waitForTimeout(250);
  const errs = await page.locator("[role=alert]").allTextContents();
  if (errs.length) console.log("  validation:", errs.map((e) => e.trim()).join(" | "));
}
await page.getByRole("button", { name: /Submit request/ }).click();
await page.waitForSelector("text=Request received", { timeout: 20000 });
await page.screenshot({ path: `${out}/done.png` });
console.log("DONE →", (await page.locator("dl").first().innerText()).replace(/\n+/g, " · "));
console.log(errors.length ? `console errors:\n${errors.join("\n")}` : "no console errors");
await browser.close();
