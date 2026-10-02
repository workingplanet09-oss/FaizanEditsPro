/*
 * Database-driven questionnaire wizard — the public "Start a project" flow (mode "inquiry") and the client's project brief (mode "project").
 * Renders whatever sections/questions the form definition contains, shows and hides questions live with FE.cond, validates per step,
 * autosaves (debounced) and can resume. Mounted with data-fe-component="wizard" data-props='{…}' (see views/site/start-project.php).
 */
(function () {
  "use strict";
  var FE = window.FE, esc = FE.esc, C = FE.cond;
  var INPUT = "w-full rounded-xl border border-line-strong bg-surface px-3.5 text-sm text-fg placeholder:text-subtle transition-[border-color,box-shadow] duration-150 hover:border-subtle focus:border-accent focus:outline-none focus:ring-4 focus:ring-[color-mix(in_srgb,var(--accent)_22%,transparent)] disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/20";

  function randomId(n) {
    var a = new Uint8Array(n || 24), chars = "abcdefghijklmnopqrstuvwxyz0123456789", out = "";
    (window.crypto || window.msCrypto).getRandomValues(a);
    for (var i = 0; i < a.length; i++) out += chars[a[i] % 36];
    return out;
  }
  function plainObject(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function same(a, b) { try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; } }

  FE.components.wizard = function (root, p) {
    var form = p.form, mode = p.mode, extra = p.extraCategories || [], skip = p.skipSections || [];
    var answers = plainObject(p.answers), initial = JSON.parse(JSON.stringify(answers));
    var stepKey = "", errors = {}, token = "", saveState = "idle", resume = null, dirty = false, submitting = false, result = null;
    var started = Date.now(), uploadedNames = {}, saveTimer = null, wrappers = {};
    var el = {};

    // ───────────── derived state ─────────────
    function sections() { return C.visibleSections(form, answers, extra).filter(function (s) { return skip.indexOf(s.key) < 0; }); }
    function keys() { return sections().map(function (s) { return s.key; }).concat("__review"); }
    function index() { var k = keys(); var i = k.indexOf(stepKey || k[0]); return i < 0 ? 0 : i; }
    function currentSection() { var k = keys()[index()]; return sections().filter(function (s) { return s.key === k; })[0] || null; }
    function isReview() { return keys()[index()] === "__review"; }
    function visQ(section) { return C.visibleQuestions(form, section, answers, extra); }

    // ───────────── skeleton ─────────────
    root.className = "mx-auto w-full max-w-2xl";
    root.innerHTML =
      '<div class="mb-8"><div class="mb-2 flex items-center justify-between text-xs font-semibold text-muted"><span data-step aria-live="polite"></span><span data-save class="flex items-center gap-1.5" role="status"></span></div>' +
      '<div data-bar role="progressbar" aria-valuemin="0" aria-valuemax="100" class="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"><div class="h-full rounded-full bg-accent transition-[width] duration-700 ease-out" style="width:0%"></div></div></div>' +
      '<div data-resume></div>' +
      '<form novalidate class="space-y-8" data-wizard-form><header><h1 data-title tabindex="-1" class="text-[clamp(1.7rem,4vw,2.5rem)] font-bold leading-tight tracking-tight outline-none"></h1><p data-desc class="mt-2 text-muted"></p></header>' +
      '<div data-extras></div><div data-body class="space-y-7"></div><p data-submit-error role="alert" class="hidden items-start gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger"></p>' +
      '<div class="sticky bottom-0 -mx-4 flex items-center justify-between gap-3 border-t border-line bg-bg/90 px-4 py-4 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none"><div data-left class="flex items-center gap-2"></div><div data-right class="flex items-center gap-2"></div></div></form>';
    ["step", "save", "bar", "resume", "title", "desc", "extras", "body", "submit-error", "left", "right"].forEach(function (k) { el[k] = root.querySelector("[data-" + k + "]"); });
    el.form = root.querySelector("[data-wizard-form]");

    // ───────────── drafts ─────────────
    function initToken() {
      var t = "";
      try { t = (p.storageKey && localStorage.getItem(p.storageKey)) || ""; } catch (e) {}
      if (!t) { t = randomId(24); try { if (p.storageKey) localStorage.setItem(p.storageKey, t); } catch (e) {} }
      token = t;
      root.setAttribute("data-draft-token", t);
      $$all("[data-fe-component=uploader]").forEach(function (u) { u.setAttribute("data-draft-token", t); });
    }
    function $$all(sel) { return FE.$$(sel, root); }
    function scheduleSave() {
      if (!dirty || !token || result) return;
      saveState = "saving"; paintSave();
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () {
        var req = mode === "inquiry"
          ? FE.api(p.draftUrl, { method: "PUT", body: { token: token, data: answers, step: index() } })
          : FE.api(p.saveUrl, { method: "PUT", body: { answers: answers, step: index() } });
        req.then(function () { saveState = "saved"; paintSave(); }, function () { saveState = "offline"; paintSave(); });
      }, 700);
    }
    window.addEventListener("beforeunload", function (e) { if (saveState === "offline") { e.preventDefault(); e.returnValue = ""; } });

    // ───────────── painting ─────────────
    function paintSave() {
      el.save.innerHTML = saveState === "saving" ? FE.icon("loader", 12, "animate-spin") + " Saving…" : saveState === "saved" ? FE.icon("check", 12, "text-success") + " Progress saved" : saveState === "offline" ? '<span class="text-danger">Couldn\'t save — check your connection</span>' : "";
    }
    function paintChrome() {
      var k = keys(), i = index(), total = k.length, pct = Math.round(((i + 1) / total) * 100), sec = currentSection(), review = isReview();
      el.step.textContent = "Step " + (i + 1) + " of " + total;
      el.bar.setAttribute("aria-valuenow", pct); el.bar.setAttribute("aria-label", "Step " + (i + 1) + " of " + total); el.bar.firstChild.style.width = pct + "%";
      el.title.textContent = review ? "Review & submit" : (sec ? sec.title : "");
      el.desc.textContent = review ? "Everything look right? You can edit any section before sending." : (sec && sec.description) || "";
      el.left.innerHTML = i > 0
        ? '<button type="button" data-back class="inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold text-muted transition hover:bg-surface-2 hover:text-fg">' + FE.icon("chevron-left", 16) + "Back</button>"
        : '<a href="' + esc(p.exitHref) + '" class="inline-flex h-11 items-center px-3 text-sm font-semibold text-muted hover:text-fg">Cancel</a>';
      el.right.innerHTML = '<a href="' + esc(p.exitHref) + '" class="hidden h-11 items-center px-3 text-sm font-semibold text-muted hover:text-fg sm:inline-flex" title="Your progress is saved automatically">Save &amp; exit</a>' +
        '<button type="submit" data-next class="relative inline-flex h-13 items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-accent px-7 text-base font-semibold text-accent-fg shadow-[0_8px_20px_-8px_color-mix(in_srgb,var(--accent)_70%,transparent)] transition hover:-translate-y-px hover:bg-accent-hover  disabled:pointer-events-none disabled:opacity-50">' +
        (review ? esc(p.submitLabel || "Send project details") + FE.icon("send", 16) : (i === total - 2 ? "Review" : "Continue") + FE.icon("arrow", 16)) + "</button>";
    }
    function showSubmitError(msg) { el["submit-error"].textContent = msg || ""; el["submit-error"].classList.toggle("hidden", !msg); el["submit-error"].classList.toggle("flex", !!msg); }

    // ───────────── fields ─────────────
    function label(q) {
      return '<label class="flex items-center gap-1.5 text-sm font-semibold"' + ' for="q-' + esc(q.key) + '"><span>' + esc(q.text) + "</span>" + (q.required ? '<span class="text-danger" aria-hidden="true" title="Required">*</span><span class="sr-only">(required)</span>' : '<span class="text-xs font-normal text-subtle">optional</span>') + "</label>";
    }
    function legend(q) { return '<div class="flex items-center gap-1.5 text-sm font-semibold" id="q-' + esc(q.key) + '"><span>' + esc(q.text) + "</span>" + (q.required ? '<span class="text-danger" aria-hidden="true" title="Required">*</span><span class="sr-only">(required)</span>' : '<span class="text-xs font-normal text-subtle">optional</span>') + "</div>"; }
    function tail(q) {
      return '<p data-err role="alert" class="hidden items-center gap-1.5 text-xs font-medium text-danger"></p>' + (q.helpText ? '<p class="text-xs text-subtle">' + esc(q.helpText) + "</p>" : "");
    }
    function choices(q, multi) {
      var cards = (q.meta && q.meta.display) === "cards", v = answers[q.key], sel = Array.isArray(v) ? v.map(String) : v ? [String(v)] : [];
      return '<div data-choices role="' + (multi ? "group" : "radiogroup") + '" aria-labelledby="q-' + esc(q.key) + '" class="' + (cards ? "grid grid-cols-1 gap-3 sm:grid-cols-2" : "flex flex-wrap gap-2") + '">' + q.options.map(function (o) {
        var on = sel.indexOf(o.value) >= 0;
        return '<label class="' + choiceCls(cards, on) + '"><input type="' + (multi ? "checkbox" : "radio") + '" name="' + esc(q.key) + '" value="' + esc(o.value) + '"' + (on ? " checked" : "") + ' class="peer sr-only"><span class="absolute inset-0 rounded-[inherit] peer-focus-visible:ring-4 peer-focus-visible:ring-accent/30" aria-hidden="true"></span>' +
          (cards && o.icon ? '<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ' + (on ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted") + '">' + FE.icon(o.icon, 20) + "</span>" : "") +
          '<span class="min-w-0"><span class="block font-semibold ' + (cards ? "text-[15px]" : "text-sm") + '">' + esc(o.label) + "</span>" + (cards && o.description ? '<span class="mt-0.5 block text-xs text-muted">' + esc(o.description) + "</span>" : "") + "</span>" +
          '<span data-tick>' + (on ? FE.icon("check-circle", 16, "text-fg " + (cards ? "ml-auto shrink-0" : "")) : "") + "</span></label>";
      }).join("") + "</div>";
    }
    function choiceCls(cards, on) {
      return "group relative cursor-pointer select-none transition duration-200 " + (cards ? "flex items-start gap-3 rounded-2xl border p-4 hover:-translate-y-px hover:shadow-soft" : "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium") + " " +
        (on ? "border-accent bg-accent-soft shadow-[0_0_0_1px_var(--accent)_inset]" : "border-line-strong bg-surface hover:border-subtle");
    }
    function control(q) {
      var v = answers[q.key], id = 'id="q-' + esc(q.key) + '" name="' + esc(q.key) + '"', meta = q.meta || {}, ph = q.placeholder ? ' placeholder="' + esc(q.placeholder) + '"' : "";
      switch (q.type) {
        case "RADIO": return legend(q) + choices(q, false) + tail(q);
        case "MULTI_SELECT": return legend(q) + choices(q, true) + tail(q);
        case "SELECT":
          return label(q) + '<div class="relative"><select ' + id + ' class="' + INPUT + ' h-11 appearance-none pr-9"><option value="">Select…</option>' + q.options.map(function (o) { return '<option value="' + esc(o.value) + '"' + (String(v) === o.value ? " selected" : "") + ">" + esc(o.label) + "</option>"; }).join("") + "</select>" + FE.icon("chevron-down", 16, "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-subtle") + "</div>" + tail(q);
        case "TEXTAREA":
          return label(q) + "<div><textarea " + id + ' class="' + INPUT + ' min-h-28 py-3 leading-relaxed" rows="' + (q.key === "project_description" ? 7 : 4) + '" maxlength="' + (meta.maxLength || 8000) + '"' + ph + ">" + esc(v == null ? "" : v) + "</textarea>" +
            (meta.minLength ? '<div data-count class="mt-1 text-right text-xs text-subtle"></div>' : "") + "</div>" + tail(q);
        case "CHECKBOX":
          return '<label class="flex cursor-pointer items-start gap-3 rounded-xl p-2 -m-2 hover:bg-surface-2/60"><span class="relative mt-0.5 inline-flex shrink-0"><input type="checkbox" ' + id + (v ? " checked" : "") + ' class="peer h-[18px] w-[18px] shrink-0 cursor-pointer appearance-none rounded-md border border-line-strong bg-surface transition checked:border-accent checked:bg-accent focus-visible:ring-4 focus-visible:ring-accent/25">' +
            FE.icon("check", 13, "pointer-events-none absolute left-[2.5px] top-[2.5px] hidden text-accent-fg peer-checked:block", 3) + '</span><span class="min-w-0"><span class="block text-sm font-medium leading-snug">' + esc(q.text) + "</span>" + (q.helpText ? '<span class="mt-0.5 block text-xs text-muted">' + esc(q.helpText) + "</span>" : "") + "</span></label>" +
            '<p data-err role="alert" class="mt-1.5 hidden items-center gap-1.5 text-xs font-medium text-danger"></p>';
        case "COLOR":
          return label(q) + '<div class="flex items-center gap-3"><input type="color" data-color aria-label="' + esc(q.text) + ' colour picker" value="' + (/^#[0-9a-f]{6}$/i.test(v || "") ? esc(v) : "#2457e6") + '" class="h-11 w-14 cursor-pointer rounded-xl border border-line-strong bg-surface p-1"><input type="text" ' + id + ' value="' + esc(v == null ? "" : v) + '" placeholder="#2457E6" class="' + INPUT + ' h-11 max-w-40 font-mono"></div>' + tail(q);
        case "RATING":
          return legend(q) + '<div class="flex gap-1" role="radiogroup" aria-labelledby="q-' + esc(q.key) + '">' + [1, 2, 3, 4, 5].map(function (n) {
            return '<button type="button" role="radio" data-rate="' + n + '" aria-checked="' + (Number(v) === n) + '" aria-label="' + n + " star" + (n > 1 ? "s" : "") + '" class="rounded-lg p-1 text-accent-text transition hover:scale-110">' + FE.icon("star", 28, Number(v) >= n ? "fill-current" : "opacity-30") + "</button>";
          }).join("") + "</div>" + tail(q);
        case "FILE":
          return legend(q) + '<div data-fe-component="uploader" data-draft-token="' + esc(token) + '" data-props="' + esc(JSON.stringify({ purpose: (p.uploads || {}).purpose || "asset", projectId: (p.uploads || {}).projectId, folderKey: (p.uploads || {}).folderKey, maxFiles: 10, hint: "PDF, DOCX, images, ZIP, video or audio" })) + '"></div>' + tail(q);
        default:
          var t = { EMAIL: "email", URL: "url", PHONE: "tel", NUMBER: "number", CURRENCY: "number", DATE: "date", TIME: "time" }[q.type] || "text";
          var auto = { name: "name", email: "email", phone: "tel", company: "organization", website: "url" }[q.key];
          return label(q) + '<input ' + id + ' type="' + t + '"' + (t === "number" ? ' inputmode="decimal"' : "") + (meta.min !== undefined ? ' min="' + meta.min + '"' : "") + (meta.max !== undefined ? ' max="' + meta.max + '"' : "") + (auto ? ' autocomplete="' + auto + '"' : "") + ' value="' + esc(v == null ? "" : v) + '" class="' + INPUT + ' h-11"' + ph + ">" + tail(q);
      }
    }
    function wrapper(q) {
      var w = wrappers[q.key];
      if (w) return w;
      w = document.createElement("div");
      w.className = "animate-fade-in"; w.setAttribute("data-q", q.key);
      w.innerHTML = '<div class="space-y-1.5">' + control(q) + "</div>";
      wrappers[q.key] = w;
      FE.mount(w);
      updateCount(q, w);
      return w;
    }
    function updateCount(q, w) {
      var c = w.querySelector("[data-count]"), min = q.meta && q.meta.minLength; if (!c || !min) return;
      var n = String(answers[q.key] || "").length; c.textContent = n + " / " + min + "+ characters"; c.className = "mt-1 text-right text-xs " + (n >= min ? "text-success" : "text-subtle");
    }
    function questionOf(key) { for (var i = 0; i < form.sections.length; i++) for (var j = 0; j < form.sections[i].questions.length; j++) if (form.sections[i].questions[j].key === key) return form.sections[i].questions[j]; return null; }
    function setError(key, msg) {
      var w = wrappers[key]; if (!w) return;
      var e = w.querySelector("[data-err]"), inp = w.querySelector("input[name],select,textarea");
      if (e) { e.textContent = msg || ""; e.classList.toggle("hidden", !msg); e.classList.toggle("flex", !!msg); }
      w.querySelectorAll("input:not([type=radio]):not([type=checkbox]),select,textarea").forEach(function (i) { if (msg) i.setAttribute("aria-invalid", "true"); else i.removeAttribute("aria-invalid"); });
    }

    // keep the question list in step with the answers without rebuilding nodes that still apply (so typing never loses focus)
    function syncQuestions() {
      var sec = currentSection(); if (!sec || isReview()) return;
      var want = visQ(sec), ref = el.body.firstChild, keep = {};
      want.forEach(function (q) {
        var w = wrapper(q); keep[q.key] = true;
        if (w === ref) ref = ref.nextSibling; else el.body.insertBefore(w, ref);
      });
      Array.prototype.slice.call(el.body.children).forEach(function (n) { if (!keep[n.getAttribute("data-q")]) el.body.removeChild(n); });
      Object.keys(errors).forEach(function (k) { if (!keep[k]) delete errors[k]; });
      paintChrome();
    }

    // ───────────── steps ─────────────
    function renderStep(focusHeading) {
      Object.keys(wrappers).forEach(function (k) { delete wrappers[k]; });
      el.body.innerHTML = "";
      el.extras.innerHTML = "";
      showSubmitError("");
      if (isReview()) renderReview(); else { syncQuestions(); Object.keys(errors).forEach(function (k) { setError(k, errors[k]); }); }
      if (index() === 0) renderExtras();
      paintChrome();
      if (focusHeading) { el.title.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: "smooth" }); }
    }
    function renderExtras() {
      var h = "";
      if (p.previousProjects && p.previousProjects.length) {
        h += '<div class="rounded-2xl border border-line bg-surface p-4"><label class="text-sm font-bold" for="prev-project">Use previous project settings</label><p class="text-xs text-muted">Start from an earlier project and change only what\'s different.</p>' +
          '<select id="prev-project" class="mt-2 h-10 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm"><option value="">Choose a project…</option>' + p.previousProjects.map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.name) + "</option>"; }).join("") + "</select></div>";
      }
      if (p.firstTime && mode === "project") h += '<div class="flex gap-3 rounded-2xl bg-info-soft p-4 text-sm text-info">' + FE.icon("info", 18, "mt-0.5 shrink-0") + "<p><b>First project with me?</b> Take a few minutes here — the more detail you give, the fewer revisions you'll need. Every answer is saved automatically and can be edited before production starts.</p></div>";
      el.extras.innerHTML = h;
    }
    function renderReview() {
      var out = sections().map(function (s) {
        var qs = visQ(s).filter(function (q) { var v = answers[q.key]; return v !== undefined && v !== "" && !(Array.isArray(v) && !v.length); });
        if (!qs.length) return "";
        return '<section class="rounded-2xl border border-line bg-surface p-6"><div class="mb-3 flex items-center justify-between"><h2 class="text-sm font-bold">' + (qs.length === 1 && qs[0].text === s.title ? "" : esc(s.title)) + '</h2><button type="button" data-edit="' + esc(s.key) + '" class="text-xs font-bold text-accent-text hover:underline">Edit</button></div><dl class="space-y-2.5">' +
          qs.map(function (q) {
            var v = answers[q.key], lab = function (x) { var o = q.options.filter(function (o) { return o.value === String(x); })[0]; return o ? o.label : String(x); };
            var shown = q.type === "FILE" ? (uploadedNames[q.key] || []).join(", ") || "Files attached" : Array.isArray(v) ? v.map(lab).join(", ") : typeof v === "boolean" ? (v ? "Yes" : "No") : lab(v);
            return '<div class="grid grid-cols-1 gap-0.5 sm:grid-cols-[38%_minmax(0,1fr)] sm:gap-4"><dt class="text-xs text-subtle">' + esc(q.text) + '</dt><dd class="whitespace-pre-line break-words text-sm font-medium">' + esc(shown) + "</dd></div>";
          }).join("") + "</dl></section>";
      }).join("");
      var box = document.createElement("div");
      box.className = "space-y-4";
      box.innerHTML = out + (mode === "inquiry" ? '<p class="text-xs text-subtle">By submitting you agree to my <a class="underline" href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>. I\'ll only use your details to respond to this request.</p>' : "") +
        (p.turnstileSiteKey ? '<input type="hidden" name="turnstile"><div data-fe-component="turnstile" data-props="' + esc(JSON.stringify({ siteKey: p.turnstileSiteKey })) + '" class="min-h-[65px]"></div>' : "") +
        '<div aria-hidden="true" class="absolute -left-[9999px] h-0 w-0 overflow-hidden"><label>Leave empty<input tabindex="-1" autocomplete="off" name="hp"></label></div>';
      el.body.appendChild(box);
      FE.mount(box);
    }
    function go(key, focus) { stepKey = key; dirty = true; renderStep(focus !== false); scheduleSave(); }

    // ───────────── validation + navigation ─────────────
    function validateSection(s) {
      var e = {};
      visQ(s).forEach(function (q) { if (q.type === "FILE") return; var m = C.validateAnswer(q, answers[q.key]); if (m) e[q.key] = m; });
      return e;
    }
    function applyErrors(e) {
      errors = e;
      Object.keys(wrappers).forEach(function (k) { setError(k, e[k]); });
      var first = root.querySelector('[aria-invalid="true"]');
      if (first) { first.scrollIntoView({ block: "center", behavior: "smooth" }); if (first.focus) first.focus({ preventScroll: true }); }
    }
    function next() {
      var sec = currentSection();
      if (sec) { var e = validateSection(sec); if (Object.keys(e).length) return applyErrors(e); }
      errors = {};
      var k = keys(); go(k[Math.min(k.length - 1, index() + 1)]);
    }
    function submit() {
      var secs = sections();
      for (var i = 0; i < secs.length; i++) {
        var e = validateSection(secs[i]);
        if (Object.keys(e).length) { errors = e; go(secs[i].key); Object.keys(e).forEach(function (k) { setError(k, e[k]); }); showSubmitError("A few answers need attention before you can submit."); return; }
      }
      var tokenInput = root.querySelector('input[name="turnstile"]'), captcha = tokenInput ? tokenInput.value : "", hpInput = root.querySelector('input[name="hp"]');
      if (p.turnstileSiteKey && !captcha) return showSubmitError("Please complete the spam check before sending.");
      submitting = true; showSubmitError("");
      var btn = el.right.querySelector("[data-next]"); FE.busy(btn, true);
      var req;
      if (mode === "inquiry") {
        var a = FE.attribution(), utm = {}; Object.keys(a.utm || {}).forEach(function (k) { if (a.utm[k]) utm[k] = a.utm[k]; });
        var urlRef = new URLSearchParams(location.search).get("ref") || "";
        var ans = JSON.parse(JSON.stringify(answers)); if (p.plan) ans.selected_plan = p.plan;
        req = FE.api("/api/leads", { body: { answers: ans, serviceSlug: p.serviceSlug || null, draftToken: token, utm: utm, referrer: a.referrer || null, referralCode: (urlRef || a.ref || "").slice(0, 24) || null, hp: hpInput ? hpInput.value : "", t: started, turnstile: captcha || undefined } });
      } else req = FE.api(p.submitUrl, { body: { answers: answers } });
      req.then(function (r) {
        try { if (p.storageKey) localStorage.removeItem(p.storageKey); } catch (e) {}
        result = r; FE.busy(btn, false); renderDone(r); window.scrollTo({ top: 0 });
      }, function (err) {
        FE.busy(btn, false); submitting = false;
        el.form.dispatchEvent(new CustomEvent("fe:error")); // a Turnstile token is single-use
        showSubmitError(err && err.message ? err.message : "Something went wrong. Your answers are safe — please try again.");
        if (err && err.fields && Object.keys(err.fields).length) {
          var sec = sections().filter(function (s) { return s.questions.some(function (q) { return q.key in err.fields; }); })[0];
          errors = err.fields; if (sec) { go(sec.key); Object.keys(err.fields).forEach(function (k) { setError(k, err.fields[k]); }); }
        }
      });
    }

    // ───────────── done screens ─────────────
    function renderDone(r) {
      var tick = '<span class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-success">' + FE.icon("check", 30) + "</span>";
      if (mode === "inquiry") {
        root.innerHTML = '<div class="mx-auto max-w-xl text-center">' + tick + '<h1 class="mt-6 text-[clamp(1.8rem,4vw,2.6rem)] font-bold tracking-tight">Request received</h1><p class="mt-3 text-muted">Thank you. Your project brief is with me. Expect to hear from me <b class="text-fg">' + esc(r.responseTime || "soon") + "</b>.</p>" +
          '<dl class="mx-auto mt-8 grid max-w-md gap-px overflow-hidden rounded-2xl border border-line bg-line text-left">' + [["Request ID", r.requestCode], ["Project type", r.projectType], ["Expected reply", r.responseTime || "Soon"]].map(function (x) { return '<div class="flex items-center justify-between gap-4 bg-surface px-6 py-3.5"><dt class="text-xs font-semibold text-subtle">' + x[0] + '</dt><dd class="text-sm font-bold">' + esc(x[1]) + "</dd></div>"; }).join("") + "</dl>" +
          '<p class="mx-auto mt-6 max-w-md rounded-2xl bg-surface-2 p-4 text-sm text-muted"><b class="text-fg">What happens next:</b> ' + esc(r.nextStep) + " A confirmation email with your request ID is on its way.</p>" +
          '<div class="mt-8 flex flex-wrap justify-center gap-3"><a href="' + esc(p.signedIn ? p.portalHref : "/") + '" class="inline-flex h-11 items-center justify-center rounded-xl bg-fg px-5 text-base font-semibold text-bg hover:opacity-90">' + (p.signedIn ? "Go to my dashboard" : "Back to home") + '</a><a href="/work" class="inline-flex h-11 items-center justify-center rounded-xl border border-line-strong px-5 text-base font-semibold hover:bg-surface-2">See recent work</a></div>' +
          '<p class="mt-6 text-xs text-subtle">Need to add something? Reply to the confirmation email, or <a class="underline" href="/contact">contact me</a> quoting ' + esc(r.requestCode) + ".</p></div>";
      } else {
        root.innerHTML = '<div class="mx-auto max-w-xl text-center">' + tick + '<h1 class="mt-6 text-[clamp(1.8rem,4vw,2.4rem)] font-bold tracking-tight">Your brief is in</h1><p class="mt-3 text-muted">Thanks — I\'ve turned your answers into a project brief for <b class="text-fg">' + esc(p.projectName) + "</b>. Next, upload your footage and assets so I can begin.</p>" +
          '<div class="mt-8 flex flex-wrap justify-center gap-3"><a href="/dashboard/projects/' + esc(p.projectId) + '?tab=files" class="inline-flex h-13 items-center justify-center gap-2 rounded-2xl bg-accent px-7 text-base font-semibold text-accent-fg hover:bg-accent-hover">' + FE.icon("upload", 16) + 'Upload files</a><a href="/dashboard/projects/' + esc(p.projectId) + '" class="inline-flex h-13 items-center justify-center rounded-2xl border border-line-strong px-7 text-base font-semibold hover:bg-surface-2">Back to project</a></div></div>';
      }
    }

    // ───────────── events ─────────────
    function setValue(key, v) {
      answers[key] = v; dirty = true;
      if (errors[key]) { delete errors[key]; setError(key, ""); }
      var w = wrappers[key], q = questionOf(key); if (w && q) updateCount(q, w);
      syncQuestions(); scheduleSave();
    }
    function paintChoices(w, q) {
      var cards = (q.meta && q.meta.display) === "cards", v = answers[q.key], sel = Array.isArray(v) ? v.map(String) : v ? [String(v)] : [];
      w.querySelectorAll("label").forEach(function (lab) {
        var inp = lab.querySelector("input"); if (!inp) return; var on = sel.indexOf(inp.value) >= 0;
        lab.className = choiceCls(cards, on);
        var ic = lab.querySelector("span.flex.h-10"); if (ic) ic.className = "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl " + (on ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted");
        lab.querySelector("[data-tick]").innerHTML = on ? FE.icon("check-circle", 16, "text-fg " + (cards ? "ml-auto shrink-0" : "")) : "";
      });
    }
    el.body.addEventListener("input", function (e) {
      var w = e.target.closest("[data-q]"); if (!w) return; var q = questionOf(w.getAttribute("data-q")); if (!q) return;
      var t = e.target;
      if (t.type === "radio" || t.type === "checkbox" && q.type !== "CHECKBOX" || t.tagName === "SELECT" || t.hasAttribute("data-rate")) return; // handled on change
      if (t.type === "color") { var txt = w.querySelector('input[type=text]'); if (txt) txt.value = t.value; return setValue(q.key, t.value); }
      if (q.type === "CHECKBOX") return;
      var val = t.type === "number" ? (t.value === "" ? "" : Number(t.value)) : t.value;
      setValue(q.key, val);
      if (q.type === "COLOR") { var pick = w.querySelector("input[type=color]"); if (pick && /^#[0-9a-f]{6}$/i.test(t.value)) pick.value = t.value; }
    });
    el.body.addEventListener("change", function (e) {
      var w = e.target.closest("[data-q]"); if (!w) return; var q = questionOf(w.getAttribute("data-q")); if (!q) return; var t = e.target;
      if (q.type === "RADIO") { setValue(q.key, t.value); paintChoices(w, q); }
      else if (q.type === "MULTI_SELECT") { var cur = Array.isArray(answers[q.key]) ? answers[q.key].slice() : []; var i = cur.indexOf(t.value); if (t.checked && i < 0) cur.push(t.value); if (!t.checked && i >= 0) cur.splice(i, 1); setValue(q.key, cur); paintChoices(w, q); }
      else if (q.type === "CHECKBOX") setValue(q.key, t.checked);
      else if (q.type === "SELECT") setValue(q.key, t.value);
      else if (t.type === "number") { /* handled on input */ }
    });
    el.body.addEventListener("click", function (e) {
      var rate = e.target.closest("[data-rate]"), w = e.target.closest("[data-q]");
      if (rate && w) { var q = questionOf(w.getAttribute("data-q")), n = Number(rate.getAttribute("data-rate")); setValue(q.key, n); w.querySelectorAll("[data-rate]").forEach(function (b) { var on = Number(b.getAttribute("data-rate")); b.setAttribute("aria-checked", on === n ? "true" : "false"); b.innerHTML = FE.icon("star", 28, n >= on ? "fill-current" : "opacity-30"); }); }
      var ed = e.target.closest("[data-edit]"); if (ed) go(ed.getAttribute("data-edit"));
    });
    root.addEventListener("fe:uploaded", function (e) {
      var w = e.target.closest("[data-q]"); if (!w) return; var key = w.getAttribute("data-q");
      uploadedNames[key] = (uploadedNames[key] || []).concat(e.detail.displayName); setValue(key, uploadedNames[key].slice());
    });
    el.extras.addEventListener("change", function (e) {
      if (e.target.id !== "prev-project" || !e.target.value) return;
      FE.api(p.previousUrl + encodeURIComponent(e.target.value)).then(function (r) {
        var prev = plainObject(r.answers); Object.keys(prev).forEach(function (k) { if (answers[k] === undefined || answers[k] === "") answers[k] = prev[k]; });
        dirty = true; renderStep(false); scheduleSave(); FE.toast.success("Previous settings applied");
      }, function (err) { FE.toast.error("Couldn't load that project", err.message); });
    });
    el.form.addEventListener("submit", function (e) { e.preventDefault(); if (submitting) return; if (isReview()) submit(); else next(); });
    el.left.addEventListener("click", function (e) { if (e.target.closest("[data-back]")) { var k = keys(); go(k[Math.max(0, index() - 1)]); } });

    // ───────────── start ─────────────
    initToken();
    if (mode === "project" && (p.initialStep || 0) > 0) { var s0 = sections(); stepKey = (s0[Math.min(p.initialStep, s0.length - 1)] || {}).key || ""; }
    renderStep(false);
    if (mode === "inquiry" && p.draftUrl) {
      FE.api(p.draftUrl + "?token=" + encodeURIComponent(token)).then(function (r) {
        var d = r && r.draft; if (!d || !Object.keys(plainObject(d.data)).length || same(d.data, initial)) return;
        resume = d;
        el.resume.innerHTML = '<div role="region" aria-label="Saved progress" class="mb-6 flex flex-col gap-3 rounded-2xl border border-accent/40 bg-accent-soft p-4 sm:flex-row sm:items-center sm:justify-between"><div class="text-sm"><span class="font-bold">Continue where you left off?</span> <span class="text-muted">I saved your earlier answers.</span></div>' +
          '<div class="flex gap-2"><button type="button" data-resume-yes class="inline-flex h-9 items-center justify-center rounded-xl bg-accent px-3.5 text-sm font-semibold text-accent-fg hover:bg-accent-hover">Continue</button><button type="button" data-resume-no class="inline-flex h-9 items-center justify-center rounded-xl px-3.5 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-fg">Start over</button></div></div>';
      }, function () {});
    }
    el.resume.addEventListener("click", function (e) {
      if (e.target.closest("[data-resume-yes]") && resume) {
        answers = plainObject(resume.data); var s = sections(); stepKey = (s[Math.min(resume.step || 0, s.length - 1)] || {}).key || ""; resume = null; el.resume.innerHTML = ""; dirty = true; renderStep(false);
      } else if (e.target.closest("[data-resume-no]")) {
        resume = null; el.resume.innerHTML = ""; var t = randomId(24); try { if (p.storageKey) localStorage.setItem(p.storageKey, t); } catch (x) {} token = t; root.setAttribute("data-draft-token", t);
        FE.$$("[data-fe-component=uploader]", root).forEach(function (u) { u.setAttribute("data-draft-token", t); });
      }
    });
  };
})();
