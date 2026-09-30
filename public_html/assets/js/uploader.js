/*
 * Resumable, validated uploads: data-fe-component="uploader" data-props='{"purpose":"asset","projectId":"…","folderKey":"references"}'
 * Props: purpose (asset|version|deliverable|brand|lead_reference), projectId, clientId, draftToken, folderKey, fileRequestId, label,
 *        accept, multiple, compact, maxFiles, title, hint, reload (refresh the page when everything finished)
 * The draft token may also be changed at run time with the data-draft-token attribute (used by the public wizard).
 * Events on the root element: fe:uploaded (detail = asset), fe:uploads-done.
 */
(function () {
  "use strict";
  var FE = window.FE, $ = FE.$;

  function bytes(n) { return FE.bytes ? FE.bytes(n) : (n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(0) + " KB" : n < 1073741824 ? (n / 1048576).toFixed(1) + " MB" : (n / 1073741824).toFixed(2) + " GB"); }

  /** A small JPEG poster captured in the browser (no ffmpeg on the server). */
  function capturePoster(file) {
    return new Promise(function (resolve) {
      if (!/^video\//.test(file.type)) return resolve(null);
      var url = URL.createObjectURL(file), v = document.createElement("video"), timer;
      var done = function (b) { clearTimeout(timer); URL.revokeObjectURL(url); resolve(b); };
      v.muted = true; v.preload = "metadata"; v.playsInline = true;
      timer = setTimeout(function () { done(null); }, 8000);
      v.onloadeddata = function () { v.currentTime = Math.min(1, (v.duration || 2) / 3); };
      v.onseeked = function () {
        try {
          var c = document.createElement("canvas"), scale = Math.min(1, 640 / (v.videoWidth || 640));
          c.width = Math.round((v.videoWidth || 640) * scale); c.height = Math.round((v.videoHeight || 360) * scale);
          c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
          c.toBlob(function (b) { done(b); }, "image/jpeg", 0.75);
        } catch (e) { done(null); }
      };
      v.onerror = function () { done(null); };
      v.src = url;
    });
  }
  function videoDuration(file) {
    return new Promise(function (resolve) {
      if (!/^video\//.test(file.type)) return resolve(undefined);
      var url = URL.createObjectURL(file), v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = function () { URL.revokeObjectURL(url); resolve(isFinite(v.duration) ? Math.round(v.duration * 1000) : undefined); };
      v.onerror = function () { URL.revokeObjectURL(url); resolve(undefined); };
      v.src = url;
    });
  }

  FE.components.uploader = function (root, props) {
    var purpose = props.purpose || "asset", multiple = props.multiple !== false, maxFiles = props.maxFiles || 50, seq = 0, items = [];
    var zone = FE.h("div", { class: "relative rounded-2xl border-2 border-dashed border-line-strong bg-surface-2/40 text-center transition hover:border-subtle " + (props.compact ? "p-5" : "p-8") });
    var input = FE.h("input", { type: "file", class: "sr-only", "aria-label": props.title || "Choose files to upload" });
    if (multiple) input.multiple = true;
    if (props.accept) input.setAttribute("accept", props.accept);
    var browse = FE.h("button", { type: "button", class: "font-bold text-fg underline underline-offset-2 hover:text-accent-text" }, "browse your computer");
    zone.appendChild(input);
    zone.appendChild(FE.h("span", { class: "mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-surface shadow-soft", html: FE.icon("upload", 20) }));
    zone.appendChild(FE.h("p", { class: "mt-3 text-sm font-bold" }, props.title || "Drag & drop files here"));
    zone.appendChild(FE.h("p", { class: "mt-1 text-xs text-muted" }, (props.hint || "or") + " ", browse));
    var list = FE.h("ul", { class: "mt-4 space-y-2", "aria-live": "polite" });
    var note = FE.h("p", { class: "mt-2 hidden text-xs text-subtle" }, "Keep this tab open until uploads finish.");
    root.appendChild(zone); root.appendChild(list); root.appendChild(note);

    function draw(it) {
      var li = it.li || (it.li = FE.h("li", { class: "rounded-xl border border-line bg-surface p-3" }));
      var tone = it.state === "done" ? "bg-success-soft text-success" : it.state === "error" ? "bg-danger-soft text-danger" : "bg-surface-2 text-muted";
      var ic = it.state === "done" ? "check" : it.state === "error" ? "alert" : /^video\//.test(it.file.type) ? "video" : "file";
      var status = it.state === "uploading" || it.state === "queued"
        ? '<div class="mt-1.5 flex items-center gap-2"><div role="progressbar" aria-valuenow="' + it.pct + '" aria-valuemin="0" aria-valuemax="100" aria-label="Uploading ' + FE.esc(it.file.name) + '" class="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"><div class="h-full rounded-full bg-accent transition-[width] duration-150" style="width:' + it.pct + '%"></div></div><span class="w-9 text-right text-xs tabular-nums text-muted">' + it.pct + "%</span></div>"
        : it.state === "error" ? '<p class="mt-0.5 text-xs font-medium text-danger">' + FE.esc(it.error) + "</p>"
        : '<p class="mt-0.5 text-xs text-success">Uploaded' + (it.asset && it.asset.version > 1 ? " · version " + it.asset.version : "") + "</p>";
      li.innerHTML = '<div class="flex items-center gap-3"><span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ' + tone + '">' + FE.icon(ic, 16) + '</span><div class="min-w-0 flex-1"><div class="flex items-center justify-between gap-3"><span class="truncate text-sm font-semibold">' + FE.esc(it.file.name) + '</span><span class="shrink-0 text-xs text-subtle">' + bytes(it.file.size) + "</span></div>" + status + "</div>"
        + (it.state === "uploading" ? '<button type="button" data-act="cancel" class="rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-surface-2">Cancel</button>' : it.state === "error" ? '<button type="button" data-act="retry" class="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-bold hover:bg-line">Retry</button>' : "") + "</div>";
      if (!li.parentNode) list.insertBefore(li, list.firstChild);
    }

    function run(it) {
      var ctrl = new AbortController();
      it.state = "uploading"; it.pct = 0; it.error = null; it.abort = ctrl; draw(it);
      var file = it.file, token = root.getAttribute("data-draft-token") || props.draftToken;
      return FE.api("/api/assets/upload-url", { body: { purpose: purpose, projectId: props.projectId, clientId: props.clientId, draftToken: token, folderKey: props.folderKey, filename: file.name, size: file.size, mimeType: file.type || "application/octet-stream", fileRequestId: props.fileRequestId, label: root.getAttribute("data-label") || props.label } })
        .then(function (r) {
          return FE.uploadChunked(r.upload, file, function (pct) { it.pct = pct; draw(it); }, ctrl.signal).then(function () { return videoDuration(file); }).then(function (duration) {
            return FE.api("/api/assets/" + r.asset.id + "/complete", { body: { draftToken: token, fileRequestId: props.fileRequestId, durationMs: duration } });
          }).then(function (done) {
            if (/^video\//.test(file.type) && purpose !== "lead_reference") { // poster frame: best effort, never blocks the upload
              capturePoster(file).then(function (blob) {
                if (!blob) return;
                return FE.api("/api/assets/" + r.asset.id + "/thumbnail", { method: "POST", body: {} }).then(function (t) {
                  return FE.uploadChunked(t.upload, blob, null).then(function () { return FE.api("/api/assets/" + r.asset.id + "/thumbnail", { method: "PUT", body: {} }); });
                });
              }).catch(function () {});
            }
            it.state = "done"; it.pct = 100; it.asset = done; draw(it);
            root.dispatchEvent(new CustomEvent("fe:uploaded", { bubbles: true, detail: done }));
          });
        })
        .catch(function (e) {
          it.state = "error"; it.error = e && e.name === "AbortError" ? "Cancelled" : (e && e.message) || "Upload failed. Check your connection and retry."; draw(it);
        });
    }
    function busy() { return items.some(function (i) { return i.state === "uploading" || i.state === "queued"; }); }
    function add(files) {
      var fresh = Array.prototype.slice.call(files, 0, Math.max(0, maxFiles)).map(function (file) { return { key: "u" + ++seq, file: file, pct: 0, state: "queued" }; });
      fresh.forEach(function (it) { items.push(it); draw(it); });
      note.classList.remove("hidden");
      var queue = fresh.slice();
      function worker() { var it = queue.shift(); return it ? run(it).then(worker) : Promise.resolve(); }
      return Promise.all([worker(), worker(), worker()]).then(function () {
        note.classList.toggle("hidden", !busy());
        root.dispatchEvent(new CustomEvent("fe:uploads-done", { bubbles: true }));
        if (props.reload && !items.some(function (i) { return i.state === "error"; })) { FE.flash("success", "Upload complete"); FE.refresh(); }
      });
    }

    list.addEventListener("click", function (e) {
      var b = e.target.closest("[data-act]"); if (!b) return;
      var it = items.filter(function (i) { return i.li && i.li.contains(b); })[0]; if (!it) return;
      if (b.getAttribute("data-act") === "cancel" && it.abort) it.abort.abort(); else if (b.getAttribute("data-act") === "retry") run(it);
    });
    browse.addEventListener("click", function () { input.click(); });
    input.addEventListener("change", function () { if (input.files && input.files.length) { add(input.files); input.value = ""; } });
    ["dragenter", "dragover"].forEach(function (n) { zone.addEventListener(n, function (e) { e.preventDefault(); zone.classList.add("border-accent", "bg-accent-soft"); }); });
    ["dragleave", "drop"].forEach(function (n) { zone.addEventListener(n, function (e) { e.preventDefault(); zone.classList.remove("border-accent", "bg-accent-soft"); }); });
    zone.addEventListener("drop", function (e) { if (e.dataTransfer && e.dataTransfer.files.length) add(multiple ? e.dataTransfer.files : [e.dataTransfer.files[0]]); });
    window.addEventListener("beforeunload", function (e) { if (busy()) { e.preventDefault(); e.returnValue = ""; } });
  };
})();
