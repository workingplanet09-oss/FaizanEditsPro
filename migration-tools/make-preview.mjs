// Dev-time only: turns a RUNNING copy of the site (with the sample studio loaded) into a folder of plain static HTML files
// that can be opened from disk or any static host — public pages, plus the client portal, admin console and editor workspace
// as the demo accounts see them. Actions that need the PHP server (saving, uploading, paying) are switched off in the copy
// and say so. Nothing here ships to the hosting account.
//
//   BASE=http://127.0.0.1:8120 OUT=preview node migration-tools/make-preview.mjs
//
// Needs Playwright + Chromium and a site running in demo mode (mode 'demo', sample studio imported).
import { chromium } from "playwright-core";
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = (process.env.BASE || "http://127.0.0.1:8120").replace(/\/$/, "");
const OUT = join(root, process.env.OUT || "preview");
const exe = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium";

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(join(root, "public_html", "assets"), join(OUT, "assets"), { recursive: true });
// the stylesheet names its fonts by absolute path (/assets/fonts/…), which breaks when the copy is served from a sub-folder
{
  const f = join(OUT, "assets", "css", "app.css");
  writeFileSync(f, readFileSync(f, "utf8").replace(/url\(\/assets\/fonts\//g, "url(../fonts/"));
}
cpSync(join(root, "public_html", "favicon.svg"), join(OUT, "favicon.svg"));
cpSync(join(root, "public_html", "assets", "img", "favicon-32.png"), join(OUT, "favicon.ico"));

// ── URL helpers ──
const SKIP = /^\/(api|logout|s\/|setup|cron|sitemap|robots|manifest|opengraph|apple-icon|favicon|auth\/|download|uploads|storage)/;
const FILE_EXT = /\.(xml|txt|pdf|png|jpe?g|gif|webp|svg|ico|zip|mp4|webm|json|webmanifest|css|js|woff2?)(\?|$)/i;
function canon(href) {
  let u;
  try { u = new URL(href, BASE + "/"); } catch { return null; }
  if (u.origin !== BASE) return null;
  let p = u.pathname.replace(/\/+$/, "") || "/";
  if (SKIP.test(p) || FILE_EXT.test(p)) return null;
  const tab = u.searchParams.get("tab");
  if (p === "/login") return "/login";
  if (p.startsWith("/start-project")) return "/start-project";
  return p + (tab && /^[a-z-]+$/.test(tab) ? "?tab=" + tab : "");
}
// record ids (25-character cuids) become their last 8 characters in file names; collisions get a counter
const shortIds = new Map(), usedShort = new Set();
const shortId = (id) => { if (!shortIds.has(id)) { let t = id.slice(-8), n = 2; while (usedShort.has(t)) t = id.slice(-8) + n++; usedShort.add(t); shortIds.set(id, t); } return shortIds.get(id); };
const fileFor = (c) => (c === "/" ? "home" : c.split("?")[0].replace(/[a-z0-9]{18,}/gi, shortId).slice(1) + (c.includes("?") ? "__" + c.split("?")[1].replace(/[^a-z0-9=-]/gi, "-") : "")) + "/index.html"; // index.html at the top is the preview hub
const groupKey = (c) => c.split("?")[0].replace(/[a-z0-9]{18,}/gi, ":id");

// ── crawl ──
const pages = new Map(); // canon path → { html, area }
async function crawl(request, seeds, area, { prefix, max, perGroup = 3 }) {
  const queue = seeds.map(canon).filter(Boolean);
  const seen = new Set(queue);
  const groups = new Map();
  let n = 0;
  while (queue.length && n < max) {
    const c = queue.shift();
    if (pages.has(c)) continue;
    const res = await request.get(BASE + c.replace("?tab=", "?tab="), { maxRedirects: 0, failOnStatusCode: false }).catch(() => null);
    if (!res || res.status() !== 200 || !/text\/html/.test(res.headers()["content-type"] || "")) continue;
    const g = groupKey(c);
    groups.set(g, (groups.get(g) || 0) + 1);
    const html = await res.text();
    pages.set(c, { html, area });
    n++;
    for (const m of html.matchAll(/\bhref="([^"#]+)(?:#[^"]*)?"/g)) {
      const d = canon(m[1].replace(/&amp;/g, "&"));
      if (!d || seen.has(d) || pages.has(d)) continue;
      if (prefix && !prefix.test(d)) continue;
      if ((groups.get(groupKey(d)) || 0) >= perGroup) continue;
      seen.add(d); queue.push(d);
      groups.set(groupKey(d), (groups.get(groupKey(d)) || 0) + 1);
    }
  }
  return n;
}

const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
{
  const ctx = await browser.newContext();
  const n = await crawl(ctx.request, ["/", "/login", "/start-project", "/book", "/blog", "/help", "/terms", "/privacy"], "Public site", { prefix: /^\/(?!dashboard|admin|editor)/, max: 70, perGroup: 4 });
  console.log("public pages:", n);
  await ctx.close();
}
for (const [role, landing, prefix, max, label] of [["client", "/dashboard", /^\/dashboard/, 45, "Client portal"], ["admin", "/admin", /^\/admin/, 80, "Admin console"], ["editor", "/editor", /^\/editor/, 18, "Editor workspace"]]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: new RegExp("^" + role + "$", "i") }).click();
  await page.waitForURL((u) => prefix.test(u.pathname), { timeout: 15000 });
  const n = await crawl(ctx.request, [landing], label, { prefix, max, perGroup: 3 });
  console.log(label + ":", n);
  await ctx.close();
}
await browser.close();

// ── rewrite + write ──
const rel = (from, to) => { const r = relative(dirname(join(OUT, from)), join(OUT, to)).split("\\").join("/"); return r || "."; };
const written = new Map([...pages.keys()].map((c) => [c, fileFor(c)]));
let missing = 0;
function rewrite(c, html) {
  const from = written.get(c);
  const assetBase = rel(from, "assets").replace(/assets$/, "");
  html = html.split(BASE).join("");
  html = html.replace(/\b(href|src|action|data-src|poster|data-href)="(\/[^"]*)"/g, (m, attr, val) => {
    if (val.startsWith("//")) return m;
    const clean = val.replace(/&amp;/g, "&");
    if (/^\/(assets\/|favicon\.svg)/.test(clean)) return `${attr}="${assetBase}${clean.slice(1)}"`;
    const d = canon(clean);
    if (d && written.has(d)) return `${attr}="${rel(from, written.get(d))}${/#/.test(clean) ? clean.slice(clean.indexOf("#")) : ""}"`;
    if (attr === "href") { missing++; return `href="#preview-missing" data-pv-missing="1"`; }
    return m;
  });
  html = html.replace(/<link rel="manifest"[^>]*>/g, "").replace(/<link rel="canonical"[^>]*>/g, "");
  html = html.replace(/<meta charset="[^"]*">/i, (m) => m + `<script src="${assetBase}assets/js/preview-shim.js" data-pv-root="${assetBase}"></script>`);
  return html;
}

