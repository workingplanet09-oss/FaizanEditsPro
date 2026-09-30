/* Public-site behaviour: work grid, video dialogs, before/after, showreel, contact + booking forms, Turnstile. */
(function () {
  "use strict";
  var FE = window.FE, $ = FE.$, $$ = FE.$$, started = Date.now();

  // ───────────── load lazy media when a dialog opens, stop it when it closes ─────────────
  function hydrate(dlg) {
    $$("[data-src]", dlg).forEach(function (m) { if (!m.getAttribute("src")) m.setAttribute("src", m.getAttribute("data-src")); });
  }
  document.addEventListener("click", function (e) {
    var o = e.target.closest("[data-modal-open]");
    if (!o) return;
    var dlg = $(o.getAttribute("data-modal-open"));
    if (dlg) hydrate(dlg);
  });
  document.addEventListener("close", function (e) {
    if (e.target.tagName !== "DIALOG") return;
    $$("video", e.target).forEach(function (v) { v.pause(); });
    $$("iframe[data-src]", e.target).forEach(function (f) { f.removeAttribute("src"); }); // stops the embedded player
  }, true);

  // ───────────── portfolio filter ─────────────
  FE.components["work-grid"] = function (root) {
    var tabs = $$("[data-cat][role=tab]", root), items = $$("li[data-cat]", root), empty = $("[data-work-empty]", root);
    tabs.forEach(function (t) {
      t.addEventListener("click", function () {
        var cat = t.getAttribute("data-cat"), shown = 0;
        tabs.forEach(function (x) {
          var on = x === t;
          x.setAttribute("aria-selected", on ? "true" : "false");
          x.className = "shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition " + (on ? "border-fg bg-fg text-bg" : "border-line-strong text-muted hover:border-subtle hover:text-fg");
        });
        items.forEach(function (li) { var show = cat === "All" || li.getAttribute("data-cat") === cat; li.hidden = !show; if (show) shown++; });
        if (empty) empty.hidden = shown > 0;
      });
    });
    // deep link: /work#slug opens that project
    if (location.hash.length > 1) {
      var li = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      var btn = li && li.querySelector("[data-modal-open]");
      if (btn) btn.click();
    }
  };

  // ───────────── before / after: one control keeps both videos in sync ─────────────
  FE.components["before-after"] = function (root) {
    var vids = $$("video", root), btn = $("[data-ba-toggle]", root), playing = false;
    btn.addEventListener("click", function () {
      vids.forEach(function (v) { if (!v.getAttribute("src") && v.getAttribute("data-src")) v.setAttribute("src", v.getAttribute("data-src")); });
      if (!playing) {
        var t = vids[0].currentTime || 0;
        vids.forEach(function (v) { v.currentTime = t; var p = v.play(); if (p && p.catch) p.catch(function () {}); });
      } else vids.forEach(function (v) { v.pause(); });
      playing = !playing;
      btn.textContent = playing ? "Pause both" : "Play both";
    });
  };

  // ───────────── hero showreel ─────────────
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-showreel]");
    if (!b) return;
    var box = b.parentNode, embed = b.getAttribute("data-embed"), video = b.getAttribute("data-video"), el;
    if (embed) el = FE.h("iframe", { src: embed, title: "Studio showreel", allow: "autoplay; encrypted-media; picture-in-picture; fullscreen", class: "absolute inset-0 h-full w-full" });
    else if (video) el = FE.h("video", { src: video, controls: true, autoplay: true, playsinline: true, class: "absolute inset-0 h-full w-full bg-black object-cover" });
    if (el) { box.replaceChild(el, b); }
  });

  // ───────────── Cloudflare Turnstile (only rendered when the site key is configured) ─────────────
  FE.components.turnstile = function (box) {
    var props = FE.props(box), form = box.closest("form"), input = form.querySelector('input[name="turnstile"]');
    function mount() {
      if (!window.turnstile) return;
      window.turnstile.render(box, { sitekey: props.siteKey, theme: "auto",
        callback: function (t) { input.value = t; }, "expired-callback": function () { input.value = ""; }, "error-callback": function () { input.value = ""; } });
    }
    if (window.turnstile) return mount();
    var s = $("script[data-turnstile]");
    if (!s) { s = document.createElement("script"); s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; s.async = true; s.setAttribute("data-turnstile", "1"); document.head.appendChild(s); }
    s.addEventListener("load", mount);
    form.addEventListener("fe:error", function () { if (window.turnstile) { input.value = ""; try { window.turnstile.reset(box); } catch (e) {} } });
  };

  // ───────────── contact form ─────────────
  FE.handlers.contactPrep = function (body, form) {
    var a = FE.attribution(), utm = {};
    Object.keys(a.utm || {}).forEach(function (k) { if (a.utm[k]) utm[k] = a.utm[k]; });
    if (form.querySelector('[data-fe-component="turnstile"]') && !body.turnstile) {
      FE.showFieldErrors(form, {}, "Please complete the spam check before sending."); return false;
    }
    body.t = started; if (a.referrer) body.source = a.referrer; if (Object.keys(utm).length) body.utm = utm;
    return body;
  };
  FE.handlers.contactDone = function (data, form) {
    var holder = form.closest("[data-contact]");
    holder.querySelector("[data-contact-form]").hidden = true;
    holder.querySelector("[data-contact-done]").hidden = false;
    return false;
  };
  FE.handlers.contactFailed = function (err, form) { form.dispatchEvent(new CustomEvent("fe:error")); };
  FE.handlers.bookingPrep = function (body, form) {
    var root = form.closest("[data-fe-component]");
    if (!body.startsAt) { FE.showFieldErrors(form, {}, "Choose a time first."); return false; }
    body.t = started; body.timezone = root.__tz || "UTC"; return body;
  };

  // ───────────── booking: type → day → slot ─────────────
  FE.components.booking = function (root) {
    var form = $("form", root), typeInputs = $$('input[name="type"]', root), startsAt = $('input[name="startsAt"]', root);
    var dayBox = $("[data-days]", root), slotBox = $("[data-slots]", root), tzLabel = $("[data-tz]", root), submit = $("[data-booking-submit]", root);
    var state = { byDay: {}, day: null }, tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
    root.__tz = tz || "UTC";
    if (tz) tzLabel.textContent = " (" + tz + ")";
    var fmtDay = function (d) { return new Date(d + "T12:00:00Z").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }); };
    var fmtTime = function (iso) { return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); };

    function paintTypes() {
      typeInputs.forEach(function (i) {
        var on = i.checked, lab = i.closest("label");
        lab.className = "cursor-pointer rounded-2xl border p-4 transition " + (on ? "border-accent bg-accent-soft" : "border-line-strong bg-surface hover:border-subtle");
      });
    }
    function paintSlots() {
      slotBox.innerHTML = "";
      (state.byDay[state.day] || []).forEach(function (s) {
        var on = startsAt.value === s;
        slotBox.appendChild(FE.h("button", { type: "button", "aria-pressed": on ? "true" : "false", class: "rounded-xl border py-3 text-sm font-semibold transition " + (on ? "border-accent bg-accent text-accent-fg" : "border-line-strong hover:border-accent"),
          onclick: function () { startsAt.value = s; submit.disabled = false; paintSlots(); } }, fmtTime(s)));
      });
    }
    function paintDays() {
      dayBox.innerHTML = "";
      Object.keys(state.byDay).slice(0, 21).forEach(function (d) {
        var on = state.day === d;
        dayBox.appendChild(FE.h("button", { type: "button", role: "tab", "aria-selected": on ? "true" : "false", class: "shrink-0 rounded-xl border px-4 py-2.5 text-sm font-semibold " + (on ? "border-fg bg-fg text-bg" : "border-line-strong hover:border-subtle"),
          onclick: function () { state.day = d; startsAt.value = ""; submit.disabled = true; paintDays(); paintSlots(); } }, fmtDay(d)));
      });
    }
    function load() {
      var type = (typeInputs.filter(function (i) { return i.checked; })[0] || typeInputs[0]).value;
      startsAt.value = ""; submit.disabled = true; state = { byDay: {}, day: null };
      dayBox.innerHTML = ""; slotBox.innerHTML = '<div role="status" class="skeleton col-span-full h-12"></div>';
      FE.api("/api/booking/slots?type=" + encodeURIComponent(type)).then(function (r) {
        (r.slots || []).forEach(function (s) { var d = s.slice(0, 10); (state.byDay[d] = state.byDay[d] || []).push(s); });
        var days = Object.keys(state.byDay);
        if (!days.length) { slotBox.innerHTML = '<p class="col-span-full rounded-xl bg-surface-2 p-5 text-sm text-muted">No open slots in the next few weeks. Please send us a message and we\'ll find a time.</p>'; return; }
        state.day = days[0]; paintDays(); paintSlots();
      }, function () { slotBox.innerHTML = '<p class="col-span-full rounded-xl bg-surface-2 p-5 text-sm text-muted">We couldn\'t load times just now. Please reload the page.</p>'; });
    }
    typeInputs.forEach(function (i) { i.addEventListener("change", function () { paintTypes(); load(); }); });
    form.addEventListener("fe:error", function (e) { });
    root.__reload = load;
    paintTypes(); load();
  };
  FE.handlers.bookingDone = function (data, form) {
    var root = form.closest("[data-fe-component]");
    var when = new Date(data.startsAt).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" });
    $("[data-booking-when]", root).textContent = data.typeLabel + " · " + when;
    $("[data-booking-mail]", root).textContent = "We've emailed your confirmation" + (data.meetingUrl ? " with the meeting link" : "") + ".";
    var link = $("[data-booking-link]", root);
    if (data.meetingUrl && /^https?:\/\//i.test(data.meetingUrl)) { link.href = data.meetingUrl; link.hidden = false; }
    $("[data-booking-form]", root).hidden = true; $("[data-booking-done]", root).hidden = false;
    return false;
  };
  FE.handlers.bookingFailed = function (err, form) { if (err && err.status === 409) { var root = form.closest("[data-fe-component]"); if (root.__reload) root.__reload(); } };
})();
