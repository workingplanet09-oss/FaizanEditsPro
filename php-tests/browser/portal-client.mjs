import { BASE, check, launch, done } from "./lib.mjs";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scenario = (stage) => JSON.parse(execFileSync("php", ["php-tests/scenario.php", stage], { env: { ...process.env, FEP_STRICT: "1", FEP_DISABLE_RATE_LIMIT: "1" }, cwd: process.cwd() }).toString().trim().split("\n").pop());
const { browser, errors } = await launch();
async function session(s, width = 1280) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  await page.goto(BASE + "/login", { waitUntil: "load" });
  await page.fill("#f-email", s.clientEmail); await page.fill("#f-password", s.password);
  await page.click("form[data-mode-form=password] button[type=submit]");
  await page.waitForURL("**/dashboard", { timeout: 10000 });
  return { ctx, page };
}
const body = async (page) => (await page.locator("body").innerText());

console.log("Sign in through the real form");
const A = scenario("quote");
const { ctx: ctxA, page } = await session(A);
check("password sign-in lands on the client dashboard", page.url().endsWith("/dashboard"));
check("dashboard shows the quote as needing attention", (await body(page)).includes("Your quote is ready"));

console.log("Quote: read, accept");
await page.goto(`${BASE}/dashboard/quotes/${A.quoteId}`, { waitUntil: "load" });
check("quote shows line items and total", (await body(page)).includes("Short-form edit") && (await body(page)).includes("$200.00"), (await body(page)).slice(0, 200));
await page.getByRole("button", { name: "Accept quote" }).click();
await page.waitForURL(`**/dashboard/projects/${A.projectId}`, { timeout: 10000 }).catch(() => {});
check("accepting redirects to the project", page.url().includes(`/dashboard/projects/${A.projectId}`), page.url());
check("project now asks for the contract", (await body(page)).toLowerCase().includes("contract"));
await page.goto(`${BASE}/dashboard/quotes/${A.quoteId}`, { waitUntil: "load" });
check("accepted quote can't be accepted again (no button)", (await page.getByRole("button", { name: "Accept quote" }).count()) === 0 && (await body(page)).includes("Accepted"));

console.log("Quote: decline with a reason");
const B = scenario("quote");
const sB = await session(B);
await sB.page.goto(`${BASE}/dashboard/quotes/${B.quoteId}`, { waitUntil: "load" });
await sB.page.getByRole("button", { name: "Decline" }).click();
await sB.page.fill("#f-reason", "Budget is tight this quarter");
await sB.page.getByRole("button", { name: "Decline quote" }).click();
await sB.page.waitForTimeout(1200);
check("declined quote shows the declined state", (await body(sB.page)).includes("You declined this quote"), (await body(sB.page)).slice(0, 300));

console.log("Cross-client protection");
await sB.page.goto(`${BASE}/dashboard/projects/${A.projectId}`, { waitUntil: "load" });
check("client B cannot open client A's project (404)", (await sB.page.content()).includes("couldn't find") );
const r1 = await sB.page.request.get(`${BASE}/api/quotes/${A.quoteId}`); check("client B cannot read client A's quote via the API", r1.status() === 404, String(r1.status()));
await sB.page.goto(`${BASE}/admin`, { waitUntil: "load" }); check("client cannot open the admin console", !(await body(sB.page)).includes("Command center"), sB.page.url());
await sB.ctx.close();

console.log("Contract: sign");
const C = scenario("contract");
const sC = await session(C);
await sC.page.goto(`${BASE}/dashboard/contracts/${C.contractId}`, { waitUntil: "load" });
check("contract sections render", (await body(sC.page)).includes("Sign this agreement"));
check("sign button disabled until the terms are accepted", await sC.page.locator("[data-sign-btn]").isDisabled());
await sC.page.fill("#typed-sig", "Scenario Client");
await sC.page.locator("[data-agree]").evaluate((i) => i.closest("label").click());
check("typing a name and agreeing enables signing", await sC.page.locator("[data-sign-btn]").isEnabled());
await sC.page.locator("[data-kind=drawn]").click();
check("switching to Draw requires ink", await sC.page.locator("[data-sign-btn]").isDisabled());
const box = await sC.page.locator("[data-canvas]").boundingBox();
await sC.page.mouse.move(box.x + 20, box.y + 80); await sC.page.mouse.down(); await sC.page.mouse.move(box.x + 120, box.y + 40, { steps: 8 }); await sC.page.mouse.move(box.x + 220, box.y + 100, { steps: 8 }); await sC.page.mouse.up();
check("drawing a signature enables signing", await sC.page.locator("[data-sign-btn]").isEnabled());
await sC.page.locator("[data-sign-btn]").click();
await sC.page.waitForFunction(() => document.body.innerText.includes("Signed"), null, { timeout: 10000 }).catch(() => {});
check("contract is signed and shows the signature", (await body(sC.page)).includes("Signed") && (await sC.page.locator("img[alt^='Signature of']").count()) === 1);
await sC.ctx.close();

