/**
 * Brand conformance for the "Faizan Ali" brand specification, measured on the rendered pages (computed styles, not the CSS source).
 *   BASE=http://127.0.0.1:8081 node php-tests/qa/brand.mjs        (app with the default theme, demo or live)
 * Covers: palette, fonts, type scale at desktop and phone width, container/gutters, radii, shadow, button sizes and states,
 * wordmark rules, contrast of the main text pairs, focus visibility, motion (timings, reduced motion, content visible without JS),
 * absence of glow/grain, required call-to-action wording, and the client dashboard when demo sign-in is available.
 */
import { chromium } from "playwright-core";
const base = process.env.BASE ?? "http://127.0.0.1:8081";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`  ${cond ? "PASS" : "FAIL"} ${name}${!cond && extra ? " — " + extra : ""}`); };

const rgb = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const same = (a, b) => a.length === 3 && a.every((v, i) => Math.abs(v - b[i]) <= 1);
const lum = (c) => { const f = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const P = { blue: "#2457E6", navy: "#10213D", paper: "#F7F9FC", white: "#FFFFFF", slate: "#526078", mist: "#EAF0FF", hover: "#1D46BC", border: "#D9E2EF" };

async function open(width, path, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, ...opts });
  const page = await ctx.newPage();
  await page.goto(base + path, { waitUntil: "networkidle" });
  return { ctx, page };
}
const style = (page, sel, props) => page.locator(sel).first().evaluate((el, ps) => { const s = getComputedStyle(el); return Object.fromEntries(ps.map((p) => [p, s.getPropertyValue(p)])); }, props);

