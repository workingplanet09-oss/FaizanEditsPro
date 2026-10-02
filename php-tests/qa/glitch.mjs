/**
 * Visual-glitch audit: loads every screen the demo accounts can reach and looks for the things people notice as "glitches".
 *   BASE=http://127.0.0.1:8081 node php-tests/qa/glitch.mjs [--phone] [--dark] [--quick]
 * Per page it checks: console and script errors, failed or 4xx/5xx requests, layout shift while loading and scrolling (CLS),
 * sideways scrolling, broken images, content stuck invisible after the reveal animations, animations that never stop,
 * `transition: all`, controls that change size when hovered, a header that changes height while scrolling, a theme script that
 * runs after first paint, and (phone) the menu drawer opening and closing cleanly. Needs the app in demo mode (demo sign-in buttons).
 */
import { chromium } from "playwright-core";
const base = process.env.BASE ?? "http://127.0.0.1:8081";
const phone = process.argv.includes("--phone"), dark = process.argv.includes("--dark"), quick = process.argv.includes("--quick");
const viewport = phone ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
let pass = 0, fail = 0, pages = 0;
const bad = [];
const ok = (name, cond, extra = "") => { cond ? pass++ : (fail++, bad.push(`${name}${extra ? " — " + extra : ""}`)); };

const CLS_BUDGET = 0.05; // "good" is 0.1; the pages are static enough to hold a stricter line
const IGNORE_REQ = /fonts\.(googleapis|gstatic)\.com|google\.com|cloudflare\.com/;

const groupKey = (p) => p.split("?")[0].replace(/[a-z0-9]{18,}/gi, ":id");
async function discover(page, prefix, max) {
  const hrefs = await page.evaluate(() => [...document.querySelectorAll("a[href^='/']")].map((a) => a.getAttribute("href")));
  const seen = new Map(), out = [];
  for (const h of hrefs) {
    const p = h.split("#")[0].replace(/\/+$/, "") || "/";
    if (!prefix.test(p) || /^\/(api|logout|s\/|auth\/)/.test(p) || /\.(pdf|png|jpe?g|zip|mp4|csv|xml|txt)(\?|$)/i.test(p) || /[?&]download/.test(p)) continue;
    const k = groupKey(p);
    if ((seen.get(k) || 0) >= 2 || out.includes(p)) continue;
    seen.set(k, (seen.get(k) || 0) + 1); out.push(p);
    if (out.length >= max) break;
  }
  return out;
}

async function newPage(role) {
  const ctx = await browser.newContext({ viewport, colorScheme: dark ? "dark" : "light", deviceScaleFactor: 1 });
  await ctx.addInitScript(() => {
    window.__cls = 0; window.__shifts = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) {
          window.__cls += e.value;
          window.__shifts.push({ v: +e.value.toFixed(4), n: (e.sources || []).slice(0, 3).map((s) => s.node ? (s.node.nodeName + "." + String(s.node.className || "").split(" ").slice(0, 3).join(".")).slice(0, 60) : "?") });
        }
      }).observe({ type: "layout-shift", buffered: true });
    } catch (e) {}
  });
  const page = await ctx.newPage();
  page.__errs = []; page.__reqs = [];
  page.on("pageerror", (e) => page.__errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) page.__errs.push("console: " + m.text().slice(0, 160)); });
  page.on("requestfailed", (r) => { if (!IGNORE_REQ.test(r.url()) && !/ERR_ABORTED/.test(r.failure()?.errorText || "")) page.__reqs.push("failed " + r.url().replace(base, "") + " " + (r.failure()?.errorText || "")); });
  page.on("response", (r) => { if (r.status() >= 400 && !IGNORE_REQ.test(r.url()) && !page.__expect404) page.__reqs.push(r.status() + " " + r.url().replace(base, "")); });
  if (role) {
    await page.goto(base + "/login", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: new RegExp("^" + role + "$", "i") }).click();
    await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 15000 });
  }
  return { ctx, page };
}

