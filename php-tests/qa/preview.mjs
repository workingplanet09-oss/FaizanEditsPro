/**
 * The static preview (preview/) must work from any folder: every link and file reference resolves inside the folder, and
 * the pages load, style themselves and load their fonts when served from a deep sub-path (as a hosting artifact would).
 *   node php-tests/qa/preview.mjs
 */
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "preview");
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; if (!cond) console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); };
if (!existsSync(root)) { console.log("preview/ not found: run migration-tools/make-preview.mjs first"); process.exit(1); }

// 1. offline link check
const files = [];
(function walk(d) { for (const n of readdirSync(d)) { const f = join(d, n); statSync(f).isDirectory() ? walk(f) : files.push(f); } })(root);
const html = files.filter((f) => f.endsWith(".html") && !f.endsWith("hub.fragment.html"));
let refs = 0; const broken = [];
for (const f of html) {
  const t = readFileSync(f, "utf8");
  for (const m of t.matchAll(/\b(?:href|src|poster|data-src)="([^"#]+)(?:#[^"]*)?"/g)) {
    const u = m[1].replace(/&amp;/g, "&");
    if (/^(https?:|mailto:|tel:|data:|javascript:|\/\/)/i.test(u) || u === "") continue;
    refs++;
    if (u.startsWith("/")) { broken.push(`${f.slice(root.length)} → ${u} (starts with /)`); continue; }
    let p = resolve(dirname(f), u.split("?")[0]);
    if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
    if (!existsSync(p) && !existsSync(p + "/index.html")) broken.push(`${f.slice(root.length)} → ${u}`);
  }
}
ok(`${html.length} pages, ${refs} references: all resolve inside the folder`, broken.length === 0, broken.slice(0, 4).join(" | "));
const css = readFileSync(join(root, "assets/css/app.css"), "utf8");
ok("the stylesheet names its fonts relatively", !/url\(\/(?!\/)/.test(css) && /url\(\.\.\/fonts\//.test(css));

// 2. serve it from a deep sub-path and open pages in a browser
const PREFIX = "/artifact/abc123/v2";
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".ico": "image/x-icon", ".mp4": "video/mp4", ".mp3": "audio/mpeg", ".pdf": "application/pdf" };
const server = createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (!u.startsWith(PREFIX)) { res.writeHead(404).end("outside the artifact"); return; }
  let p = join(root, u.slice(PREFIX.length));
  if (!p.startsWith(root)) { res.writeHead(403).end(); return; }
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
  if (!existsSync(p)) { res.writeHead(404).end("not found"); return; }
  res.writeHead(200, { "content-type": types[extname(p)] || "application/octet-stream" }).end(readFileSync(p));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}${PREFIX}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
for (const path of ["/", "/home/", "/services/", "/work/", "/about/", "/dashboard/", "/admin/", "/editor/", "/login/"]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [], miss = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errs.push(m.text().slice(0, 120)));
  page.on("response", (r) => { if (r.status() >= 400 && !/fonts\.g/.test(r.url())) miss.push(r.status() + " " + r.url().replace(base, "")); });
  await page.goto(base + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  ok(`${path} loads without errors or missing files`, errs.length === 0 && miss.length === 0, [...errs, ...miss].slice(0, 3).join(" | "));
  if (path !== "/") {
    const fonts = await page.evaluate(async () => { await document.fonts.ready; return { inter: document.fonts.check('16px "Inter Variable"'), manrope: document.fonts.check('800 16px "Manrope Variable"'), loaded: [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family) }; });
    ok(`${path} is styled and its self-hosted fonts load`, /rgb\((247, 249, 252|255, 255, 255|11, 23, 48)\)/.test(bg) && fonts.loaded.includes("Inter Variable") && fonts.loaded.includes("Manrope Variable"), JSON.stringify({ bg, loaded: fonts.loaded }));
    ok(`${path} has the preview menu`, (await page.getByRole("button", { name: "Preview menu" }).count()) === 1);
  }
  await ctx.close();
}
{
  // actions that need PHP say so instead of failing silently
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await page.goto(base + "/login/", { waitUntil: "networkidle" });
  const r = await page.evaluate(() => fetch("/api/auth/login", { method: "POST" }).then((x) => x.json()));
  ok("API calls are answered with a clear 'static preview' message", r && r.ok === false && /static preview/i.test(r.error?.message || ""), JSON.stringify(r));
  await ctx.close();
}
await browser.close(); server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
