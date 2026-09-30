// First-run wizard on a freshly imported database. Start a second server against an EMPTY imported database:
//   mysql -e "create database fep_fresh ..." && mysql fep_fresh < public_html/database.sql
//   FEP_TEST_DB=fep_fresh FEP_TEST_URL=http://127.0.0.1:8082 FEP_TEST_MODE=live php -S 127.0.0.1:8082 -t public_html php-tests/dev-router.php
//   BASE=http://127.0.0.1:8082 SAMPLE=1 node php-tests/browser/setup.mjs      (SAMPLE=1 also ticks "load the sample studio")
import { check, launch, done } from "./lib.mjs";
const BASE = process.env.BASE || "http://127.0.0.1:8082";
const SAMPLE = process.env.SAMPLE === "1";
const { browser, page, errors } = await launch();
const text = async () => await page.locator("body").innerText();

console.log("Before setup");
const r = await page.goto(BASE + "/pricing", { waitUntil: "load" });
check("any page leads to the setup wizard", page.url().endsWith("/setup"), page.url());
check("wizard explains what to do", (await text()).includes("Welcome") && (await text()).includes("Installation code"));
const api = await page.request.post(BASE + "/api/leads", { data: { answers: {} } });
check("public API refuses until setup is finished", api.status() === 501 || api.status() === 503, String(api.status()));
const sql = await page.request.get(BASE + "/database.sql", { maxRedirects: 0 }); check("the SQL files are not downloadable", sql.status() === 403 || sql.status() === 404, String(sql.status()));

console.log("Validation");
await page.fill("#f-name", "Olivia Owner"); await page.fill("#f-email", "olivia@example.com"); await page.fill("#f-password", "a-long-passphrase-1"); await page.fill("#f-confirm", "a-long-passphrase-1"); await page.fill("#f-code", "wrong!");
await page.fill("#f-studio", "Northlight Video");
await page.getByRole("button", { name: "Create my account" }).click(); await page.waitForTimeout(700);
check("a wrong installation code is refused with a clear message", (await text()).includes("first 6 characters") || (await text()).includes("installation code"));
await page.fill("#f-code", "test-s"); await page.fill("#f-confirm", "different-passphrase-2");
await page.getByRole("button", { name: "Create my account" }).click(); await page.waitForTimeout(700);
check("mismatching passwords are refused", (await text()).toLowerCase().includes("passwords don't match") || (await text()).toLowerCase().includes("passwords don’t match"));
await page.fill("#f-password", "short"); await page.fill("#f-confirm", "short");
await page.getByRole("button", { name: "Create my account" }).click(); await page.waitForTimeout(700);
check("a short password is refused", (await text()).toLowerCase().includes("10") || (await text()).toLowerCase().includes("at least"));

console.log("Create the administrator");
await page.fill("#f-password", "a-long-passphrase-1"); await page.fill("#f-confirm", "a-long-passphrase-1");
if (SAMPLE) await page.getByLabel("Also load the sample studio").check();
await page.getByRole("button", { name: "Create my account" }).click();
await page.waitForURL("**/admin/settings", { timeout: 60000 });
check("lands in the admin console, signed in", page.url().endsWith("/admin/settings") && (await text()).includes("Settings"));
await page.goto(BASE + "/admin", { waitUntil: "load" });
check("command center opens", (await text()).includes("Everything that needs you today"));
check("studio name was saved", (await text()).includes("Northlight Video"));
await page.goto(BASE + "/", { waitUntil: "load" });
check("public site shows the new studio name", (await text()).includes("Northlight Video"));
await page.goto(BASE + "/setup", { waitUntil: "load" });
check("the wizard is gone once finished", !page.url().endsWith("/setup"), page.url());
const again = await page.request.post(BASE + "/api/setup", { data: { name: "Mallory", email: "m@example.com", password: "another-passphrase-3", confirm: "another-passphrase-3", code: "test-s" }, headers: { "x-csrf-token": (await page.context().cookies()).find((c) => c.name === "fe_csrf")?.value ?? "" } });
check("setup cannot be run a second time", again.status() === 409, String(again.status()));
if (SAMPLE) {
  await page.goto(BASE + "/admin/clients?section=all", { waitUntil: "load" });
  check("sample clients were loaded", (await text()).includes("Northwind Realty"));
  await page.goto(BASE + "/admin/projects?scope=all", { waitUntil: "load" });
  check("sample projects were loaded", (await text()).includes("Listing Tour"));
} else {
  await page.goto(BASE + "/admin/clients?section=all", { waitUntil: "load" });
  check("a clean install has no clients", (await text()).includes("No clients here yet"));
}
await browser.close();
done(errors);