const shim = `/* Static preview shim: this copy of the site has no PHP server behind it. */
(function () {
  var s = document.currentScript, root = (s && s.getAttribute("data-pv-root")) || "./";
  window.__STATIC_PREVIEW__ = true;
  var MSG = "This is a static preview, so this action is switched off. Install the PHP app (see README) to use it.";
  function fake(url, method) {
    var u = String(url), path = u.replace(/^https?:\\/\\/[^/]+/, "");
    if (path.indexOf("/api/") !== 0) return null;
    if ((method || "GET").toUpperCase() === "GET" && /\\/api\\/(notifications|auth\\/session)/.test(path)) {
      return { ok: true, data: /session/.test(path) ? { user: null, providers: { google: false, demo: false } } : { items: [], unread: 0, nextCursor: null } };
    }
    return { ok: false, error: { code: "PREVIEW", message: MSG } };
  }
  var f = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : input && input.url, method = (init && init.method) || (input && input.method) || "GET";
    var r = fake(url, method);
    if (!r) return f.apply(this, arguments);
    return Promise.resolve(new Response(JSON.stringify(r), { status: r.ok ? 200 : 503, headers: { "content-type": "application/json" } }));
  };
  var open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u) { this.__pv = fake(u, m); if (this.__pv) { arguments[1] = "data:application/json," + encodeURIComponent(JSON.stringify(this.__pv)); } return open.apply(this, arguments); };
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[data-pv-missing]");
    if (!a) return;
    e.preventDefault(); toast("That page is not part of this static preview.");
  });
  function toast(t) {
    var d = document.createElement("div"); d.setAttribute("role", "status");
    d.style.cssText = "position:fixed;left:50%;bottom:84px;transform:translateX(-50%);z-index:9999;background:#10213D;color:#fff;padding:12px 18px;border-radius:12px;font:600 15px Inter,Arial,sans-serif;box-shadow:0 8px 24px rgba(16,33,61,.2);max-width:90vw";
    d.textContent = t; document.body.appendChild(d); setTimeout(function () { d.remove(); }, 3500);
  }
  window.addEventListener("unhandledrejection", function () {});
  document.addEventListener("DOMContentLoaded", function () {
    var b = document.createElement("button"); b.type = "button"; b.textContent = "Preview menu"; b.setAttribute("aria-expanded", "false");
    b.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:9998;height:44px;padding:0 18px;border-radius:12px;border:0;background:#2457E6;color:#fff;font:600 16px Inter,Arial,sans-serif;cursor:pointer;box-shadow:0 8px 24px rgba(16,33,61,.2)";
    var lift = document.querySelector('nav[aria-label="Quick navigation"]') && innerWidth < 1024 ? 84 : 16; // keep clear of the portal's bottom tab bar on phones
    b.style.bottom = lift + "px";
    var p = document.createElement("div"); p.hidden = true; p.setAttribute("role", "dialog"); p.setAttribute("aria-label", "Preview pages");
    p.style.cssText = "position:fixed;right:16px;bottom:" + (lift + 52) + "px;z-index:9998;width:min(360px,calc(100vw - 32px));max-height:70vh;overflow:auto;background:#fff;color:#10213D;border:1px solid #D9E2EF;border-radius:16px;padding:16px;box-shadow:0 8px 24px rgba(16,33,61,.2);font:16px/1.5 Inter,Arial,sans-serif";
    b.onclick = function () { p.hidden = !p.hidden; b.setAttribute("aria-expanded", String(!p.hidden)); };
    fetch(root + "preview-pages.json").then(function (r) { return r.json(); }).then(function (d) {
      var h = '<p style="margin:0 0 12px;color:#526078;font-size:14px">Static copy of the site. Buttons that save or send are switched off.</p>';
      Object.keys(d).forEach(function (k) {
        h += '<div style="font:700 15px Manrope,Arial,sans-serif;margin:12px 0 4px">' + k + "</div>";
        d[k].forEach(function (i) { h += '<a href="' + root + i.file + '" style="display:block;padding:6px 0;color:#2457E6;text-decoration:underline;min-height:32px">' + i.title + "</a>"; });
      });
      p.innerHTML = h;
    }).catch(function () {});
    document.body.appendChild(p); document.body.appendChild(b);
  });
})();
`;
writeFileSync(join(OUT, "assets", "js", "preview-shim.js"), shim);

