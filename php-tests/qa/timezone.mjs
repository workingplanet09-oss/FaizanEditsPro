// Time-zone consistency. The same site is opened from Karachi (UTC+5), Los Angeles (UTC-7/-8), Kiritimati (UTC+14) and Pago Pago (UTC-11)
// and the instants, calendar days and booking slots must agree everywhere:
//   1. every <time data-local> is converted to the viewer's zone by the browser, and every other date on the page is UTC text that does not change with the viewer
//   2. the public booking page: opening hours are the studio's (America/Los_Angeles here), each visitor sees them in their own zone, filed under their own calendar day
//   3. a call scheduled in the admin UI is stored as the exact instant, whatever zone the admin's browser is in
//   4. the admin calendar files an event under the viewer's local day
// Run: BASE=http://127.0.0.1:8081 node php-tests/qa/timezone.mjs   (demo data loaded; the script restores the booking settings it changes)
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";

const base = process.env.BASE ?? "http://127.0.0.1:8081";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { if (cond) pass++; else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); } };
const ZONES = ["Asia/Karachi", "America/Los_Angeles", "Pacific/Kiritimati", "Pacific/Pago_Pago", "UTC"];
const stamp = Date.now().toString(36);

async function context(timezoneId, who) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId, locale: "en-US" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/login", { waitUntil: "load" }); // like a real visitor: the site learns the zone from the first page
  if (who) await ctx.request.post(`${base}/api/auth/demo`, { data: { kind: who } });
  return { ctx, page, errors };
}
const api = async (c, method, path, data) => {
  const csrf = (await c.ctx.cookies()).find((x) => x.name === "fe_csrf")?.value ?? "";
  const r = await c.ctx.request.fetch(base + path, { method, data, headers: { "x-csrf-token": csrf, "content-type": "application/json" } });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status(), json, data: json?.data };
};

