// Dev/test only: renders a small playable WebM (VP8) so browser tests can exercise the review player without proprietary codecs.
// Output: php-tests/fixtures/review-test.webm   Run: node migration-tools/make-test-video.mjs
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "php-tests", "fixtures", "review-test.webm");
mkdirSync(dirname(out), { recursive: true });
const FPS = 15, SECS = 12, W = 320, H = 180;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage();
const frames = await page.evaluate(async ({ FPS, SECS, W, H }) => {
  const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d"); const res = [];
  for (let f = 0; f < FPS * SECS; f++) {
    const t = f / FPS; g.fillStyle = `hsl(${(t * 30) % 360} 70% 35%)`; g.fillRect(0, 0, W, H);
    g.fillStyle = "#fff"; g.font = "bold 48px sans-serif"; g.fillText(String(Math.floor(t)).padStart(2, "0") + "s", 20, 100);
    g.fillRect(((f * 7) % (W - 20)), 140, 20, 20);
    res.push(c.toDataURL("image/jpeg", 0.8).split(",")[1]);
  }
  return res;
}, { FPS, SECS, W, H });
await browser.close();
const ff = spawn("/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux", ["-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "pipe:0", "-c:v", "libvpx", "-b:v", "300k", "-pix_fmt", "yuv420p", "-y", out], { stdio: ["pipe", "inherit", "inherit"] });
ff.stdin.on("error", () => {});
for (const f of frames) ff.stdin.write(Buffer.from(f, "base64"));
ff.stdin.end();
ff.on("close", (c) => console.log("ffmpeg exit", c, out));
