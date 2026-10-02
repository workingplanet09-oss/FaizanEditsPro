/*
 * Admin editors: team, website content (CMS), project form builder, automations and settings.
 * Each one is a component mounted from markup like <div data-fe-component="cms-manager" data-props='{…}'>.
 * They use the small toolkit in admin.js (FE.ui, FE.dialog) and talk to the same /api/admin/* endpoints as before.
 */
(function () {
  "use strict";
  var FE = window.FE, h = FE.h, UI = FE.ui, esc = FE.esc;

  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function slug(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50); }
  function card(inner, cls) { return '<div class="rounded-[var(--radius-card)] border border-line bg-surface shadow-soft ' + (cls || "") + '">' + inner + "</div>"; }
  function cardHead(title, desc, actionHtml) { return '<div class="flex items-start justify-between gap-4 px-6 pt-6 pb-3"><div class="min-w-0"><h3 class="text-base font-bold leading-tight">' + esc(title) + "</h3>" + (desc ? '<p class="mt-1 text-sm text-muted">' + esc(desc) + "</p>" : "") + "</div>" + (actionHtml ? '<div class="shrink-0">' + actionHtml + "</div>" : "") + "</div>"; }
  function badge(text, tone, icon) {
    var t = { neutral: "bg-surface-2 text-muted", info: "bg-info-soft text-info", warning: "bg-warning-soft text-warning", success: "bg-success-soft text-success", danger: "bg-danger-soft text-danger", accent: "bg-accent-soft text-fg" }[tone || "neutral"];
    return '<span class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ' + t + '">' + (icon ? FE.icon(icon, 12) : "") + esc(text) + "</span>";
  }
  function empty(icon, title, desc) { return '<div class="flex flex-col items-center justify-center px-6 py-14 text-center"><div class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-subtle">' + FE.icon(icon, 24) + '</div><h3 class="text-base font-bold">' + esc(title) + "</h3>" + (desc ? '<p class="mt-1.5 max-w-sm text-sm text-muted">' + esc(desc) + "</p>" : "") + "</div>"; }
  var rowBtn = "rounded-lg p-2 text-subtle hover:bg-surface-2 hover:text-fg";
  var rowBtnDanger = "rounded-lg p-2 text-subtle hover:bg-danger-soft hover:text-danger";

  // ═══════════════════════════ TEAM ═══════════════════════════
  FE.components.teamManager = function (root, p) {
    function draw() {
      var active = p.members.filter(function (m) { return m.status === "ACTIVE"; }).length;
      root.innerHTML =
        card(cardHead("Team", active + " active · " + p.members.length + " total", '<button type="button" data-act="invite" class="' + UI.btnClass("dark", "sm") + '">' + FE.icon("plus", 16) + "Invite teammate</button>")
          + '<ul class="divide-y divide-line">' + p.members.map(function (m) {
            return '<li class="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3.5.5"><span class="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-bold">' + esc(m.name.split(/\s+/).map(function (w) { return w[0]; }).slice(0, 2).join("").toUpperCase()) + "</span>"
              + '<div class="min-w-0 flex-1 basis-56"><div class="flex flex-wrap items-center gap-2"><b class="text-sm">' + esc(m.name) + "</b>" + (m.id === p.meId ? '<span class="text-xs text-subtle">(you)</span>' : "")
              + (m.status === "INVITED" ? badge("Invited", "warning") : m.status === "SUSPENDED" ? badge("Suspended", "danger") : "") + (m.twoFactorEnabled ? badge("2FA", "success", "shield") : "") + "</div>"
              + '<div class="truncate text-xs text-muted">' + esc(m.email) + " · " + (m.lastLoginAt ? "seen " + esc(FE.timeAgo(m.lastLoginAt)) : "never signed in") + "</div></div>"
              + '<div class="flex flex-wrap gap-1">' + m.roles.map(function (r) { return badge(r.name, r.key === "super_admin" ? "accent" : "neutral"); }).join("") + "</div>"
              + '<span class="w-20 text-right text-xs text-subtle">' + m.projects + " project" + (m.projects === 1 ? "" : "s") + '</span><button type="button" data-act="manage" data-id="' + esc(m.id) + '" class="' + UI.btnClass("outline", "sm") + '">Manage</button></li>';
          }).join("") + "</ul>")
        + card(cardHead("Roles & permissions", "What each role can do. Clients never have any of these.", '<button type="button" data-act="roles" class="' + UI.btnClass("ghost", "sm") + '">' + (root.__roles ? "Hide" : "Show details") + "</button>")
          + '<ul class="divide-y divide-line">' + p.roles.map(function (r) {
            return '<li class="px-6 py-3.5.5"><div class="flex flex-wrap items-baseline justify-between gap-2"><b class="text-sm">' + esc(r.name) + '</b><span class="text-xs text-subtle">' + r.permissions.length + " permissions</span></div><p class=\"text-xs text-muted\">" + esc(r.description || "") + "</p>"
              + (root.__roles ? '<div class="mt-2 flex flex-wrap gap-1">' + r.permissions.map(function (k) { return '<span class="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-muted">' + esc(k) + "</span>"; }).join("") + "</div>" : "") + "</li>";
          }).join("") + "</ul>");
    }
    root.addEventListener("click", function (e) {
      var b = e.target.closest("[data-act]"); if (!b) return;
      var act = b.getAttribute("data-act");
      if (act === "roles") { root.__roles = !root.__roles; draw(); }
      else if (act === "invite") editMember(null);
      else if (act === "manage") editMember(p.members.filter(function (m) { return m.id === b.getAttribute("data-id"); })[0]);
    });
    function editMember(m) {
      var name = UI.input(m ? m.name : ""), email = UI.input(m ? m.email : "", { type: "email", disabled: !!m });
      var roles = p.roles.filter(function (r) { return p.isSuper || r.key !== "super_admin"; });
      var sel = m ? m.roles.map(function (r) { return r.key; }) : ["editor"];
      var boxes = roles.map(function (r) { var c = UI.checkbox(sel.indexOf(r.key) >= 0, r.name, r.description || ""); c.dataset.key = r.key; return c; });
      var cost = UI.input(m && m.hourlyCost != null ? String(FE.fromMinor(m.hourlyCost, "USD")) : "", { inputmode: "decimal" });
      var nameF = UI.field("Name", name, { required: true }), emailF = UI.field("Email", email, { required: true });
      var err = h("div");
      var body = h("div", { class: "space-y-4" }, err, nameF, emailF, h("fieldset", {}, h("legend", { class: "mb-2 text-sm font-semibold" }, "Roles"), h("div", { class: "space-y-2" }, boxes)),
        UI.field("Internal hourly cost (USD)", cost, { optional: true, hint: "Used only for the profitability report. Never shown to clients." }));
      var save = UI.btn(m ? "Save" : "Send invite", { onclick: function () {
        err.innerHTML = ""; nameF.setError(""); emailF.setError("");
        var keys = boxes.filter(function (c) { return c.get(); }).map(function (c) { return c.dataset.key; });
        if (name.value.trim().length < 2) return nameF.setError("Enter a name.");
        if (!m && !email.value.trim()) return emailF.setError("Enter an email address.");
        if (!keys.length) return err.appendChild(UI.banner("Choose at least one role."));
        var body = { name: name.value.trim(), roleKeys: keys, hourlyCost: cost.value.trim() ? FE.toMinor(cost.value, "USD") : null };
        if (!m) body.email = email.value.trim();
        UI.run(save, function () { return m ? FE.api("/api/admin/team/" + m.id, { method: "PATCH", body: body }) : FE.api("/api/admin/team", { body: body }); },
          function () { UI.done(m ? "Saved" : "Invitation sent to " + email.value.trim()); },
          function (er) { if (er.fields && er.fields.name) nameF.setError(er.fields.name); else if (er.fields && er.fields.email) emailF.setError(er.fields.email); else err.appendChild(UI.banner(er.message)); });
      } });
      var foot = [];
      if (m && m.id !== p.meId) foot.push(UI.btn(m.status === "SUSPENDED" ? "Reactivate" : "Suspend access", { variant: m.status === "SUSPENDED" ? "outline" : "danger", class: "mr-auto", onclick: function (ev) {
        var btn = ev.currentTarget; UI.run(btn, function () { return FE.api("/api/admin/team/" + m.id, { method: "PATCH", body: { suspended: m.status !== "SUSPENDED" } }); }, function () { UI.done("Updated"); });
      } }));
      foot.push(UI.btn("Cancel", { variant: "ghost", onclick: function () { dlg.close(); } }), save);
      var dlg = FE.dialog({ title: m ? "Manage " + m.name : "Invite a teammate", size: "md", body: body, footer: foot });
    }
    draw();
  };

  // ═══════════════════════════ CMS ═══════════════════════════
  FE.components.cmsManager = function (root, p) {
    var res = p.resource, items = p.items, relations = p.relations || {}, q = "";
    var toolbar = h("div", { class: "mb-4 flex flex-wrap items-center gap-3" });
    var filter = h("input", { type: "search", "aria-label": "Filter " + res.label, placeholder: "Filter " + res.label.toLowerCase() + "…", class: "h-10 w-full rounded-xl border border-line-strong bg-surface pl-9 pr-3 text-sm focus:border-accent focus:outline-none" });
    toolbar.appendChild(h("div", { class: "relative min-w-52 flex-1 sm:max-w-xs" }, h("span", { class: "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle", html: FE.icon("search", 15) }), filter));
    toolbar.appendChild(h("span", { class: "text-xs text-subtle" }, p.total + " total"));
    if (res.allowCreate !== false) toolbar.appendChild(UI.btn("Add " + res.singular, { variant: "dark", icon: "plus", class: "ml-auto", onclick: function () { edit(null); } }));
    var list = h("div");
    root.appendChild(toolbar); root.appendChild(list);
    filter.addEventListener("input", function () { q = filter.value.toLowerCase(); draw(); });

    function isOn(r) { var f = res.flagField; if (!f) return null; var v = r[f]; return typeof v === "boolean" ? v : v === "PUBLISHED" || v === "APPROVED"; }
    function draw() {
      var shown = q ? items.filter(function (r) { return JSON.stringify(r).toLowerCase().indexOf(q) >= 0; }) : items;
      if (!shown.length) { list.innerHTML = card(empty("news", q ? "Nothing matches" : "No " + res.label.toLowerCase() + " yet", q ? "Try a different search." : res.description)); return; }
      list.innerHTML = '<ul class="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-soft">' + shown.map(function (r, i) {
        var on = isOn(r);
        return '<li class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5" data-id="' + esc(r.id) + '">'
          + (res.sortable && !q ? '<span class="flex flex-col"><button type="button" data-act="up" aria-label="Move up" ' + (i === 0 ? "disabled " : "") + 'class="rounded p-0.5 text-subtle hover:text-fg disabled:opacity-25">' + FE.icon("chevron-up", 14) + '</button><button type="button" data-act="down" aria-label="Move down" ' + (i === shown.length - 1 ? "disabled " : "") + 'class="rounded p-0.5 text-subtle hover:text-fg disabled:opacity-25">' + FE.icon("chevron-down", 14) + "</button></span>" : "")
          + '<div class="min-w-0 flex-1 basis-56"><button type="button" data-act="edit" class="block max-w-full truncate text-left text-sm font-bold hover:text-accent-text hover:underline">' + esc(r[res.titleField] || "Untitled") + "</button>"
          + (res.subtitleField && r[res.subtitleField] ? '<div class="truncate text-xs text-muted">' + esc(String(r[res.subtitleField]).slice(0, 120)) + "</div>" : "") + "</div>"
          + (r.isDemo ? badge("Sample", "warning") : "")
          + (res.flagField ? '<button type="button" data-act="toggle" aria-label="' + (on ? "Unpublish" : "Publish") + '" title="' + (on ? "Click to unpublish" : "Click to publish") + '">' + badge(on ? (res.flagField === "enabled" ? "On" : "Published") : "Draft", on ? "success" : "neutral", on ? "check-circle" : "clock") + "</button>" : "")
          + '<div class="flex items-center gap-1">' + (r._href ? '<a href="' + esc(r._href) + '" target="_blank" rel="noopener noreferrer" aria-label="View on the website" class="' + rowBtn + '">' + FE.icon("external", 15) + "</a>" : "")
          + '<button type="button" data-act="edit" aria-label="Edit ' + esc(r[res.titleField]) + '" class="' + rowBtn + '">' + FE.icon("pencil", 15) + "</button>"
          + (res.allowDuplicate ? '<button type="button" data-act="dup" aria-label="Duplicate" class="' + rowBtn + '">' + FE.icon("copy", 15) + "</button>" : "")
          + (res.allowDelete !== false ? '<button type="button" data-act="del" aria-label="Delete" class="' + rowBtnDanger + '">' + FE.icon("trash", 15) + "</button>" : "") + "</div></li>";
      }).join("") + "</ul>";
    }
    list.addEventListener("click", function (e) {
      var b = e.target.closest("[data-act]"); if (!b) return;
      var li = b.closest("li"), id = li && li.getAttribute("data-id"), r = items.filter(function (x) { return x.id === id; })[0], act = b.getAttribute("data-act");
      var base = "/api/admin/cms/" + res.key;
      if (act === "edit") edit(r);
      else if (act === "up" || act === "down") {
        var ids = items.map(function (x) { return x.id; }), i = ids.indexOf(id), j = i + (act === "up" ? -1 : 1); if (j < 0 || j >= ids.length) return;
        var t = ids[i]; ids[i] = ids[j]; ids[j] = t;
        FE.api(base + "/reorder", { body: { ids: ids } }).then(function () { FE.refresh(); }, function (er) { FE.toast.error("Couldn't reorder", er.message); });
      } else if (act === "dup") FE.api(base + "/" + id + "/duplicate", { body: {} }).then(function () { UI.done("Duplicated as a draft"); }, function (er) { FE.toast.error("Couldn't duplicate", er.message); });
      else if (act === "toggle") {
        var f = res.flagField, now = isOn(r), value = typeof r[f] === "boolean" ? !now : now ? "DRAFT" : "PUBLISHED", body = {}; body[f] = value;
        FE.api(base + "/" + id, { method: "PATCH", body: body }).then(function () { UI.done("Updated"); }, function (er) { FE.toast.error("Couldn't update", er.message); });
      } else if (act === "del") FE.confirm({ title: "Delete this " + res.singular + "?", description: "“" + r[res.titleField] + "” will be removed from the site. This can't be undone.", confirmLabel: "Delete", tone: "danger" }).then(function (yes) {
        if (yes) FE.api(base + "/" + id, { method: "DELETE" }).then(function () { UI.done(cap(res.singular) + " deleted"); }, function (er) { FE.toast.error("Couldn't delete", er.message); });
      });
    });

    // ── editor ──
    function initial(f, row) {
      var raw = row ? row[f.key] : (res.defaults || {})[f.key];
      switch (f.type) {
        case "boolean": return !!raw;
        case "money": return raw == null ? "" : String(FE.fromMinor(Number(raw), (row && row.currency) || p.currency));
        case "lines": return Array.isArray(raw) ? raw.join("\n") : "";
        case "tags": return Array.isArray(raw) ? raw.join(", ") : "";
        case "datetime": if (!raw) return ""; var d = new Date(raw); return isNaN(d) ? "" : new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        case "metrics": return Object.keys(raw || {}).map(function (k) { return k + ": " + raw[k]; }).join("\n");
        case "number": return raw == null ? "" : String(raw);
        default: return raw == null ? "" : raw;
      }
    }
    function control(f, value, locked) {
      var t = f.type, el;
      if (t === "boolean") { var s = UI.sw(value, f.label, f.help); return { field: s, get: s.get, el: s, setError: function () {} }; }
      if (t === "textarea" || t === "lines" || t === "tasklist" || t === "deliverables" || t === "metrics") el = UI.textarea(value, t === "textarea" ? 3 : 4, { placeholder: f.placeholder || (t === "metrics" ? "Avg. watch time: +38%\nTurnaround: 3 days" : t === "deliverables" ? "2× Hero video\n5× Shorts" : ""), class: t === "tasklist" || t === "metrics" ? "font-mono text-sm" : "" });
      else if (t === "markdown") el = UI.textarea(value, 10, { placeholder: "Markdown supported: ## headings, **bold**, lists, links", class: "font-mono text-sm" });
      else if (t === "select") el = UI.select([{ value: "", label: "—" }].concat(f.options || []), value);
      else if (t === "relation") el = UI.select([{ value: "", label: "—" }].concat(relations[f.relation] || []), value);
      else if (t === "icon") el = UI.select((p.icons || []).map(function (i) { return { value: i, label: i }; }), value);
      else if (t === "datetime") el = UI.input(value, { type: "datetime-local" });
      else if (t === "number" || t === "money") el = UI.input(value, { inputmode: "decimal", placeholder: f.placeholder });
      else if (t === "url" || t === "image") el = UI.input(value, { type: "url", placeholder: f.placeholder || "https://" });
      else el = UI.input(value, { disabled: locked, placeholder: f.placeholder });
      var fld = UI.field(f.label, el, { required: f.required, hint: f.help });
      return { field: fld, el: el, get: function () { return el.value; }, setError: fld.setError };
    }
    function payload(f, v) {
      switch (f.type) {
        case "metrics": var o = {}; String(v || "").split("\n").forEach(function (l) { var i = l.indexOf(":"); if (i > 0 && l.slice(i + 1).trim()) o[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }); return o;
        case "lines": return String(v || "").split("\n");
        case "tags": return String(v || "").split(",");
        case "datetime": return v ? new Date(v).toISOString() : null;
        default: return v;
      }
    }
    function edit(row) {
      var ctrls = {}, err = h("div"), groups = [];
      res.fields.forEach(function (f) { var g = f.group || "Details"; if (groups.indexOf(g) < 0) groups.push(g); });
      var body = h("div", { class: "space-y-8" }, err, groups.map(function (g) {
        return h("section", {}, h("h3", { class: "mb-3 text-xs font-bold text-subtle" }, g),
          h("div", { class: "grid grid-cols-1 gap-4 sm:grid-cols-2" }, res.fields.filter(function (f) { return (f.group || "Details") === g; }).map(function (f) {
            var c = control(f, initial(f, row), !!row && !!f.readOnlyOnEdit); ctrls[f.key] = c;
            var wrap = h("div", { class: f.half ? "" : "sm:col-span-2" }, c.field); return wrap;
          })));
      }));
      var save = UI.btn(row ? "Save changes" : "Create " + res.singular, { onclick: function () {
        err.innerHTML = ""; res.fields.forEach(function (f) { ctrls[f.key].setError(""); });
        var b = {}; res.fields.forEach(function (f) { if (!(row && f.readOnlyOnEdit)) b[f.key] = payload(f, ctrls[f.key].get()); });
        var base = "/api/admin/cms/" + res.key;
        UI.run(save, function () { return row ? FE.api(base + "/" + row.id, { method: "PATCH", body: b }) : FE.api(base, { body: b }); },
          function () { UI.done(row ? "Saved" : cap(res.singular) + " created"); },
          function (er) {
            var fields = er.fields || {}, keys = Object.keys(fields);
            if (keys.length) { keys.forEach(function (k) { if (ctrls[k]) ctrls[k].setError(fields[k]); }); err.appendChild(UI.banner("Please fix the highlighted fields.")); }
            else err.appendChild(UI.banner(er.message));
          });
      } });
      var dlg = FE.dialog({ title: (row ? "Edit " : "New ") + res.singular, description: res.description, size: "xl", body: body, footer: [UI.btn("Cancel", { variant: "ghost", onclick: function () { dlg.close(); } }), save] });
    }
    draw();
  };

  // ═══════════════════════════ FORM BUILDER ═══════════════════════════
  var Q_TYPES = ["TEXT", "TEXTAREA", "SELECT", "MULTI_SELECT", "RADIO", "CHECKBOX", "DATE", "TIME", "NUMBER", "CURRENCY", "FILE", "URL", "EMAIL", "PHONE", "COLOR", "RATING"];
  var OPTION_TYPES = ["SELECT", "MULTI_SELECT", "RADIO"];
  var OPS = [["eq", "is"], ["neq", "is not"], ["in", "is one of"], ["nin", "is none of"], ["contains", "contains"], ["not_contains", "doesn't contain"], ["exists", "is answered"], ["empty", "is empty"], ["gt", "greater than"], ["lt", "less than"], ["truthy", "is yes / checked"]];
  var NO_VALUE = ["exists", "empty", "truthy"];
  function opLabel(o) { for (var i = 0; i < OPS.length; i++) if (OPS[i][0] === o) return OPS[i][1]; return o; }

  FE.components.formBuilder = function (root, p) {
    var form = p.form, all = [];
    form.sections.forEach(function (s) { s.questions.forEach(function (q) { all.push(q); }); });
    var section = form.sections.filter(function (s) { return s.key === p.activeSection; })[0] || form.sections[0];
    function describe(l) {
      if (!l) return null;
      var conds = (l.all || []).concat(l.any || []); if (!conds.length) return null;
      return conds.map(function (c) { var q = all.filter(function (x) { return x.key === c.field; })[0]; return (q ? q.text : c.field) + " " + opLabel(c.op) + " " + (NO_VALUE.indexOf(c.op) >= 0 ? "" : Array.isArray(c.value) ? c.value.join(", ") : String(c.value == null ? "" : c.value)); }).join(l.any && l.any.length && !(l.all && l.all.length) ? " OR " : " AND ");
    }
    function draw() {
      var tabs = p.forms.map(function (f) { return '<a href="/admin/forms?form=' + esc(f.key) + '"' + (f.key === form.key ? ' aria-current="page"' : "") + ' class="flex-1 rounded-lg px-2 py-1.5 text-center ' + (f.key === form.key ? "bg-surface shadow-soft" : "text-muted") + '">' + (f.key === "inquiry" ? "Inquiry" : "Project brief") + "</a>"; }).join("");
      var secs = form.sections.map(function (s) { var on = section && s.key === section.key; return '<a href="/admin/forms?form=' + esc(form.key) + "&section=" + esc(s.key) + '"' + (on ? ' aria-current="page"' : "") + ' class="flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ' + (on ? "bg-fg text-bg" : "text-muted hover:bg-surface-2 hover:text-fg") + '"><span class="truncate">' + esc(s.title) + '</span><span class="rounded-full px-1.5 text-xs ' + (on ? "bg-white/15" : "bg-surface-2") + '">' + s.questions.length + "</span></a>"; }).join("");
      var rows = section ? (section.questions.length ? '<ul class="divide-y divide-line">' + section.questions.map(function (q, i) {
        var logic = describe(q.conditionalLogic), extra = (q.options || []).filter(function (o) { return o.categoryKeys && o.categoryKeys.length; });
        return '<li data-id="' + esc(q.id) + '" class="flex flex-wrap items-start gap-x-3 gap-y-2 px-6 py-3.5.5' + (q.active === false ? " opacity-60" : "") + '"><span class="flex flex-col pt-0.5"><button type="button" data-act="up" aria-label="Move up" ' + (i === 0 ? "disabled " : "") + 'class="rounded p-0.5 text-subtle hover:text-fg disabled:opacity-25">' + FE.icon("chevron-up", 14) + '</button><button type="button" data-act="down" aria-label="Move down" ' + (i === section.questions.length - 1 ? "disabled " : "") + 'class="rounded p-0.5 text-subtle hover:text-fg disabled:opacity-25">' + FE.icon("chevron-down", 14) + "</button></span>"
          + '<div class="min-w-0 flex-1 basis-64"><button type="button" data-act="edit" class="text-left text-sm font-bold hover:text-accent-text hover:underline">' + esc(q.text) + '</button><div class="mt-1 flex flex-wrap items-center gap-1.5 text-xs">' + badge(q.type.toLowerCase().replace("_", " "), "neutral") + (q.required ? badge("required", "danger") : "")
          + (q.categoryKeys || []).filter(function (c) { return c !== "COMMON"; }).map(function (c) { return badge(c.toLowerCase().replace(/_/g, " "), "accent"); }).join("") + '<span class="font-mono text-subtle">' + esc(q.key) + "</span></div>"
          + (logic ? '<p class="mt-1.5 text-xs text-muted">' + FE.icon("workflow", 11, "mr-1 inline") + "Shown when: " + esc(logic) + "</p>" : "")
          + (extra.length ? '<p class="mt-1 text-xs text-muted">Selecting ' + esc(extra.map(function (o) { return o.label; }).slice(0, 4).join(", ")) + " adds extra questions.</p>" : "") + "</div>"
          + '<div class="flex items-center gap-1"><button type="button" role="switch" data-act="toggle" aria-checked="' + (q.active !== false) + '" aria-label="Enabled" class="relative h-6 w-11 shrink-0 rounded-full transition-colors ' + (q.active !== false ? "bg-accent" : "bg-line-strong") + '"><span class="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ' + (q.active !== false ? "translate-x-[22px]" : "translate-x-0.5") + '"></span></button>'
          + '<button type="button" data-act="edit" aria-label="Edit ' + esc(q.text) + '" class="' + rowBtn + '">' + FE.icon("pencil", 15) + '</button><button type="button" data-act="dup" aria-label="Duplicate" class="' + rowBtn + '">' + FE.icon("copy", 15) + '</button><button type="button" data-act="del" aria-label="Delete" class="' + rowBtnDanger + '">' + FE.icon("trash", 15) + "</button></div></li>";
      }).join("") + "</ul>" : empty("clipboard", "No questions in this section", "Add one to start.")) : "";
      root.innerHTML = '<nav aria-label="Sections" class="space-y-1"><div class="mb-3 flex gap-1 rounded-xl bg-surface-2 p-1 text-sm font-semibold">' + tabs + "</div>" + secs
        + '<a href="/start-project" target="_blank" rel="noopener noreferrer" class="mt-4 flex items-center gap-2 rounded-xl border border-dashed border-line-strong px-3 py-2 text-sm font-semibold text-muted hover:text-fg">' + FE.icon("eye", 15) + "Preview as visitor</a></nav>"
        + "<div>" + (section ? card(cardHead(section.title, section.description, '<button type="button" data-act="add" class="' + UI.btnClass("primary", "sm") + '">' + FE.icon("plus", 16) + "Add question</button>") + rows) : "") + "</div>";
    }
    root.addEventListener("click", function (e) {
      var b = e.target.closest("[data-act]"); if (!b) return;
      var act = b.getAttribute("data-act"), li = b.closest("li"), id = li && li.getAttribute("data-id");
      var q = section && section.questions.filter(function (x) { return x.id === id; })[0];
      if (act === "add") return editQuestion(null);
      if (act === "edit") return editQuestion(q);
      if (act === "up" || act === "down") {
        var ids = section.questions.map(function (x) { return x.id; }), i = ids.indexOf(id), j = i + (act === "up" ? -1 : 1); if (j < 0 || j >= ids.length) return;
        var t = ids[i]; ids[i] = ids[j]; ids[j] = t;
        FE.api("/api/admin/forms/questions/reorder", { body: { ids: ids } }).then(function () { FE.refresh(); }, function (er) { FE.toast.error("Couldn't reorder", er.message); });
      } else if (act === "toggle") FE.api("/api/admin/forms/questions/" + id, { method: "PATCH", body: { active: q.active === false } }).then(function () { FE.refresh(); }, function (er) { FE.toast.error("Couldn't update", er.message); });
      else if (act === "dup") FE.api("/api/admin/forms/questions/" + id + "/duplicate", { body: {} }).then(function () { UI.done("Duplicated (disabled until you review it)"); }, function (er) { FE.toast.error("Couldn't duplicate", er.message); });
      else if (act === "del") FE.confirm({ title: "Delete this question?", description: "“" + q.text + "” will be removed. Answers already collected are kept on existing leads and projects.", confirmLabel: "Delete question", tone: "danger" }).then(function (yes) {
        if (yes) FE.api("/api/admin/forms/questions/" + id, { method: "DELETE" }).then(function () { UI.done("Question deleted"); }, function (er) { FE.toast.error("Couldn't delete", er.message); });
      });
    });

    function editQuestion(q) {
      var text = UI.input(q ? q.text : ""), key = UI.input(q ? q.key : "", { disabled: !!q, class: "font-mono" });
      var type = UI.select(Q_TYPES.map(function (t) { return { value: t, label: t.toLowerCase().replace("_", " ") }; }), q ? q.type : "TEXT");
      var sectionSel = UI.select(form.sections.map(function (s) { return { value: s.key, label: s.title }; }), q ? q.sectionKey : section.key);
      var placeholder = UI.input(q ? q.placeholder : ""), help = UI.input(q ? q.helpText : "");
      var required = UI.sw(q ? q.required : false, "Required"), active = UI.sw(q ? q.active !== false : true, "Enabled");
      text.addEventListener("input", function () { if (!q) key.value = slug(text.value); });
      key.addEventListener("input", function () { key.value = slug(key.value); });
      var textF = UI.field("Question", text, { required: true, class: "sm:col-span-2" }), keyF = UI.field("Field key", key, { hint: "Stable ID used in automations and scoring. Lowercase with underscores." });
      var err = h("div");

      // options
      var opts = (q ? q.options || [] : []).map(function (o) { return { label: o.label, value: o.value, categoryKeys: (o.categoryKeys || []).slice(), description: o.description || "" }; });
      var optsBox = h("section"), optsList = h("div", { class: "space-y-2" });
      function drawOpts() {
        optsList.innerHTML = "";
        opts.forEach(function (o, i) {
          var label = UI.input(o.label, { placeholder: "Label", "aria-label": "Option label" }), value = UI.input(o.value, { placeholder: "value", "aria-label": "Option value", class: "font-mono" });
          var grp = UI.select([{ value: "", label: "Adds no group" }].concat(p.categories.filter(function (c) { return c.key !== "COMMON"; }).map(function (c) { return { value: c.key, label: "Adds: " + c.name }; })), o.categoryKeys[0] || "", { "aria-label": "Adds question group" });
          label.addEventListener("input", function () { var auto = !o.value || slug(o.label) === o.value; o.label = label.value; if (auto) { o.value = slug(label.value); value.value = o.value; } });
          value.addEventListener("input", function () { o.value = slug(value.value); value.value = o.value; });
          grp.addEventListener("change", function () { o.categoryKeys = grp.value ? [grp.value] : []; });
          optsList.appendChild(h("div", { class: "grid grid-cols-1 gap-2 rounded-xl border border-line p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]" }, label, value, grp, UI.iconBtn("trash", "Remove option", function () { opts.splice(i, 1); drawOpts(); }, true)));
        });
      }
      optsBox.appendChild(h("h3", { class: "mb-1 text-sm font-bold" }, "Options"));
      optsBox.appendChild(h("p", { class: "mb-3 text-xs text-muted" }, "Choose which extra question groups an option unlocks — that's how “Real estate” adds property questions."));
      optsBox.appendChild(optsList);
      optsBox.appendChild(UI.btn("Add option", { variant: "outline", size: "sm", icon: "plus", onclick: function () { opts.push({ label: "", value: "", categoryKeys: [], description: "" }); drawOpts(); } }));
      drawOpts();
      function syncOpts() { optsBox.hidden = OPTION_TYPES.indexOf(type.value) < 0; }
      type.addEventListener("change", syncOpts); syncOpts();

      // conditions
      var mode = q && q.conditionalLogic && q.conditionalLogic.any && q.conditionalLogic.any.length && !(q.conditionalLogic.all && q.conditionalLogic.all.length) ? "any" : "all";
      var conds = ((q && q.conditionalLogic && (q.conditionalLogic.all || q.conditionalLogic.any)) || []).map(function (c) { return { field: c.field, op: c.op, value: Array.isArray(c.value) ? c.value.join(", ") : String(c.value == null ? "" : c.value) }; });
      var condBox = h("section"), condList = h("div", { class: "space-y-2" }), modeRow = h("div", { class: "mb-3 flex items-center gap-2 text-sm" });
      var others = all.filter(function (x) { return !q || x.key !== q.key; });
      function drawConds() {
        condList.innerHTML = ""; modeRow.innerHTML = "";
        if (conds.length > 1) {
          var m = UI.select([{ value: "all", label: "all conditions" }, { value: "any", label: "any condition" }], mode, { "aria-label": "Match mode", class: "h-9! w-auto!" }); m.addEventListener("change", function () { mode = m.value; });
          modeRow.appendChild(document.createTextNode("Match ")); modeRow.appendChild(m);
        }
        conds.forEach(function (c, i) {
          var f = UI.select([{ value: "", label: "Choose question…" }].concat(others.map(function (o) { return { value: o.key, label: o.text.slice(0, 60) }; })), c.field, { "aria-label": "Question" });
          var op = UI.select(OPS.map(function (o) { return { value: o[0], label: o[1] }; }), c.op, { "aria-label": "Operator" });
          var val = UI.input(c.value, { placeholder: ["in", "nin"].indexOf(c.op) >= 0 ? "a, b, c" : "value", "aria-label": "Value" });
          val.hidden = NO_VALUE.indexOf(c.op) >= 0;
          f.addEventListener("change", function () { c.field = f.value; }); val.addEventListener("input", function () { c.value = val.value; });
          op.addEventListener("change", function () { c.op = op.value; val.hidden = NO_VALUE.indexOf(c.op) >= 0; val.placeholder = ["in", "nin"].indexOf(c.op) >= 0 ? "a, b, c" : "value"; });
          condList.appendChild(h("div", { class: "grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto]" }, f, op, val, UI.iconBtn("trash", "Remove condition", function () { conds.splice(i, 1); drawConds(); }, true)));
        });
        addCond.hidden = conds.length >= 10;
      }
      var addCond = UI.btn("Add condition", { variant: "outline", size: "sm", icon: "plus", onclick: function () { conds.push({ field: "", op: "eq", value: "" }); drawConds(); } });
      condBox.appendChild(h("h3", { class: "mb-1 text-sm font-bold" }, "Show this question only when…"));
      condBox.appendChild(h("p", { class: "mb-3 text-xs text-muted" }, "Leave empty to always show it (when its question group is active)."));
      condBox.appendChild(modeRow); condBox.appendChild(condList); condBox.appendChild(addCond); drawConds();

      // groups
      var cats = (q ? q.categoryKeys : ["COMMON"]) || ["COMMON"];
      var catBoxes = p.categories.map(function (c) { var b = UI.checkbox(cats.indexOf(c.key) >= 0, c.name); b.dataset.key = c.key; return b; });
      var grpBox = h("section", {}, h("h3", { class: "mb-2 text-sm font-bold" }, "Question group"), h("div", { class: "flex flex-wrap gap-x-5 gap-y-2" }, catBoxes),
        h("p", { class: "mt-2 text-xs text-muted" }, "The question appears only when at least one of its groups is active. “Common” is always active."));

      var body = h("div", { class: "space-y-7" }, err,
        h("section", { class: "grid grid-cols-1 gap-4 sm:grid-cols-2" }, textF, UI.field("Answer type", type), UI.field("Section", sectionSel), keyF, UI.field("Placeholder", placeholder, { optional: true }), UI.field("Help text", help, { optional: true, class: "sm:col-span-2" }),
          h("div", { class: "flex flex-wrap gap-6 sm:col-span-2" }, required, active)),
        optsBox, condBox, grpBox);
      var save = UI.btn(q ? "Save changes" : "Add question", { onclick: function () {
        err.innerHTML = ""; textF.setError(""); keyF.setError("");
        if (text.value.trim().length < 3) return textF.setError("Enter the question (at least 3 characters).");
        var logic = conds.filter(function (c) { return c.field; }).length ? (function () { var o = {}; o[mode] = conds.filter(function (c) { return c.field; }).map(function (c) { var r = { field: c.field, op: c.op }; if (NO_VALUE.indexOf(c.op) < 0) r.value = ["in", "nin"].indexOf(c.op) >= 0 ? c.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean) : c.value; return r; }); return o; })() : null;
        var body = { sectionKey: sectionSel.value, key: key.value || slug(text.value), text: text.value.trim(), helpText: help.value || null, placeholder: placeholder.value || null, type: type.value, required: required.get(), active: active.get(),
          categoryKeys: catBoxes.filter(function (c) { return c.get(); }).map(function (c) { return c.dataset.key; }), conditionalLogic: logic };
        if (OPTION_TYPES.indexOf(type.value) >= 0) body.options = opts.filter(function (o) { return o.label.trim(); }).map(function (o) { return { label: o.label.trim(), value: (o.value || "").trim() || slug(o.label), categoryKeys: o.categoryKeys, description: o.description || null }; });
        if (!q) body.formKey = form.key;
        UI.run(save, function () { return q ? FE.api("/api/admin/forms/questions/" + q.id, { method: "PATCH", body: body }) : FE.api("/api/admin/forms/questions", { body: body }); },
          function () { UI.done(q ? "Question saved" : "Question added"); },
          function (er) { var f = er.fields || {}; if (f.text) textF.setError(f.text); else if (f.key) keyF.setError(f.key); else err.appendChild(UI.banner(er.message)); });
      } });
      var dlg = FE.dialog({ title: q ? "Edit question" : "Add question", description: "Changes apply to new submissions immediately. Existing answers are never altered.", size: "xl", body: body, footer: [UI.btn("Cancel", { variant: "ghost", onclick: function () { dlg.close(); } }), save] });
    }
    draw();
  };

  // ═══════════════════════════ AUTOMATIONS ═══════════════════════════
  var ACTION_TYPES = [["EMAIL", "Send email", "mail"], ["NOTIFICATION", "In-app notification", "bell"], ["ADMIN_ALERT", "Alert the team", "alert"], ["CLIENT_REMINDER", "Remind the client", "clock"], ["STATUS_UPDATE", "Change project status", "refresh"], ["CREATE_TASK", "Create a task", "checklist"]];
  var RECIPIENTS = [["client", "The client"], ["client_billing", "Client billing contact"], ["manager", "Project manager"], ["editors", "Assigned editors"], ["team", "Whole project team"], ["lead_owner", "Lead owner"], ["admins", "Admins"], ["finance", "Finance"]];
  var AOPS = [["eq", "is"], ["neq", "is not"], ["in", "is one of"], ["gt", "greater than"], ["lt", "less than"], ["exists", "is present"]];
  function blankAction(type) {
    type = type || "EMAIL";
    return { type: type, delayMinutes: 0, config: type === "EMAIL" ? { recipient: "client", templateKey: "" } : type === "STATUS_UPDATE" ? { toStatus: "EDITING" } : type === "CREATE_TASK" ? { taskTitle: "", assignee: "manager", priority: "NORMAL", dueInDays: 2 } : { recipient: type === "ADMIN_ALERT" ? "admins" : "client", title: "", message: "", link: "" } };
  }
  function fmtDelay(m) { return m % 1440 === 0 ? m / 1440 + "d" : m % 60 === 0 ? m / 60 + "h" : m + "m"; }

  FE.components.automationManager = function (root, p) {
    var rows = p.automations, label = function (e) { var x = p.events.filter(function (v) { return v.value === e; })[0]; return x ? x.label : e; };
    function draw() {
      var groups = []; rows.forEach(function (a) { if (groups.indexOf(a.event) < 0) groups.push(a.event); });
      root.innerHTML = '<div class="mb-5 flex flex-wrap items-center gap-3"><p class="text-sm text-muted">' + rows.filter(function (a) { return a.enabled; }).length + " of " + rows.length + ' automations are on. Turning one off stops it immediately; nothing is deleted.</p><button type="button" data-act="new" class="ml-auto ' + UI.btnClass("dark", "md") + '">' + FE.icon("plus", 16) + "New automation</button></div>"
        + (!rows.length ? card(empty("workflow", "No automations yet", "Create your own to get started.")) : '<div class="space-y-6">' + groups.map(function (g) {
          return '<section><h3 class="mb-2 text-xs font-bold text-subtle">When: ' + esc(label(g)) + '</h3><ul class="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-soft">' + rows.filter(function (a) { return a.event === g; }).map(function (a) {
            return '<li data-id="' + esc(a.id) + '" class="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3.5.5"><div class="min-w-0 flex-1 basis-64"><button type="button" data-act="edit" class="text-left text-sm font-bold hover:text-accent-text hover:underline">' + esc(a.name) + "</button>" + (a.description ? '<p class="mt-0.5 text-xs text-muted">' + esc(a.description) + "</p>" : "")
              + '<div class="mt-1.5 flex flex-wrap gap-1.5">' + a.actions.map(function (x) { var t = ACTION_TYPES.filter(function (y) { return y[0] === x.type; })[0]; return badge((t ? t[1] : x.type) + (x.delayMinutes ? " · after " + fmtDelay(x.delayMinutes) : ""), "neutral", t ? t[2] : "zap"); }).join("") + "</div></div>"
              + (a.isSystem ? badge("built-in", "info") : "") + '<span class="text-xs text-subtle">' + a.runs + " run" + (a.runs === 1 ? "" : "s") + '</span>'
              + '<button type="button" role="switch" data-act="toggle" aria-checked="' + a.enabled + '" aria-label="' + esc(a.name) + ' enabled" class="relative h-6 w-11 shrink-0 rounded-full transition-colors ' + (a.enabled ? "bg-accent" : "bg-line-strong") + '"><span class="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ' + (a.enabled ? "translate-x-[22px]" : "translate-x-0.5") + '"></span></button>'
              + '<button type="button" data-act="edit" aria-label="Edit ' + esc(a.name) + '" class="' + rowBtn + '">' + FE.icon("pencil", 15) + "</button>" + (!a.isSystem ? '<button type="button" data-act="del" aria-label="Delete ' + esc(a.name) + '" class="' + rowBtnDanger + '">' + FE.icon("trash", 15) + "</button>" : "") + "</li>";
          }).join("") + "</ul></section>";
        }).join("") + "</div>");
    }
    root.addEventListener("click", function (e) {
      var b = e.target.closest("[data-act]"); if (!b) return;
      var act = b.getAttribute("data-act"), li = b.closest("li"), id = li && li.getAttribute("data-id"), a = rows.filter(function (x) { return x.id === id; })[0];
      if (act === "new") edit(null); else if (act === "edit") edit(a);
      else if (act === "toggle") FE.api("/api/admin/automations/" + id + "/toggle", { body: { enabled: !a.enabled } }).then(function () { FE.refresh(); }, function (er) { FE.toast.error("Couldn't update", er.message); });
      else if (act === "del") FE.confirm({ title: "Delete this automation?", description: "“" + a.name + "” will stop running. Past runs stay in the audit trail.", confirmLabel: "Delete", tone: "danger" }).then(function (yes) {
        if (yes) FE.api("/api/admin/automations/" + id, { method: "DELETE" }).then(function () { UI.done("Automation deleted"); }, function (er) { FE.toast.error("Couldn't delete", er.message); });
      });
    });

    function edit(row) {
      var name = UI.input(row ? row.name : ""), desc = UI.input(row ? row.description : ""), ev = UI.select(p.events, row ? row.event : (p.events[0] || {}).value), enabled = UI.sw(row ? row.enabled : true, "Enabled");
      var acts = row ? row.actions.map(function (a) { return { type: a.type, config: Object.assign({}, a.config), delayMinutes: a.delayMinutes }; }) : [blankAction()];
      var conds = ((row && row.conditions && (row.conditions.all || row.conditions.any)) || []).map(function (c) { return { field: c.field, op: c.op, value: Array.isArray(c.value) ? c.value.join(", ") : String(c.value == null ? "" : c.value) }; });
      var err = h("div"), nameF = UI.field("Name", name, { required: true, class: "sm:col-span-2" });
      var condList = h("div", { class: "space-y-2" }), actList = h("div", { class: "space-y-3" });
      function drawConds() {
        condList.innerHTML = "";
        conds.forEach(function (c, i) {
          var f = UI.input(c.field, { placeholder: "field (e.g. toStatus)", "aria-label": "Field", class: "font-mono" }), op = UI.select(AOPS.map(function (o) { return { value: o[0], label: o[1] }; }), c.op, { "aria-label": "Operator" }), v = UI.input(c.value, { placeholder: "value", "aria-label": "Value" });
          v.hidden = c.op === "exists"; f.addEventListener("input", function () { c.field = f.value; }); v.addEventListener("input", function () { c.value = v.value; }); op.addEventListener("change", function () { c.op = op.value; v.hidden = c.op === "exists"; });
          condList.appendChild(h("div", { class: "grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_minmax(0,1fr)_auto]" }, f, op, v, UI.iconBtn("trash", "Remove condition", function () { conds.splice(i, 1); drawConds(); }, true)));
        });
      }
      function actionFields(a) {
        var c = a.config, set = function (k, v) { c[k] = v; }, box = h("div");
        function sel(k, opts, lab) { var s = UI.select(opts, c[k] == null ? "" : c[k]); s.addEventListener("change", function () { set(k, s.value); }); return UI.field(lab, s); }
        function txt(k, lab, o) { var i = o && o.area ? UI.textarea(c[k] || "", 2) : UI.input(c[k] || "", { placeholder: o && o.placeholder }); i.addEventListener("input", function () { set(k, i.value); }); return UI.field(lab, i, { class: o && o.wide ? "sm:col-span-2" : "", optional: !(o && o.required) , required: o && o.required }); }
        if (a.type === "STATUS_UPDATE") return sel("toStatus", p.statuses, "Move the project to");
        if (a.type === "CREATE_TASK") {
          var due = UI.input(c.dueInDays == null ? 2 : c.dueInDays, { type: "number", min: 0 }); due.addEventListener("input", function () { set("dueInDays", Number(due.value)); });
          return h("div", { class: "grid grid-cols-1 gap-3 sm:grid-cols-2" }, txt("taskTitle", "Task title", { required: true, wide: true, placeholder: "e.g. Follow up on {{project_name}}" }), sel("assignee", [{ value: "manager", label: "Project manager" }, { value: "editor", label: "Assigned editor" }, { value: "", label: "Unassigned" }], "Assign to"), UI.field("Due in (days)", due));
        }
        var f = [sel("recipient", RECIPIENTS.map(function (r) { return { value: r[0], label: r[1] }; }), "Send to")];
        if (a.type === "EMAIL") f.push(sel("templateKey", [{ value: "", label: "Choose…" }].concat(p.templates.map(function (t) { return { value: t.key, label: t.name }; })), "Email template"));
        else { f.push(txt("title", "Title", { required: true })); f.push(txt("message", "Message", { area: true, wide: true })); f.push(txt("link", "Link (app path)", { wide: true, placeholder: "{{base}}/projects/{{project_pid}}" })); }
        return h("div", { class: "grid grid-cols-1 gap-3 sm:grid-cols-2" }, f);
      }
      function drawActs() {
        actList.innerHTML = "";
        acts.forEach(function (a, i) {
          var type = UI.select(ACTION_TYPES.map(function (t) { return { value: t[0], label: t[1] }; }), a.type, { "aria-label": "Action type", class: "h-10! w-auto! font-semibold" });
          var delay = h("input", { type: "number", min: 0, value: a.delayMinutes, "aria-label": "Delay in minutes", class: "h-9 w-20 rounded-lg border border-line-strong bg-surface px-2 text-sm text-fg" });
          type.addEventListener("change", function () { acts[i] = Object.assign(blankAction(type.value), { delayMinutes: a.delayMinutes }); drawActs(); });
          delay.addEventListener("input", function () { a.delayMinutes = Number(delay.value) || 0; });
          actList.appendChild(h("div", { class: "space-y-3 rounded-2xl border border-line bg-surface-2/30 p-4" },
            h("div", { class: "flex flex-wrap items-center gap-3" }, h("span", { class: "flex h-7 w-7 items-center justify-center rounded-full bg-fg text-xs font-bold text-bg" }, String(i + 1)), type,
              h("label", { class: "ml-auto flex items-center gap-2 text-xs font-semibold text-muted" }, "Wait ", delay, " min first"), acts.length > 1 ? UI.iconBtn("trash", "Remove action", function () { acts.splice(i, 1); drawActs(); }, true) : null), actionFields(a)));
        });
        addAct.hidden = acts.length >= 10;
      }
      var addAct = UI.btn("Add another action", { variant: "outline", size: "sm", icon: "plus", onclick: function () { acts.push(blankAction("NOTIFICATION")); drawActs(); } });
      var addCond = UI.btn("Add condition", { variant: "outline", size: "sm", icon: "plus", onclick: function () { conds.push({ field: "", op: "eq", value: "" }); drawConds(); } });
      drawConds(); drawActs();
      var body = h("div", { class: "space-y-7" }, err,
        h("section", { class: "grid grid-cols-1 gap-4 sm:grid-cols-2" }, nameF, UI.field("Description", desc, { optional: true, class: "sm:col-span-2" }), UI.field("Trigger — when this happens", ev), h("div", { class: "flex items-end pb-1" }, enabled)),
        h("section", {}, h("h3", { class: "mb-1 text-sm font-bold" }, "Only if… (optional)"), h("p", { class: "mb-3 text-xs text-muted" }, "Conditions look at the event's data, e.g. toStatus is CLIENT_REVIEW for a status change."), condList, addCond),
        h("section", {}, h("h3", { class: "mb-3 text-sm font-bold" }, "Then do this"), actList, h("div", { class: "mt-3" }, addAct),
          h("p", { class: "mt-3 text-xs text-muted" }, "Use placeholders like {{client_name}}, {{project_name}}, {{amount}}, {{deadline}}, {{project_url}}.")));
      var save = UI.btn(row ? "Save changes" : "Create automation", { onclick: function () {
        err.innerHTML = ""; nameF.setError("");
        if (!name.value.trim()) return nameF.setError("Give the automation a name.");
        var cs = conds.filter(function (c) { return c.field; });
        var payload = { name: name.value.trim(), description: desc.value || null, event: ev.value, enabled: enabled.get(),
          conditions: cs.length ? { all: cs.map(function (c) { var r = { field: c.field, op: c.op }; if (c.op !== "exists") r.value = c.op === "in" ? c.value.split(",").map(function (s) { return s.trim(); }) : (c.value === "" || isNaN(Number(c.value)) ? c.value : Number(c.value)); return r; }) } : null,
          actions: acts.map(function (a) { return { type: a.type, config: a.config, delayMinutes: a.delayMinutes }; }) };
        UI.run(save, function () { return row ? FE.api("/api/admin/automations/" + row.id, { method: "PUT", body: payload }) : FE.api("/api/admin/automations", { body: payload }); },
          function () { UI.done(row ? "Automation saved" : "Automation created"); }, function (er) { err.appendChild(UI.banner(er.message)); });
      } });
      var dlg = FE.dialog({ title: row ? "Edit automation" : "New automation", description: "When something happens, do something — automatically.", size: "xl", body: body, footer: [UI.btn("Cancel", { variant: "ghost", onclick: function () { dlg.close(); } }), save] });
    }
    draw();
  };

  // ═══════════════════════════ SETTINGS ═══════════════════════════
  var ENUMS = { mode: ["auto", "manual", "hidden"] };
  var LONG = /(description|intro|story|body|summary|detail|terms|privacy|notes|policy|address|instructions|subheadline|message|bio|youDo|weDo)$/i;
  var COLOR_KEYS = /^(accent|accentContrast|color|.*Color)$/;
  function pretty(k) { return k.replace(/([A-Z])/g, " $1").replace(/[_-]/g, " ").replace(/^./, function (c) { return c.toUpperCase(); }).replace(/\bUrl\b/, "URL").replace(/\bCta\b/, "button").replace(/\bSeo\b/, "SEO").replace(/\bBps\b/, "(basis points)"); }
  function blankLike(s) {
    if (Array.isArray(s)) return [];
    if (s && typeof s === "object") { var o = {}; Object.keys(s).forEach(function (k) { var v = s[k]; o[k] = typeof v === "number" ? 0 : typeof v === "boolean" ? false : Array.isArray(v) ? [] : v && typeof v === "object" ? blankLike(v) : ""; }); return o; }
    return typeof s === "number" ? 0 : typeof s === "boolean" ? false : "";
  }

  /** Schema-less editor: renders controls from the shape of the current value; the server validates with the real schema on save. */
  FE.components.settingsEditor = function (root, p) {
    var value = JSON.parse(JSON.stringify(p.value)), original = JSON.stringify(p.value);
    var bar = h("div", { class: "sticky bottom-20 z-10 mt-5 flex items-center justify-end gap-3 rounded-2xl border border-line bg-bg/90 p-3 shadow-lift lg:bottom-4" });
    var status = h("span", { class: "mr-auto text-sm text-subtle" }, "All changes saved");
    var reset = UI.btn("Reset", { variant: "ghost", onclick: function () { value = JSON.parse(original); paint(); touch(); } });
    var save = UI.btn("Save settings", { icon: "check", onclick: function () {
      UI.run(save, function () { return FE.api("/api/admin/settings/" + p.group, { method: "PUT", body: value }); }, function () { original = JSON.stringify(value); touch(); FE.toast.success("Settings saved", "The change is live."); },
        function (er) { status.textContent = er.message; status.className = "mr-auto text-sm font-medium text-danger"; status.setAttribute("role", "alert"); });
    } });
    bar.appendChild(status); bar.appendChild(reset); bar.appendChild(save);
    var host = h("div");
    root.appendChild(host); root.appendChild(bar);
    function touch() { var dirty = JSON.stringify(value) !== original; status.className = "mr-auto text-sm " + (dirty ? "text-muted" : "text-subtle"); status.textContent = dirty ? "You have unsaved changes" : "All changes saved"; status.removeAttribute("role"); reset.disabled = !dirty; save.disabled = !dirty; }
    function paint() { host.innerHTML = ""; host.appendChild(objectFields(value, function (nv) { value = nv; touch(); })); }

    function objectFields(obj, onChange) {
      var grid = h("div", { class: "grid gap-4 sm:grid-cols-2" });
      Object.keys(obj).forEach(function (k) {
        grid.appendChild(node(k, obj[k], function (nv) { obj[k] = nv; onChange(obj); }));
      });
      return grid;
    }
    function node(name, val, onChange) {
      var label = pretty(name);
      if (typeof val === "boolean") { var sw = UI.sw(val, label); sw.button.addEventListener("fe:switch", function () { onChange(sw.get()); }); return h("div", { class: "sm:col-span-2" }, sw); }
      if (typeof val === "number") { var n = UI.input(val, { type: "number" }); n.addEventListener("input", function () { onChange(Number(n.value)); }); return UI.field(label, n); }
      if (typeof val === "string") {
        if (ENUMS[name]) { var s = UI.select(ENUMS[name].map(function (o) { return { value: o, label: o }; }), val); s.addEventListener("change", function () { onChange(s.value); }); return UI.field(label, s); }
        if (COLOR_KEYS.test(name) || /^#[0-9a-f]{6}$/i.test(val)) {
          var pick = h("input", { type: "color", "aria-label": label + " picker", class: "h-11 w-14 cursor-pointer rounded-xl border border-line-strong bg-surface p-1" }); pick.value = /^#[0-9a-f]{6}$/i.test(val) ? val : "#000000";
          var hex = UI.input(val, { class: "max-w-36 font-mono" });
          pick.addEventListener("input", function () { hex.value = pick.value.toUpperCase(); onChange(hex.value); }); hex.addEventListener("input", function () { onChange(hex.value); if (/^#[0-9a-f]{6}$/i.test(hex.value)) pick.value = hex.value; });
          return UI.field(label, h("div", { class: "flex items-center gap-2" }, pick, hex));
        }
        if (LONG.test(name) || val.indexOf("\n") >= 0 || val.length > 90) { var ta = UI.textarea(val, Math.min(12, Math.max(3, Math.ceil(val.length / 90)))); ta.addEventListener("input", function () { onChange(ta.value); }); return UI.field(label, ta, { class: "sm:col-span-2" }); }
        var t = UI.input(val); t.addEventListener("input", function () { onChange(t.value); }); return UI.field(label, t);
      }
      if (Array.isArray(val)) {
        if (!val.length || typeof val[0] !== "object") {
          var isNum = typeof val[0] === "number";
          var area = UI.textarea(isNum ? val.join(", ") : val.join("\n"), Math.min(8, Math.max(2, val.length + 1)));
          area.addEventListener("input", function () { onChange(isNum ? area.value.split(",").map(function (x) { return Number(x.trim()); }).filter(function (x) { return !isNaN(x); }) : area.value.split("\n")); });
          return UI.field(label, area, { class: "sm:col-span-2", hint: isNum ? "Comma-separated numbers (e.g. weekdays 1–5 = Mon–Fri)." : "One per line." });
        }
        var template = blankLike(val[0]), wrap = h("div", { class: "sm:col-span-2" }), list = h("div", { class: "space-y-3" });
        wrap.appendChild(h("h4", { class: "mb-2 text-sm font-bold" }, label)); wrap.appendChild(list);
        var redraw = function () {
          list.innerHTML = "";
          val.forEach(function (row, i) {
            var move = function (d) { var j = i + d; if (j < 0 || j >= val.length) return; var t2 = val[i]; val[i] = val[j]; val[j] = t2; onChange(val); redraw(); };
            list.appendChild(h("div", { class: "rounded-2xl border border-line bg-surface-2/30 p-4" },
              h("div", { class: "mb-3 flex items-center justify-between" }, h("span", { class: "text-xs font-bold text-subtle" }, "#" + (i + 1)),
                h("span", { class: "flex gap-1" }, UI.iconBtn("chevron-up", "Move up", function () { move(-1); }), UI.iconBtn("chevron-down", "Move down", function () { move(1); }), UI.iconBtn("trash", "Remove", function () { val.splice(i, 1); onChange(val); redraw(); }, true))),
              row && typeof row === "object" ? objectFields(row, function (nv) { val[i] = nv; onChange(val); }) : null));
          });
        };
        redraw();
        wrap.appendChild(UI.btn("Add", { variant: "outline", size: "sm", icon: "plus", class: "mt-3", onclick: function () { val.push(JSON.parse(JSON.stringify(template))); onChange(val); redraw(); } }));
        return wrap;
      }
      if (val && typeof val === "object") {
        return h("fieldset", { class: "sm:col-span-2" }, h("legend", { class: "mb-2 text-sm font-bold" }, label), h("div", { class: "rounded-2xl border border-line p-4" }, objectFields(val, function (nv) { onChange(nv); })));
      }
      return h("div");
    }
    paint(); touch();
  };
})();