// ───────────────────────────── desktop home ─────────────────────────────
console.log("Palette and typography (desktop home)");
{
  const { ctx, page } = await open(1440, "/");
  const body = await style(page, "body", ["background-color", "color", "font-family", "line-height", "font-size"]);
  ok("page background is Paper #F7F9FC", same(rgb(body["background-color"]), hex(P.paper)), body["background-color"]);
  ok("body text is Ink Navy #10213D", same(rgb(body.color), hex(P.navy)), body.color);
  ok("body font is Inter with an Arial fallback", /^"?Inter/.test(body["font-family"]) && /Arial/.test(body["font-family"]), body["font-family"]);
  const lh = parseFloat(body["line-height"]) / parseFloat(body["font-size"]);
  ok("body line-height is 1.5–1.65", lh >= 1.5 && lh <= 1.65, String(lh));
  ok("body size is 16–18 px", [16, 17, 18].includes(parseFloat(body["font-size"])), body["font-size"]);

  const h1 = await style(page, "h1", ["font-family", "font-weight", "font-size", "line-height", "color", "text-transform"]);
  ok("hero heading is Manrope 800", /^"?Manrope/.test(h1["font-family"]) && h1["font-weight"] === "800", `${h1["font-family"]} ${h1["font-weight"]}`);
  ok("hero heading is 56–72 px on desktop", parseFloat(h1["font-size"]) >= 56 && parseFloat(h1["font-size"]) <= 72, h1["font-size"]);
  const h1lh = parseFloat(h1["line-height"]) / parseFloat(h1["font-size"]);
  ok("hero heading line-height is 1.05–1.15", h1lh >= 1.05 && h1lh <= 1.15, String(h1lh));
  ok("headings use sentence case (no forced capitals)", h1["text-transform"] === "none");

  const h2 = await style(page, "main h2", ["font-family", "font-weight", "font-size"]);
  ok("section heading is Manrope 700 at 36–44 px", /^"?Manrope/.test(h2["font-family"]) && h2["font-weight"] === "700" && parseFloat(h2["font-size"]) >= 36 && parseFloat(h2["font-size"]) <= 44, JSON.stringify(h2));
  const card = await style(page, "main h3", ["font-size", "font-weight"]);
  ok("card heading is 700 at 20–26 px", card["font-weight"] === "700" && parseFloat(card["font-size"]) >= 20 && parseFloat(card["font-size"]) <= 26, JSON.stringify(card));

  console.log("Layout: container, gutters, radii, shadow");
  const wrap = await page.locator("main .container-page").first().evaluate((el) => { const s = getComputedStyle(el), r = el.getBoundingClientRect(); return { w: r.width, pl: parseFloat(s.paddingLeft), max: s.maxWidth }; });
  ok("content column is at most 1200 px (plus gutters)", wrap.w <= 1200 + 2 * wrap.pl + 1 && wrap.w > 1100, JSON.stringify(wrap));
  ok("desktop gutters are 40–64 px", wrap.pl >= 40 && wrap.pl <= 64, String(wrap.pl));
  const cardEl = await style(page, "main a.group", ["border-radius", "border-top-color", "box-shadow", "background-color"]);
  ok("cards have a 16 px radius", cardEl["border-radius"] === "16px", cardEl["border-radius"]);
  ok("card border is the spec's #D9E2EF", same(rgb(cardEl["border-top-color"]), hex(P.border)), cardEl["border-top-color"]);
  ok("cards sit on white", same(rgb(cardEl["background-color"]), hex(P.white)), cardEl["background-color"]);
  const sec = await page.locator("main section").nth(1).evaluate((el) => parseFloat(getComputedStyle(el).paddingTop));
  ok("section spacing is 80–112 px on desktop", sec >= 80 && sec <= 112, String(sec));

  console.log("Buttons");
  const prim = page.locator("main a", { hasText: "Discuss your project" }).first();
  const pb = await prim.evaluate((el) => { const s = getComputedStyle(el), r = el.getBoundingClientRect(); return { bg: s.backgroundColor, color: s.color, h: r.height, radius: s.borderRadius, weight: s.fontWeight, font: s.fontFamily, size: s.fontSize }; });
  ok("primary button is Signature Blue with white text", same(rgb(pb.bg), hex(P.blue)) && same(rgb(pb.color), hex(P.white)), JSON.stringify(pb));
  ok("buttons are 44–48 px high with a 12 px radius", pb.h >= 44 && pb.h <= 48.5 && pb.radius === "12px", `${pb.h} ${pb.radius}`);
  ok("button label is Inter 600 / 16 px", /^"?Inter/.test(pb.font) && pb.weight === "600" && pb.size === "16px", `${pb.font} ${pb.weight} ${pb.size}`);
  await prim.hover(); await page.waitForTimeout(260);
  const hov = await prim.evaluate((el) => getComputedStyle(el).backgroundColor);
  ok("primary hover is #1D46BC", same(rgb(hov), hex(P.hover)), hov);
  const sec1 = page.locator("main a", { hasText: "View my work" }).first();
  const sb = await sec1.evaluate((el) => { const s = getComputedStyle(el); return { bg: s.backgroundColor, color: s.color, border: s.borderTopWidth, bc: s.borderTopColor }; });
  ok("secondary button: navy text with a visible border", same(rgb(sb.color), hex(P.navy)) && parseFloat(sb.border) >= 1, JSON.stringify(sb));
  ok("secondary button border is visible against its background (≥3:1)", ratio(rgb(sb.bc), hex(P.paper)) >= 3, sb.bc);

  console.log("Wordmark");
  const header = await page.locator("header").first().innerText();
  ok("header shows the name \"Faizan Ali\" top-left without the descriptor", /Faizan Ali/.test(header) && !/Video Editor and Content Creator/.test(header));
  const logoBox = await page.locator("header a[aria-label$=\"home\"]").first().boundingBox();
  ok("wordmark sits at the left edge of the content column", logoBox && logoBox.x < 200, JSON.stringify(logoBox));
  const wm = await style(page, "header .wordmark-name", ["font-family", "font-weight", "color"]);
  ok("wordmark is Manrope 800 in navy on light", /^"?Manrope/.test(wm["font-family"]) && wm["font-weight"] === "800" && same(rgb(wm.color), hex(P.navy)), JSON.stringify(wm));
  const foot = await page.locator("footer").first().innerText();
  ok("footer repeats the name with the descriptor", /Faizan Ali/.test(foot) && /Video Editor and Content Creator/.test(foot));
  const fw = await style(page, "footer .wordmark-name", ["color"]);
  ok("footer wordmark is white on navy", same(rgb(fw.color), hex(P.white)), fw.color);
  const fbg = await style(page, "footer", ["background-color"]);
  ok("footer background is Ink Navy", same(rgb(fbg["background-color"]), hex(P.navy)), fbg["background-color"]);
  const dz = await page.locator("main .dark-zone h2").first().evaluate((el) => getComputedStyle(el).color);
  ok("headings on navy are white", same(rgb(dz), hex(P.white)), dz);

  console.log("Copy and voice");
  const text = await page.locator("main").innerText();
  const own = await page.locator("main").evaluate((m) => { const c = m.cloneNode(true); c.querySelectorAll("blockquote, figure").forEach((n) => n.remove()); return c.innerText; }); // client testimonials are quoted verbatim
  ok("brand line is on the home page", /Video editing that brings your message into focus\./.test(text));
  ok("introduction line is on the home page", /I'm Faizan Ali, a video editor helping creators and businesses turn raw footage into engaging content\./.test(text));
  ok("primary and secondary calls to action use the specified words", /Discuss your project/.test(text) && /View my work/.test(text));
  ok("no 'we' or 'our' in my own home page copy (first-person voice)", !/\b(we|our|we'll|we're)\b/i.test(own), (own.match(/.{20}\b(we|our)\b.{20}/i) || [""])[0]);
  ok("no unverified award/ranking claims", !/\b(award|#1|best in|top-rated|guarantee)/i.test(text));

  console.log("Contrast of the main pairs");
  const mutedC = await page.locator("main p").first().evaluate((el) => getComputedStyle(el).color);
  ok("muted text on Paper ≥ 4.5:1", ratio(rgb(mutedC), hex(P.paper)) >= 4.5, mutedC);
  ok("white on Signature Blue ≥ 4.5:1", ratio(hex(P.white), hex(P.blue)) >= 4.5);
  const link = await page.locator("main a.link, main p a, main a.underline").first().evaluate((el) => { const s = getComputedStyle(el); return { color: s.color, deco: s.textDecorationLine }; }).catch(() => null);
  if (link) ok("links in copy are blue and underlined", ratio(rgb(link.color), hex(P.white)) >= 4.5 && /underline/.test(link.deco), JSON.stringify(link));

  console.log("Focus and keyboard");
  await page.keyboard.press("Tab"); await page.keyboard.press("Tab");
  const focus = await page.evaluate(() => { const el = document.activeElement, s = getComputedStyle(el); return { tag: el.tagName, outline: s.outlineStyle, w: parseFloat(s.outlineWidth), shadow: s.boxShadow }; });
  ok("focused control shows a visible indicator", (focus.outline !== "none" && focus.w >= 2) || focus.shadow !== "none", JSON.stringify(focus));

  console.log("No glow or grain");
  const css = await page.evaluate(async () => { const l = [...document.styleSheets].map((s) => s.href).filter(Boolean)[0]; return (await fetch(l)).text(); });
  ok("stylesheet has no glow/grain classes, text-shadow or drop-shadow filters", !/\.(glow|grain)\b|text-shadow\s*:|drop-shadow\([^)]/.test(css));
  const shadow = await page.evaluate(() => {
    const bad = [];
    for (const e of document.querySelectorAll("main *")) {
      const v = getComputedStyle(e).boxShadow;
      if (v === "none") continue;
      for (const seg of v.split(/,(?![^(]*\))/)) {
        const m = seg.match(/rgba?\((\d+), (\d+), (\d+)(?:, [\d.]+)?\)\s+(-?[\d.]+)px (-?[\d.]+)px ([\d.]+)px/);
        if (m && parseFloat(m[6]) > 0 && !((+m[1] === 16 && +m[2] === 33 && +m[3] === 61) || (+m[1] === 0 && +m[2] === 0 && +m[3] === 0))) bad.push(seg.trim());
      }
    }
    return bad.slice(0, 5);
  });
  ok("every blurred shadow is the soft navy/black shadow (no coloured glow)", shadow.length === 0, shadow.join(" | "));
  await ctx.close();
}

// ───────────────────────────── phone width ─────────────────────────────
console.log("Phone width (390 px)");
{
  const { ctx, page } = await open(390, "/");
  const h1 = await style(page, "h1", ["font-size"]);
  ok("hero heading is 36–44 px on phones", parseFloat(h1["font-size"]) >= 36 && parseFloat(h1["font-size"]) <= 44, h1["font-size"]);
  const h2 = await style(page, "main h2", ["font-size"]);
  ok("section heading is 28–32 px on phones", parseFloat(h2["font-size"]) >= 28 && parseFloat(h2["font-size"]) <= 32, h2["font-size"]);
  const pl = await page.locator("main .container-page").first().evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft));
  ok("phone gutters are 24 px", pl === 24, String(pl));
  ok("no horizontal scrolling", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  const small = await page.evaluate(() => [...document.querySelectorAll("a[href], button")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1 && r.height < 40 && !e.closest("[hidden]") && !e.matches(".sr-only, [href='#main'], [href='#content']") && getComputedStyle(e).display !== "inline"; }).map((e) => (e.textContent || "").trim().slice(0, 24)).slice(0, 8));
  ok("block-level tap targets are at least 40 px high", small.length === 0, small.join(" | "));
  await ctx.close();
}

// ───────────────────────────── motion ─────────────────────────────
console.log("Motion");
{
  const { ctx, page } = await open(1280, "/", { reducedMotion: "reduce" });
  await page.evaluate(() => window.scrollTo(0, 600)); await page.waitForTimeout(300);
  const hidden = await page.evaluate(() => [...document.querySelectorAll("[data-reveal]")].filter((e) => getComputedStyle(e).opacity !== "1").length);
  ok("reduced motion: every revealed element is visible at once", hidden === 0, String(hidden));
  const dur = await page.evaluate(() => Math.max(...[...document.querySelectorAll("[data-reveal], a, button")].map((e) => parseFloat(getComputedStyle(e).animationDuration) || 0)));
  ok("reduced motion: animations are effectively off", dur < 0.05, String(dur));
  await ctx.close();
}
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(base + "/", { waitUntil: "load" });
  const hidden = await page.evaluate(() => [...document.querySelectorAll("[data-reveal]")].filter((e) => getComputedStyle(e).opacity === "0").length);
  ok("without JavaScript all content is visible", hidden === 0, String(hidden));
  await ctx.close();
}
{
  const { ctx, page } = await open(1280, "/");
  const css = await page.evaluate(async () => { const l = [...document.styleSheets].map((s) => s.href).filter(Boolean)[0]; return (await fetch(l)).text(); });
  ok("the brand easing curve is defined", /cubic-bezier\(\s*\.22,\s*1,\s*\.36,\s*1\)|cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\)/.test(css));
  const trans = await page.locator("main a", { hasText: "Discuss your project" }).first().evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration) * 1000);
  ok("hover transitions run 120–180 ms", trans >= 120 && trans <= 180, String(trans));
  await ctx.close();
}

// ───────────────────────────── other pages ─────────────────────────────
console.log("Other pages share the system");
for (const [path, needle] of [["/services", "Short-form editing"], ["/work", "View my work|Work"], ["/process", "Brief"], ["/about", "Faizan Ali"], ["/pricing", "Pricing"], ["/faq", "FAQ"], ["/contact", "Send message"], ["/start-project", "Discuss your project|Send project details|Continue"]]) {
  const { ctx, page } = await open(1280, path);
  const t = await page.locator("body").innerText();
  const f = await style(page, "h1", ["font-family", "color"]).catch(() => null);
  ok(`${path} renders in Manrope/navy and mentions "${needle}"`, new RegExp(needle).test(t) && (!f || (/^"?Manrope/.test(f["font-family"]) && same(rgb(f.color), hex(P.navy)))), JSON.stringify(f));
  await ctx.close();
}
{
  const { ctx, page } = await open(1280, "/contact");
  const input = await style(page, "input[name=email]", ["height", "border-top-color", "border-radius", "font-size"]);
  ok("form fields are at least 44 px high with 16 px text", parseFloat(input.height) >= 44 && input["font-size"] === "16px", JSON.stringify(input));
  ok("field borders are visible (≥3:1 against white)", ratio(rgb(input["border-top-color"]), hex(P.white)) >= 3, input["border-top-color"]);
  const label = await page.locator("label", { hasText: "Email" }).first().isVisible();
  ok("labels stay visible (no placeholder-only fields)", label);
  await page.getByRole("button", { name: "Send message" }).click();
  await page.waitForTimeout(400);
  const err = await page.locator("[role=alert], [data-field-error]").first().isVisible().catch(() => false);
  ok("a validation message appears next to the field", err);
  await ctx.close();
}
{
  const { ctx, page } = await open(1280, "/login");
  const demo = page.getByRole("button", { name: /^client$/i });
  if (await demo.count()) {
    await demo.click();
    await page.waitForURL("**/dashboard", { timeout: 10000 });
    console.log("Client dashboard");
    const bg = await style(page, "body", ["background-color"]);
    ok("dashboard keeps the quiet light background", same(rgb(bg["background-color"]), hex(P.paper)), bg["background-color"]);
    const cta = page.locator("main a, main button", { hasText: /Review V\d|Download final files|New project/ }).first();
    if (await cta.count()) {
      const c = await cta.evaluate((el) => getComputedStyle(el).backgroundColor);
      ok("dashboard actions are Signature Blue", same(rgb(c), hex(P.blue)), c);
    }
    const t = await page.locator("main").innerText();
    ok("status wording is plain and first-person", !/\b(we|our)\b/i.test(t), (t.match(/.{15}\b(we|our)\b.{15}/i) || [""])[0]);
  } else console.log("  (dashboard checks skipped: demo sign-in is off)");
  await ctx.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
