/* Sign-in, registration, password reset and emailed-link pages. */
(function () {
  "use strict";
  var FE = window.FE, started = Date.now();

  FE.handlers.loginDone = function (data, form) {
    var next = new URLSearchParams(location.search).get("next");
    if (data.requires2fa) FE.go("/login/2fa" + (next ? "?next=" + encodeURIComponent(next) : ""));
    else FE.go(FE.safeNext(next, data.redirect || "/dashboard"));
    return false;
  };
  FE.handlers.magicPrep = function (body) { var n = new URLSearchParams(location.search).get("next"); if (n) body.next = n; return body; };
  FE.handlers.magicSent = function (data, form, body) {
    var root = form.closest("[data-fe-component]");
    root.querySelector("[data-login-main]").hidden = true;
    var sent = root.querySelector("[data-login-sent]"); sent.hidden = false; sent.querySelector("[data-sent-email]").textContent = body.email;
    return false;
  };
  FE.components.login = function (root) {
    var forms = FE.$$("[data-mode-form]", root), tabs = FE.$$("[data-mode]", root);
    tabs.forEach(function (t) {
      t.addEventListener("click", function () {
        tabs.forEach(function (x) { var on = x === t; x.setAttribute("aria-selected", on ? "true" : "false"); x.className = "h-9 rounded-lg text-sm font-semibold transition " + (on ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg"); });
        forms.forEach(function (f) { f.hidden = f.getAttribute("data-mode-form") !== t.getAttribute("data-mode"); });
      });
    });
    root.querySelector("[data-login-again]").addEventListener("click", function () { root.querySelector("[data-login-sent]").hidden = true; root.querySelector("[data-login-main]").hidden = false; });
  };
  FE.handlers.registerPrep = function (body, form) {
    var props = FE.props(form); if (props.ref) body.referralCode = props.ref; body.t = started; return body;
  };
  FE.handlers.forgotSent = function (data, form, body) {
    var root = form.closest("[data-fe-component]"); form.hidden = true;
    var sent = root.querySelector("[data-forgot-sent]"); sent.hidden = false; sent.querySelector("[data-sent-email]").textContent = body.email;
    return false;
  };
  FE.handlers.tokenPrep = function (body, form) {
    if (body.confirm !== undefined || (body.password && body.type === "reset")) {
      if (body.password !== body.confirm) { FE.showFieldErrors(form, { confirm: "Passwords don't match." }); return false; }
    }
    delete body.confirm; return body;
  };
})();