async function audit(page, path) {
  const label = `${path} [${phone ? "phone" : "desktop"}${dark ? ", dark" : ""}]`;
  page.__errs.length = 0; page.__reqs.length = 0;
  await page.evaluate(() => { window.__cls = 0; window.__shifts = []; }).catch(() => {});
  const res = await page.goto(base + path, { waitUntil: "load" });
  ok(`${label} responds 200`, res && res.status() === 200, String(res && res.status()));
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(700);
  // scroll the whole page slowly, the way a visitor does, so lazy images and reveals run
  await page.evaluate(async () => { const H = document.documentElement.scrollHeight; for (let y = 0; y <= H; y += Math.max(200, innerHeight * 0.6)) { scrollTo({ top: y, behavior: "instant" }); await new Promise((r) => setTimeout(r, 90)); } scrollTo({ top: H, behavior: "instant" }); });
  await page.waitForTimeout(900);
  // at the bottom everything above the viewport has been seen or scrolled past: nothing may still be invisible
  const stuck = await page.evaluate(() => [...document.querySelectorAll("[data-reveal]")].filter((e) => getComputedStyle(e).opacity !== "1").length);
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(300);

  const r = await page.evaluate(() => {
    const out = {};
    out.cls = +(window.__cls || 0).toFixed(4); out.shifts = (window.__shifts || []).slice(0, 4);
    out.overflow = document.documentElement.scrollWidth - innerWidth;
    out.broken = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && !i.closest("[hidden]") && getComputedStyle(i).display !== "none" && !(i.style.visibility === "hidden" && i.parentElement.querySelector("[data-img-fallback]"))).map((i) => i.getAttribute("src")).slice(0, 4); // a failed image must be replaced by the placeholder icon
    out.noAlt = [...document.images].filter((i) => !i.hasAttribute("alt")).length;
        out.running = document.getAnimations().filter((a) => a.playState === "running" && a.effect && a.effect.getComputedTiming().iterations === Infinity && !/^(spin|pulse)$/.test(a.animationName || "")).map((a) => (a.animationName || a.transitionProperty || "?") + "@" + (a.effect.target ? a.effect.target.nodeName + "." + String(a.effect.target.className || "").toString().split(" ").slice(0, 2).join(".") : "?")).slice(0, 4);
    out.transAll = [...document.querySelectorAll("body *")].filter((e) => { const s = getComputedStyle(e); return s.transitionProperty === "all" && parseFloat(s.transitionDuration) > 0; }).length;
    out.themeFirst = (() => { const sc = [...document.scripts].map((s) => s.src); const t = sc.findIndex((s) => /theme\.js/.test(s)); const a = sc.findIndex((s) => /app\.js/.test(s)); return t >= 0 && (a < 0 || t < a) && document.querySelector("script[src*='theme.js']").closest("head") !== null; })();
    return out;
  });
  pages++;
  ok(`${label} has no script/console errors`, page.__errs.length === 0, page.__errs.slice(0, 2).join(" | "));
  ok(`${label} has no failed or 4xx/5xx requests`, page.__reqs.length === 0, [...new Set(page.__reqs)].slice(0, 3).join(" | "));
  ok(`${label} layout shift ≤ ${CLS_BUDGET}`, r.cls <= CLS_BUDGET, `CLS ${r.cls} ${JSON.stringify(r.shifts)}`);
  ok(`${label} does not scroll sideways`, r.overflow <= 1, `${r.overflow}px`);
  ok(`${label} has no broken images`, r.broken.length === 0, r.broken.join(", "));
  ok(`${label} has alt on every image`, r.noAlt === 0, String(r.noAlt));
  ok(`${label} shows all revealed content`, stuck === 0, `${stuck} hidden`);
  ok(`${label} has no animation that never stops`, r.running.length === 0, r.running.join(" | "));
  ok(`${label} avoids transition: all`, r.transAll === 0, `${r.transAll} elements`);
  ok(`${label} runs the theme script in the head before the app`, r.themeFirst);
}