const index = {};
for (const [c, { html, area }] of pages) {
  const f = written.get(c);
  mkdirSync(dirname(join(OUT, f)), { recursive: true });
  writeFileSync(join(OUT, f), rewrite(c, html));
  const LABEL = { "/": "Home", "/login": "Sign in", "/start-project": "Discuss your project (project form)" };
  const title = LABEL[c] || (html.match(/<title>([^<]*)<\/title>/) || [, c])[1].replace(/\s*\|\s*Faizan Ali\s*$/, "").replace(/&amp;/g, "&").replace(/&#0?39;/g, "'");
  (index[area] ||= []).push({ title: title + (c.includes("?tab=") ? " (" + c.split("tab=")[1] + ")" : ""), file: f, path: c });
}
writeFileSync(join(OUT, "preview-pages.json"), JSON.stringify(index, null, 1));

// ── the hub page (index.html): where a visitor of the folder starts ──
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const order = ["Public site", "Client portal", "Admin console", "Editor workspace"];
const blurb = {
  "Public site": "What a visitor sees: home, services, work, process, pricing, FAQ, contact, booking and the project form.",
  "Client portal": "What a client sees after signing in as the demo client: dashboard, project, video review, quotes and invoices.",
  "Admin console": "What I see: command centre, projects, leads, billing, content and settings.",
  "Editor workspace": "What a hired editor sees: only the projects assigned to them.",
};
const groups = order.filter((k) => index[k]).map((k) => `<section aria-labelledby="g-${esc(k.split(" ")[0])}"><h2 id="g-${esc(k.split(" ")[0])}">${esc(k)}</h2><p>${esc(blurb[k])}</p><ul>${index[k].map((i) => `<li><a href="${esc(i.file)}">${esc(i.title)}</a></li>`).join("")}</ul></section>`).join("\n");
const swatches = [["Signature Blue", "#2457E6"], ["Ink Navy", "#10213D"], ["Paper", "#F7F9FC"], ["Slate", "#526078"], ["Mist Blue", "#EAF0FF"]].map(([n, h]) => `<li><span class="sw" style="background:${h}"></span><span><b>${n}</b><br>${h}</span></li>`).join("");
const hubBody = `<main class="wrap">
<header class="top"><div class="mark" aria-hidden="true">FA</div><div><p class="eyebrow">Video Editor and Content Creator</p><h1>Faizan Ali website, as built</h1></div></header>
<p class="lead">Video editing that brings your message into focus. This is a static copy of every screen of the finished site, with the branding applied throughout. Open any page below; the <b>Preview menu</b> button on each page lists them all.</p>
<p class="note" role="note">Static copy: reading, scrolling, filters, the FAQ, dark mode and the project form steps work. Anything that saves, uploads, pays or sends needs the PHP application and is switched off here. All names, prices and projects are sample content.</p>
<p><a class="btn" href="home/index.html">Discuss your project</a> <a class="btn alt" href="work/index.html">View my work</a></p>
<div class="grid">${groups}</div>
<section aria-labelledby="g-brand"><h2 id="g-brand">Brand tokens in use</h2><ul class="sws">${swatches}</ul><p>Manrope for headings, Inter for text, 1200 px column, 16 px cards, 12 px buttons.</p></section>
</main>`;
const hubStyle = `
:root{--bg:#F7F9FC;--fg:#10213D;--muted:#526078;--surface:#FFFFFF;--line:#D9E2EF;--accent:#2457E6;--accent-fg:#FFFFFF;--accent-text:#2457E6;--mist:#EAF0FF;--font-d:"Manrope",Arial,sans-serif;--font-b:"Inter",Arial,sans-serif}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0B1730;--fg:#FFFFFF;--muted:#C9D6F0;--surface:#10213D;--line:#27406B;--accent-text:#A9C0FF;--mist:#172A4C;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0B1730;--fg:#FFFFFF;--muted:#C9D6F0;--surface:#10213D;--line:#27406B;--accent-text:#A9C0FF;--mist:#172A4C;color-scheme:dark}
body{background:var(--bg);color:var(--fg);font:18px/1.6 var(--font-b);margin:0}
.wrap{max-width:1100px;margin:0 auto;padding-inline:max(16px,4vw);padding-block:48px 72px}
.top{display:flex;gap:16px;align-items:center}.mark{width:56px;height:56px;border-radius:14px;background:#10213D;color:#fff;display:grid;place-items:center;font:800 22px var(--font-d);box-shadow:inset -8px -8px 0 -6px #2457E6}
.eyebrow{margin:0;color:var(--accent-text);font-weight:600;font-size:15px}
h1{font:800 clamp(32px,5vw,52px)/1.08 var(--font-d);margin:4px 0 0;letter-spacing:-.02em;text-wrap:balance}
h2{font:700 24px/1.2 var(--font-d);margin:0 0 6px}
.lead{max-width:62ch;font-size:19px;color:var(--muted);margin:24px 0 16px}
.note{max-width:70ch;background:var(--mist);border-radius:12px;padding:14px 18px;margin:0 0 24px;font-size:16px}
.btn{display:inline-flex;align-items:center;min-height:46px;padding:0 22px;border-radius:12px;background:var(--accent);color:var(--accent-fg);font-weight:600;text-decoration:none;margin:0 8px 8px 0;transition:background-color .15s}
.btn:hover{background:#1D46BC}.btn.alt{background:transparent;color:var(--fg);border:1px solid #7C8AA6}.btn.alt:hover{background:var(--mist)}
.btn:focus-visible,a:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:24px;margin-block:32px}
.grid section,section[aria-labelledby=g-brand]{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:24px;min-width:0}
.grid p,section p{color:var(--muted);font-size:16px;margin:0 0 12px}
ul{list-style:none;padding:0;margin:0}.grid li a{display:block;padding:6px 0;color:var(--accent-text);text-decoration:underline;text-underline-offset:3px;overflow-wrap:anywhere}
.sws{display:flex;flex-wrap:wrap;gap:16px;margin-block:12px}.sws li{display:flex;gap:10px;align-items:center;font-size:15px;line-height:1.3}.sw{width:40px;height:40px;border-radius:10px;border:1px solid var(--line)}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}`;
const font = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Manrope:wght@700;800&display=swap">';
const hubTitle = "Faizan Ali Website";
writeFileSync(join(OUT, "index.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${hubTitle}</title>${font}<style>${hubStyle}</style></head><body>${hubBody}</body></html>\n`);
// the same hub without document tags: the Artifact tool adds its own skeleton around it
writeFileSync(join(OUT, "hub.fragment.html"), `<title>${hubTitle}</title>${font}<style>${hubStyle}</style>${hubBody}\n`);
// every reference must now be relative: report anything still pointing at the server root
{
  let rooted = 0;
  for (const [c] of pages) { const t = readFileSync(join(OUT, written.get(c)), "utf8"); rooted += (t.match(/\b(?:href|src|poster|data-src)="\/(?!\/)/g) || []).length; } // form actions point at /api, which the shim answers
  const css = readFileSync(join(OUT, "assets", "css", "app.css"), "utf8");
  rooted += (css.match(/url\(\/(?!\/)/g) || []).length;
  console.log(rooted ? `WARNING: ${rooted} references still start with "/"` : "all references are relative");
}
console.log(`wrote ${pages.size} pages to ${relative(root, OUT)}/ (${missing} links to pages outside the preview were disabled)`);
