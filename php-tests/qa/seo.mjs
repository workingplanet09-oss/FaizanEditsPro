/**
 * SEO and public-link audit. Crawls robots.txt and sitemap.xml, then checks every listed page and every internal link.
 *
 *   node php-tests/qa/seo.mjs                                   # against http://127.0.0.1:8081
 *   BASE=http://localhost:3101 PUBLIC_ORIGIN=https://studio.example.com node php-tests/qa/seo.mjs
 *
 * Start the app with APP_URL=$PUBLIC_ORIGIN to prove that no absolute URL falls back to localhost or a temporary host.
 */
const BASE = (process.env.BASE ?? "http://127.0.0.1:8081").replace(/\/$/, "");
const ORIGIN = (process.env.PUBLIC_ORIGIN ?? BASE).replace(/\/$/, "");
const production = ORIGIN !== BASE;

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) pass++;
  else {
    fail++;
    console.log(`  ✗ ${name}${extra ? `  — ${extra}` : ""}`);
  }
};
const get = (path, init) => fetch(path.startsWith("http") ? path : BASE + path, { redirect: "manual", ...init });
const attr = (tag, name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"))?.[2] ?? tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"))?.[3];
const decode = (s) => (s ?? "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const toPath = (u) => (u.startsWith(ORIGIN) ? u.slice(ORIGIN.length) || "/" : u.startsWith(BASE) ? u.slice(BASE.length) || "/" : u);

console.log(`\nSEO audit — ${BASE}${production ? `  (app believes it is at ${ORIGIN})` : ""}`);

// ── robots.txt ──
const robots = await (await get("/robots.txt")).text();
ok("robots.txt lists the sitemap", robots.includes(`Sitemap: ${ORIGIN}/sitemap.xml`), robots.split("\n").find((l) => /sitemap/i.test(l)));
for (const p of ["/admin", "/dashboard", "/editor", "/api"]) ok(`robots.txt keeps crawlers out of ${p}`, new RegExp(`Disallow:\\s*${p}`).test(robots));
ok("robots.txt does not block the public site", !/Disallow:\s*\/\s*$/m.test(robots));

// ── sitemap.xml ──
const sitemap = await (await get("/sitemap.xml")).text();
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decode(m[1]));
ok("sitemap has URLs", locs.length > 10, locs.length);
ok("sitemap has no duplicates", new Set(locs).size === locs.length);
ok(`every sitemap URL uses ${ORIGIN}`, locs.every((l) => l.startsWith(ORIGIN + "/") || l === ORIGIN), locs.find((l) => !l.startsWith(ORIGIN)));
ok("sitemap never contains portal pages", !locs.some((l) => /\/(admin|dashboard|editor|api|login|register)(\/|$)/.test(l)));
for (const must of ["/", "/services", "/pricing", "/contact"]) ok(`sitemap includes ${must}`, locs.includes(ORIGIN + must) || (must === "/" && locs.includes(ORIGIN)));