async function hoverStable(page, label) {
  const sizes = await page.evaluate(() => [...document.querySelectorAll("main a[href], main button, header a[href], header button")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 20 && r.height > 20 && r.top >= 0 && r.bottom <= innerHeight; }).slice(0, 14).map((e, i) => { e.setAttribute("data-gl", i); const r = e.getBoundingClientRect(); return [i, +r.width.toFixed(1), +r.height.toFixed(1)]; }));
  const moved = [];
  for (const [i, w, h] of sizes) {
    const el = page.locator(`[data-gl="${i}"]`).first();
    await el.hover({ timeout: 1500 }).catch(() => {});
    await page.waitForTimeout(220);
    const b = await el.boundingBox();
    if (b && (Math.abs(b.width - w) > 0.6 || Math.abs(b.height - h) > 0.6)) moved.push(`${(await el.innerText().catch(() => "")).trim().slice(0, 24) || "(icon)"} ${w}x${h}→${b.width.toFixed(1)}x${b.height.toFixed(1)}`);
  }
  await page.mouse.move(2, 2);
  ok(`${label} controls keep their size on hover`, moved.length === 0, moved.slice(0, 3).join(" | "));
}

async function headerStable(page, label) {
  const hs = await page.evaluate(async () => { const h = document.querySelector("header"); if (!h) return null; const a = h.getBoundingClientRect().height; scrollTo({ top: 700, behavior: "instant" }); await new Promise((r) => setTimeout(r, 450)); const b = h.getBoundingClientRect().height; scrollTo({ top: 0, behavior: "instant" }); await new Promise((r) => setTimeout(r, 450)); return [a, b, h.getBoundingClientRect().height]; });
  if (hs) ok(`${label} header keeps its height while scrolling`, Math.abs(hs[0] - hs[1]) < 0.6 && Math.abs(hs[0] - hs[2]) < 0.6, JSON.stringify(hs));
}

async function themeSwitch(page) {
  await page.goto(base + "/", { waitUntil: "networkidle" });
  if (phone) { await page.locator("header [data-drawer-toggle], header button[aria-label*='enu']").first().click(); await page.waitForTimeout(450); } // on a phone the toggle lives in the menu
  const btn = page.locator("[data-theme-toggle]:visible").first();
  if (!(await btn.count())) return ok("theme toggle exists", false);
  await btn.click(); await page.waitForTimeout(30);
  const fading = await page.evaluate(() => document.getAnimations().filter((a) => a instanceof CSSTransition && /color|background|border|fill|stroke|shadow/.test(a.transitionProperty) && !a.effect.target.closest("button, a")).length); // buttons under the pointer legitimately fade their own hover state
  ok("switching theme changes every colour in one frame (no staggered fades)", fading === 0, `${fading} colour transitions running`);
  await btn.click(); await btn.click(); await page.waitForTimeout(200); // back to the starting mode
  if (phone) await page.keyboard.press("Escape");
}

async function anchors(page) {
  await page.goto(base + "/faq", { waitUntil: "networkidle" });
  const id = await page.evaluate(() => { const el = document.querySelector("main [id]:not([id=main])"); return el ? el.id : null; });
  if (!id) return;
  await page.goto(base + "/faq#" + id, { waitUntil: "networkidle" }); await page.waitForTimeout(900);
  const gap = await page.evaluate((i) => { const el = document.getElementById(i), h = document.querySelector("header"); const hb = h ? h.getBoundingClientRect().bottom : 0; return +(el.getBoundingClientRect().top - hb).toFixed(1); }, id);
  ok("an in-page link stops below the sticky header, not under it", gap >= -1, `${gap}px`);
}

