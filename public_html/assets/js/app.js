/*
 * FaizanEdits Pro — browser code shared by every page (plain JavaScript, no build step).
 * Conventions used by the server-rendered markup:
 *   data-fe-form="/api/…"   submit a form as JSON        data-fe-action="/api/…"  one-click API call (optional confirm)
 *   data-modal-open="#id"   open a <dialog>              data-copy="text"         copy to clipboard
 *   data-fe-component="x"   mount FE.components.x        data-ago="ISO"           live relative time
 */
(function () {
  "use strict";
  var FE = (window.FE = window.FE || {});
  FE.components = {};
  FE.handlers = {};

  // ───────────── tiny helpers ─────────────
  var $ = (FE.$ = function (sel, root) { return (root || document).querySelector(sel); });
  var $$ = (FE.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); });
  FE.esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  FE.on = function (root, ev, sel, fn) {
    root.addEventListener(ev, function (e) {
      var t = e.target.closest ? e.target.closest(sel) : null;
      if (t && root.contains(t)) fn.call(t, e, t);
    });
  };
  /** hyperscript: h("div.a.b", {class:"x", onclick:fn, dataset:{}}, child, "text") — text is always escaped. */
  FE.h = function (tag, props) {
    var parts = tag.split(".");
    var el = document.createElement(parts[0] || "div");
    if (parts.length > 1) el.className = parts.slice(1).join(" ");
    for (var k in props || {}) {
      var v = props[k];
      if (v == null || v === false) continue;
      if (k === "class") el.className = (el.className ? el.className + " " : "") + v;
      else if (k === "html") el.innerHTML = v;
      else if (k === "dataset") for (var d in v) el.dataset[d] = v[d];
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k.slice(0, 2) === "on" && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    }
    for (var i = 2; i < arguments.length; i++) FE.append(el, arguments[i]);
    return el;
  };
  FE.append = function (el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(function (x) { FE.append(el, x); });
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  };
  FE.icon = function (name, size, cls, stroke) {
    var inner = (window.FE_ICONS || {})[name] || (window.FE_ICONS || {}).sparkles || "";
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + (size || 18) + '" height="' + (size || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (stroke || 1.75) + '" stroke-linecap="round" stroke-linejoin="round" class="' + FE.esc(cls || "") + '" aria-hidden="true">' + inner + "</svg>";
  };
  FE.cx = function () { return Array.prototype.slice.call(arguments).filter(Boolean).join(" "); };
  FE.debounce = function (fn, ms) { var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); }; };
  FE.cookie = function (name) { var m = document.cookie.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)")); return m ? decodeURIComponent(m[1]) : ""; };
  FE.json = function (s, fallback) { try { return JSON.parse(s); } catch (e) { return fallback; } };
  FE.props = function (el) { return FE.json(el.getAttribute("data-props") || "{}", {}); };
  /** Only same-site relative paths are followed after sign-in (no open redirects). */
  FE.safeNext = function (next, fallback) { return typeof next === "string" && next.length < 500 && /^\/(?![\/\\])[^\s\\\u0000-\u001f\u007f]*$/.test(next) ? next : fallback; };
  FE.money = function (minor, cur) {
    cur = (cur || "USD").toUpperCase();
    var zero = ["JPY", "KRW", "VND", "CLP", "ISK", "UGX", "XAF", "XOF", "PYG", "RWF", "VUV", "KMF", "GNF", "DJF", "XPF"].indexOf(cur) >= 0;
    var digits = zero ? 0 : 2;
    try { return new Intl.NumberFormat("en-US", { style: "currency", currency: cur, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(minor / Math.pow(10, digits)); }
    catch (e) { return (minor / Math.pow(10, digits)).toFixed(digits) + " " + cur; }
  };
  FE.bytes = function (n) { n = Number(n) || 0; if (n < 1024) return n + " B"; var u = ["KB", "MB", "GB", "TB"], i = -1; do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1); return n.toFixed(n >= 100 ? 0 : 1) + " " + u[i]; };
  FE.timecode = function (ms, withMs) {
    var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60, p = function (x) { return String(x).padStart(2, "0"); };
    return (h ? h + ":" + p(m) : p(m)) + ":" + p(sec) + (withMs ? "." + String(Math.floor(ms % 1000)).padStart(3, "0") : "");
  };
  FE.timeAgo = function (v) {
    var t = new Date(v).getTime();
    if (!isFinite(t)) return "—";
    var d = Math.round((Date.now() - t) / 1000);
    if (d < 45) return "just now";
    if (d < 3600) return Math.round(d / 60) + "m ago";
    if (d < 86400) return Math.round(d / 3600) + "h ago";
    if (d < 86400 * 7) return Math.round(d / 86400) + "d ago";
    return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  // ───────────── API ─────────────
  function ApiError(status, code, message, fields) { this.status = status; this.code = code; this.message = message; this.fields = fields || null; }
  ApiError.prototype = Object.create(Error.prototype);
  FE.ApiError = ApiError;

  FE.api = function (path, opts) {
    opts = opts || {};
    var method = opts.method || (opts.body !== undefined ? "POST" : "GET");
    var headers = { "X-CSRF-Token": FE.cookie("fe_csrf") };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    return fetch(path, { method: method, headers: headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined, signal: opts.signal, credentials: "same-origin" })
      .catch(function (e) {
        if (e && e.name === "AbortError") throw e;
        throw new ApiError(0, "OFFLINE", "You appear to be offline. Check your connection and try again.");
      })
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (json) {
          if (!res.ok || !json || !json.ok) {
            var err = (json && json.error) || {};
            if (res.status === 401 && path.indexOf("/api/auth/") !== 0) window.location.href = "/login?expired=1&next=" + encodeURIComponent(window.location.pathname);
            throw new ApiError(res.status, err.code || "ERROR", err.message || "Something went wrong.", err.fields || null);
          }
          return json.data;
        });
      });
  };

  /** Uploads one file in chunks to a signed upload target (resumable, with progress). */
  FE.uploadChunked = function (target, file, onProgress, signal) {
    var chunk = target.chunkBytes || 4 * 1024 * 1024, total = file.size, offset = 0;
    function send() {
      var end = Math.min(total, offset + chunk), blob = file.slice(offset, end);
      return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open(target.method || "PUT", target.url);
        xhr.setRequestHeader("Content-Type", "application/octet-stream");
        xhr.setRequestHeader("Content-Range", "bytes " + offset + "-" + (end - 1) + "/" + total);
        xhr.upload.onprogress = function (e) { if (e.lengthComputable && onProgress) onProgress(Math.round(((offset + e.loaded) / total) * 100)); };
        xhr.onload = function () {
          if (xhr.status >= 200 && xhr.status < 300) return resolve();
          var body = FE.json(xhr.responseText, null);
          if (xhr.status === 409 && body && body.error && typeof body.error.received === "number") return resolve({ resume: body.error.received });
          reject(new ApiError(xhr.status, "UPLOAD_FAILED", (body && body.error && body.error.message) || "Upload failed. Please try again."));
        };
        xhr.onerror = function () { reject(new ApiError(0, "UPLOAD_FAILED", "Upload failed — check your connection and retry.")); };
        xhr.onabort = function () { reject(new DOMException("Aborted", "AbortError")); };
        if (signal) signal.addEventListener("abort", function () { xhr.abort(); });
        xhr.send(blob);
      });
    }
    function loop(retries) {
      return send().then(function (r) {
        if (r && typeof r.resume === "number") { offset = r.resume; if (offset >= total) return; return loop(retries); }
        offset = Math.min(total, offset + chunk);
        if (onProgress) onProgress(Math.round((offset / total) * 100));
        if (offset < total) return loop(3);
      }, function (e) {
        if (e && e.name === "AbortError") throw e;
        if (retries > 0 && (!e.status || e.status >= 500)) return new Promise(function (r) { setTimeout(r, 1200); }).then(function () { return loop(retries - 1); });
        throw e;
      });
    }
    if (total === 0) return Promise.reject(new ApiError(400, "UPLOAD_FAILED", "The file appears to be empty."));
    return loop(3);
  };

  // ───────────── toasts ─────────────
  var toastRoot;
  function toast(tone, title, description) {
    if (!toastRoot) {
      toastRoot = FE.h("div", { class: "pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:pr-6 lg:bottom-6", "aria-live": "polite", "aria-atomic": "false" });
      document.body.appendChild(toastRoot);
    }
    var toneCls = tone === "success" ? "bg-success-soft text-success" : tone === "error" ? "bg-danger-soft text-danger" : "bg-info-soft text-info";
    var el = FE.h("div.pointer-events-auto.flex.w-full.max-w-sm.animate-pop.items-start.gap-3.rounded-2xl.border.border-line.bg-surface.p-4.shadow-lift", { role: tone === "error" ? "alert" : "status" },
      FE.h("span", { class: "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full " + toneCls, html: FE.icon(tone === "success" ? "check" : tone === "error" ? "alert" : "info", 14, "", 2.5) }),
      FE.h("div.min-w-0.flex-1", {}, FE.h("div.text-sm.font-semibold", {}, title), description ? FE.h("div.mt-0.5.text-sm.text-muted", {}, description) : null),
      FE.h("button.-mr-1.-mt-1.rounded-lg.p-1.text-subtle.hover:bg-surface-2.hover:text-fg", { type: "button", "aria-label": "Dismiss", html: FE.icon("x", 14), onclick: function () { el.remove(); } }));
    while (toastRoot.children.length > 3) toastRoot.firstChild.remove();
    toastRoot.appendChild(el);
    setTimeout(function () { el.remove(); }, tone === "error" ? 7000 : 4200);
  }
  FE.toast = { success: function (t, d) { toast("success", t, d); }, error: function (t, d) { toast("error", t, d); }, info: function (t, d) { toast("info", t, d); } };
  // a message that must survive a page reload (shown right after the refresh)
  FE.flash = function (tone, title) { try { sessionStorage.setItem("fe-flash", JSON.stringify([tone, title])); } catch (e) {} };

  // ───────────── modals (native <dialog>) ─────────────
  FE.modal = {
    open: function (target) { var d = typeof target === "string" ? $(target) : target; if (d && !d.open) d.showModal(); return d; },
    close: function (target) { var d = typeof target === "string" ? $(target) : target; if (d && d.open) d.close(); },
  };
  document.addEventListener("click", function (e) {
    var o = e.target.closest("[data-modal-open]");
    if (o) { e.preventDefault(); FE.modal.open(o.getAttribute("data-modal-open")); return; }
    var c = e.target.closest("[data-modal-close]");
    if (c) { var dlg = c.closest("dialog"); if (dlg) dlg.close(); return; }
    var dlg2 = e.target.tagName === "DIALOG" ? e.target : null;
    if (dlg2 && !dlg2.hasAttribute("data-static") && dlg2.hasAttribute("open")) dlg2.close();
  });

  /** Promise-based confirm dialog: FE.confirm({title, description, confirmLabel, tone}) → true/false */
  FE.confirm = function (o) {
    return new Promise(function (resolve) {
      var done = false;
      var finish = function (v) { if (done) return; done = true; dlg.close(); dlg.remove(); resolve(v); };
      var confirmBtn = FE.h("button", { type: "button", class: (o.tone === "danger" ? "bg-danger-soft text-danger hover:bg-danger hover:text-white" : "bg-accent text-accent-fg hover:bg-accent-hover") + " inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold", onclick: function () { finish(true); } }, o.confirmLabel || "Confirm");
      var dlg = FE.h("dialog", { "aria-labelledby": "fe-confirm-t", class: "m-auto w-[calc(100%-1.5rem)] max-w-md overflow-hidden rounded-3xl border border-line bg-surface p-0 text-fg shadow-lift open:flex open:flex-col open:animate-pop" },
        FE.h("div.border-b.border-line.px-6.py-4", {}, FE.h("h2.text-lg.font-bold.leading-tight", { id: "fe-confirm-t" }, o.title || "Are you sure?"), o.description ? FE.h("p.mt-1.text-sm.text-muted", {}, o.description) : null),
        o.bodyHtml ? FE.h("div.px-6.py-5", { html: o.bodyHtml }) : null,
        FE.h("div.flex.flex-wrap.items-center.justify-end.gap-2.border-t.border-line.bg-surface-2/40.px-6.py-4", {},
          FE.h("button", { type: "button", class: "inline-flex h-11 items-center justify-center rounded-xl px-5 text-base font-semibold text-muted hover:bg-surface-2 hover:text-fg", onclick: function () { finish(false); } }, "Cancel"), confirmBtn));
      dlg.addEventListener("cancel", function (e) { e.preventDefault(); finish(false); });
      dlg.addEventListener("click", function (e) { if (e.target === dlg) finish(false); });
      document.body.appendChild(dlg);
      dlg.showModal();
      confirmBtn.focus();
    });
  };

  // ───────────── busy buttons / refresh ─────────────
  FE.busy = function (btn, on) {
    if (!btn) return;
    if (on) {
      btn.setAttribute("aria-busy", "true"); btn.disabled = true;
      if (!btn.__html) { btn.__html = btn.innerHTML; btn.innerHTML = FE.icon("loader", 16, "animate-spin") + '<span class="sr-only">Working…</span>' + (btn.getAttribute("data-busy-label") ? FE.esc(btn.getAttribute("data-busy-label")) : ""); }
    } else {
      btn.removeAttribute("aria-busy"); btn.disabled = false;
      if (btn.__html != null) { btn.innerHTML = btn.__html; btn.__html = null; }
    }
  };
  FE.refresh = function () { window.location.reload(); };
  FE.go = function (url) { window.location.href = url; };

  // ───────────── forms: data-fe-form ─────────────
  function coerce(el, v) {
    var t = el.getAttribute("data-type");
    if (t === "number") return v === "" ? null : Number(v);
    if (t === "int") return v === "" ? null : Math.round(Number(v));
    if (t === "money") return v === "" ? null : Math.round(Number(String(v).replace(/[^0-9.\-]/g, "")) * 100);
    if (t === "csv") return v.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    if (t === "lines") return v.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
    if (t === "json") return FE.json(v, null);
    if (t === "date") return v ? new Date(v).toISOString() : null;
    return v;
  }
  function setPath(obj, path, val) {
    var parts = path.split("."), cur = obj;
    for (var i = 0; i < parts.length - 1; i++) { if (typeof cur[parts[i]] !== "object" || cur[parts[i]] === null) cur[parts[i]] = {}; cur = cur[parts[i]]; }
    cur[parts[parts.length - 1]] = val;
  }
  FE.formData = function (form) {
    var out = {}, seen = {};
    $$("input[name],select[name],textarea[name]", form).forEach(function (el) {
      if (el.disabled || el.closest("[data-skip]")) return;
      var name = el.name, val;
      if (el.type === "checkbox") {
        var group = $$('input[type="checkbox"][name="' + name + '"]', form);
        if (group.length > 1 || el.hasAttribute("data-multi")) { if (seen[name]) return; seen[name] = 1; val = group.filter(function (c) { return c.checked; }).map(function (c) { return c.value; }); }
        else val = el.checked;
      } else if (el.type === "radio") { if (!el.checked) return; val = el.value; }
      else if (el.type === "file") return;
      else if (el.tagName === "SELECT" && el.multiple) val = Array.prototype.slice.call(el.selectedOptions).map(function (o) { return o.value; });
      else { val = coerce(el, el.value); if (typeof val === "string" && el.hasAttribute("data-trim")) val = val.trim(); }
      if (val === "" && !el.hasAttribute("data-keep-empty")) { if (el.hasAttribute("data-null-empty")) val = null; else return; }
      setPath(out, name, val);
    });
    $$("[data-switch]", form).forEach(function (b) { setPath(out, b.getAttribute("data-switch"), b.getAttribute("aria-checked") === "true"); });
    return out;
  };
  // keeps the visible error message tied to its input for screen readers (aria-describedby), and removes it again when the error clears
  function describe(input, id, on) {
    if (!id) return;
    var cur = (input.getAttribute("aria-describedby") || "").split(/\s+/).filter(function (x) { return x && x !== id; });
    if (on) cur.push(id);
    if (cur.length) input.setAttribute("aria-describedby", cur.join(" ")); else input.removeAttribute("aria-describedby");
  }
  FE.showFieldErrors = function (form, fields, message) {
    $$("[data-error-for]", form).forEach(function (p) {
      var inp = form.querySelector('[name="' + p.getAttribute("data-error-for") + '"]'); if (inp) describe(inp, p.id, false);
      p.classList.add("hidden"); p.classList.remove("flex"); p.textContent = "";
    });
    $$("[aria-invalid]", form).forEach(function (i) { i.removeAttribute("aria-invalid"); });
    var top = form.querySelector("[data-form-error]");
    if (top) { top.classList.add("hidden"); top.textContent = ""; }
    var first = null;
    Object.keys(fields || {}).forEach(function (k) {
      var holder = form.querySelector('[data-error-for="' + k + '"]');
      var input = form.querySelector('[name="' + k + '"]');
      if (holder) { holder.textContent = fields[k]; holder.classList.remove("hidden"); holder.classList.add("flex"); }
      if (input) { input.setAttribute("aria-invalid", "true"); if (holder) describe(input, holder.id, true); if (!first) first = input; }
      if (!holder && !input && top) message = message || fields[k];
    });
    if (message && top) { top.textContent = message; top.classList.remove("hidden"); }
    if (first) first.focus({ preventScroll: false });
  };
  FE.submitForm = function (form, submitter) {
    var url = form.getAttribute("data-fe-form"), method = form.getAttribute("data-method") || "POST";
    var body = FE.formData(form);
    var pre = form.getAttribute("data-prepare");
    if (pre && FE.handlers[pre]) { var prepared = FE.handlers[pre](body, form); if (prepared === false) return Promise.resolve(); body = prepared || body; }
    var btn = submitter || form.querySelector('[type="submit"]');
    FE.busy(btn, true);
    FE.showFieldErrors(form, {}, "");
    return FE.api(url, { method: method, body: body }).then(function (data) {
      FE.busy(btn, false);
      var ok = form.getAttribute("data-on-success");
      if (ok && FE.handlers[ok]) { var r = FE.handlers[ok](data, form, body); if (r === false) return; }
      var msg = form.getAttribute("data-success");
      var red = form.getAttribute("data-redirect");
      if (red) {
        if (msg) FE.flash("success", msg);
        var target = red === "@redirect" ? (data && data.redirect) : red.replace("@id", data && data.id);
        var nextParam = form.getAttribute("data-next-param");
        if (nextParam) target = FE.safeNext(new URLSearchParams(location.search).get(nextParam), target);
        FE.go(target || "/");
        return;
      }
      if (msg) { if (form.getAttribute("data-refresh") !== "0") FE.flash("success", msg); else FE.toast.success(msg); }
      if (form.hasAttribute("data-reset")) form.reset();
      if (form.getAttribute("data-refresh") !== "0") FE.refresh();
    }, function (e) {
      FE.busy(btn, false);
      if (e && e.name === "AbortError") return;
      FE.showFieldErrors(form, e.fields || {}, e.message);
      var eh = form.getAttribute("data-on-error");
      if (eh && FE.handlers[eh]) FE.handlers[eh](e, form);
      else if (!form.querySelector("[data-form-error]")) FE.toast.error("That didn't work", e.message);
    });
  };
  document.addEventListener("submit", function (e) {
    var f = e.target.closest ? e.target.closest("form[data-fe-form]") : null;
    if (!f) return;
    e.preventDefault();
    if (f.__busy) return;
    f.__busy = true;
    var p = FE.submitForm(f, e.submitter);
    (p && p.finally ? p : Promise.resolve()).then(function () { f.__busy = false; }, function () { f.__busy = false; });
  });

  // switches
  document.addEventListener("click", function (e) {
    var sw = e.target.closest("button[data-switch]");
    if (!sw) return;
    var on = sw.getAttribute("aria-checked") !== "true";
    sw.setAttribute("aria-checked", on ? "true" : "false");
    sw.classList.toggle("bg-accent", on); sw.classList.toggle("bg-line-strong", !on);
    var knob = sw.firstElementChild; if (knob) { knob.classList.toggle("translate-x-[22px]", on); knob.classList.toggle("translate-x-0.5", !on); }
    var sr = sw.querySelector(".sr-only"); if (sr) sr.textContent = on ? "On" : "Off";
    sw.dispatchEvent(new CustomEvent("fe:switch", { bubbles: true, detail: on }));
  });

  // ───────────── one-click actions: data-fe-action ─────────────
  FE.runAction = function (btn) {
    var url = btn.getAttribute("data-fe-action"), method = btn.getAttribute("data-method") || "POST";
    var body = btn.hasAttribute("data-body") ? FE.json(btn.getAttribute("data-body"), {}) : (method === "DELETE" ? undefined : {});
    var go = function () {
      FE.busy(btn, true);
      return FE.api(url, { method: method, body: body }).then(function (data) {
        FE.busy(btn, false);
        var ok = btn.getAttribute("data-on-success");
        if (ok && FE.handlers[ok]) { if (FE.handlers[ok](data, btn) === false) return; }
        var msg = btn.getAttribute("data-success"), red = btn.getAttribute("data-redirect");
        if (red) { if (msg) FE.flash("success", msg); FE.go(red === "@redirect" ? (data && data.redirect) : red.replace("@id", data && data.id)); return; }
        if (btn.getAttribute("data-refresh") === "0") { if (msg) FE.toast.success(msg); return; }
        if (msg) FE.flash("success", msg);
        FE.refresh();
      }, function (e) {
        FE.busy(btn, false);
        FE.toast.error("That didn't work", e.message);
      });
    };
    var title = btn.getAttribute("data-confirm-title");
    if (!title) return go();
    return FE.confirm({ title: title, description: btn.getAttribute("data-confirm-description"), confirmLabel: btn.getAttribute("data-confirm-label"), tone: btn.getAttribute("data-confirm-tone") }).then(function (yes) { if (yes) return go(); });
  };
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-fe-action]");
    if (!b || b.disabled) return;
    e.preventDefault();
    FE.runAction(b);
  });
  document.addEventListener("click", function (e) {
    var c = e.target.closest("[data-copy]");
    if (!c) return;
    e.preventDefault();
    var text = c.getAttribute("data-copy");
    var done = function () { FE.toast.success(c.getAttribute("data-copied") || "Copied to clipboard"); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { FE.toast.error("Couldn't copy"); });
    else { var ta = FE.h("textarea", { style: { position: "fixed", opacity: "0" } }); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (er) { FE.toast.error("Couldn't copy"); } ta.remove(); }
  });
  document.addEventListener("click", function (e) {
    var p = e.target.closest("[data-print]");
    if (p) { e.preventDefault(); window.print(); }
  });

  // ───────────── times ─────────────
  function fmtLocal(el) {
    var d = new Date(el.getAttribute("datetime")); if (isNaN(d)) return;
    var f = el.getAttribute("data-local");
    var opt = f === "time" ? { hour: "numeric", minute: "2-digit" } : f === "date" ? { year: "numeric", month: "long", day: "numeric" } : f === "short" ? { month: "short", day: "numeric" } : { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
    el.textContent = d.toLocaleString(undefined, opt);
    el.title = d.toISOString();
  }
  function tickAgo() {
    $$("[data-ago]").forEach(function (el) { el.textContent = (el.getAttribute("data-prefix") || "") + FE.timeAgo(el.getAttribute("data-ago")) + (el.getAttribute("data-suffix") || ""); });
  }
  FE.refreshTimes = function () { $$("time[data-local]").forEach(fmtLocal); tickAgo(); };
  setInterval(tickAgo, 60000);

  // ───────────── theme ─────────────
  function applyTheme(mode) {
    var dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    var root = document.documentElement;
    if (root.classList.contains("dark") === dark) return;
    root.classList.add("no-transitions"); // every colour changes at once instead of fading at different speeds
    root.classList.toggle("dark", dark);
    void root.offsetWidth;
    requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.remove("no-transitions"); }); });
  }
  function themeButton(btn) {
    var mode = "system";
    try { mode = localStorage.getItem("fe-theme") || "system"; } catch (e) {}
    var paint = function () {
      var next = mode === "system" ? "light" : mode === "light" ? "dark" : "system";
      var label = mode === "system" ? "Theme: match device" : mode === "light" ? "Theme: light" : "Theme: dark";
      btn.setAttribute("aria-label", label + ". Switch to " + next + "."); btn.title = label;
      btn.innerHTML = FE.icon(mode === "dark" ? "moon" : mode === "light" ? "sun" : "monitor", 17);
    };
    paint();
    btn.addEventListener("click", function () {
      mode = mode === "system" ? "light" : mode === "light" ? "dark" : "system";
      try { localStorage.setItem("fe-theme", mode); } catch (e) {}
      applyTheme(mode); paint();
    });
  }
  if (window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () { var m = "system"; try { m = localStorage.getItem("fe-theme") || "system"; } catch (e) {} if (m === "system") applyTheme("system"); });

  // ───────────── menus / dropdowns ─────────────
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-menu-toggle]");
    $$("[data-menu]").forEach(function (m) { if (!t || m.id !== t.getAttribute("data-menu-toggle")) closeMenu(m); });
    if (!t) return;
    var m = document.getElementById(t.getAttribute("data-menu-toggle"));
    if (!m) return;
    var open = m.classList.contains("hidden");
    m.classList.toggle("hidden", !open);
    t.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) m.dispatchEvent(new CustomEvent("fe:menu-open"));
  });
  function closeMenu(m) { if (!m.classList.contains("hidden")) { m.classList.add("hidden"); var t = document.querySelector('[data-menu-toggle="' + m.id + '"]'); if (t) t.setAttribute("aria-expanded", "false"); } }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") $$("[data-menu]").forEach(closeMenu); });

  // ───────────── mobile drawers ─────────────
  function setDrawer(id, open) {
    var d = document.getElementById(id); if (!d) return;
    d.classList.toggle("hidden", !open);
    document.body.style.overflow = open ? "hidden" : "";
    $$('[data-drawer-toggle="' + id + '"]').forEach(function (b) {
      b.setAttribute("aria-expanded", open ? "true" : "false");
      if (b.hasAttribute("data-menu-icon")) { b.setAttribute("aria-label", open ? "Close menu" : "Open menu"); b.innerHTML = FE.icon(open ? "x" : "menu", 22); } // the button shows what it will do
    });
  }
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-drawer-toggle]");
    if (t) { var id = t.getAttribute("data-drawer-toggle"), d = document.getElementById(id); setDrawer(id, d && d.classList.contains("hidden")); return; }
    var c = e.target.closest("[data-drawer-close]");
    if (c) setDrawer(c.getAttribute("data-drawer-close"), false);
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") $$("[data-drawer]").forEach(function (d) { if (!d.classList.contains("hidden")) setDrawer(d.id, false); }); });

  // ───────────── site header scroll state ─────────────
  function headerScroll() {
    var h = $("[data-site-header]"); if (!h) return;
    var on = function () { var s = window.scrollY > 8 || !$("#mobile-menu", h) || !$("#mobile-menu", h).classList.contains("hidden"); h.classList.toggle("border-line", s); h.classList.toggle("bg-bg/85", s); h.classList.toggle("backdrop-blur-xl", s); h.classList.toggle("border-transparent", !s); h.classList.toggle("bg-bg/60", !s); h.classList.toggle("backdrop-blur-md", !s); };
    on(); window.addEventListener("scroll", on, { passive: true });
  }

  // ───────────── reveal on scroll ─────────────
  function reveal() {
    document.documentElement.classList.add("reveal-ready"); // tells the safety timer in theme.js that this script is running
    var els = $$("[data-reveal]");
    if (!els.length) return;
    if (typeof IntersectionObserver === "undefined") { els.forEach(function (el) { el.classList.add("animate-fade-up"); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("animate-fade-up"); io.unobserve(en.target); }
        else if (en.boundingClientRect.bottom <= 0) { en.target.classList.add("revealed"); io.unobserve(en.target); } // already scrolled past: show without animating
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    els.forEach(function (el) { io.observe(el); });
    window.addEventListener("beforeprint", function () { document.documentElement.classList.add("reveal-all"); });
  }

  // ───────────── offline banner ─────────────
  function offline() {
    var bar = null;
    var upd = function () {
      if (navigator.onLine) { if (bar) { bar.remove(); bar = null; } return; }
      if (bar) return;
      bar = FE.h("div.fixed.inset-x-0.top-0.z-[150].flex.items-center.justify-center.gap-2.bg-fg.px-4.py-2.text-center.text-sm.font-medium.text-bg", { role: "status" }, FE.h("span", { html: FE.icon("warning", 16) }), "You're offline. Changes won't save until your connection is back — drafts stay in your browser in the meantime.");
      document.body.appendChild(bar);
    };
    window.addEventListener("online", upd); window.addEventListener("offline", upd); upd();
  }

  // ───────────── first-touch attribution ─────────────
  function attribution() {
    try {
      var url = new URL(window.location.href), utm = {
        source: url.searchParams.get("utm_source") || undefined, medium: url.searchParams.get("utm_medium") || undefined, campaign: url.searchParams.get("utm_campaign") || undefined,
        term: url.searchParams.get("utm_term") || undefined, content: url.searchParams.get("utm_content") || undefined,
      };
      var ref = url.searchParams.get("ref") || "";
      var hasNew = Object.keys(utm).some(function (k) { return utm[k]; }) || !!ref;
      var existing = localStorage.getItem("fe-attribution");
      if (existing && !hasNew) return;
      var referrer = document.referrer && document.referrer.indexOf(window.location.origin) !== 0 ? document.referrer : "";
      localStorage.setItem("fe-attribution", JSON.stringify({ utm: utm, referrer: referrer, ref: ref }));
    } catch (e) { /* storage blocked — attribution is best-effort */ }
  }
  FE.attribution = function () { try { var r = localStorage.getItem("fe-attribution"); if (r) return JSON.parse(r); } catch (e) {} return { utm: {}, referrer: "", ref: "" }; };

  // ───────────── notification bell ─────────────
  FE.components.bell = function (root) {
    var cats = [["", "All"], ["PROJECT", "Projects"], ["MESSAGE", "Messages"], ["PAYMENT", "Payments"], ["REVIEW", "Reviews"], ["SYSTEM", "System"]];
    var catIcon = { PROJECT: "film", MESSAGE: "message", PAYMENT: "card", REVIEW: "eye", SYSTEM: "settings" };
    var btn = $("[data-bell-btn]", root), panel = $("[data-bell-panel]", root), badge = $("[data-bell-badge]", root);
    var state = { cat: "", unread: Number(root.getAttribute("data-unread")) || 0 };
    function paintBadge() {
      badge.textContent = state.unread > 99 ? "99+" : String(state.unread);
      badge.classList.toggle("hidden", !state.unread);
      btn.setAttribute("aria-label", state.unread ? "Notifications, " + state.unread + " unread" : "Notifications");
    }
    function row(n) {
      var read = !!n.readAt;
      var b = FE.h("button", { type: "button", class: "flex w-full items-start gap-3 border-b border-line/70 px-4 py-3 text-left transition hover:bg-surface-2/70 " + (read ? "" : "bg-accent-soft/60"), onclick: function () {
        if (!read) FE.api("/api/notifications/" + n.id + "/read", { method: "POST", body: {} }).catch(function () {});
        if (n.link) FE.go(n.link); else { panel.classList.add("hidden"); }
      } },
        FE.h("span", { class: "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted", html: FE.icon(catIcon[n.category] || "bell", 15) }),
        FE.h("span.min-w-0.flex-1", {}, FE.h("span", { class: "block text-sm leading-snug " + (read ? "font-medium" : "font-bold") }, n.title), n.message ? FE.h("span.mt-0.5.block.truncate.text-xs.text-muted", {}, n.message) : null,
          FE.h("span.mt-1.block.text-xs.text-subtle", { "data-ago": n.createdAt }, FE.timeAgo(n.createdAt))),
        read ? null : FE.h("span.mt-2.h-2.w-2.shrink-0.rounded-full.bg-accent", { "aria-label": "Unread" }));
      return FE.h("li", {}, b);
    }
    var list = $("[data-bell-list]", root), tabs = $("[data-bell-tabs]", root), markAll = $("[data-bell-markall]", root);
    function load(cat) {
      state.cat = cat == null ? state.cat : cat;
      return FE.api("/api/notifications?pageSize=12" + (state.cat ? "&category=" + state.cat : "")).then(function (r) {
        state.unread = r.unread; paintBadge(); markAll.disabled = !state.unread;
        list.innerHTML = "";
        if (!r.items.length) { list.innerHTML = '<div class="p-8 text-center">' + FE.icon("check-circle", 26, "mx-auto mb-2 text-subtle") + '<p class="text-sm font-semibold">You\'re all caught up</p><p class="mt-1 text-xs text-muted">New activity will show up here.</p></div>'; return; }
        var ul = FE.h("ul", {}); r.items.forEach(function (n) { ul.appendChild(row(n)); }); list.appendChild(ul);
      }, function () { list.innerHTML = '<p class="p-6 text-center text-sm text-muted">Couldn\'t load notifications. We\'ll keep trying.</p>'; });
    }
    tabs.innerHTML = "";
    cats.forEach(function (c) {
      var t = FE.h("button", { type: "button", "data-cat": c[0], class: "shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition " + (c[0] === "" ? "bg-fg text-bg" : "text-muted hover:bg-surface-2"), onclick: function () {
        $$("button", tabs).forEach(function (x) { var on = x === t; x.className = "shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition " + (on ? "bg-fg text-bg" : "text-muted hover:bg-surface-2"); });
        load(c[0]);
      } }, c[1]);
      tabs.appendChild(t);
    });
    markAll.addEventListener("click", function () { FE.api("/api/notifications/read", { method: "POST", body: state.cat ? { category: state.cat } : {} }).catch(function () {}).then(function () { load(); }); });
    panel.addEventListener("fe:menu-open", function () { load(); });
    document.addEventListener("mousedown", function (e) { if (!root.contains(e.target)) { panel.classList.add("hidden"); btn.setAttribute("aria-expanded", "false"); } });
    paintBadge();
    setInterval(function () { if (document.visibilityState === "visible") FE.api("/api/notifications?pageSize=1").then(function (r) { state.unread = r.unread; paintBadge(); }, function () {}); }, 30000);
  };

  // ───────────── sign out ─────────────
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-logout]");
    if (!b) return;
    e.preventDefault();
    b.disabled = true;
    FE.api("/api/auth/logout", { method: "POST", body: {} }).catch(function () {}).then(function () { window.location.href = "/login"; });
  });

  // ───────────── command palette ─────────────
  FE.components.palette = function (dlg) {
    var props = FE.props(dlg), commands = props.commands || [], canSearch = props.canSearch !== false;
    var kindIcon = { client: "building", lead: "inbox", project: "film", invoice: "receipt", quote: "clipboard", contract: "sign", file: "file", message: "message" };
    var input = $("input", dlg), list = $("[data-palette-list]", dlg), spinner = $("[data-palette-spin]", dlg);
    var hits = [], idx = 0, ctrl = null;
    function rows() {
      var t = input.value.trim().toLowerCase();
      var f = commands.filter(function (c) { return !t || c.label.toLowerCase().indexOf(t) >= 0; }).map(function (c) { return { key: c.id, label: c.label, sub: c.hint, icon: c.icon, href: c.href, group: c.group }; });
      return f.concat(hits.map(function (h) { return { key: h.kind + "-" + h.id, label: h.title, sub: h.subtitle, icon: kindIcon[h.kind] || "search", href: h.href, group: h.kind.charAt(0).toUpperCase() + h.kind.slice(1) + "s" }; }));
    }
    function paint() {
      var r = rows(); list.innerHTML = "";
      if (!r.length) { list.appendChild(FE.h("li.px-4.py-10.text-center.text-sm.text-muted", {}, input.value.trim().length < 2 ? "Type at least 2 characters to search." : "No results for “" + input.value + "”.")); return; }
      r.forEach(function (x, i) {
        var li = FE.h("li", { id: "cmd-" + x.key, role: "option", "aria-selected": i === idx ? "true" : "false" });
        if (i === 0 || r[i - 1].group !== x.group) li.appendChild(FE.h("div.px-3.pb-1.pt-3.text-xs.font-bold...text-subtle", {}, x.group));
        li.appendChild(FE.h("button", { type: "button", class: "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left " + (i === idx ? "bg-accent-soft" : "hover:bg-surface-2"), onmouseenter: function () { idx = i; paint(); }, onclick: function () { FE.go(x.href); } },
          FE.h("span", { class: "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted", html: FE.icon(x.icon, 16) }),
          FE.h("span.min-w-0.flex-1", {}, FE.h("span.block.truncate.text-sm.font-semibold", {}, x.label), x.sub ? FE.h("span.block.truncate.text-xs.text-muted", {}, x.sub) : null)));
        list.appendChild(li);
      });
    }
    var search = FE.debounce(function () {
      var q = input.value.trim();
      if (ctrl) ctrl.abort();
      if (!canSearch || q.length < 2) { hits = []; spinner.classList.add("hidden"); paint(); return; }
      spinner.classList.remove("hidden"); ctrl = new AbortController();
      FE.api("/api/search?q=" + encodeURIComponent(q), { signal: ctrl.signal }).then(function (r) { hits = r.hits; idx = 0; paint(); spinner.classList.add("hidden"); }, function () {});
    }, 180);
    input.addEventListener("input", function () { idx = 0; paint(); search(); });
    input.addEventListener("keydown", function (e) {
      var r = rows();
      if (e.key === "ArrowDown") { e.preventDefault(); idx = Math.min(r.length - 1, idx + 1); paint(); }
      if (e.key === "ArrowUp") { e.preventDefault(); idx = Math.max(0, idx - 1); paint(); }
      if (e.key === "Enter" && r[idx]) { e.preventDefault(); FE.go(r[idx].href); }
    });
    function open() { if (!dlg.open) { dlg.showModal(); input.value = ""; hits = []; idx = 0; paint(); setTimeout(function () { input.focus(); }, 30); } }
    window.addEventListener("keydown", function (e) { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); dlg.open ? dlg.close() : open(); } });
    window.addEventListener("open-command-palette", open);
    dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
  };
  document.addEventListener("click", function (e) { if (e.target.closest("[data-palette-open]")) window.dispatchEvent(new Event("open-command-palette")); });

  // ───────────── accordions (FAQ) — native <details>, plus "open one at a time" groups ─────────────
  document.addEventListener("toggle", function (e) {
    var d = e.target; if (!(d instanceof HTMLDetailsElement) || !d.open) return;
    var g = d.closest("[data-accordion]"); if (!g) return;
    $$("details[open]", g).forEach(function (o) { if (o !== d) o.open = false; });
  }, true);

  // ───────────── Urdu and other right-to-left text ─────────────
  // Text blocks written mostly in Arabic script (Urdu, Arabic, Persian) get lang="ur", dir="rtl" and the .rtl-text class:
  // right-aligned, Noto Nastaliq Urdu, generous line height, no letter-spacing. Blocks in English are left alone.
  var RTL_CHARS = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g, LATIN_CHARS = /[A-Za-z]/g;
  FE.rtl = function (root) {
    $$("p,li,h1,h2,h3,h4,h5,h6,blockquote,summary,dt,dd,td,th,label,figcaption,.rtl-candidate", root || document).forEach(function (el) {
      if (el.__rtl || el.hasAttribute("dir") || el.querySelector("p,li,div,ul,ol,table")) return;
      el.__rtl = true;
      var t = el.textContent || "", a = (t.match(RTL_CHARS) || []).length;
      if (a > 1 && a >= (t.match(LATIN_CHARS) || []).length) { el.setAttribute("dir", "rtl"); el.setAttribute("lang", "ur"); el.classList.add("rtl-text"); }
    });
  };

  // ───────────── images that fail to load ─────────────
  // A thumbnail that cannot load (corrupt upload, expired link) shows a quiet placeholder icon instead of the browser's broken-image symbol.
  FE.imgFallback = function (img) {
    if (!img || img.tagName !== "IMG" || img.__broke || img.hasAttribute("data-no-fallback")) return;
    img.__broke = true; img.style.visibility = "hidden";
    var holder = img.parentElement; if (!holder || holder.querySelector("[data-img-fallback]")) return;
    if (getComputedStyle(holder).position === "static") holder.classList.add("relative");
    holder.classList.add("bg-surface-2");
    holder.appendChild(FE.h("span", { "data-img-fallback": "", "aria-hidden": "true", class: "absolute inset-0 flex items-center justify-center text-subtle", html: FE.icon("image", 22) }));
  };
  document.addEventListener("error", function (e) { FE.imgFallback(e.target); }, true);

  // ───────────── boot ─────────────
  function boot() {
    try {
      var f = sessionStorage.getItem("fe-flash");
      if (f) { sessionStorage.removeItem("fe-flash"); var p = JSON.parse(f); FE.toast[p[0]](p[1]); }
    } catch (e) {}
    FE.refreshTimes();
    $$("[data-theme-toggle]").forEach(themeButton);
    headerScroll(); reveal(); offline(); attribution(); FE.rtl(document);
    $$("img").forEach(function (i) { if (i.complete && i.naturalWidth === 0 && i.getAttribute("src")) FE.imgFallback(i); }); // some may have failed before this script ran
    FE.mount(document);
  }
  /** Mounts every [data-fe-component] inside root that is not mounted yet (also used for markup built by JavaScript). */
  FE.mount = function (root) {
    $$("[data-fe-component]", root).concat(root.getAttribute && root.getAttribute("data-fe-component") ? [root] : []).forEach(function (el) {
      var name = el.getAttribute("data-fe-component"), c = FE.components[name] || FE.components[name.replace(/-([a-z])/g, function (m, ch) { return ch.toUpperCase(); })];
      if (c && !el.__mounted) { el.__mounted = true; try { c(el, FE.props(el)); } catch (err) { if (window.console) console.error("component " + name, err); } }
    });
    if (root !== document) { FE.refreshTimes && FE.refreshTimes(); FE.rtl && FE.rtl(root); }
  };
  FE.boot = boot;
  // deferred page scripts (registered after this file) run before DOMContentLoaded, so wait for it
  if (document.readyState === "complete") boot(); else document.addEventListener("DOMContentLoaded", boot);
})();