console.log("Invoice: pay (demo provider)");
const D = scenario("invoice");
const sD = await session(D);
await sD.page.goto(`${BASE}/dashboard/invoices/${D.invoiceId}`, { waitUntil: "load" });
check("invoice shows the amount due", (await body(sD.page)).toLowerCase().includes("amount due"));
await sD.page.locator("[data-pay-begin]").click();
await sD.page.waitForSelector("[data-pay-demo]:not([hidden])", { timeout: 8000 }).catch(() => {});
check("demo checkout panel appears (no real card)", await sD.page.locator("[data-pay-demo]").isVisible());
await sD.page.locator("[data-pay-demo-go]").click();
await sD.page.waitForURL("**paid=1", { timeout: 10000 }).catch(() => {});
check("payment recorded and confirmed", (await body(sD.page)).includes("Payment received"), sD.page.url());
await sD.page.goto(`${BASE}/dashboard/projects/${D.projectId}`, { waitUntil: "load" });
check("project moved on after payment (setup is next)", (await body(sD.page)).includes("Complete project setup"));
await sD.ctx.close();

console.log("Project setup wizard (post-payment brief)");
const E0 = scenario("onboarding");
const sE0 = await session(E0);
await sE0.page.goto(`${BASE}/dashboard/projects/${E0.projectId}/setup`, { waitUntil: "load" });
await sE0.page.waitForSelector("[data-title]", { timeout: 8000 });
check("project setup wizard loads from the database form", (await sE0.page.locator("[data-step]").innerText()).startsWith("Step 1 of"));
await sE0.ctx.close();

console.log("Review stage: messages, files, change requests, brand kit, settings");
const F = scenario("review");
const sF = await session(F);
const pf = sF.page;
await pf.goto(`${BASE}/dashboard/projects/${F.projectId}?tab=messages`, { waitUntil: "load" });
await pf.fill("#msg-body", "Hello team — can you confirm the delivery date?");
await pf.locator("[data-msg-form] button[type=submit]").click();
await pf.waitForFunction(() => document.body.innerText.includes("confirm the delivery date"), null, { timeout: 8000 }).catch(() => {});
check("message is sent and appears in the thread", (await body(pf)).includes("confirm the delivery date"));
await pf.reload({ waitUntil: "load" });
check("message persists after reload", (await body(pf)).includes("confirm the delivery date"));

await pf.goto(`${BASE}/dashboard/projects/${F.projectId}?tab=files`, { waitUntil: "load" });
check("files tab lists the footage uploaded earlier", (await body(pf)).includes("raw_interview.mp4"));
const tmp = mkdtempSync(join(tmpdir(), "pc-"));
const png = join(tmp, "logo_ref.png"); writeFileSync(png, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(3000, 7)]));
await pf.locator("input[type=file]").first().setInputFiles(png);
await pf.waitForFunction(() => document.body.innerText.includes("logo_ref.png"), null, { timeout: 12000 }).catch(() => {});
await pf.waitForTimeout(1800);
await pf.goto(`${BASE}/dashboard/projects/${F.projectId}?tab=files`, { waitUntil: "load" });
check("uploaded image is listed after the upload completes", (await body(pf)).includes("logo_ref.png"));
const dl = pf.waitForEvent("download", { timeout: 8000 }).catch(() => null);
await pf.locator('[data-asset-open][data-mode=download]').first().click();
const d = await dl;
check("Download starts from a short-lived signed link", !!d && /\/api\/storage\/object\?t=/.test(d.url()), d ? d.url().slice(0, 80) : "no download");
check("downloaded file keeps its real name", !!d && /raw_interview|logo_ref/.test(d.suggestedFilename()), d ? d.suggestedFilename() : "");

await pf.goto(`${BASE}/dashboard/projects/${F.projectId}?tab=versions`, { waitUntil: "load" });
check("videos tab shows V1 awaiting review", (await body(pf)).includes("V1") && (await body(pf)).includes("Awaiting your review"));

await pf.goto(`${BASE}/dashboard/projects/${F.projectId}?tab=changes`, { waitUntil: "load" });
await pf.fill("#f-whatChanged", "Please also deliver a 9:16 version for TikTok.");
await pf.getByRole("button", { name: "Submit change request" }).click();
await pf.waitForFunction(() => document.body.innerText.includes("9:16 version for TikTok"), null, { timeout: 8000 }).catch(() => {});
check("change request is recorded and listed", (await body(pf)).includes("9:16 version for TikTok"));

