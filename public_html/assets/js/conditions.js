/*
 * Conditional-logic engine for the questionnaires — the browser twin of app/lib/conditions.php (the server re-runs the same rules
 * when it validates). Logic is stored as { all?: Cond[], any?: Cond[] } with Cond = { field, op, value? }.
 */
(function () {
  "use strict";
  var FE = window.FE;
  var C = (FE.cond = {});

  function asArray(v) { return Array.isArray(v) ? v : v === undefined || v === null || v === "" ? [] : [v]; }
  function isEmpty(v) { if (v === undefined || v === null) return true; if (typeof v === "string") return v.trim() === ""; if (Array.isArray(v)) return v.length === 0; return false; }
  function str(x) { return String(x); }

  C.evalCond = function (c, ctx) {
    var actual = ctx[c.field], a = asArray(actual), wanted;
    switch (c.op) {
      case "eq": return a.some(function (x) { return str(x) === str(c.value); });
      case "neq": return !a.some(function (x) { return str(x) === str(c.value); });
      case "in": wanted = asArray(c.value).map(str); return a.some(function (x) { return wanted.indexOf(str(x)) >= 0; });
      case "nin": wanted = asArray(c.value).map(str); return !a.some(function (x) { return wanted.indexOf(str(x)) >= 0; });
      case "contains":
        if (typeof actual === "string") return actual.toLowerCase().indexOf(str(c.value == null ? "" : c.value).toLowerCase()) >= 0;
        return a.some(function (x) { return str(x) === str(c.value); });
      case "not_contains":
        if (typeof actual === "string") return actual.toLowerCase().indexOf(str(c.value == null ? "" : c.value).toLowerCase()) < 0;
        return !a.some(function (x) { return str(x) === str(c.value); });
      case "exists": return !isEmpty(actual);
      case "empty": return isEmpty(actual);
      case "gt": return Number(actual) > Number(c.value);
      case "lt": return Number(actual) < Number(c.value);
      case "truthy": return !!actual && actual !== "false" && actual !== "no";
      default: return false;
    }
  };
  C.evalLogic = function (logic, ctx) {
    if (!logic) return true;
    var all = logic.all || [], any = logic.any || [];
    if (!all.length && !any.length) return true;
    return all.every(function (c) { return C.evalCond(c, ctx); }) && (any.length === 0 || any.some(function (c) { return C.evalCond(c, ctx); }));
  };

  function visibleWith(q, answers, cats) {
    if (q.categoryKeys && q.categoryKeys.length && !q.categoryKeys.some(function (k) { return cats[k]; })) return false;
    return C.evalLogic(q.conditionalLogic, answers);
  }
  /** Categories in play: COMMON always, plus whatever the picked options switch on (repeated until nothing new appears). */
  C.activeCategories = function (form, answers, extra) {
    var cats = { COMMON: true }, n = 1, i, before;
    (extra || []).forEach(function (k) { if (!cats[k]) { cats[k] = true; n++; } });
    for (i = 0; i < 6; i++) {
      before = n;
      form.sections.forEach(function (s) { s.questions.forEach(function (q) {
        if (!q.options.length || !visibleWith(q, answers, cats)) return;
        var picked = asArray(answers[q.key]).map(str);
        q.options.forEach(function (o) { if (picked.indexOf(o.value) >= 0) (o.categoryKeys || []).forEach(function (k) { if (!cats[k]) { cats[k] = true; n++; } }); });
      }); });
      if (n === before) break;
    }
    return cats;
  };
  C.visibleQuestions = function (form, section, answers, extra) {
    var cats = C.activeCategories(form, answers, extra);
    return section.questions.filter(function (q) { return visibleWith(q, answers, cats); });
  };
  C.visibleSections = function (form, answers, extra) {
    var cats = C.activeCategories(form, answers, extra);
    return form.sections.filter(function (s) { return s.questions.some(function (q) { return visibleWith(q, answers, cats); }); });
  };
  C.isAnswered = function (v) {
    if (v === undefined || v === null) return false;
    if (typeof v === "string") return v.trim().length > 0;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  };

  var URL_RE = /^https?:\/\/[^\s/$.?#].[^\s]*$/i, EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, PHONE_RE = /^[+()\-.\s\d]{6,24}$/, COLOR_RE = /^#?[0-9a-f]{3,8}$/i;
  /** One answer against its question definition → error message or null. */
  C.validateAnswer = function (q, value) {
    if (!C.isAnswered(value)) return q.required ? "This field is required." : null;
    var s = typeof value === "string" ? value.trim() : value, meta = q.meta || {}, n;
    switch (q.type) {
      case "EMAIL": return EMAIL_RE.test(String(s)) ? null : "Enter a valid email address.";
      case "URL": return URL_RE.test(String(s)) ? null : "Enter a valid URL starting with http:// or https://";
      case "PHONE": return PHONE_RE.test(String(s)) ? null : "Enter a valid phone number.";
      case "COLOR": return COLOR_RE.test(String(s)) ? null : "Enter a valid color like #FF5B2E.";
      case "NUMBER": case "CURRENCY":
        n = Number(s);
        if (!isFinite(n)) return "Enter a number.";
        if (meta.min !== undefined && n < meta.min) return "Must be at least " + meta.min + ".";
        if (meta.max !== undefined && n > meta.max) return "Must be at most " + meta.max + ".";
        return null;
      case "DATE": return isNaN(Date.parse(String(s))) ? "Enter a valid date." : null;
      case "TIME": return /^\d{1,2}:\d{2}$/.test(String(s)) ? null : "Enter a valid time.";
      case "RATING": n = Number(s); return n >= 1 && n <= 5 ? null : "Choose a rating from 1 to 5.";
      case "SELECT": case "RADIO":
        if (q.options.length && !q.options.some(function (o) { return o.value === String(s); })) return "Choose one of the options.";
        return null;
      case "MULTI_SELECT":
        if (!Array.isArray(value)) return "Choose one or more options.";
        if (q.options.length && !value.every(function (v) { return q.options.some(function (o) { return o.value === String(v); }); })) return "One of the selected options is not valid.";
        return null;
      case "TEXT": case "TEXTAREA":
        var max = meta.maxLength || (q.type === "TEXT" ? 300 : 8000), min = meta.minLength;
        if (min && String(s).length < min) return "Please write at least " + min + " characters so we can help properly.";
        return String(s).length > max ? "Keep this under " + max + " characters." : null;
      default: return null;
    }
  };
})();
