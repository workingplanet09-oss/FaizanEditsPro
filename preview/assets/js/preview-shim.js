/* Static preview shim: this copy of the site has no PHP server behind it. */
(function () {
  var s = document.currentScript, root = (s && s.getAttribute("data-pv-root")) || "./";
  window.__STATIC_PREVIEW__ = true;
  var MSG = "This is a static preview, so this action is switched off. Install the PHP app (see README) to use it.";
  function fake(url, method) {
    var u = String(url), path = u.replace(/^https?:\/\/[^/]+/, "");
    if (path.indexOf("/api/") !== 0) return null;
    if ((method || "GET").toUpperCase() === "GET" && /\/api\/(notifications|auth\/session)/.test(path)) {
      return { ok: true, data: /session/.test(path) ? { user: null, providers: { google: false, demo: false } } : { items: [], unread: 0, nextCursor: null } };
    }
    return { ok: false, error: { code: "PREVIEW", message: MSG } };
  }
  var f = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : input && input.url, method = (init && init.method) || (input && input.method) || "GET";
    var r = fake(url, method);
    if (!r) return f.apply(this, arguments);
    return Promise.resolve(new Response(JSON.stringify(r), { status: r.ok ? 200 : 503, headers: { "content-type": "application/json" } }));
  };
  var open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u) { this.__pv = fake(u, m); if (this.__pv) { arguments[1] = "data:application/json," + encodeURIComponent(JSON.stringify(this.__pv)); } return open.apply(this, arguments); };
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[data-pv-missing]");
    if (!a) return;
    e.preventDefault(); toast("That page is not part of this static preview.");
  });
  function toast(t) {
    var d = document.createElement("div"); d.setAttribute("role", "status");
    d.style.cssText = "position:fixed;left:50%;bottom:84px;transform:translateX(-50%);z-index:9999;background:#10213D;color:#fff;padding:12px 18px;border-radius:12px;font:600 15px Inter,Arial,sans-serif;box-shadow:0 8px 24px rgba(16,33,61,.2);max-width:90vw";
    d.textContent = t; document.body.appendChild(d); setTimeout(function () { d.remove(); }, 3500);
  }
  window.addEventListener("unhandledrejection", function () {});
  document.addEventListener("DOMContentLoaded", function () {
    var b = document.createElement("button"); b.type = "button"; b.textContent = "Preview menu"; b.setAttribute("aria-expanded", "false");
    b.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:9998;height:44px;padding:0 18px;border-radius:12px;border:0;background:#2457E6;color:#fff;font:600 16px Inter,Arial,sans-serif;cursor:pointer;box-shadow:0 8px 24px rgba(16,33,61,.2)";
    var p = document.createElement("div"); p.hidden = true; p.setAttribute("role", "dialog"); p.setAttribute("aria-label", "Preview pages");
    p.style.cssText = "position:fixed;right:16px;bottom:68px;z-index:9998;width:min(360px,calc(100vw - 32px));max-height:70vh;overflow:auto;background:#fff;color:#10213D;border:1px solid #D9E2EF;border-radius:16px;padding:16px;box-shadow:0 8px 24px rgba(16,33,61,.2);font:16px/1.5 Inter,Arial,sans-serif";
    b.onclick = function () { p.hidden = !p.hidden; b.setAttribute("aria-expanded", String(!p.hidden)); };
    fetch(root + "preview-pages.json").then(function (r) { return r.json(); }).then(function (d) {
      var h = '<p style="margin:0 0 12px;color:#526078;font-size:14px">Static copy of the site. Buttons that save or send are switched off.</p>';
      Object.keys(d).forEach(function (k) {
        h += '<div style="font:700 15px Manrope,Arial,sans-serif;margin:12px 0 4px">' + k + "</div>";
        d[k].forEach(function (i) { h += '<a href="' + root + i.file + '" style="display:block;padding:6px 0;color:#2457E6;text-decoration:underline;min-height:32px">' + i.title + "</a>"; });
      });
      p.innerHTML = h;
    }).catch(function () {});
    document.body.appendChild(p); document.body.appendChild(b);
  });
})();