await pf.goto(`${BASE}/dashboard/brand-kit`, { waitUntil: "load" });
await pf.getByRole("button", { name: "Add colour" }).click();
await pf.locator('[data-row=colors] input[aria-label="Colour name"]').last().fill("Primary");
await pf.locator('[data-row=colors] input[aria-label="Hex"]').last().fill("#ff5b2e");
await pf.fill("#f-typographyRules", "Titles in sentence case.");
await pf.getByRole("button", { name: "Save brand kit" }).click();
await pf.waitForTimeout(1500);
await pf.reload({ waitUntil: "load" });
check("brand kit colour + typography persist", (await pf.locator('[data-row=colors] input[aria-label="Hex"]').count()) === 1 && (await pf.inputValue("#f-typographyRules")) === "Titles in sentence case.");

await pf.goto(`${BASE}/dashboard/settings`, { waitUntil: "load" });
await pf.fill("#f-name", "Scenario Client Renamed");
await pf.getByRole("button", { name: "Save profile" }).click();
await pf.waitForTimeout(1200);
await pf.reload({ waitUntil: "load" });
check("profile name change persists", (await pf.inputValue("#f-name")) === "Scenario Client Renamed");

await pf.goto(`${BASE}/dashboard/settings?tab=notifications`, { waitUntil: "load" });
const sw = pf.locator("li[data-cat=MESSAGE] [data-switch]").nth(1);
const was = await sw.getAttribute("aria-checked");
await sw.click(); await pf.waitForTimeout(900);
await pf.reload({ waitUntil: "load" });
check("notification preference toggle persists", (await pf.locator("li[data-cat=MESSAGE] [data-switch]").nth(1).getAttribute("aria-checked")) !== was);

await pf.goto(`${BASE}/dashboard/settings?tab=security`, { waitUntil: "load" });
await pf.fill("#f-current", "wrong-password-xx"); await pf.fill("#f-next", "Another-Pass-456!"); await pf.fill("#f-confirm", "Mismatch-Pass-789!");
await pf.getByRole("button", { name: "Change password" }).click();
check("password confirm mismatch is caught client-side", (await body(pf)).includes("Passwords don't match"));
await pf.fill("#f-confirm", "Another-Pass-456!");
await pf.getByRole("button", { name: "Change password" }).click(); await pf.waitForTimeout(900);
check("wrong current password is refused by the server", (await body(pf)).toLowerCase().includes("incorrect") || (await body(pf)).toLowerCase().includes("current password"), (await body(pf)).slice(0, 100));
await pf.getByRole("button", { name: "Set up two-factor authentication" }).click();
await pf.waitForSelector("img[alt^='QR code']", { timeout: 8000 }).catch(() => {});
check("two-factor setup shows a QR code and manual key", (await pf.locator("img[alt^='QR code']").count()) === 1 && (await body(pf)).includes("manually"));
check("settings page stays free of horizontal scroll at desktop", await pf.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await sF.ctx.close();

console.log("Delivered: secure downloads + feedback");
const G = scenario("delivered");
const sG = await session(G);
await sG.page.goto(`${BASE}/dashboard/projects/${G.projectId}?tab=delivery`, { waitUntil: "load" });
check("delivery tab offers the final file", (await body(sG.page)).includes("Ready to download") && (await body(sG.page)).includes("Master"));
await sG.page.goto(`${BASE}/dashboard/projects/${G.projectId}?tab=feedback`, { waitUntil: "load" });
await sG.page.locator("[data-rate='5']").click();
await sG.page.fill("#f-quote", "Fast, clear and the edit was spot on — would use again.");
await sG.page.getByRole("button", { name: "Send feedback" }).click();
await sG.page.waitForTimeout(1500);
await sG.page.goto(`${BASE}/dashboard/projects/${G.projectId}?tab=feedback`, { waitUntil: "load" });
check("feedback is saved (thank-you state)", (await body(sG.page)).includes("Feedback received"));
await sG.ctx.close();

console.log("Mobile layout");
const M = await session(F, 375);
await M.page.goto(`${BASE}/dashboard`, { waitUntil: "load" });
check("no horizontal scroll at 375px", await M.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
check("bottom navigation visible on mobile", await M.page.locator("nav[aria-label='Quick navigation']").isVisible());
await M.page.locator("[data-drawer-toggle=mobile-nav]").click();
check("mobile menu drawer opens", await M.page.locator("#mobile-nav").isVisible());
await M.ctx.close();

await browser.close();
done(errors);
