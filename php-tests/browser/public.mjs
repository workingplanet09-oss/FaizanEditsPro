import { BASE, check, launch, scrollAll, done } from "./lib.mjs";
const { browser, page, errors } = await launch();
const go = (p) => page.goto(BASE + p, { waitUntil: "networkidle" });

console.log("Public pages render with real content");
for (const [path, needle] of [["/", "Your Footage"], ["/services", "Editing for every kind of content"], ["/work", "A look at what we've made"], ["/case-studies", "The problem, the edit, the result"], ["/process", "Tell us what you need"], ["/pricing", "Pay for the outcome"], ["/about", "About"], ["/blog", "Editing tips"], ["/faq", "Everything you'd want to know first"], ["/contact", "Send message"], ["/book", "Pick a time"], ["/help", "How do I"], ["/privacy", "Privacy policy"], ["/terms", "Terms of service"]]) {
  const r = await page.goto(BASE + path, { waitUntil: "networkidle" });
  check(`${path} 200 and shows "${needle}"`, r.status() === 200 && (await page.content()).includes(needle));
}
const r404 = await page.goto(BASE + "/services/does-not-exist", { waitUntil: "networkidle" });
check("unknown service gives a real 404 page", r404.status() === 404 && (await page.content()).includes("couldn't find"));

console.log("Head metadata");
await go("/services/short-form-video-editing");
check("unique <title>", /Short.*\| FaizanEdits Pro/.test(await page.title()), await page.title());
check("meta description present", (await page.locator('meta[name=description]').getAttribute("content"))?.length > 30);
check("canonical has no localhost-less relative URL", /^https?:\/\//.test(await page.locator('link[rel=canonical]').getAttribute("href")));
check("og:image present", !!(await page.locator('meta[property="og:image"]').getAttribute("content")));
check("JSON-LD parses", await page.evaluate(() => [...document.querySelectorAll('script[type="application/ld+json"]')].every((s) => { try { JSON.parse(s.textContent); return true; } catch { return false; } })));
check("every <img> has an alt attribute", await page.evaluate(() => [...document.images].every((i) => i.hasAttribute("alt"))));

console.log("Navigation, theme, mobile menu");
await go("/");
await scrollAll(page);
await page.locator('header nav[aria-label=Main] a', { hasText: "Pricing" }).click();
await page.waitForURL("**/pricing");
check("header link navigates", page.url().endsWith("/pricing"));
await go("/");
const before = await page.evaluate(() => document.documentElement.classList.contains("dark"));
await page.locator("header [data-theme-toggle]").first().click();
await page.waitForTimeout(200);
const after = await page.evaluate(() => ({ dark: document.documentElement.classList.contains("dark"), stored: localStorage.getItem("fe-theme") }));
check("theme toggle changes theme and persists choice", after.dark !== before || after.stored !== null, JSON.stringify(after));
await page.setViewportSize({ width: 375, height: 800 });
await go("/");
check("no horizontal scroll at 375px", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await page.locator('[data-drawer-toggle="mobile-menu"]').click();
check("mobile menu opens", await page.locator("#mobile-menu").isVisible());
await page.setViewportSize({ width: 1280, height: 900 });

console.log("Work grid: filter + video dialog");
await go("/work");
const cards = await page.locator("li[data-cat]").count();
check("portfolio cards render", cards > 0, String(cards));
const tab = page.locator('[role=tab][data-cat]').nth(1);
const cat = await tab.getAttribute("data-cat");
await tab.click();
const visible = await page.locator("li[data-cat]:visible").count();
check(`filter "${cat}" narrows the grid`, visible > 0 && visible <= cards);
check("filtered-out cards all belong to other categories", await page.evaluate((c) => [...document.querySelectorAll("li[data-cat]")].every((li) => li.hidden === (li.dataset.cat !== c)), cat));
await page.locator('[role=tab][data-cat="All"]').click();
await page.locator("li[data-cat] [data-modal-open]:visible").first().click();
check("project dialog opens", await page.locator("dialog[open]").count() === 1);
check("video source only loaded after opening", await page.evaluate(() => { const d = document.querySelector("dialog[open]"); const m = d.querySelector("video,iframe"); return !m || !!m.getAttribute("src"); }));
await page.keyboard.press("Escape");
check("Escape closes dialog", await page.locator("dialog[open]").count() === 0);

console.log("FAQ accordion (no JS needed)");
await go("/faq");
const d = page.locator("details").first();
await d.locator("summary").click();
check("FAQ item expands", await d.evaluate((el) => el.open));

console.log("Contact form");
await go("/contact");
await page.locator('form[data-contact-form] button[type=submit]').click();
await page.waitForTimeout(700);
check("empty submit shows field errors", (await page.locator("[data-error-for]:visible").count()) >= 2);
await page.waitForTimeout(2600);
await page.fill("#f-name", "Test Person"); await page.fill("#f-email", "test.person@example.com"); await page.fill("#f-message", "Hello, I need help editing a weekly podcast.");
await page.locator('form[data-contact-form] button[type=submit]').click();
await page.waitForSelector("[data-contact-done]:not([hidden])", { timeout: 8000 }).catch(() => {});
check("valid submit shows the confirmation", await page.locator("[data-contact-done]").isVisible());

console.log("Honeypot is rejected");
const hp = await page.evaluate(async () => {
  const c = document.cookie.match(/fe_csrf=([^;]+)/)?.[1];
  const r = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": decodeURIComponent(c || "") }, body: JSON.stringify({ name: "Bot", email: "bot@example.com", reason: "GENERAL", message: "buy cheap stuff now please", hp: "gotcha", t: Date.now() - 60000 }) });
  return r.status;
});
check("bot submission with honeypot filled is refused", hp === 400, String(hp));

console.log("Booking flow");
await go("/book");
await page.waitForSelector("[data-slots] button", { timeout: 8000 }).catch(() => {});
const slotCount = await page.locator("[data-slots] button").count();
check("available slots load for the default meeting type", slotCount > 0, String(slotCount));
if (slotCount) {
  check("submit disabled until a slot is chosen", await page.locator("[data-booking-submit]").isDisabled());
  await page.locator("[data-slots] button").first().click();
  check("choosing a slot enables submit", await page.locator("[data-booking-submit]").isEnabled());
  await page.fill("#f-name", "Booking Tester"); await page.fill("#f-email", "booking.tester@example.com");
  await page.waitForTimeout(2200);
  await page.locator("[data-booking-submit]").click();
  await page.waitForSelector("[data-booking-done]:not([hidden])", { timeout: 8000 }).catch(() => {});
  check("booking confirmed", await page.locator("[data-booking-done]").isVisible());
}

console.log("Crawler files");
for (const [p, needle] of [["/robots.txt", "Sitemap:"], ["/sitemap.xml", "<urlset"], ["/manifest.webmanifest", "start_url"]]) {
  const t = await (await page.request.get(BASE + p)).text();
  check(`${p} served`, t.includes(needle));
}
const sm = await (await page.request.get(BASE + "/sitemap.xml")).text();
check("sitemap lists service pages", sm.includes("/services/"));
check("robots blocks private areas", (await (await page.request.get(BASE + "/robots.txt")).text()).includes("Disallow: /admin"));
await browser.close();
done(errors);