// ───────────── 1. <time> elements and zone-independent text ─────────────
console.log("1. Times on pages");
const PAGES = {
  admin: ["/admin", "/admin/leads", "/admin/clients", "/admin/projects", "/admin/quotes", "/admin/invoices", "/admin/payments", "/admin/contracts", "/admin/retainers", "/admin/calendar?view=month&date=2026-10-15", "/admin/tasks", "/admin/messages", "/admin/audit-log", "/admin/emails", "/admin/analytics", "/admin/submissions"],
  client: ["/dashboard", "/dashboard/projects", "/dashboard/quotes", "/dashboard/invoices", "/dashboard/contracts", "/dashboard/messages", "/dashboard/retainers", "/dashboard/files"],
  editor: ["/editor", "/editor/projects", "/editor/tasks", "/editor/revisions"],
};
const masked = {}; // page → zone → text with <time> elements masked
let timeEls = 0, converted = 0;
for (const who of Object.keys(PAGES)) {
  for (const zone of ZONES) {
    const c = await context(zone, who);
    const extra = [];
    if (who !== "editor") {
      const list = await api(c, "GET", "/api/projects?pageSize=3");
      for (const p of (list.data?.items ?? []).slice(0, 2)) extra.push(who === "admin" ? `/admin/projects/${p.id}` : `/dashboard/projects/${p.id}`);
    }
    for (const p of [...PAGES[who], ...extra]) {
      await c.page.goto(base + p, { waitUntil: "load" });
      await c.page.waitForTimeout(250);
      const r = await c.page.evaluate((tz) => {
        const els = [...document.querySelectorAll("time[data-local]")];
        const bad = els.filter((t) => {
          const d = new Date(t.getAttribute("datetime"));
          if (isNaN(d)) return true;
          const f = t.getAttribute("data-local");
          const opt = f === "time" ? { hour: "numeric", minute: "2-digit" } : f === "date" ? { year: "numeric", month: "long", day: "numeric" } : f === "short" ? { month: "short", day: "numeric" } : { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
          return t.textContent !== d.toLocaleString("en-US", { ...opt, timeZone: tz });
        }).map((t) => t.outerHTML.slice(0, 120));
        const clone = document.querySelector("main")?.cloneNode(true);
        clone?.querySelectorAll("time[data-local]").forEach((t) => (t.textContent = "⏱"));
        clone?.querySelectorAll("[data-ago]").forEach((t) => (t.textContent = "⏱"));
        return { n: els.length, bad, text: (clone?.innerText ?? "").replace(/\s+/g, " ").replace(/Good (morning|afternoon|evening)/g, "Hello") };
      }, zone);
      timeEls += r.n; converted += r.n - r.bad.length;
      ok(`${who} ${p} @${zone}: every <time> shows the viewer's local time`, r.bad.length === 0, r.bad[0]);
      ((masked[`${who}${p}`] ??= {})[zone]) = r.text;
    }
    await c.ctx.close();
  }
}
// greetings follow the viewer's clock on purpose; message lists change as the unread markers are cleared by viewing them
for (const [page, byZone] of Object.entries(masked)) {
  if (/\/messages$|\/calendar/.test(page)) continue; // the calendar files events under the viewer's own day (section 4)
  const ref = byZone["UTC"];
  for (const zone of ZONES) {
    // lists that depend on "now" (relative dates) can legitimately differ by a few characters only if the clock ticks across midnight
    ok(`${page}: all non-<time> text is identical in ${zone} and UTC`, byZone[zone] === ref, byZone[zone] === ref ? "" : `first difference near: ${firstDiff(byZone[zone], ref)}`);
  }
}
function firstDiff(a, b) { let i = 0; while (i < a.length && a[i] === b[i]) i++; return `…${a.slice(Math.max(0, i - 30), i + 40)}  ≠  …${b.slice(Math.max(0, i - 30), i + 40)}`; }
console.log(`   ${timeEls} <time> elements checked, ${converted} converted`);

// ───────────── 2. public booking ─────────────
console.log("2. Booking page");
const admin = await context("UTC", "admin");
const oldBooking = (await api(admin, "GET", "/api/admin/settings")).data.settings.booking;
const studioZone = "America/Los_Angeles";
const bookingCfg = { ...oldBooking, enabled: true, timezone: studioZone, days: [1, 2, 3, 4, 5], startHour: 9, endHour: 17, slotMinutes: 30, minNoticeHours: 0, horizonDays: 21 };
const saved = await api(admin, "PUT", "/api/admin/settings/booking", bookingCfg);
ok("the studio can set its opening hours in its own time zone", saved.status === 200, JSON.stringify(saved.json?.error ?? "").slice(0, 160));
const badZone = await api(admin, "PUT", "/api/admin/settings/booking", { ...bookingCfg, timezone: "Mars/Olympus" });
ok("an unknown time zone name is refused", badZone.status === 422, badZone.status);
const slotsRes = await api(admin, "GET", "/api/booking/slots?type=DISCOVERY_CALL&days=14");
const slots = slotsRes.data?.slots ?? [];
ok("slots are offered", slots.length > 20, slots.length);
// in the studio's zone every slot lies on a weekday between 09:00 and 17:00
const inStudio = (iso) => new Intl.DateTimeFormat("en-US", { timeZone: studioZone, weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(new Date(iso)).reduce((o, p) => ((o[p.type] = p.value), o), {});
ok("every slot is inside the studio's opening hours (Mon–Fri 09:00–17:00 Los Angeles, daylight saving included)", slots.every((s) => { const p = inStudio(s); return !["Sat", "Sun"].includes(p.weekday) && +p.hour >= 9 && +p.hour * 60 + +p.minute <= 17 * 60 - 30; }), slots.find((s) => { const p = inStudio(s); return ["Sat", "Sun"].includes(p.weekday) || +p.hour < 9 || +p.hour >= 17; }));
await admin.ctx.close();
let bookedIso = null;
for (const zone of ["America/Los_Angeles", "Asia/Karachi", "Pacific/Kiritimati", "Pacific/Pago_Pago"]) {
  const c = await context(zone, null);
  await c.page.goto(base + "/book", { waitUntil: "load" });
  await c.page.waitForSelector("[data-slots] button", { timeout: 8000 });
  const days = await c.page.locator("[data-days] button").count();
  let consistent = true, detail = "";
  for (let i = 0; i < Math.min(days, 6); i++) {
    await c.page.locator("[data-days] button").nth(i).click();
    const label = (await c.page.locator("[data-days] button").nth(i).innerText()).trim();
    const times = await c.page.locator("[data-slots] button").allInnerTexts();
    // expected: the slots whose date in this visitor's zone is the labelled day, shown as local clock times
    const mine = (await (await c.ctx.request.get(`${base}/api/booking/slots?type=DISCOVERY_CALL`)).json()).data.slots;
    const exp = await c.page.evaluate(({ slots, label }) => {
      const dayOf = (iso) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      return slots.filter((s) => dayOf(s) === label).map((s) => new Date(s).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
    }, { slots: mine, label });
    if (JSON.stringify(times.map((t) => t.trim())) !== JSON.stringify(exp)) { consistent = false; detail = `${label}: got ${times.slice(0, 3).join("|")}… expected ${exp.slice(0, 3).join("|")}…`; break; }
  }
  ok(`@${zone}: each day button lists exactly the slots that fall on that day in the visitor's own zone`, consistent, detail);
  const tzText = await c.page.locator("[data-tz]").innerText();
  ok(`@${zone}: the page names the visitor's zone`, tzText.includes(zone), tzText);
  if (zone === "Asia/Karachi") {
    await c.page.locator("[data-days] button").nth(1).click();
    await c.page.locator("[data-slots] button").nth(2).click();
    const chosen = await c.page.locator('input[name="startsAt"]').inputValue();
    bookedIso = chosen;
    await c.page.fill('input[name="name"]', "Zone Tester");
    await c.page.fill('input[name="email"]', `zone-${stamp}@example.test`);
    await c.page.waitForTimeout(2600); // the form refuses instant submissions
    await c.page.locator("[data-booking-submit]").click();
    await c.page.locator("[data-booking-done]:not([hidden])").waitFor({ timeout: 10000 }).catch(() => {});
    const done = await c.page.locator("[data-booking-when]").innerText().catch(() => "");
    const expLocal = await c.page.evaluate((iso) => new Date(iso).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" }), chosen);
    ok("the confirmation shows the booked time in the visitor's zone", done.includes(expLocal), `${done} vs ${expLocal}`);
  }
  await c.ctx.close();
}
const meetingRow = JSON.parse(execFileSync("mysql", ["-ufaizan", "-pfaizan_dev", "-N", "-e", `select json_object('startsAt', date_format(startsAt,'%Y-%m-%dT%H:%i:%s.000Z'), 'tz', timezone) from meetings where email='zone-${stamp}@example.test' order by createdAt desc limit 1`, process.env.FEP_TEST_DB ?? "fep_qa"]).toString().trim() || "null");
ok("the booking is stored as the exact instant that was chosen", meetingRow && bookedIso && meetingRow.startsAt === new Date(bookedIso).toISOString(), JSON.stringify([meetingRow, bookedIso]));
ok("...together with the visitor's zone", meetingRow?.tz === "Asia/Karachi", meetingRow?.tz);
const mail = JSON.parse(execFileSync("mysql", ["-ufaizan", "-pfaizan_dev", "-N", "-e", `select json_object('body', body) from email_logs where toEmail='zone-${stamp}@example.test' and templateKey='meeting_booked' order by createdAt desc limit 1`, process.env.FEP_TEST_DB ?? "fep_qa"]).toString().trim() || "null");
if (!mail) {
  // the confirmation email is queued; render it the way the worker does
  const adm = await context("UTC", "admin"); await api(adm, "POST", "/api/admin/jobs", {}); await adm.ctx.close();
}
const mail2 = mail ?? JSON.parse(execFileSync("mysql", ["-ufaizan", "-pfaizan_dev", "-N", "-e", `select json_object('body', body) from email_logs where toEmail='zone-${stamp}@example.test' and templateKey='meeting_booked' order by createdAt desc limit 1`, process.env.FEP_TEST_DB ?? "fep_qa"]).toString().trim() || "null");
ok("the confirmation email states the time in the visitor's zone and in UTC (once)", !!mail2 && mail2.body.includes("(Asia/Karachi)") && (mail2.body.match(/UTC/g) ?? []).length === 1 && !/UTC UTC/.test(mail2.body), mail2?.body?.slice(0, 300));
{ const adm = await context("UTC", "admin"); await api(adm, "PUT", "/api/admin/settings/booking", oldBooking); await adm.ctx.close(); }

// ───────────── 3 + 4. scheduling and the calendar ─────────────
console.log("3. Scheduling a call and the calendar");
const sched = { "America/Los_Angeles": "2026-10-12T10:00", "Asia/Karachi": "2026-10-12T10:00", "Pacific/Kiritimati": "2026-10-12T10:00" };
const expectedUtc = { "America/Los_Angeles": "2026-10-12T17:00:00.000Z", "Asia/Karachi": "2026-10-12T05:00:00.000Z", "Pacific/Kiritimati": "2026-10-11T20:00:00.000Z" };
for (const zone of Object.keys(sched)) {
  const c = await context(zone, "admin");
  await c.page.goto(base + "/admin/calendar?view=week&date=2026-10-12", { waitUntil: "load" });
  await c.page.getByRole("button", { name: "Schedule call" }).click();
  const dlg = c.page.getByRole("dialog");
  await dlg.waitFor({ timeout: 6000 });
  const title = `TZ ${zone.split("/")[1]} ${stamp}`;
  await dlg.locator('input[name="title"]').fill(title);
  await dlg.locator('input[name="when"]').fill(sched[zone]);
  await dlg.getByRole("button", { name: "Schedule", exact: true }).click();
  await c.page.waitForTimeout(1500);
  const list = (await api(c, "GET", "/api/meetings?from=2026-10-01&to=2026-10-31")).data ?? [];
  const m = (Array.isArray(list) ? list : list.items ?? []).find((x) => x.title === title);
  ok(`@${zone}: a call set for ${sched[zone]} local is stored as ${expectedUtc[zone]}`, m && new Date(m.startsAt).toISOString() === expectedUtc[zone], JSON.stringify(m?.startsAt));
  await c.ctx.close();
}
// one fixed instant, seen from different zones: 2026-10-12T02:30Z = Sun Oct 11 19:30 (LA) = Mon Oct 12 07:30 (Karachi) = Mon Oct 12 16:30 (Kiritimati) = Sun Oct 11 15:30 (Pago Pago)
const seed = await context("UTC", "admin");
const fixed = await api(seed, "POST", "/api/meetings", { type: "DISCOVERY_CALL", title: `Fixed instant ${stamp}`, startsAt: "2026-10-12T02:30:00.000Z", minutes: 30 });
ok("the fixed-instant meeting was created", fixed.status === 201, JSON.stringify(fixed.json?.error ?? ""));
await seed.ctx.close();
const expectDay = { "America/Los_Angeles": "Sun Oct 11 2026", "Asia/Karachi": "Mon Oct 12 2026", "Pacific/Kiritimati": "Mon Oct 12 2026", "Pacific/Pago_Pago": "Sun Oct 11 2026", UTC: "Mon Oct 12 2026" };
for (const zone of ZONES) {
  const c = await context(zone, "admin");
  await c.page.goto(base + `/admin/calendar?view=week&date=${expectDay[zone] === "Sun Oct 11 2026" ? "2026-10-11" : "2026-10-12"}`, { waitUntil: "load" });
  const label = await c.page.evaluate((t) => { const s = [...document.querySelectorAll("section[aria-label]")].find((x) => x.innerText.includes(t)); return s?.getAttribute("aria-label") ?? null; }, `Fixed instant ${stamp}`);
  ok(`@${zone}: the calendar files the event under ${expectDay[zone]} (the viewer's own day)`, label === expectDay[zone], String(label));
  const timeText = await c.page.evaluate((t) => { const s = [...document.querySelectorAll("section[aria-label]")].find((x) => x.innerText.includes(t)); return s?.innerText.replace(/\s+/g, " ") ?? ""; }, `Fixed instant ${stamp}`);
  const expTime = await c.page.evaluate(() => new Date("2026-10-12T02:30:00.000Z").toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
  ok(`@${zone}: ...at ${expTime}`, timeText.includes(expTime), timeText.slice(0, 160));
  await c.ctx.close();
}
await browser.close();
console.log(`\n${fail === 0 ? "Time-zone checks passed" : "Time-zone checks FAILED"}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
