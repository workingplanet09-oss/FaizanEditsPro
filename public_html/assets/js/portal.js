/* Client portal, editor workspace and admin console behaviour: messages, files, signing, payment, account panels, brand kit. */
(function () {
  "use strict";
  var FE = window.FE, $ = FE.$, $$ = FE.$$, esc = FE.esc;

  // ───────────── files: open/download through short-lived signed links, lazy thumbnails, rename ─────────────
  FE.openAsset = function (id, mode) {
    // inline previews open in a tab that is created right away (popup blockers only allow that inside the click); downloads just start
    var win = mode === "inline" ? window.open("", "_blank") : null;
    return FE.api("/api/assets/" + id + "?" + (mode === "inline" ? "inline=1" : "download=1")).then(function (r) {
      if (!/^\/api\/storage\/object\?t=|^https:\/\//.test(r.url)) throw new Error("Unexpected file address.");
      if (win) { win.opener = null; win.location.href = r.url; } else window.location.href = r.url;
    }, function (e) { if (win) win.close(); throw e; });
  };
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-asset-open]");
    if (b) { e.preventDefault(); FE.busy(b, true); FE.openAsset(b.getAttribute("data-asset-open"), b.getAttribute("data-mode")).then(function () { FE.busy(b, false); }, function (err) { FE.busy(b, false); FE.toast.error("Can't open file", err.message); }); return; }
    var t = e.target.closest("[data-toggle]");
    if (t) { var el = document.getElementById(t.getAttribute("data-toggle")); if (el) el.hidden = !el.hidden; return; }
    var r = e.target.closest("[data-rename]");
    if (r) {
      var form = $("#rename-form"); if (!form) return;
      form.setAttribute("data-fe-form", "/api/assets/" + r.getAttribute("data-rename")); $("#rename-input").value = r.getAttribute("data-name") || "";
      FE.modal.open("#rename-file"); setTimeout(function () { $("#rename-input").focus(); }, 30); return;
    }
    var pr = e.target.closest("[data-print]"); if (pr) { window.print(); }
  });
  FE.handlers.copyShare = function (data) {
    if (data && data.url && navigator.clipboard) navigator.clipboard.writeText(data.url).catch(function () {});
    return false;
  };
  function loadThumbs(root) {
    $$("[data-thumb]", root).forEach(function (el) {
      if (el.__thumb) return; el.__thumb = true;
      FE.api("/api/assets/" + el.getAttribute("data-thumb") + "/thumbnail").then(function (r) {
        if (!r.url) return; var img = FE.h("img", { src: r.url, alt: "", class: "h-full w-full object-cover", loading: "lazy" }); el.innerHTML = ""; el.appendChild(img);
      }, function () {});
    });
  }
  FE.loadThumbs = loadThumbs;
  loadThumbs(document);
  // team role selector
  document.addEventListener("change", function (e) {
    var s = e.target.closest("[data-member-role]"); if (!s) return;
    FE.api("/api/members/" + s.getAttribute("data-member-role"), { method: "PATCH", body: { role: s.value } }).then(function () { FE.toast.success("Role updated"); }, function (err) { FE.toast.error("Couldn't change role", err.message); FE.refresh(); });
  });

  // ───────────── star rating inputs ─────────────
  FE.components.rating = function (root) {
    var input = root.previousElementSibling, btns = $$("[data-rate]", root);
    root.addEventListener("click", function (e) {
      var b = e.target.closest("[data-rate]"); if (!b) return;
      var n = Number(b.getAttribute("data-rate")); input.value = n;
      btns.forEach(function (x) { var v = Number(x.getAttribute("data-rate")); x.setAttribute("aria-checked", v === n ? "true" : "false"); x.innerHTML = FE.icon("star", 30, n >= v ? "fill-current" : "opacity-30"); });
    });
  };

  // ───────────── conversations ─────────────
  FE.components.messages = function (root, p) {
    var list = $("[data-msg-list]", root), form = $("[data-msg-form]", root), ta = $("textarea", form), btn = $("button[type=submit]", form), err = $("[data-msg-error]", form), group = $("[data-msg-group]", form);
    var items = p.initial || [], qs = p.projectId ? "projectId=" + encodeURIComponent(p.projectId) : p.clientId ? "clientId=" + encodeURIComponent(p.clientId) : "";
    function render() {
      if (!items.length) {
        list.innerHTML = '<div class="flex h-full flex-col items-center justify-center text-center text-sm text-muted"><span class="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2">' + FE.icon("message", 22) + '</span><p class="font-semibold text-fg">No messages yet</p><p class="mt-1 max-w-xs">Ask a question or share a note — your project team replies here and by email.</p></div>';
        return;
      }
      var nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 120, html = "";
      items.forEach(function (m, i) {
        var prev = items[i - 1], grouped = prev && prev.sender.id === m.sender.id && new Date(m.createdAt) - new Date(prev.createdAt) < 300000;
        html += '<div class="flex gap-3 ' + (m.mine ? "flex-row-reverse " : "") + (grouped ? "-mt-2.5" : "") + '"><div class="w-8 shrink-0">' + (grouped ? "" : avatar(m.sender)) + '</div><div class="max-w-[85%] min-w-0 ' + (m.mine ? "text-right" : "") + '">' +
          (grouped ? "" : '<div class="mb-1 flex items-baseline gap-2 text-xs ' + (m.mine ? "flex-row-reverse" : "") + '"><span class="font-bold">' + (m.mine ? "You" : esc(m.sender.name)) + "</span>" + (m.sender.isStaff && !m.mine ? '<span class="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">Studio</span>' : "") + '<span class="text-subtle" data-ago="' + esc(new Date(m.createdAt).toISOString()) + '"></span></div>') +
          '<div class="inline-block whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-left text-sm leading-relaxed ' + (m.mine ? "rounded-tr-md bg-fg text-bg" : "rounded-tl-md bg-surface-2") + '">' + esc(m.body) + "</div>" +
          (m.attachments && m.attachments.length ? '<ul class="mt-1.5 space-y-1">' + m.attachments.map(function (a) { return '<li class="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs">' + FE.icon("file", 13) + esc(a.name) + "</li>"; }).join("") + "</ul>" : "") + "</div></div>";
      });
      list.innerHTML = html; FE.refreshTimes();
      if (nearBottom || !list.__placed) { list.scrollTop = list.scrollHeight; list.__placed = true; }
    }
    function avatar(s) {
      if (s.avatarUrl) return '<img src="' + esc(s.avatarUrl) + '" alt="" width="32" height="32" class="h-8 w-8 rounded-full object-cover">';
      return '<span aria-hidden="true" class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-xs font-bold">' + esc((s.name || "?").split(/\s+/).map(function (w) { return w[0]; }).slice(0, 2).join("").toUpperCase()) + "</span>";
    }
    function load() {
      FE.api("/api/messages?" + qs + (qs ? "&" : "") + "markRead=1").then(function (rows) {
        if (rows.length === items.length && rows.length && items.length && rows[rows.length - 1].id === items[items.length - 1].id) return;
        items = rows; render();
      }, function () {});
    }
    ta.addEventListener("input", function () { btn.disabled = !ta.value.trim(); });
    ta.addEventListener("keydown", function (e) { if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && ta.value.trim()) { e.preventDefault(); form.requestSubmit(); } });
    form.addEventListener("submit", function (e) {
      e.preventDefault(); if (!ta.value.trim()) return;
      var body = { projectId: p.projectId || undefined, clientId: p.clientId || undefined, body: ta.value }; if (!p.staff && group) body.recipientGroup = group.value;
      FE.busy(btn, true); err.classList.add("hidden");
      FE.api("/api/messages", { body: body }).then(function (m) { FE.busy(btn, false); ta.value = ""; btn.disabled = true; items.push(m); render(); list.scrollTop = list.scrollHeight; },
        function (er) { FE.busy(btn, false); err.textContent = er.message; err.classList.remove("hidden"); });
    });
    render(); load();
    setInterval(function () { if (document.visibilityState === "visible") load(); }, 15000);
  };

  // ───────────── contract signing ─────────────
  FE.components["contract-sign"] = function (root, p) {
    var form = $("[data-sign-form]", root), name = $('input[name="signerName"]', form), typed = $("[data-typed]", form), canvas = $("[data-canvas]", form), btn = $("[data-sign-btn]", form), agree = $("[data-agree]", form);
    var kind = "typed", inked = false, drawing = false, g;
    function ready() { btn.disabled = !(agree.checked && name.value.trim().length >= 2 && (kind === "typed" ? (typed.value || name.value).trim().length >= 2 : inked)); }
    function setupCanvas() {
      var ratio = window.devicePixelRatio || 1, w = canvas.clientWidth || 300;
      canvas.width = w * ratio; canvas.height = 160 * ratio; g = canvas.getContext("2d"); g.scale(ratio, ratio); g.lineWidth = 2.2; g.lineCap = "round"; g.strokeStyle = "#111"; inked = false;
    }
    typed.placeholder = name.value || "Your name";
    $$("[data-kind]", root).forEach(function (t) {
      t.addEventListener("click", function () {
        kind = t.getAttribute("data-kind");
        $$("[data-kind]", root).forEach(function (x) { var on = x === t; x.setAttribute("aria-selected", on ? "true" : "false"); x.className = "rounded-lg px-4 py-1.5 transition " + (on ? "bg-surface shadow-soft" : "text-muted"); });
        $("[data-pane=typed]", root).hidden = kind !== "typed"; $("[data-pane=drawn]", root).hidden = kind !== "drawn";
        if (kind === "drawn") setupCanvas(); ready();
      });
    });
    function pos(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    canvas.addEventListener("pointerdown", function (e) { drawing = true; canvas.setPointerCapture(e.pointerId); var q = pos(e); g.beginPath(); g.moveTo(q.x, q.y); });
    canvas.addEventListener("pointermove", function (e) { if (!drawing) return; var q = pos(e); g.lineTo(q.x, q.y); g.stroke(); inked = true; ready(); });
    canvas.addEventListener("pointerup", function () { drawing = false; });
    $("[data-clear]", root).addEventListener("click", function () { g.clearRect(0, 0, canvas.width, canvas.height); inked = false; ready(); });
    [name, typed, agree].forEach(function (el) { el.addEventListener("input", ready); el.addEventListener("change", ready); });
    form.addEventListener("submit", function (e) {
      e.preventDefault(); if (btn.disabled) return;
      FE.busy(btn, true); FE.showFieldErrors(form, {}, "");
      FE.api("/api/contracts/" + p.id + "/sign", { body: { signerName: name.value, signature: kind === "typed" ? typed.value || name.value : canvas.toDataURL("image/png"), kind: kind, accept: agree.checked, version: p.version } }).then(function () {
        FE.flash("success", "Contract signed — a copy is saved to your account. Your invoice is next."); FE.refresh();
      }, function (er) { FE.busy(btn, false); FE.showFieldErrors(form, er.fields || {}, er.message); });
    });
    ready();
  };

  // ───────────── payment ─────────────
  FE.components["pay-panel"] = function (root, p) {
    var start = $("[data-pay-start]", root), demo = $("[data-pay-demo]", root), err = $("[data-pay-error]", root);
    function fail(title, e) { err.textContent = e.message; err.classList.remove("hidden"); FE.toast.error(title, e.message); }
    $("[data-pay-begin]", root).addEventListener("click", function (e) {
      var b = e.currentTarget; FE.busy(b, true); err.classList.add("hidden");
      FE.api("/api/invoices/" + p.id + "/pay", { body: {} }).then(function (r) {
        if (r.kind === "redirect" && /^https:\/\//.test(r.url)) { window.location.href = r.url; return; }
        FE.busy(b, false); start.hidden = true; demo.hidden = false;
      }, function (er) { FE.busy(b, false); fail("Couldn't start payment", er); });
    });
    $("[data-pay-cancel]", root).addEventListener("click", function () { demo.hidden = true; start.hidden = false; });
    $("[data-pay-demo-go]", root).addEventListener("click", function (e) {
      var b = e.currentTarget; FE.busy(b, true);
      FE.api("/api/invoices/" + p.id + "/pay/demo", { body: {} }).then(function () { FE.flash("success", "Payment received — thank you! A receipt is on its way."); window.location.replace("/dashboard/invoices/" + p.id + "?paid=1"); }, function (er) { FE.busy(b, false); fail("Payment failed", er); });
    });
  };

  // ───────────── account ─────────────
  FE.handlers.passwordPrep = function (body, form) {
    if (body.next && body.next.length < 10) { FE.showFieldErrors(form, { next: "Use at least 10 characters." }); return false; }
    if (body.next !== body.confirm) { FE.showFieldErrors(form, { confirm: "Passwords don't match." }); return false; }
    return { current: body.current, next: body.next };
  };
  FE.components.prefs = function (root) {
    function collect() { return $$("li[data-cat]", root).map(function (li) { var s = $$("[data-switch]", li); return { category: li.getAttribute("data-cat"), inApp: s[0].getAttribute("aria-checked") === "true", email: s[1].getAttribute("aria-checked") === "true" }; }); }
    root.addEventListener("fe:switch", function () {
      FE.api("/api/notifications/preferences", { method: "PUT", body: { prefs: collect() } }).then(function () { FE.toast.success("Notification settings saved"); }, function (e) { FE.toast.error("Couldn't save", e.message); });
    });
  };
  FE.components["two-factor"] = function (root, p) {
    var inputCls = "h-11 rounded-xl border border-line-strong bg-surface px-3.5 text-sm focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20";
    function btn(label, cls, fn, icon) { var b = FE.h("button", { type: "button", class: cls, onclick: function () { fn(b); } }); b.innerHTML = (icon ? FE.icon(icon, 16) : "") + esc(label); return b; }
    var primary = "inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-accent px-5 text-sm font-semibold text-accent-fg hover:brightness-105 disabled:opacity-50";
    function show(node) { root.innerHTML = ""; root.appendChild(node); }
    function errLine(holder, msg) { holder.textContent = msg || ""; holder.classList.toggle("hidden", !msg); }
    function home() {
      if (!p.enabled) { show(btn("Set up two-factor authentication", primary, begin, "shield")); return; }
      show(btn("Turn off two-factor", "inline-flex h-11 items-center justify-center rounded-xl border border-line-strong px-5 text-sm font-semibold hover:bg-surface-2", off));
    }
    function begin(b) {
      FE.busy(b, true);
      FE.api("/api/auth/2fa/setup", { body: {} }).then(function (r) {
        var code = FE.h("input", { "aria-label": "6-digit code", inputmode: "numeric", autocomplete: "one-time-code", class: inputCls + " font-mono tracking-widest", placeholder: "123456" }), er = FE.h("p", { role: "alert", class: "hidden text-sm font-medium text-danger" });
        var go = btn("Turn on", primary, function (gb) {
          FE.busy(gb, true);
          FE.api("/api/auth/2fa/enable", { body: { code: code.value.trim() } }).then(function (res) { recovery(res.recoveryCodes); }, function (e) { FE.busy(gb, false); errLine(er, e.message); });
        });
        var wrap = FE.h("div", { class: "grid grid-cols-1 gap-6 sm:grid-cols-[220px_1fr]" }, FE.h("img", { src: r.qrDataUrl, alt: "QR code to scan with your authenticator app", width: 220, height: 220, class: "rounded-2xl border border-line bg-white" }),
          FE.h("div", { class: "space-y-3" }, FE.h("p", { class: "text-sm" }, "1. Scan the code with Google Authenticator, 1Password, Authy or similar."), FE.h("p", { class: "text-sm" }, "2. Enter the 6-digit code it shows."),
            FE.h("p", { class: "text-xs text-subtle" }, "Can't scan? Enter this key manually: ", FE.h("span", { class: "select-all font-mono" }, r.secret)), er, FE.h("div", { class: "flex max-w-xs gap-2" }, code, go)));
        show(wrap);
      }, function (e) { FE.busy(b, false); FE.toast.error("Couldn't start setup", e.message); });
    }
    function recovery(codes) {
      var box = FE.h("div", { class: "rounded-2xl border border-warning/40 bg-warning-soft/60 p-5" }, FE.h("h3", { class: "font-extrabold" }, "Save your recovery codes"),
        FE.h("p", { class: "mt-1 text-sm text-muted" }, "Each code works once if you lose your phone. This is the only time they're shown."),
        FE.h("ul", { class: "mt-4 grid grid-cols-2 gap-2 font-mono text-sm sm:grid-cols-4" }, codes.map(function (c) { return FE.h("li", { class: "rounded-lg bg-surface px-3 py-2 text-center" }, c); })),
        FE.h("div", { class: "mt-4 flex gap-2" }, btn("Copy all", "inline-flex h-11 items-center gap-2 rounded-xl bg-fg px-5 text-sm font-semibold text-bg", function () { if (navigator.clipboard) navigator.clipboard.writeText(codes.join("\n")); FE.toast.success("Copied to clipboard"); }, "copy"),
          btn("I've saved them", "inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold text-muted hover:bg-surface-2", function () { FE.refresh(); })));
      show(box);
    }
    function off() {
      var pw = FE.h("input", { type: "password", autocomplete: "current-password", class: inputCls + " w-full", "aria-label": "Password" }), code = FE.h("input", { inputmode: "numeric", class: inputCls + " w-full", "aria-label": "Authenticator code" }), er = FE.h("p", { role: "alert", class: "hidden text-sm font-medium text-danger" });
      show(FE.h("div", { class: "max-w-md space-y-3" }, er, FE.h("label", { class: "block text-sm font-semibold" }, "Password", pw), FE.h("label", { class: "block text-sm font-semibold" }, "Authenticator code", code),
        FE.h("div", { class: "flex gap-2" }, btn("Turn off 2FA", "inline-flex h-11 items-center rounded-xl bg-danger-soft px-5 text-sm font-semibold text-danger hover:bg-danger hover:text-white", function (b) {
          FE.busy(b, true); FE.api("/api/auth/2fa/disable", { body: { password: pw.value, code: code.value.trim() } }).then(function () { FE.flash("success", "Two-factor authentication turned off"); FE.refresh(); }, function (e) { FE.busy(b, false); errLine(er, e.message); });
        }), btn("Cancel", "inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold text-muted hover:bg-surface-2", home))));
    }
    home();
  };

  // ───────────── brand kit ─────────────
  FE.components["brand-kit"] = function (form) {
    var canEdit = $("[data-edit]", form).getAttribute("data-edit") === "1", inputCls = "h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20 disabled:opacity-60";
    function listEditor(holder, kind) {
      var rows = FE.json(holder.getAttribute("data-props"), []); rows = Array.isArray(rows) ? rows : [];
      var max = kind === "colors" ? 12 : 8, box = FE.h("div", { class: "space-y-3" }), add = FE.h("button", { type: "button", class: "inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong px-3 text-sm font-semibold hover:bg-surface-2" });
      add.innerHTML = FE.icon("plus", 15) + (kind === "colors" ? "Add colour" : "Add font");
      function draw() {
        box.innerHTML = "";
        rows.forEach(function (r, i) {
          var row = FE.h("div", { class: "flex flex-wrap items-center gap-2", "data-row": kind });
          if (kind === "colors") {
            var pick = FE.h("input", { type: "color", "aria-label": "Colour " + (i + 1), value: /^#[0-9a-f]{6}$/i.test(r.hex || "") ? r.hex : "#000000", class: "h-10 w-12 cursor-pointer rounded-lg border border-line-strong bg-surface p-1" });
            var nm = FE.h("input", { "aria-label": "Colour name", placeholder: "Name (e.g. Primary)", value: r.name || "", class: inputCls + " w-44" }), hx = FE.h("input", { "aria-label": "Hex", value: r.hex || "", class: inputCls + " w-28 font-mono" });
            pick.addEventListener("input", function () { hx.value = pick.value; r.hex = pick.value; }); nm.addEventListener("input", function () { r.name = nm.value; }); hx.addEventListener("input", function () { r.hex = hx.value; if (/^#[0-9a-f]{6}$/i.test(hx.value)) pick.value = hx.value; });
            [pick, nm, hx].forEach(function (x) { x.disabled = !canEdit; row.appendChild(x); });
          } else {
            var fn = FE.h("input", { "aria-label": "Font name", placeholder: "Font (e.g. Montserrat Bold)", value: r.name || "", class: inputCls + " w-60" }), us = FE.h("input", { "aria-label": "Usage", placeholder: "Used for (titles, captions…)", value: r.usage || "", class: inputCls + " w-60" });
            fn.addEventListener("input", function () { r.name = fn.value; }); us.addEventListener("input", function () { r.usage = us.value; });
            [fn, us].forEach(function (x) { x.disabled = !canEdit; row.appendChild(x); });
          }
          if (canEdit) { var rm = FE.h("button", { type: "button", "aria-label": "Remove", class: "flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2", html: FE.icon("trash", 15), onclick: function () { rows.splice(i, 1); draw(); } }); row.appendChild(rm); }
          box.appendChild(row);
        });
        add.hidden = !canEdit || rows.length >= max;
      }
      add.addEventListener("click", function () { rows.push(kind === "colors" ? { name: "", hex: "#" } : { name: "", usage: "" }); draw(); });
      holder.appendChild(box); holder.appendChild(add); draw();
      holder.__rows = function () { return rows; };
    }
    $$("[data-list]", form).forEach(function (h) { listEditor(h, h.getAttribute("data-list")); });
    FE.handlers.brandKitPrep = function (body) {
      var colors = $("[data-list=colors]", form).__rows().filter(function (c) { return c.hex && c.hex !== "#"; }).map(function (c) { return { name: c.name || "", hex: c.hex }; });
      var fonts = $("[data-list=fonts]", form).__rows().filter(function (f) { return (f.name || "").trim(); }).map(function (f) { return { name: f.name, usage: f.usage || undefined }; });
      var roles = {}; $$("[data-asset-role]", form).forEach(function (s) { roles[s.getAttribute("data-asset-role")] = s.value; });
      var ids = function (r) { return Object.keys(roles).filter(function (k) { return roles[k] === r; }); }, social = {};
      Object.keys(body.social || {}).forEach(function (k) { if (body.social[k]) social[k] = body.social[k]; });
      return { colors: colors, fonts: fonts, typographyRules: body.typographyRules || null, musicPreference: body.musicPreference || null, websiteUrl: body.websiteUrl || null, socialHandles: social,
        logoAssetId: ids("logo")[0] || null, guidelinesAssetId: ids("guidelines")[0] || null, introAssetId: ids("intro")[0] || null, outroAssetId: ids("outro")[0] || null, watermarkAssetId: ids("watermark")[0] || null, altLogoAssetIds: ids("alt"), lowerThirdAssetIds: ids("lower") };
    };
  };
})();
