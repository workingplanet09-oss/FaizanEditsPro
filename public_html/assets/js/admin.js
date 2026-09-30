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
