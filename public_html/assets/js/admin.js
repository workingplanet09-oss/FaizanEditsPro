/*
 * Admin console + editor workspace behaviour (plain JavaScript).
 * Components (data-fe-component): status-control, version-upload, deliverables-admin, …
 * Generic hooks: select[data-patch="/api/…"][data-field="name"] saves on change, [data-timer="ISO"] is a live stopwatch.
 */
(function () {
  "use strict";
  var FE = window.FE, $ = FE.$, $$ = FE.$$;

  // ───────────── inline saves: <select data-patch="/api/tasks/ID" data-field="status"> ─────────────
  document.addEventListener("change", function (e) {
    var el = e.target.closest ? e.target.closest("[data-patch]") : null;
    if (!el) return;
    var body = {}, v = el.value;
    if (v === "" && el.hasAttribute("data-null-empty")) v = null;
    body[el.getAttribute("data-field")] = v;
    el.disabled = true;
    FE.api(el.getAttribute("data-patch"), { method: el.getAttribute("data-method") || "PATCH", body: body }).then(function () {
      el.disabled = false;
      if (el.getAttribute("data-refresh") === "1") FE.refresh(); else FE.toast.success(el.getAttribute("data-success") || "Saved");
    }, function (err) { el.disabled = false; FE.toast.error("Couldn't save", err.message); FE.refresh(); });
  });

  // dialogs that should be open when the page loads
  function openOnLoad() {
    $$("[data-open-on-load]").forEach(function (el) { FE.modal.open(el.getAttribute("data-open-on-load")); });
    try { var u = new URL(location.href); if (u.searchParams.has("new")) { u.searchParams.delete("new"); history.replaceState(null, "", u.pathname + u.search); } } catch (e) {}
  }
  if (document.readyState === "complete") openOnLoad(); else window.addEventListener("load", openOnLoad);

  // ───────────── stopwatch ─────────────
  function clock(s) { return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map(function (n) { return String(n).padStart(2, "0"); }).join(":"); }
  function tickTimers() { $$("[data-timer]").forEach(function (el) { var t = new Date(el.getAttribute("data-timer")).getTime(); if (!isNaN(t)) el.textContent = clock(Math.max(0, Math.floor((Date.now() - t) / 1000))); }); }
  tickTimers(); setInterval(tickTimers, 1000);

  // ───────────── change-request dialog ─────────────
  document.addEventListener("change", function (e) {
    var sel = e.target.closest ? e.target.closest("[data-cr-class]") : null;
    if (!sel) return;
    var box = sel.closest("form").querySelector("[data-cr-quote]");
    if (box) box.hidden = sel.value !== "ADDITIONAL_COST";
  });
  FE.handlers.changeRequestPrep = function (body) {
    var out = { classification: body.classification, staffNote: body.staffNote || undefined };
    if (body.classification === "ADDITIONAL_COST" && body.quoteAmount) out.createQuote = { title: body.quoteTitle || "Change order", amount: Math.round(Number(String(body.quoteAmount).replace(/[^0-9.]/g, "")) * 100) };
    return out;
  };

  FE.handlers.leadConverted = function (data) {
    FE.flash("success", "Lead converted");
    FE.go(data && data.projectId ? "/admin/projects/" + data.projectId : "/admin/clients/" + (data && data.clientId));
    return false;
  };


  // ───────────── money helpers ─────────────
  var ZERO = ["JPY", "KRW", "VND", "CLP", "ISK", "UGX", "XAF", "XOF", "PYG", "RWF", "VUV", "KMF", "GNF", "DJF", "XPF"];
  function digits(cur) { return ZERO.indexOf(String(cur).toUpperCase()) >= 0 ? 0 : 2; }
  FE.toMinor = function (major, cur) { return Math.round((Number(String(major).replace(/[^0-9.\-]/g, "")) || 0) * Math.pow(10, digits(cur))); };
  FE.fromMinor = function (minor, cur) { return Number(minor || 0) / Math.pow(10, digits(cur)); };
  function isoDay(offsetDays) { return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10); }

  FE.handlers.manualPaymentPrep = function (body, form) {
    var cur = form.getAttribute("data-currency") || "USD";
    var out = { amount: FE.toMinor(body.amount, cur), method: body.method };
    if (body.reference) out.reference = body.reference;
    if (!out.amount) { FE.showFieldErrors(form, { amount: "Enter the amount received." }); return false; }
    return out;
  };
  FE.handlers.contractPrep = function (body, form) {
    return { title: body.title, sections: FE.$$("[data-section]", form).map(function (el) { return { key: el.getAttribute("data-key"), title: FE.$('[data-s="title"]', el).value, body: FE.$('[data-s="body"]', el).value }; }) };
  };
  FE.handlers.retainerPrep = function (body) {
    var cur = body.currency || "USD";
    var out = { clientId: body.clientId, planId: body.planId || null, name: body.name, monthlyPrice: FE.toMinor(body.monthlyPrice, cur), currency: cur,
      videosIncluded: body.videosIncluded, shortsIncluded: body.shortsIncluded, hoursIncluded: body.hoursIncluded, turnaroundDays: body.turnaroundDays, revisionsIncluded: body.revisionsIncluded, notes: body.notes || null };
    return out;
  };
  FE.components.retainerForm = function (root, props) {
    var sel = FE.$("[data-plan]", root); if (!sel) return;
    sel.addEventListener("change", function () {
      var p = (props.plans || []).filter(function (x) { return x.id === sel.value; })[0]; if (!p) return;
      function set(n, v) { var el = FE.$('[name="' + n + '"]', root); if (el && v != null) el.value = v; }
      if (!FE.$('[name="name"]', root).value) set("name", p.name);
      if (p.price) set("monthlyPrice", String(p.price / 100));
      set("videosIncluded", p.videos || 0); set("shortsIncluded", p.shorts || 0); set("hoursIncluded", p.hours || 0); set("revisionsIncluded", p.revisions == null ? 2 : p.revisions);
    });
  };

  // ───────────── quote / invoice builder ─────────────
  FE.components.docBuilder = function (root, props) {
    var mode = props.mode, init = props.initial || {}, def = props.defaults || {}, editing = !!init.id;
    var cur = init.currency, linesEl = $("[data-lines]", root), prev = $("[data-preview]", root), err = $("[data-doc-error]", root), totalEl = $("[data-doc-total]", root);
    function f(n) { return $('[data-doc="' + n + '"]', root); }
    var lines = (init.items && init.items.length ? init.items.map(function (i) { return { description: i.description, quantity: String(i.quantity), price: String(FE.fromMinor(i.unitPrice, init.currency)), serviceId: i.serviceId || null }; }) : [{ description: "", quantity: "1", price: "" }]);

    // selects
    var client = f("clientId"), project = f("projectId");
    client.innerHTML = '<option value="">Choose a client…</option>' + props.clients.map(function (c) { return '<option value="' + FE.esc(c.id) + '">' + FE.esc(c.label) + "</option>"; }).join("");
    client.value = init.clientId || "";
    function fillProjects() {
      project.innerHTML = '<option value="">' + (mode === "quote" ? "New project (auto)" : "— none —") + "</option>" + props.projects.filter(function (p) { return p.clientId === client.value; }).map(function (p) { return '<option value="' + FE.esc(p.id) + '">' + FE.esc(p.label) + "</option>"; }).join("");
    }
    fillProjects(); project.value = init.projectId || "";
    client.addEventListener("change", function () { fillProjects(); project.value = ""; update(); });
    $("#svc-list", root).innerHTML = props.services.map(function (s) { return '<option value="' + FE.esc(s.label) + '"></option>'; }).join("");
    if (f("title")) f("title").value = init.title || "";
    f("discount").value = init.discount ? String(FE.fromMinor(init.discount, init.currency)) : "";
    f("tax").value = String((init.taxRateBps != null ? init.taxRateBps : def.taxRateBps || 0) / 100);
    if (mode === "quote") { f("deposit").value = String(init.depositPercent != null ? init.depositPercent : def.depositPercent); f("validUntil").value = init.validUntil || isoDay(def.validDays || 14); f("terms").value = init.terms != null && init.id ? init.terms : def.terms || ""; }
    else f("dueDate").value = init.dueDate || isoDay(def.dueDays || 7);
    f("notes").value = init.notes || "";

    function drawLines() {
      linesEl.innerHTML = lines.map(function (l, i) {
        var lab = function (t) { return i === 0 ? '<span class="text-sm font-semibold">' + t + "</span>" : '<span class="sr-only">' + t + "</span>"; };
        var cls = "w-full rounded-xl border border-line-strong bg-surface px-3.5 text-sm h-11 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20";
        return '<div class="grid grid-cols-[1fr_5rem_7rem_auto] items-end gap-2 max-sm:grid-cols-2" data-row="' + i + '">'
          + '<label class="space-y-1.5 max-sm:col-span-2">' + lab("Description") + '<input data-k="description" ' + (mode === "quote" ? 'list="svc-list" ' : "") + 'class="' + cls + '" value="' + FE.esc(l.description) + '" placeholder="e.g. YouTube video edit (up to 10 min)" aria-label="Description"></label>'
          + '<label class="space-y-1.5">' + lab("Qty") + '<input data-k="quantity" inputmode="decimal" class="' + cls + '" value="' + FE.esc(l.quantity) + '" aria-label="Quantity"></label>'
          + '<label class="space-y-1.5">' + lab("Unit price") + '<input data-k="price" inputmode="decimal" class="' + cls + '" value="' + FE.esc(l.price) + '" placeholder="0.00" aria-label="Unit price"></label>'
          + '<button type="button" data-remove="' + i + '" aria-label="Remove line" ' + (lines.length === 1 ? "disabled " : "") + 'class="mb-1 rounded-lg p-2 text-subtle hover:bg-danger-soft hover:text-danger disabled:opacity-30">' + FE.icon("trash", 16) + "</button></div>";
      }).join("");
    }
    function num(v) { return Number(String(v).replace(/[^0-9.\-]/g, "")) || 0; }
    function parsed() { cur = f("currency").value; return lines.map(function (l) { return { description: l.description.trim(), quantity: num(l.quantity), unitPrice: FE.toMinor(l.price, cur), serviceId: l.serviceId || null }; }).filter(function (l) { return l.description && l.quantity > 0; }); }
    function totals(items) {
      var subtotal = 0; items.forEach(function (l) { subtotal += Math.round(l.quantity * l.unitPrice); });
      var discount = Math.min(Math.max(FE.toMinor(f("discount").value, cur), 0), subtotal), taxable = subtotal - discount, bps = Math.round(num(f("tax").value) * 100);
      var tax = Math.round(taxable * bps / 10000), total = taxable + tax, pct = mode === "quote" ? Math.min(Math.max(Math.round(num(f("deposit").value)), 0), 100) : 100;
      var deposit = pct >= 100 ? total : Math.round(total * pct / 100);
      return { subtotal: subtotal, discount: discount, tax: tax, total: total, deposit: deposit, balance: total - deposit, bps: bps, pct: pct };
    }
    function update() {
      var items = parsed(), t = totals(items), m = function (n) { return FE.esc(FE.money(n, cur)); };
      if (!items.length) { prev.innerHTML = '<p class="text-sm text-muted">Add a line item to see totals.</p>'; }
      else {
        var row = function (k, v, strong, muted) { return '<div class="flex items-baseline justify-between gap-4' + (strong ? " border-t border-line pt-2 text-base font-extrabold" : "") + (muted ? " text-muted" : "") + '"><dt' + (!strong ? ' class="text-muted"' : "") + ">" + k + '</dt><dd class="tabular-nums">' + v + "</dd></div>"; };
        var h = '<table class="w-full text-left text-sm"><thead><tr class="border-b border-line text-xs font-semibold text-subtle"><th class="py-2 pr-2 font-semibold">Description</th><th class="py-2 pr-2 text-right font-semibold">Qty</th><th class="py-2 text-right font-semibold">Amount</th></tr></thead><tbody class="divide-y divide-line">'
          + items.map(function (l) { return '<tr><td class="py-2 pr-2 font-medium">' + FE.esc(l.description) + '</td><td class="py-2 pr-2 text-right tabular-nums text-muted">' + FE.esc(l.quantity) + '</td><td class="py-2 text-right tabular-nums">' + m(Math.round(l.quantity * l.unitPrice)) + "</td></tr>"; }).join("") + "</tbody></table>";
        h += '<dl class="ml-auto mt-4 w-full space-y-1.5 text-sm">' + row("Subtotal", m(t.subtotal)) + (t.discount > 0 ? row("Discount", "− " + m(t.discount)) : "") + (t.tax > 0 ? row("Tax (" + (t.bps / 100) + "%)", m(t.tax)) : "") + row("Total", m(t.total), true);
        if (mode === "quote" && t.balance > 0) h += row("Deposit due now (" + t.pct + "%)", m(t.deposit)) + row("Balance on approval", m(t.balance), false, true);
        prev.innerHTML = h + "</dl>";
      }
      totalEl.textContent = "Total " + FE.money(t.total, cur) + (mode === "quote" && t.balance > 0 ? " · deposit " + FE.money(t.deposit, cur) : "");
      var ok = !!client.value && items.length > 0;
      $$("[data-doc-save]", root).forEach(function (b) { b.disabled = !ok; });
    }
    root.addEventListener("input", function (e) {
      var row = e.target.closest("[data-row]");
      if (row) {
        var l = lines[Number(row.getAttribute("data-row"))], k = e.target.getAttribute("data-k"); l[k] = e.target.value;
        if (k === "description" && mode === "quote") { var s = props.services.filter(function (x) { return x.label === e.target.value; })[0]; if (s && s.price && !l.price) { l.price = String(FE.fromMinor(s.price, f("currency").value)); $('[data-k="price"]', row).value = l.price; } }
      }
      update();
    });
    root.addEventListener("change", update);
    root.addEventListener("click", function (e) {
      var rm = e.target.closest("[data-remove]"); if (rm) { lines.splice(Number(rm.getAttribute("data-remove")), 1); drawLines(); update(); return; }
      if (e.target.closest("[data-add-line]")) { lines.push({ description: "", quantity: "1", price: "" }); drawLines(); update(); }
    });
    function save(send, btn) {
      err.hidden = true;
      var items = parsed(); cur = f("currency").value;
      var common = { items: items, discount: FE.toMinor(f("discount").value, cur), taxRateBps: Math.round(num(f("tax").value) * 100), notes: f("notes").value || null };
      var req;
      if (mode === "quote") {
        var body = Object.assign({}, common, { currency: cur, depositPercent: Math.round(num(f("deposit").value)), validUntil: f("validUntil").value || null, terms: f("terms").value || null });
        if (f("title").value.trim()) body.title = f("title").value.trim();
        if (editing) req = FE.api("/api/quotes/" + init.id, { method: "PATCH", body: body });
        else req = FE.api("/api/quotes", { body: Object.assign(body, { clientId: client.value, projectId: project.value || null, leadId: init.leadId || null }) });
        req = req.then(function (q) { return send ? FE.api("/api/quotes/" + q.id + "/send", { body: {} }).then(function () { return q; }) : q; });
      } else {
        req = FE.api("/api/invoices", { body: Object.assign({}, common, { clientId: client.value, projectId: project.value || null, kind: f("kind").value, currency: cur, dueDate: f("dueDate").value || null, send: send }) });
      }
      FE.busy(btn, true);
      req.then(function (r) { FE.flash("success", send ? (mode === "quote" ? "Quote" : "Invoice") + " sent to the client" : "Saved as draft"); FE.go("/admin/" + mode + "s/" + r.id); },
        function (e) { FE.busy(btn, false); err.textContent = e.message; err.hidden = false; });
    }
    $$("[data-doc-save]", root).forEach(function (b) { b.addEventListener("click", function () { save(b.getAttribute("data-doc-save") === "send", b); }); });
    drawLines(); update();
  };

  FE.handlers.meetingPrep = function (body) {
    var d = new Date(body.when);
    if (isNaN(d)) return false;
    var out = { title: body.title, type: body.type, startsAt: d.toISOString(), minutes: body.minutes || 30 };
    if (body.clientId) out.clientId = body.clientId;
    if (body.notes) out.notes = body.notes;
    return out;
  };


  // ───────────── small UI toolkit for the editors (admin-editors.js) ─────────────
  var h = FE.h;
  var INPUT = "w-full rounded-xl border border-line-strong bg-surface px-3.5 text-sm text-fg placeholder:text-subtle transition-[border-color,box-shadow] duration-150 hover:border-subtle focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60";
  var UI = (FE.ui = {});
  UI.INPUT = INPUT;
  UI.btnClass = function (variant, size) {
    var sz = { xs: "h-7 px-2.5 text-xs rounded-lg", sm: "h-9 px-3.5 text-sm rounded-xl", md: "h-11 px-5 text-sm rounded-xl" }[size || "md"];
    var v = { primary: "bg-accent text-accent-fg hover:brightness-105", dark: "bg-fg text-bg hover:opacity-90", outline: "border border-line-strong text-fg hover:bg-surface-2", ghost: "text-muted hover:text-fg hover:bg-surface-2", danger: "bg-danger-soft text-danger hover:bg-danger hover:text-white", secondary: "bg-surface-2 text-fg hover:bg-line" }[variant || "primary"];
    return "relative inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold select-none transition duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 " + sz + " " + v;
  };
  UI.btn = function (label, o) {
    o = o || {};
    var b = h("button", { type: o.type || "button", class: UI.btnClass(o.variant, o.size) + (o.class ? " " + o.class : ""), html: (o.icon ? FE.icon(o.icon, 16) : "") + FE.esc(label) });
    if (o.onclick) b.addEventListener("click", o.onclick);
    return b;
  };
  UI.iconBtn = function (icon, label, onclick, danger) {
    var b = h("button", { type: "button", "aria-label": label, title: label, class: "rounded-lg p-2 text-subtle " + (danger ? "hover:bg-danger-soft hover:text-danger" : "hover:bg-surface-2 hover:text-fg"), html: FE.icon(icon, 15) });
    b.addEventListener("click", onclick); return b;
  };
  UI.input = function (value, o) {
    o = o || {};
    var el = h("input", { type: o.type || "text", class: INPUT + " h-11 " + (o.class || ""), value: value == null ? "" : value, placeholder: o.placeholder, "aria-label": o["aria-label"], disabled: o.disabled, inputmode: o.inputmode, min: o.min, max: o.max });
    el.value = value == null ? "" : value; return el;
  };
  UI.textarea = function (value, rows, o) {
    o = o || {};
    var el = h("textarea", { rows: rows || 3, class: INPUT + " py-3 leading-relaxed " + (o.class || ""), placeholder: o.placeholder, "aria-label": o["aria-label"] });
    el.value = value == null ? "" : value; return el;
  };
  UI.select = function (options, value, o) {
    o = o || {};
    var el = h("select", { class: INPUT + " h-11 " + (o.class || ""), "aria-label": o["aria-label"], disabled: o.disabled });
    options.forEach(function (x) { var op = h("option", { value: x.value }, x.label); el.appendChild(op); });
    el.value = value == null ? "" : value; return el;
  };
  /** label + control + hint + error slot. Returns an element with setError(msg). */
  UI.field = function (label, control, o) {
    o = o || {};
    var id = "f-" + Math.random().toString(36).slice(2, 8);
    if (control.id === "" || !control.id) control.id = id;
    var err = h("p", { class: "hidden items-center gap-1.5 text-xs font-medium text-danger", role: "alert" });
    var el = h("div", { class: "space-y-1.5 " + (o.class || "") },
      label ? h("label", { for: control.id, class: "flex items-center gap-1.5 text-sm font-semibold" }, label, o.required ? h("span", { class: "text-danger", "aria-hidden": "true" }, "*") : o.optional ? h("span", { class: "text-xs font-normal text-subtle" }, "optional") : null) : null,
      control, err, o.hint ? h("p", { class: "text-xs text-subtle" }, o.hint) : null);
    el.setError = function (m) { err.textContent = m || ""; err.classList.toggle("hidden", !m); err.classList.toggle("flex", !!m); control.setAttribute("aria-invalid", m ? "true" : "false"); };
    return el;
  };
  /** accessible switch; returns an element with get()/set() */
  UI.sw = function (checked, label, description) {
    var on = !!checked;
    var btn = h("button", { type: "button", role: "switch", "aria-checked": on ? "true" : "false", "data-switch": "x", class: "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 " + (on ? "bg-accent" : "bg-line-strong"), html: '<span class="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ' + (on ? "translate-x-[22px]" : "translate-x-0.5") + '"></span><span class="sr-only">' + (on ? "On" : "Off") + "</span>" });
    var wrap = h("div", { class: "flex items-center justify-between gap-4" }, label ? h("span", { class: "min-w-0" }, h("span", { class: "block text-sm font-semibold leading-snug" }, label), description ? h("span", { class: "mt-0.5 block text-xs text-muted" }, description) : null) : null, btn);
    wrap.get = function () { return btn.getAttribute("aria-checked") === "true"; };
    wrap.button = btn;
    return wrap;
  };
  UI.checkbox = function (checked, label, description) {
    var cb = h("input", { type: "checkbox", class: "mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer accent-[var(--accent)]" });
    cb.checked = !!checked;
    var el = h("label", { class: "flex cursor-pointer items-start gap-3" }, cb, h("span", { class: "min-w-0" }, h("span", { class: "block text-sm font-medium leading-snug" }, label), description ? h("span", { class: "mt-0.5 block text-xs text-muted" }, description) : null));
    el.get = function () { return cb.checked; }; el.box = cb; return el;
  };
  UI.banner = function (msg, tone) {
    return h("p", { role: "alert", class: "rounded-xl px-4 py-3 text-sm font-medium " + (tone === "warning" ? "bg-warning-soft text-warning" : "bg-danger-soft text-danger") }, msg);
  };
  var SIZES = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" };
  /** Builds and opens a <dialog>. o: title, description, size, body (Node), footer (Node|Node[]). Returns {el, body, foot, close()}. */
  FE.dialog = function (o) {
    var id = "dlg-" + Math.random().toString(36).slice(2, 8);
    var body = h("div", { class: "thin-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5" }, o.body);
    var foot = h("div", { class: "flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2/40 px-6 py-4" }, o.footer);
    var dlg = h("dialog", { id: id, "aria-labelledby": id + "-t", class: "m-auto w-[calc(100%-1.5rem)] max-h-[92dvh] overflow-hidden rounded-3xl border border-line bg-surface p-0 text-fg shadow-lift open:flex open:flex-col open:animate-pop " + (SIZES[o.size || "md"]) },
      h("div", { class: "flex items-start justify-between gap-4 border-b border-line px-6 py-4" }, h("div", { class: "min-w-0" }, h("h2", { id: id + "-t", class: "text-lg font-bold leading-tight" }, o.title), o.description ? h("p", { class: "mt-1 text-sm text-muted" }, o.description) : null),
        h("button", { type: "button", "data-modal-close": true, "aria-label": "Close dialog", class: "-mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg", html: FE.icon("x", 18) })),
      body, foot);
    dlg.addEventListener("close", function () { dlg.remove(); if (o.onClose) o.onClose(); });
    document.body.appendChild(dlg);
    dlg.showModal();
    return { el: dlg, body: body, foot: foot, close: function () { if (dlg.open) dlg.close(); } };
  };
  /** run an API call with a busy button; on success run ok(data); on failure run fail(err) (toast otherwise) */
  UI.run = function (btn, promiseFn, ok, fail) {
    FE.busy(btn, true);
    return promiseFn().then(function (d) { FE.busy(btn, false); if (ok) ok(d); }, function (e) { FE.busy(btn, false); if (fail) fail(e); else FE.toast.error("That didn't work", e.message); });
  };
  UI.done = function (msg) { FE.flash("success", msg); FE.refresh(); };

  // ───────────── project status control ─────────────
  FE.components.statusControl = function (root, props) {
    var dlg = $("#status-modal", root), title = $("#status-modal-t", dlg), comment = $("textarea", dlg);
    var gate = $("[data-gate]", dlg), gateText = $("[data-gate-text]", dlg), note = $("[data-override-note]", dlg), err = $("[data-status-error]", dlg);
    var goBtn = $("[data-move-go]", dlg), ovBtn = $("[data-override-go]", dlg);
    var normal = $('[data-group="normal"]', root), over = $('[data-group="override"]', root), toggle = $("[data-override-toggle]", root);
    var target = null, override = false, mode = false;

    function reset() { gate.hidden = true; note.hidden = true; err.hidden = true; ovBtn.hidden = true; goBtn.hidden = false; comment.value = ""; }
    function open(to, isOverride) {
      target = to; override = isOverride; reset();
      title.textContent = "Move to “" + props.meta[to].label + "”?";
      var d = dlg.querySelector("p.text-muted"); if (d) d.remove();
      var desc = document.createElement("p"); desc.className = "mt-1 text-sm text-muted"; desc.textContent = props.meta[to].clientNow; title.parentNode.appendChild(desc);
      note.hidden = !override;
      goBtn.textContent = override ? "Override & move" : "Move project";
      goBtn.className = goBtn.className.replace(/bg-danger-soft text-danger hover:bg-danger hover:text-white|bg-accent text-accent-fg/g, "").trim() + (override ? " bg-danger-soft text-danger hover:bg-danger hover:text-white" : " bg-accent text-accent-fg");
      FE.modal.open(dlg);
    }
    function send(withOverride) {
      err.hidden = true;
      var body = { to: target }; if (comment.value.trim()) body.comment = comment.value.trim(); if (withOverride) body.override = true;
      var btn = withOverride ? ovBtn : goBtn;
      FE.busy(btn, true);
      FE.api("/api/projects/" + props.projectId + "/transition", { body: body }).then(function () {
        FE.flash("success", "Moved to " + props.meta[target].label); FE.refresh();
      }, function (e) {
        FE.busy(btn, false);
        if (e.code === "GATED" || e.code === "INVALID_TRANSITION") {
          gateText.textContent = e.message + (props.canOverride ? " You can override this — it will be recorded in the audit log." : "");
          gate.hidden = false;
          if (props.canOverride && !withOverride) { ovBtn.hidden = false; goBtn.hidden = true; }
        } else { err.textContent = e.message; err.hidden = false; }
      });
    }
    root.addEventListener("click", function (e) {
      var b = e.target.closest("[data-status-to]");
      if (b) { open(b.getAttribute("data-status-to"), b.getAttribute("data-override") === "1"); return; }
      if (toggle && e.target.closest("[data-override-toggle]")) {
        mode = !mode; normal.hidden = mode; over.hidden = !mode;
        toggle.textContent = mode ? "Override mode on" : "Admin override";
        toggle.classList.toggle("text-danger", mode);
      }
    });
    goBtn.addEventListener("click", function () { send(override); });
    ovBtn.addEventListener("click", function () { override = true; send(true); });
  };

  // ───────────── upload a new video version ─────────────
  FE.components.versionUpload = function (root, props) {
    var drop = $("[data-vu-drop]", root), done = $("[data-vu-done]", root), nameEl = $("[data-vu-name]", root), link = $("[data-vu-link]", root), errEl = $("[data-vu-error]", root), go = $("[data-vu-go]", root);
    var asset = null;
    root.addEventListener("fe:uploaded", function (e) {
      asset = e.detail; nameEl.textContent = asset.displayName || "Uploaded"; drop.hidden = true; done.hidden = false; done.classList.add("flex");
    });
    $("[data-vu-replace]", root).addEventListener("click", function () { asset = null; drop.hidden = false; done.hidden = true; done.classList.remove("flex"); });
    function sync() { go.disabled = !asset && !link.value.trim(); }
    link.addEventListener("input", sync); root.addEventListener("fe:uploaded", sync); root.addEventListener("click", function () { setTimeout(sync, 0); });
    sync();
    go.addEventListener("click", function () {
      errEl.hidden = true;
      var body = { release: $('[data-vu="release"]', root).value };
      if (asset) body.assetId = asset.id; else if (link.value.trim()) body.videoUrl = link.value.trim();
      var notes = $('[data-vu="notes"]', root).value.trim(), sum = $('[data-vu="changeSummary"]', root).value.trim(), rev = $('[data-vu="revisionId"]', root).value;
      if (notes) body.notes = notes; if (sum) body.changeSummary = sum; if (rev) body.revisionId = rev;
      FE.busy(go, true);
      FE.api("/api/projects/" + props.projectId + "/versions", { body: body }).then(function () {
        FE.flash("success", "Version created"); FE.refresh();
      }, function (e) { FE.busy(go, false); errEl.textContent = e.message; errEl.hidden = false; });
    });
  };

  // ───────────── final deliverables: label travels with the uploader ─────────────
  FE.components.deliverablesAdmin = function (root) {
    var label = $("[data-da-label]", root), up = $("[data-da-uploader]", root);
    if (label && up) label.addEventListener("input", function () { up.setAttribute("data-label", label.value); });
  };
})();