async function drawer(page) {
  await page.goto(base + "/", { waitUntil: "networkidle" });
  const btn = page.locator("header [data-drawer-toggle], header button[aria-label*='enu']").first();
  if (!(await btn.count())) return ok("phone: header has a menu button", false);
  await btn.click(); await page.waitForTimeout(500);
  const open = await page.evaluate(() => { const d = document.querySelector("[data-drawer]:not(.hidden)"); const r = d && d.getBoundingClientRect(); const main = document.querySelector("main"); return d ? { w: r.width, h: r.height, bottom: r.bottom, vh: innerHeight, covers: getComputedStyle(d).position === "absolute", locked: getComputedStyle(document.body).overflow, over: document.documentElement.scrollWidth - innerWidth, mainTop: main ? main.getBoundingClientRect().top : null } : null; });
  ok("phone: the menu drawer opens fully inside the screen", !!open && open.h >= 200 && open.bottom <= open.vh + 1 && open.w >= 389, JSON.stringify(open));
  ok("phone: the open menu overlays the page instead of pushing it down", !!open && open.covers && open.mainTop < 120, JSON.stringify(open));
  ok("phone: opening the menu does not push the page sideways", !open || open.over <= 1);
  await page.keyboard.press("Escape"); await page.waitForTimeout(500);
  const closed = await page.evaluate(() => { const d = document.querySelector("[data-drawer]"); return !d || d.classList.contains("hidden") || getComputedStyle(d).display === "none"; });
  ok("phone: Escape closes the menu drawer", closed);
}

const pub = ["/", "/services", "/services/short-form-video-editing", "/work", "/case-studies", "/process", "/pricing", "/about", "/faq", "/contact", "/book", "/blog", "/help", "/terms", "/privacy", "/start-project", "/login", "/register", "/forgot-password"];
{
  const { ctx, page } = await newPage(null);
  const list = quick ? pub.slice(0, 6) : pub;
  for (const p of list) await audit(page, p);
  const posts = (await (async () => { await page.goto(base + "/blog", { waitUntil: "networkidle" }); return discover(page, /^\/blog\/[^/]/, 1); })());
  const cs = (await (async () => { await page.goto(base + "/case-studies", { waitUntil: "networkidle" }); return discover(page, /^\/case-studies\/[^/]/, 1); })());
  for (const p of [...posts, ...cs]) await audit(page, p);
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await hoverStable(page, "home"); await headerStable(page, "home");
  await page.goto(base + "/services", { waitUntil: "networkidle" }); await hoverStable(page, "services");
  await page.goto(base + "/work", { waitUntil: "networkidle" }); await hoverStable(page, "work");
  await themeSwitch(page); await anchors(page);
  if (phone) await drawer(page);
  // the 404 page is a real page too
  page.__expect404 = true;
  const nf = await page.goto(base + "/definitely-not-a-page", { waitUntil: "networkidle" });
  ok("unknown address gives a styled 404", nf.status() === 404 && (await page.locator("main h1, h1").count()) > 0);
  page.__expect404 = false;
  await ctx.close();
}
for (const [role, landing, prefix, max] of [["Client", "/dashboard", /^\/dashboard/, quick ? 4 : 30], ["Admin", "/admin", /^\/admin/, quick ? 4 : 45], ["Editor", "/editor", /^\/editor/, quick ? 3 : 12]]) {
  const { ctx, page } = await newPage(role);
  const list = [landing, ...(await discover(page, prefix, max))].filter((p, i, a) => a.indexOf(p) === i);
  for (const p of list) await audit(page, p);
  await page.goto(base + landing, { waitUntil: "networkidle" });
  await hoverStable(page, role.toLowerCase());
  await ctx.close();
}

await browser.close();
console.log(`${pages} pages audited${phone ? " (phone)" : ""}${dark ? " (dark)" : ""}: ${pass} checks passed, ${fail} failed`);
if (bad.length) { console.log("\nProblems:"); for (const b of bad.slice(0, 80)) console.log("  ✗ " + b); if (bad.length > 80) console.log(`  … and ${bad.length - 80} more`); }
process.exit(fail ? 1 : 0);
