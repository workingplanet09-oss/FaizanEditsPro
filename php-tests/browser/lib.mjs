// Tiny assertion + browser helper used by the browser tests (run with: node php-tests/browser/<file>.mjs).
import { chromium } from "playwright-core";
export const BASE = process.env.BASE || "http://127.0.0.1:8081";
let pass = 0, fail = 0;
export function check(name, ok, detail = "") {
  if (ok) { pass++; console.log("  PASS", name); } else { fail++; console.log("  FAIL", name, detail ? "— " + detail : ""); }
}
export async function launch(opts = {}) {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource.*4[0-9][0-9]/.test(m.text())) errors.push("console: " + m.text()); });
  return { browser, ctx, page, errors };
}
export async function scrollAll(page) {
  await page.evaluate(async () => { const h = document.body.scrollHeight; for (let y = 0; y < h; y += 500) { window.scrollTo({ top: y, behavior: "instant" }); await new Promise((r) => setTimeout(r, 40)); } window.scrollTo({ top: 0, behavior: "instant" }); });
}
export function done(errors = []) {
  if (errors.length) { fail++; console.log("  FAIL unexpected browser errors:\n    " + errors.join("\n    ")); } else { pass++; console.log("  PASS no unexpected browser errors"); }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
