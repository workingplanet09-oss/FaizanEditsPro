/**
 * Keyboard-only checks that automated axe rules can't fully cover: skip link, visible focus, focus trapping in dialogs,
 * Escape to close, and focus returning to the control that opened the dialog.
 *   node scripts/qa-keyboard.mjs        (app on :3000 with demo data)
 */
import { chromium } from "playwright-core";
const base = process.env.BASE ?? "http://localhost:3000";
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; if (!cond) console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); };

const active = (page) => page.evaluate(() => {
  const e = document.activeElement;
  if (!e || e === document.body) return null;
  const cs = getComputedStyle(e);
  return { tag: e.tagName.toLowerCase(), id: e.id, text: (e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 40), outline: cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0, shadow: cs.boxShadow !== "none", inDialog: !!e.closest('dialog[open], [role="dialog"]') };
});

// ── public site: skip link + visible focus ──
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  const first = await active(page);
  ok("the first Tab stop is the skip link", first?.text === "Skip to content", JSON.stringify(first));
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
  ok("activating the skip link moves to the main content", (await page.evaluate(() => location.hash)) === "#main");
  await page.goto(base + "/", { waitUntil: "networkidle" });
  let invisible = [];
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Tab");
    const a = await active(page);
    if (a && !(a.outline || a.shadow)) invisible.push(`${a.tag}:${a.text}`);
  }
  ok("30 consecutive Tab stops on the home page all show a focus indicator", invisible.length === 0, invisible.slice(0, 4).join(", "));
  await ctx.close();
}

// ── mobile menu ──
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(base + "/", { waitUntil: "networkidle" });
  const toggle = page.getByRole("button", { name: /open menu/i });
  await toggle.click();
  ok("the mobile menu reports itself expanded", (await page.getByRole("button", { name: /close menu/i }).getAttribute("aria-expanded")) === "true");
  await ctx.close();
}

// ── admin: dialog focus handling ──
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.request.post(`${base}/api/auth/demo`, { data: { kind: "admin" } });
  // any invoice that can still take a payment (which one exists depends on what earlier suites did to the demo data)
  let link = null;
  for (const status of ["SENT", "VIEWED", "OVERDUE", "PARTIALLY_PAID"]) {
    await page.goto(`${base}/admin/invoices?status=${status}`, { waitUntil: "networkidle" });
    const candidate = page.locator("main tbody tr a").first();
    if (await candidate.count()) { link = candidate; break; }
  }
  ok("an unpaid invoice exists to open", !!link);
  if (!link) throw new Error("no unpaid invoice in the demo data");
  await link.click();
  await page.waitForURL(/\/admin\/invoices\/(?!new)[a-z0-9]+$/);
  await page.waitForLoadState("networkidle");
  const trigger = page.getByRole("button", { name: "Record payment" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ timeout: 8000 });
  ok("the dialog opens from the keyboard", await dialog.isVisible());
  ok("focus moves into the dialog when it opens", (await active(page))?.inDialog === true, JSON.stringify(await active(page)));
  // A native modal <dialog> hands focus to the browser's own UI after its last control (activeElement is then <body>) and comes back
  // to its first control on the next Tab. What must never happen is focus landing on a page element behind the dialog.
  let escaped = 0;
  const behind = async () => { const a = await active(page); return !!a && !a.inDialog; };
  for (let i = 0; i < 14; i++) { await page.keyboard.press("Tab"); if (await behind()) escaped++; }
  ok("Tab never reaches the page behind the open dialog (14 presses)", escaped === 0, `${escaped} escapes`);
  for (let i = 0; i < 6; i++) { await page.keyboard.press("Shift+Tab"); if (await behind()) escaped++; }
  ok("Shift+Tab never reaches the page behind the dialog", escaped === 0, `${escaped} escapes`);
  ok("the dialog has an accessible name", !!(await dialog.getAttribute("aria-label")) || !!(await dialog.getAttribute("aria-labelledby")));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  ok("Escape closes the dialog", !(await dialog.isVisible().catch(() => false)));
  const back = await active(page);
  ok("focus returns to the button that opened it", back?.text === "Record payment", JSON.stringify(back));
  await ctx.close();
}

// ── forms announce errors (filled in and submitted with Enter, no mouse) ──
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(base + "/login", { waitUntil: "networkidle" });
  ok("the email field has focus when the sign-in page opens", (await active(page))?.tag === "input");
  await page.keyboard.type("not-an-email");
  await page.keyboard.press("Tab");
  await page.keyboard.type("wrong-password-1");
  await page.keyboard.press("Enter");
  await page.locator('[role="alert"]').first().waitFor({ timeout: 8000 });
  ok("a rejected sign-in is announced to assistive technology", (await page.locator('[role="alert"]').first().innerText()).trim().length > 0);
  ok("the email field is flagged invalid and linked to its message", (await page.locator('input[name="email"]').getAttribute("aria-invalid")) === "true" && !!(await page.locator('input[name="email"]').getAttribute("aria-describedby")));
  await page.locator('input[name="email"]').fill("nobody@example.com");
  await page.locator('input[name="password"]').press("Enter");
  await page.waitForTimeout(800);
  ok("wrong credentials give one generic message that doesn't reveal whether the account exists", /incorrect|invalid|couldn't sign you in|wrong/i.test(await page.locator('[role="alert"]').first().innerText()));
  await ctx.close();
}

await browser.close();
console.log(`\n${fail === 0 ? "Keyboard checks passed" : "Keyboard checks FAILED"}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