// ── every page ──
const linkTargets = new Map();
for (const loc of locs) {
  const path = toPath(loc);
  const res = await get(path);
  ok(`${path} answers 200`, res.status === 200, res.status);
  if (res.status !== 200) continue;
  const html = await res.text();
  const title = decode(html.match(/<title>([^<]*)<\/title>/i)?.[1]);
  ok(`${path}: has a title (${title.length} chars)`, title.length >= 8 && title.length <= 110, title);
  const brand = title.split("|").pop()?.trim();
  ok(`${path}: the brand name is not repeated in the title`, !brand || title.split(brand).length <= 2, title);
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const meta = (key, by = "name") => decode(attr(metas.find((m) => attr(m, by) === key) ?? "", "content"));
  const desc = meta("description");
  ok(`${path}: has a meta description (${desc.length} chars)`, desc.length >= 40 && desc.length <= 320, desc.slice(0, 60));
  const canonical = decode(attr((html.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i) ?? [""])[0], "href"));
  ok(`${path}: canonical points at ${ORIGIN}`, path === "/" ? canonical === ORIGIN || canonical === ORIGIN + "/" : canonical === ORIGIN + path, canonical);
  ok(`${path}: is indexable`, !/noindex/i.test(meta("robots")) && !/noindex/i.test(res.headers.get("x-robots-tag") ?? ""));
  ok(`${path}: Open Graph title/description/url/type`, !!meta("og:title", "property") && !!meta("og:description", "property") && meta("og:url", "property").startsWith(ORIGIN) && !!meta("og:type", "property"));
  const ogImage = meta("og:image", "property");
  ok(`${path}: Open Graph image is an absolute URL on ${ORIGIN}`, ogImage.startsWith(ORIGIN + "/") || /^https:\/\//.test(ogImage), ogImage);
  ok(`${path}: Twitter card with a large image`, meta("twitter:card") === "summary_large_image", meta("twitter:card"));
  ok(`${path}: <html lang> is set`, /<html[^>]*\blang=["'][a-z-]+["']/i.test(html));
  ok(`${path}: exactly one <h1>`, (html.match(/<h1\b/gi) ?? []).length === 1, (html.match(/<h1\b/gi) ?? []).length);
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  ok(`${path}: every image has alt text (${imgs.length} images)`, imgs.every((t) => /\balt\s*=/.test(t)), imgs.find((t) => !/\balt\s*=/.test(t))?.slice(0, 80));
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let parsed = true;
    try { JSON.parse(m[1]); } catch { parsed = false; }
    ok(`${path}: JSON-LD parses`, parsed);
  }
  if (production) {
    const leaks = [...html.matchAll(/(?:href|src|content|action)=["']([^"']*(?:localhost|127\.0\.0\.1|0\.0\.0\.0)[^"']*)["']/gi)].map((m) => m[1]);
    ok(`${path}: no localhost / loopback URLs in the markup`, leaks.length === 0, leaks[0]);
  }
  for (const m of html.matchAll(/<a\b[^>]*\bhref=["']([^"'#]+)["']/gi)) {
    let href = decode(m[1]);
    if (/^(mailto:|tel:|javascript:)/i.test(href)) continue;
    if (href.startsWith(ORIGIN)) href = toPath(href);
    if (href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/_next")) linkTargets.set(href.split("?")[0], path);
  }
}

// ── every internal link found on those pages ──
console.log(`  following ${linkTargets.size} distinct internal links…`);
for (const [href, from] of linkTargets) {
  let r = await get(href);
  for (let hop = 0; hop < 3 && r.status >= 300 && r.status < 400 && r.headers.get("location"); hop++) r = await get(toPath(new URL(r.headers.get("location"), BASE).toString()));
  ok(`link ${href} (from ${from}) resolves`, r.status < 400, r.status);
}

// ── error pages, icons, manifest ──
const missing = await get("/this-page-does-not-exist");
ok("unknown page is a real 404", missing.status === 404, missing.status);
ok("the 404 page is the branded one", /couldn(&#x27;|&#039;|'|’)t find that page/.test(await missing.text()));
const apiMissing = await get("/api/does-not-exist");
ok("unknown API path is a 404", apiMissing.status === 404, apiMissing.status);
for (const [path, type] of [["/favicon.svg", /svg/], ["/apple-icon", /png/], ["/opengraph-image", /png/], ["/manifest.webmanifest", /json/]]) {
  const r = await get(path);
  ok(`${path} is served`, r.status === 200 && type.test(r.headers.get("content-type") ?? ""), `${r.status} ${r.headers.get("content-type")}`);
}
const icoRedirect = await get("/favicon.ico");
ok("/favicon.ico is served as an image (or redirects to the icon)", (icoRedirect.status === 200 && /image\//.test(icoRedirect.headers.get("content-type") ?? "")) || (icoRedirect.status >= 300 && icoRedirect.status < 400), `${icoRedirect.status} ${icoRedirect.headers.get("content-type")}`);
const manifest = await (await get("/manifest.webmanifest")).json().catch(() => null);
ok("manifest has name, start_url and icons", !!manifest?.name && !!manifest?.start_url && manifest?.icons?.length > 0);
if (production) ok("manifest and icons never mention localhost", !JSON.stringify(manifest).includes("localhost"));
const portal = await get("/dashboard");
ok("portal pages send signed-out visitors to sign in", portal.status >= 300 && portal.status < 400 && /\/login/.test(portal.headers.get("location") ?? ""), `${portal.status} ${portal.headers.get("location")}`);

console.log(`\n${fail === 0 ? "SEO audit passed" : "SEO audit FAILED"}: ${pass} checks passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
