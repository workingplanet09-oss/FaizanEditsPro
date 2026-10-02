// Dev-time only: renders the brand share card, the FA monogram favicon (SVG) and app icons that ship in public_html.
// Run: node migration-tools/make-icons.mjs   (needs Playwright + Chromium; the output files are committed, nothing runs on the host)
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pub = join(dirname(fileURLToPath(import.meta.url)), "..", "public_html");
const root = join(pub, "assets", "img");
mkdirSync(root, { recursive: true });
const fontB64 = readFileSync(join(pub, "assets", "fonts", "manrope-latin-wght-normal.woff2")).toString("base64");
const interB64 = readFileSync(join(pub, "assets", "fonts", "inter-latin-wght-normal.woff2")).toString("base64");
const face = `@font-face{font-family:M;src:url(data:font/woff2;base64,${fontB64}) format('woff2');font-weight:200 800}@font-face{font-family:I;src:url(data:font/woff2;base64,${interB64}) format('woff2');font-weight:100 900}`;

// Brand tokens (Faizan Ali brand specification)
const NAVY = "#10213D", BLUE = "#2457E6", MIST = "#EAF0FF", WHITE = "#FFFFFF";

// "FA" monogram: white letters on Ink Navy with a small Signature Blue crop corner. Same artwork as monogram_svg() in app/lib/site-ui.php.
const mark = (bg = NAVY) => `<rect width="64" height="64" rx="14" fill="${bg}"/><path d="M15 46V18h13M15 31.5h10M30 46l9.5-28L49 46M33.5 37h12" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M54 44v10H44" fill="none" stroke="${BLUE}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${mark()}</svg>\n`;
writeFileSync(join(pub, "favicon.svg"), svg);
writeFileSync(join(root, "favicon.svg"), svg);

const portrait = readFileSync(join(root, "faizan-ali.jpg")).toString("base64");
const og = `<style>${face}*{box-sizing:border-box;margin:0}body{width:1200px;height:630px;background:${NAVY};color:${WHITE};font-family:I,Arial,sans-serif;padding:64px 72px;display:flex;gap:56px;align-items:stretch}
.left{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:space-between}
.brand{display:flex;align-items:center;gap:20px}.brand svg{width:64px;height:64px}.name{font-family:M,Arial,sans-serif;font-size:36px;font-weight:800;letter-spacing:-.5px;line-height:1}.desc{margin-top:6px;font-size:22px;color:${MIST}}
h1{font-family:M,Arial,sans-serif;font-size:62px;line-height:1.1;letter-spacing:-1.5px;font-weight:800}
.foot{display:flex;align-items:center;gap:18px;font-size:20px;color:${MIST}}.pill{padding:14px 26px;border-radius:12px;background:${BLUE};color:#fff;font-weight:600;font-size:24px;white-space:nowrap}
.photo{width:410px;height:502px;margin-top:2px;border-radius:16px;overflow:hidden;position:relative;flex:none;align-self:center}
.photo img{width:100%;height:100%;object-fit:cover;object-position:50% 8%;display:block}
.photo:after{content:"";position:absolute;right:14px;bottom:14px;width:34px;height:34px;border-right:4px solid #fff;border-bottom:4px solid #fff;border-radius:0 0 8px 0;opacity:.9}</style>
<div class="left"><div class="brand"><svg viewBox="0 0 64 64">${mark("#fff").replace(/stroke="#fff"/, `stroke="${NAVY}"`)}</svg><div><div class="name">Faizan Ali</div><div class="desc">Video Editor and Content Creator</div></div></div>
<h1>Video editing that brings your message into focus.</h1>
<div class="foot"><div class="pill">Discuss your project</div><div style="white-space:nowrap">Short-form · Podcast · Motion</div></div></div>
<div class="photo"><img alt="" src="data:image/jpeg;base64,${portrait}"></div>`;

const icon = (size, maskable = false) => `<style>*{margin:0}body{width:${size}px;height:${size}px;background:${NAVY}}svg{width:${size}px;height:${size}px;display:block}</style><svg viewBox="${maskable ? "-10 -10 84 84" : "0 0 64 64"}">${mark()}</svg>`;

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
async function shot(html, w, h, file) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.setContent(html, { waitUntil: "load" });
  await p.evaluate(() => document.fonts.ready);
  writeFileSync(join(root, file), await p.screenshot({ type: "png" }));
  await p.close();
}
await shot(og, 1200, 630, "og.png");
await shot(icon(180, true), 180, 180, "apple-icon.png");
await shot(icon(192), 192, 192, "icon-192.png");
await shot(icon(512), 512, 512, "icon-512.png");
await shot(icon(32), 32, 32, "favicon-32.png");
await b.close();
console.log("wrote favicon.svg og.png apple-icon.png icon-192.png icon-512.png favicon-32.png");
