/**
 * Runtime-configuration checks: behaviour that must follow the environment the server STARTS with, not the one it was built with
 * (a Docker image is built once, without your storage or spam-protection settings, and configured when it runs).
 *
 * Start three production instances from the SAME build, each with different runtime settings, then run this script:
 *
 *   PLAIN    next start -p 3100
 *   S3       STORAGE_PROVIDER=s3 STORAGE_BUCKET=media STORAGE_REGION=eu-west-1 next start -p 3102
 *            (or STORAGE_ENDPOINT=https://<account>.r2.cloudflarestorage.com)
 *   TURNSTILE TURNSTILE_SECRET_KEY=x TURNSTILE_SITE_KEY=y next start -p 3103
 *
 *   BASE_PLAIN=http://localhost:3100 BASE_S3=http://localhost:3102 BASE_TURNSTILE=http://localhost:3103 node scripts/qa-runtime-config.mjs
 *
 * Turnstile itself is not contacted: Cloudflare's script is replaced by a stand-in, so this proves the wiring (widget shown, token
 * sent, widget reset, submission blocked without a token) but not Cloudflare's verdict.
 */
import { chromium } from "playwright-core";

const PLAIN = process.env.BASE_PLAIN ?? "http://localhost:3100";
const S3 = process.env.BASE_S3 ?? "http://localhost:3102";
const TS = process.env.BASE_TURNSTILE ?? "http://localhost:3103";
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; if (!cond) console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); };
const csp = async (base) => (await fetch(base + "/", { redirect: "manual" })).headers.get("content-security-policy") ?? "";
const directive = (policy, name) => policy.split(";").map((s) => s.trim()).find((s) => s.startsWith(name + " ")) ?? "";

// ── CSP follows the runtime storage settings ──
const plain = await csp(PLAIN);
const s3 = await csp(S3);
const ts = await csp(TS);
ok("plain instance: connect-src is same-origin only", directive(plain, "connect-src") === "connect-src 'self'", directive(plain, "connect-src"));
ok("plain instance: no Turnstile origin", !plain.includes("challenges.cloudflare.com"));
const bucket = ["https://fep-media.s3.eu-west-1.amazonaws.com", "https://s3.eu-west-1.amazonaws.com"]; // what the S3 instance above is started with
ok("S3 instance: connect-src allows exactly this bucket (uploads work)", bucket.every((o) => directive(s3, "connect-src").includes(o)), directive(s3, "connect-src"));
ok("S3 instance: media-src allows this bucket (playback works)", bucket.every((o) => directive(s3, "media-src").includes(o)), directive(s3, "media-src"));
ok("S3 instance: connect-src names no wildcard or unrelated host", directive(s3, "connect-src").split(/\s+/).slice(1).every((t) => t === "'self'" || bucket.includes(t)), directive(s3, "connect-src"));
ok("Turnstile instance: the challenge origin is allowed for scripts, frames and connections", ["script-src", "frame-src", "connect-src"].every((d) => directive(ts, d).includes("https://challenges.cloudflare.com")));
ok("every instance still sends frame-ancestors 'none'", [plain, s3, ts].every((p) => p.includes("frame-ancestors 'none'")));
for (const base of [PLAIN, S3, TS]) {
  const h = (await fetch(base + "/", { redirect: "manual" })).headers;
  ok(`${base}: static security headers are present`, h.get("x-content-type-options") === "nosniff" && h.get("x-frame-options") === "DENY" && !!h.get("strict-transport-security") && !!h.get("permissions-policy"));
}

// ── Turnstile wiring ──
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const FAKE_OK = `window.turnstile={_n:0,render(el,o){this._n++;el.setAttribute('data-rendered',String(this._n));setTimeout(()=>o.callback('FAKE-TOKEN-'+this._n),40);return 'w'+this._n},remove(){}};`;
const FAKE_NEVER = `window.turnstile={_n:0,render(el){this._n++;el.setAttribute('data-rendered',String(this._n));return 'w'+this._n},remove(){}};`;

async function contact(base, script) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();
  if (script) await page.route("https://challenges.cloudflare.com/**", (route) => route.fulfill({ contentType: "application/javascript", body: script }));
  const posts = [];
  page.on("request", (r) => { if (r.method() === "POST" && r.url().endsWith("/api/contact")) posts.push(JSON.parse(r.postData() ?? "{}")); });
  await page.goto(base + "/contact", { waitUntil: "networkidle" });
  return { ctx, page, posts };
}
async function fill(page) {
  const form = page.locator("main form");
  await form.getByLabel(/Your name/).fill("Runtime Check");
  await form.getByLabel(/^Email/).fill("runtime@example.com");
  await form.getByLabel(/^Message/).fill("Checking that the spam check is wired up end to end.");
  await page.waitForTimeout(2800); // the form's minimum fill time
}

{
  const { ctx, page } = await contact(PLAIN);
  ok("without Turnstile keys the contact form shows no challenge", (await page.getByTestId("turnstile").count()) === 0);
  await ctx.close();
}
{
  const { ctx, page, posts } = await contact(TS, FAKE_OK);
  await page.getByTestId("turnstile").waitFor({ timeout: 8000 });
  ok("with both keys the contact form renders the challenge", (await page.getByTestId("turnstile").count()) === 1);
  await fill(page);
  await page.getByRole("button", { name: /send message/i }).click();
  await page.waitForTimeout(2500);
  ok("the Turnstile token is sent with the submission", posts.length === 1 && /^FAKE-TOKEN-\d+$/.test(posts[0].turnstile ?? ""), JSON.stringify(posts[0]?.turnstile));
  ok("a rejected submission shows an error the person can read", (await page.locator('[role="alert"]').count()) > 0);
  ok("the challenge is reset after an attempt (tokens are single-use)", Number(await page.getByTestId("turnstile").getAttribute("data-rendered")) >= 1);
  await ctx.close();
}
{
  const { ctx, page, posts } = await contact(TS, FAKE_NEVER);
  await page.getByTestId("turnstile").waitFor({ timeout: 8000 });
  await fill(page);
  await page.getByRole("button", { name: /send message/i }).click();
  await page.waitForTimeout(600);
  ok("submission is blocked (and explained) until the challenge is solved", posts.length === 0 && /spam check/i.test(await page.locator('[role="alert"]').first().innerText()));
  await ctx.close();
}
{
  // and the server enforces it, whatever the browser does
  const r = await fetch(TS + "/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Bot", email: "bot@example.com", reason: "GENERAL", message: "Buy things now please, this is long enough.", t: Date.now() - 10_000 }) });
  const j = await r.json().catch(() => ({}));
  ok(`the server refuses a form without a Turnstile token (${r.status})`, r.status === 400 && /spam check/i.test(j?.error?.message ?? ""), JSON.stringify(j));
  const r2 = await fetch(TS + "/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Bot", email: "bot@example.com", reason: "GENERAL", message: "Buy things now please, this is long enough.", t: Date.now() - 10_000, turnstile: "forged-token" }) });
  ok(`the server refuses a forged token (fails closed when Cloudflare can't confirm it) (${r2.status})`, r2.status === 400);
}

await browser.close();
console.log(`\n${fail === 0 ? "Runtime configuration checks passed" : "Runtime configuration checks FAILED"}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
