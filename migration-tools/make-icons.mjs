// Dev-time only: renders the static share card and app icons that ship in public_html/assets/img.
// Run: node migration-tools/make-icons.mjs   (needs Playwright + Chromium; the output PNGs are committed, nothing runs on the host)
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "public_html", "assets", "img");
mkdirSync(root, { recursive: true });
const fontB64 = readFileSync(join(root, "..", "fonts", "manrope-latin-wght-normal.woff2")).toString("base64");
const face = `@font-face{font-family:M;src:url(data:font/woff2;base64,${fontB64}) format('woff2');font-weight:200 800}`;
const accent = "#FF5B2E";

const og = `<style>${face}*{box-sizing:border-box;margin:0}body{width:1200px;height:630px;background:#09090b;color:#f4f3ef;font-family:M,sans-serif;padding:72px;display:flex;flex-direction:column;justify-content:space-between}
.brand{display:flex;align-items:center;gap:20px;font-size:34px;font-weight:800;letter-spacing:-1px}.mark{width:64px;height:64px;border-radius:18px;background:#f4f3ef;color:#09090b;display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:800;position:relative}
.mark i{position:absolute;right:13px;bottom:14px;width:9px;height:9px;border-radius:50%;background:${accent}}
h1{font-size:84px;line-height:1.02;letter-spacing:-3px;max-width:980px;font-weight:800}.bar{margin-top:36px;width:140px;height:10px;border-radius:5px;background:${accent}}
.foot{display:flex;align-items:center;gap:18px;font-size:26px;color:#a1a1aa}.pill{padding:10px 22px;border-radius:999px;background:${accent};color:#0b0b0c;font-weight:700}</style>
<div class="brand"><div class="mark">F<i></i></div>FaizanEdits Pro</div><div><h1>Your footage. Our edit. Content people remember.</h1><div class="bar"></div></div>
<div class="foot"><div class="pill">Start a project</div><div>Fixed-scope quotes · Timestamped review · Clear turnaround</div></div>`;

const icon = (size) => `<style>${face}*{margin:0}body{width:${size}px;height:${size}px;background:#09090b;display:flex;align-items:center;justify-content:center}svg{width:${Math.round(size * 0.62)}px;height:${Math.round(size * 0.62)}px}</style><svg viewBox="0 0 64 64"><path d="M22 18h22v6H29v6h13v6H29v10h-7z" fill="${accent}"/></svg>`;

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
async function shot(html, w, h, file) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.setContent(html, { waitUntil: "load" });
  await p.evaluate(() => document.fonts.ready);
  writeFileSync(join(root, file), await p.screenshot({ type: "png" }));
  await p.close();
}
await shot(og, 1200, 630, "og.png");
await shot(icon(180), 180, 180, "apple-icon.png");
await shot(icon(192), 192, 192, "icon-192.png");
await shot(icon(512), 512, 512, "icon-512.png");
await shot(icon(32), 32, 32, "favicon-32.png");
await b.close();
console.log("wrote og.png apple-icon.png icon-192.png icon-512.png favicon-32.png");
