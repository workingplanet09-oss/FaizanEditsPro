/*
 * Timestamped review player: video + scrubber with comment markers, keyboard shortcuts, side-by-side compare,
 * threaded notes (add / reply / resolve), approve and request-changes. Mounted by views/portal/review.php.
 */
(function () {
  "use strict";
  var FE = window.FE, $ = FE.$, $$ = FE.$$, esc = FE.esc;

  function tc(ms, withMs) { // 00:14 / 1:02:03
    ms = Math.max(0, Math.round(ms || 0)); var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60, p = function (n) { return n < 10 ? "0" + n : "" + n; };
    return (h ? h + ":" + p(m) : p(m)) + ":" + p(sec);
  }
  var SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
  var REV = { OPEN: ["Open", "bg-warning-soft text-warning"], IN_PROGRESS: ["In progress", "bg-info-soft text-info"], RESOLVED: ["Resolved", "bg-success-soft text-success"], REJECTED: ["Won't do", "bg-surface-2 text-muted"], CLOSED: ["Withdrawn", "bg-surface-2 text-muted"] };
  function btn(label, icon, flip) { return '<button type="button" aria-label="' + label + '" title="' + label + '" data-ctl="' + label + '" class="flex h-9 w-9 items-center justify-center rounded-lg text-white/90 transition hover:bg-white/10 hover:text-white">' + FE.icon(icon, 18, flip ? "-scale-x-100" : "") + "</button>"; }

  FE.components["review-player"] = function (root, p) {
    var comments = p.comments || [], dur = p.current.durationMs || 0, time = 0, buffered = 0, playing = false, dragging = false, filter = "all", pin = null, replyTo = null, compareId = null, raf = 0;
    var perms = p.perms, staff = p.staff, me = p.me;
    root.innerHTML =
      '<div class="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_24rem] xl:grid-cols-[minmax(0,1fr)_26rem]"><div>' +
      '<div data-stage tabindex="0" aria-label="Video player. Space plays or pauses, arrow keys seek, C adds a comment." class="group/player relative overflow-hidden bg-black outline-none focus-visible:ring-4 focus-visible:ring-accent/40 sm:rounded-[var(--radius-card)]">' +
      '<div data-screens class="grid grid-cols-1"><div class="relative" data-main></div><div data-compare class="relative hidden border-t border-white/10 sm:border-l sm:border-t-0"></div></div>' +
      '<div class="bg-neutral-950 px-3 pb-3 pt-2 text-white sm:px-4"><div data-scrub role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0" class="group/scrub relative flex h-7 cursor-pointer touch-none items-center"><div class="relative h-1.5 w-full rounded-full bg-white/20 transition-[height] duration-150 group-hover/scrub:h-2"><div data-buf class="absolute inset-y-0 left-0 rounded-full bg-white/25" style="width:0"></div><div data-prog class="absolute inset-y-0 left-0 rounded-full bg-accent" style="width:0"></div></div><div data-knob class="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow" style="left:0"></div><div data-markers></div></div>' +
      '<div class="flex flex-wrap items-center gap-1 sm:gap-2">' + btn("Play", "play") + btn("Back 10 seconds", "refresh", true) + '<span data-clock class="px-1 font-mono text-xs tabular-nums text-white/90 sm:text-sm" aria-hidden="true">00:00 <span class="text-white/50">/ 00:00</span></span>' +
      '<span class="ml-auto flex items-center gap-1"><span class="hidden items-center gap-1 sm:flex">' + btn("Mute", "music") + '<input data-vol type="range" min="0" max="1" step="0.05" value="1" aria-label="Volume" class="h-1 w-20 accent-[var(--accent)]"></span>' +
      '<label class="sr-only" for="speed">Playback speed</label><select id="speed" data-speed class="h-8 rounded-lg border border-white/15 bg-transparent px-1.5 text-xs font-semibold text-white">' + SPEEDS.map(function (s) { return '<option value="' + s + '"' + (s === 1 ? " selected" : "") + ' class="text-black">' + s + "×</option>"; }).join("") + "</select>" + btn("Full screen", "monitor") + "</span></div></div></div>" +
      '<div data-notes-card></div><div data-decision></div></div>' +
      '<aside class="flex min-h-0 flex-col px-4 sm:px-0 lg:h-[calc(100vh-11rem)] lg:min-h-[32rem]" aria-label="Comments"><div class="mb-3 flex items-center justify-between gap-3"><h2 class="text-base font-bold">Notes <span data-count class="text-sm font-semibold text-subtle"></span></h2>' +
      '<div role="tablist" aria-label="Filter notes" class="flex rounded-lg bg-surface-2 p-0.5 text-xs font-semibold">' + ["all", "open", "resolved"].map(function (f) { return '<button role="tab" type="button" data-filter="' + f + '" aria-selected="' + (f === "all") + '" class="rounded-md px-2.5 py-1 capitalize transition">' + f + "</button>"; }).join("") + "</div></div>" +
      '<div data-composer></div><div data-list class="thin-scroll -mr-2 min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-2 pb-4"></div></aside></div>';
    var stage = $("[data-stage]", root), main = $("[data-main]", root), cmp = $("[data-compare]", root), scrub = $("[data-scrub]", root), clock = $("[data-clock]", root), list = $("[data-list]", root), composer = $("[data-composer]", root);
    var video, video2;

    // ───────────── video ─────────────
    function mountVideo() {
      if (p.playback.url && !p.playback.external) {
        video = FE.h("video", { src: p.playback.url, playsinline: true, preload: "metadata", class: "aspect-video w-full bg-black" }); if (p.posterUrl) video.poster = p.posterUrl;
        main.appendChild(video);
        var overlay = FE.h("button", { type: "button", "aria-label": "Play", class: "absolute inset-0 hidden items-center justify-center bg-black/10 transition hover:bg-black/25", html: '<span class="flex h-16 w-16 items-center justify-center rounded-full bg-white/95 text-black shadow-lift">' + FE.icon("play", 26, "ml-1") + "</span>" });
        main.appendChild(overlay); main.__overlay = overlay; overlay.addEventListener("click", toggle);
        video.addEventListener("click", toggle);
        video.addEventListener("loadedmetadata", function () { dur = Math.round(video.duration * 1000) || dur; overlay.classList.remove("hidden"); overlay.classList.add("flex"); paint(); });
        video.addEventListener("play", function () { playing = true; overlay.classList.add("hidden"); overlay.classList.remove("flex"); setPlayIcon(); tick(); });
        video.addEventListener("pause", function () { playing = false; setPlayIcon(); sync(); });
        video.addEventListener("ended", function () { playing = false; setPlayIcon(); });
        ["seeked", "timeupdate", "progress"].forEach(function (ev) { video.addEventListener(ev, sync); });
        video.addEventListener("error", function () { showError("This video couldn't be loaded. It may still be processing, or the secure link expired."); });
      } else if (p.playback.external && p.playback.url) {
        main.innerHTML = '<div class="flex aspect-video w-full flex-col items-center justify-center gap-3 bg-neutral-900 px-6 text-center text-white">' + FE.icon("film", 30) + '<p class="text-sm text-white/80">This version is hosted externally.</p><a href="' + esc(p.playback.url) + '" target="_blank" rel="noopener noreferrer" class="rounded-xl bg-white px-4 py-2 text-sm font-bold text-black">Open video ↗</a><p class="text-xs text-white/60">Note the timecode you\'re commenting on and enter it below.</p></div>';
      } else showError(p.playback.error || "This version has no playable video yet.");
    }
    function showError(msg) {
      main.innerHTML = '<div class="flex aspect-video w-full flex-col items-center justify-center gap-3 bg-neutral-900 px-6 text-center text-white">' + FE.icon("warning", 30) + '<p class="max-w-sm text-sm text-white/80">' + esc(msg) + '</p><button type="button" data-retry class="rounded-xl bg-white px-4 py-2 text-sm font-bold text-black">Try again</button></div>';
      $("[data-retry]", main).addEventListener("click", function () { FE.refresh(); }); video = null;
    }
    function toggle() { if (!video) return; if (video.paused) { var r = video.play(); if (r && r.catch) r.catch(function () { showError("Your browser blocked playback. Tap play again."); }); } else video.pause(); }
    function setPlayIcon() { var b = $('[data-ctl="Play"],[data-ctl="Pause"]', root); if (!b) return; b.setAttribute("aria-label", playing ? "Pause" : "Play"); b.setAttribute("title", playing ? "Pause" : "Play"); b.setAttribute("data-ctl", playing ? "Pause" : "Play"); b.innerHTML = FE.icon(playing ? "pause" : "play", 18); }
    function sync() { if (!video) return; time = Math.round(video.currentTime * 1000); if (video.buffered.length) buffered = video.buffered.end(video.buffered.length - 1) * 1000; paint(); }
    function tick() { if (!playing) return; sync(); raf = requestAnimationFrame(tick); }
    function seek(ms) {
      if (!video) return; var max = (video.duration || dur / 1000 || 0) * 1000, t = Math.max(0, Math.min(ms, max || ms));
      video.currentTime = t / 1000; if (video2) video2.currentTime = t / 1000; time = t; paint();
    }
    function paint() {
      var pct = dur ? Math.min(100, (time / dur) * 100) : 0;
      $("[data-prog]", root).style.width = pct + "%"; $("[data-knob]", root).style.left = pct + "%"; $("[data-buf]", root).style.width = (dur ? (buffered / dur) * 100 : 0) + "%";
      clock.innerHTML = tc(time) + ' <span class="text-white/50">/ ' + tc(dur) + "</span>";
      scrub.setAttribute("aria-valuemax", Math.round(dur / 1000)); scrub.setAttribute("aria-valuenow", Math.round(time / 1000)); scrub.setAttribute("aria-valuetext", tc(time) + " of " + tc(dur));
      var cb = $("[data-pin-time]", root); if (cb) cb.textContent = tc(pin !== null ? pin : time);
      highlightActive();
    }

    // ───────────── scrubber ─────────────
    function fromPointer(x) { var r = scrub.getBoundingClientRect(); return Math.max(0, Math.min(1, (x - r.left) / r.width)) * dur; }
    scrub.addEventListener("pointerdown", function (e) { if (e.target.closest("[data-marker]") || !dur) return; scrub.setPointerCapture(e.pointerId); dragging = true; seek(fromPointer(e.clientX)); });
    scrub.addEventListener("pointermove", function (e) { if (dragging) seek(fromPointer(e.clientX)); });
    scrub.addEventListener("pointerup", function () { dragging = false; });
    scrub.addEventListener("keydown", function (e) { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); seek(time + (e.key === "ArrowRight" ? 5000 : -5000)); } });
    function drawMarkers() {
      var h = ""; roots().forEach(function (c) {
        h += '<button type="button" data-marker="' + esc(c.id) + '" aria-label="Comment at ' + esc(c.timecode) + ": " + esc(c.comment.slice(0, 60)) + '" title="' + esc(c.timecode + " · " + c.author + ": " + c.comment.slice(0, 80)) + '" class="absolute top-0 z-10 h-2.5 w-2.5 -translate-x-1/2 rounded-full border border-black/40 transition hover:scale-150 ' + (c.status === "RESOLVED" ? "bg-emerald-400" : c.isStaff ? "bg-sky-400" : "bg-amber-300") + '" style="left:' + (dur ? Math.min(100, (c.timecodeMs / dur) * 100) : 0) + '%"></button>';
      });
      $("[data-markers]", root).innerHTML = h;
    }
    $("[data-markers]", root).addEventListener("click", function (e) {
      var m = e.target.closest("[data-marker]"); if (!m) return; e.stopPropagation(); var c = comments.filter(function (x) { return x.id === m.getAttribute("data-marker"); })[0];
      if (c) { seek(c.timecodeMs); var el = document.getElementById("c-" + c.id); if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
    });

    // ───────────── controls + keyboard ─────────────
    root.addEventListener("click", function (e) {
      var b = e.target.closest("[data-ctl]"); if (!b) return; var a = b.getAttribute("data-ctl");
      if (a === "Play" || a === "Pause") toggle(); else if (a === "Back 10 seconds") seek(time - 10000);
      else if (a === "Mute" || a === "Unmute") { if (!video) return; video.muted = !video.muted; b.setAttribute("data-ctl", video.muted ? "Unmute" : "Mute"); b.setAttribute("aria-label", video.muted ? "Unmute" : "Mute"); }
      else if (a === "Full screen") { if (document.fullscreenElement) document.exitFullscreen(); else if (stage.requestFullscreen) stage.requestFullscreen(); }
    });
    $("[data-vol]", root).addEventListener("input", function (e) { if (video) { video.volume = Number(e.target.value); video.muted = false; } });
    $("[data-speed]", root).addEventListener("change", function (e) { if (video) video.playbackRate = Number(e.target.value); if (video2) video2.playbackRate = Number(e.target.value); });
    stage.addEventListener("keydown", function (e) {
      var t = e.target; if (/^(TEXTAREA|INPUT|SELECT)$/.test(t.tagName)) return; var step = e.shiftKey ? 1000 : 5000;
      switch (e.key) {
        case " ": case "k": e.preventDefault(); toggle(); break;
        case "j": seek(time - 10000); break; case "l": seek(time + 10000); break;
        case "ArrowLeft": e.preventDefault(); seek(time - step); break; case "ArrowRight": e.preventDefault(); seek(time + step); break;
        case ",": if (video) video.pause(); seek(time - 42); break; case ".": if (video) video.pause(); seek(time + 42); break;
        case "ArrowUp": e.preventDefault(); if (video) video.volume = Math.min(1, video.volume + 0.1); break; case "ArrowDown": e.preventDefault(); if (video) video.volume = Math.max(0, video.volume - 0.1); break;
        case "m": if (video) video.muted = !video.muted; break; case "f": if (document.fullscreenElement) document.exitFullscreen(); else stage.requestFullscreen && stage.requestFullscreen(); break;
        case "c": if (perms.canComment) { e.preventDefault(); var ta = $("#new-comment", root); if (ta) ta.focus(); } break;
      }
    });

    // ───────────── compare ─────────────
    FE.review = { compare: function (id) {
      if (!id) { compareId = null; cmp.classList.add("hidden"); cmp.innerHTML = ""; $("[data-screens]", root).classList.remove("sm:grid-cols-2"); video2 = null; return; }
      compareId = id; cmp.classList.remove("hidden"); $("[data-screens]", root).classList.add("sm:grid-cols-2"); cmp.innerHTML = '<div class="flex aspect-video items-center justify-center text-sm text-white/70">Loading…</div>';
      FE.api("/api/video-versions/" + id + "/playback").then(function (r) {
        var lab = (p.versions.filter(function (v) { return v.id === id; })[0] || {}).label || "";
        video2 = FE.h("video", { src: r.url, muted: true, playsinline: true, preload: "metadata", class: "aspect-video w-full bg-black" }); video2.muted = true;
        cmp.innerHTML = '<span class="absolute left-2 top-2 z-10 rounded-md bg-black/70 px-2 py-1 text-xs font-bold text-white">' + esc(lab) + "</span>"; cmp.appendChild(video2);
        if (video) { video2.currentTime = video.currentTime; video.addEventListener("play", function () { if (video2) video2.play().catch(function () {}); }); video.addEventListener("pause", function () { if (video2) video2.pause(); }); video.addEventListener("seeked", function () { if (video2) video2.currentTime = video.currentTime; }); video.addEventListener("ratechange", function () { if (video2) video2.playbackRate = video.playbackRate; }); }
      }, function () { FE.toast.error("Can't load that version"); FE.review.compare(null); });
    } };

    // ───────────── notes ─────────────
    function roots() { return comments.filter(function (c) { return !c.parentId; }).sort(function (a, b) { return a.timecodeMs - b.timecodeMs || new Date(a.createdAt) - new Date(b.createdAt); }); }
    function replies(id) { return comments.filter(function (c) { return c.parentId === id; }).sort(function (a, b) { return new Date(a.createdAt) - new Date(b.createdAt); }); }
    function activeId() { var best = null; roots().forEach(function (c) { if (c.timecodeMs <= time + 250 && time - c.timecodeMs < 5000) best = c; }); return best ? best.id : null; }
    function highlightActive() {
      var id = activeId(); $$("article[id^=c-]", list).forEach(function (a) { var on = a.id === "c-" + id; a.classList.toggle("border-accent", on); a.classList.toggle("border-line", !on); });
      if (playing && id !== highlightActive.last) { highlightActive.last = id; var el = id && document.getElementById("c-" + id); if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
    }
    function renderComposer() {
      if (perms.canComment) {
        composer.innerHTML = '<div class="mb-3 rounded-2xl border border-line-strong bg-surface p-3 shadow-soft"><div class="mb-2 flex items-center justify-between gap-2 text-xs"><span class="flex items-center gap-1.5 font-bold">' + FE.icon("clock", 13) + 'Comment at <button type="button" data-pin-reset class="rounded-md bg-accent-soft px-1.5 py-0.5 font-mono font-bold hover:underline" title="Use the current playhead time"><span data-pin-time>00:00</span></button></span><span data-pin-state class="text-subtle">follows playhead</span></div>' +
          '<label for="new-comment" class="sr-only">Add a timestamped comment</label><textarea id="new-comment" rows="3" maxlength="2000" placeholder="What should change at this moment?" class="w-full resize-none rounded-xl border border-line bg-surface-2/50 px-3 py-2 text-sm focus:border-accent focus:bg-surface focus:outline-none focus:ring-4 focus:ring-accent/20"></textarea>' +
          '<p data-comment-error role="alert" class="mt-1 hidden text-xs font-medium text-danger"></p><div class="mt-2 flex items-center justify-between"><span class="text-xs text-subtle">Ctrl/⌘+Enter to post</span><button type="button" data-add disabled class="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-accent px-3.5 text-sm font-semibold text-accent-fg disabled:opacity-50">' + FE.icon("send", 16) + "Add note</button></div></div>";
        var ta = $("#new-comment", composer), add = $("[data-add]", composer);
        ta.addEventListener("focus", function () { if (pin === null && !ta.value) { if (video) video.pause(); pin = time; pinState(); } });
        ta.addEventListener("input", function () { add.disabled = !ta.value.trim(); });
        ta.addEventListener("keydown", function (e) { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); post(); } });
        add.addEventListener("click", post);
        $("[data-pin-reset]", composer).addEventListener("click", function () { pin = null; pinState(); paint(); });
        function pinState() { $("[data-pin-state]", composer).innerHTML = pin !== null ? '<button type="button" data-follow class="text-subtle hover:text-fg">Follow playhead</button>' : "follows playhead"; var f = $("[data-follow]", composer); if (f) f.addEventListener("click", function () { pin = null; pinState(); paint(); }); paint(); }
        function post() {
          var text = ta.value.trim(); if (!text) return; FE.busy(add, true);
          FE.api("/api/video-versions/" + p.current.id + "/comments", { body: { timecodeMs: pin !== null ? pin : time, comment: text } }).then(function (c) { FE.busy(add, false); comments.push(c); ta.value = ""; add.disabled = true; pin = null; pinState(); FE.toast.success("Comment added at " + c.timecode); renderList(); },
            function (er) { FE.busy(add, false); FE.toast.error("Comment not saved", er.message); });
        }
      } else {
        var cur = p.current.reviewStatus, msg = cur === "APPROVED" ? "This version is approved, so it's closed for new notes." : cur === "SUPERSEDED" ? "A newer version replaced this one. Add notes on the latest version." : !staff && cur === "CHANGES_REQUESTED" ? "Your notes were sent. I’ll upload a new version soon." : "Notes can't be added right now.";
        composer.innerHTML = '<p class="mb-3 rounded-xl bg-surface-2 px-3 py-2.5 text-xs text-muted">' + esc(msg) + "</p>";
      }
    }
    function renderList() {
      var rs = roots(), shown = rs.filter(function (c) { return filter === "open" ? ["OPEN", "IN_PROGRESS"].indexOf(c.status) >= 0 : filter === "resolved" ? ["RESOLVED", "REJECTED", "CLOSED"].indexOf(c.status) >= 0 : true; });
      $("[data-count]", root).textContent = "(" + rs.length + ")";
      $$("[data-filter]", root).forEach(function (b) { var on = b.getAttribute("data-filter") === filter; b.setAttribute("aria-selected", on ? "true" : "false"); b.className = "rounded-md px-2.5 py-1 capitalize transition " + (on ? "bg-surface shadow-soft" : "text-muted hover:text-fg"); });
      var openCount = rs.filter(function (c) { return ["OPEN", "IN_PROGRESS"].indexOf(c.status) >= 0; }).length; root.__openCount = openCount; var oc = $("[data-open-notes]"); if (oc) oc.textContent = openCount;
      if (!shown.length) {
        list.innerHTML = '<div class="rounded-2xl border border-dashed border-line-strong px-5 py-10 text-center">' + FE.icon("message", 22, "mx-auto text-subtle") + '<p class="mt-2 text-sm font-semibold">' + (rs.length ? "No notes match this filter" : "No notes yet") + "</p>" +
          (!rs.length ? '<p class="mx-auto mt-1 max-w-[16rem] text-xs text-muted">' + (perms.canComment ? "Pause the video where you want a change and add a note. It's saved with the exact timestamp." : "Feedback added on this version will show up here.") + "</p>" : "") + "</div>";
        drawMarkers(); return;
      }
      list.innerHTML = shown.map(function (c) {
        var rep = replies(c.id), st = REV[c.status] || [c.status, "bg-surface-2 text-muted"], mine = c.authorId === me.id, done = ["RESOLVED", "CLOSED", "REJECTED"].indexOf(c.status) >= 0;
        var act = "";
        if (perms.canComment || staff) act += '<button type="button" data-reply="' + esc(c.id) + '" class="rounded-md px-2 py-1 text-muted hover:bg-surface-2 hover:text-fg">Reply</button>';
        if (perms.canTriage) {
          act += c.status !== "RESOLVED" ? '<button type="button" data-status="RESOLVED" data-id="' + esc(c.id) + '" class="rounded-md px-2 py-1 text-success hover:bg-success-soft">Resolve</button>' : '<button type="button" data-status="OPEN" data-id="' + esc(c.id) + '" class="rounded-md px-2 py-1 text-muted hover:bg-surface-2">Reopen</button>';
          if (c.status === "OPEN") act += '<button type="button" data-status="IN_PROGRESS" data-id="' + esc(c.id) + '" class="rounded-md px-2 py-1 text-info hover:bg-info-soft">Start</button>';
          if (c.status !== "REJECTED") act += '<button type="button" data-status="REJECTED" data-id="' + esc(c.id) + '" class="rounded-md px-2 py-1 text-muted hover:bg-surface-2" title="Won\'t do — explain in a reply">Won\'t do</button>';
        } else if (mine && perms.canComment) {
          if (c.status === "OPEN") act += '<button type="button" data-status="CLOSED" data-id="' + esc(c.id) + '" class="rounded-md px-2 py-1 text-muted hover:bg-surface-2">Withdraw</button>';
          else if (c.status === "CLOSED") act += '<button type="button" data-status="OPEN" data-id="' + esc(c.id) + '" class="rounded-md px-2 py-1 text-muted hover:bg-surface-2">Reopen</button>';
        }
        return '<article id="c-' + esc(c.id) + '" class="rounded-2xl border border-line bg-surface p-3.5 transition' + (done ? " opacity-75" : "") + '"><div class="flex items-start gap-2.5"><button type="button" data-seek="' + c.timecodeMs + '" class="mt-0.5 shrink-0 rounded-lg bg-fg px-2 py-1 font-mono text-xs font-bold text-bg hover:bg-accent hover:text-accent-fg" aria-label="Jump to ' + esc(c.timecode) + '">' + esc(c.timecode) + "</button>" +
          '<div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-x-2 text-xs"><b>' + (mine ? "You" : esc(c.author)) + "</b>" + (c.isStaff ? '<span class="rounded bg-accent-soft px-1 py-0.5 text-xs font-bold ">Studio</span>' : "") + '<span class="text-subtle" data-ago="' + esc(c.createdAt) + '"></span></div><p class="mt-1 whitespace-pre-wrap break-words text-sm leading-snug">' + esc(c.comment) + "</p></div>" +
          '<span class="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold leading-none ' + st[1] + '">' + esc(st[0]) + "</span></div>" +
          (rep.length ? '<ul class="mt-3 space-y-2 border-l-2 border-line pl-3">' + rep.map(function (r) { return '<li class="text-sm"><div class="text-xs"><b>' + (r.authorId === me.id ? "You" : esc(r.author)) + "</b>" + (r.isStaff ? '<span class="ml-1.5 rounded bg-accent-soft px-1 py-0.5 text-xs font-bold ">Studio</span>' : "") + '<span class="ml-2 text-subtle" data-ago="' + esc(r.createdAt) + '"></span></div><p class="mt-0.5 whitespace-pre-wrap break-words">' + esc(r.comment) + "</p></li>"; }).join("") + "</ul>" : "") +
          '<div class="mt-2.5 flex flex-wrap items-center gap-1 text-xs font-semibold">' + act + "</div>" +
          (replyTo === c.id ? '<div class="mt-2 flex items-end gap-2"><label class="sr-only" for="reply-' + esc(c.id) + '">Reply</label><textarea id="reply-' + esc(c.id) + '" rows="2" placeholder="Write a reply…" class="flex-1 resize-none rounded-xl border border-line-strong bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none"></textarea><button type="button" data-send-reply="' + esc(c.id) + '" class="inline-flex h-9 items-center justify-center rounded-lg bg-accent px-3.5 text-sm font-semibold text-accent-fg">Reply</button></div>' : "") + "</article>";
      }).join("");
      FE.refreshTimes(); drawMarkers(); highlightActive();
      if (replyTo) { var rt = $("#reply-" + replyTo, list); if (rt) rt.focus(); }
    }
    list.addEventListener("click", function (e) {
      var s = e.target.closest("[data-seek]"); if (s) { seek(Number(s.getAttribute("data-seek"))); return; }
      var rp = e.target.closest("[data-reply]"); if (rp) { replyTo = replyTo === rp.getAttribute("data-reply") ? null : rp.getAttribute("data-reply"); renderList(); return; }
      var st = e.target.closest("[data-status]");
      if (st) { FE.api("/api/video-comments/" + st.getAttribute("data-id"), { method: "PATCH", body: { status: st.getAttribute("data-status") } }).then(function (c) { comments = comments.map(function (x) { return x.id === c.id ? c : x; }); renderList(); }, function (er) { FE.toast.error("Couldn't update the note", er.message); }); return; }
      var sr = e.target.closest("[data-send-reply]");
      if (sr) {
        var c = comments.filter(function (x) { return x.id === sr.getAttribute("data-send-reply"); })[0], ta = $("#reply-" + c.id, list), text = ta.value.trim(); if (!text) return; FE.busy(sr, true);
        FE.api("/api/video-versions/" + p.current.id + "/comments", { body: { timecodeMs: c.timecodeMs, comment: text, parentId: c.id } }).then(function (r) { comments.push(r); replyTo = null; FE.toast.success("Reply added"); renderList(); }, function (er) { FE.busy(sr, false); FE.toast.error("Comment not saved", er.message); });
      }
    });
    $$("[data-filter]", root).forEach(function (b) { b.addEventListener("click", function () { filter = b.getAttribute("data-filter"); renderList(); }); });

    mountVideo(); renderComposer(); renderList(); paint(); setInterval(function () { FE.refreshTimes(); }, 60000);
  };

  // page-level: version switcher + compare select
  document.addEventListener("change", function (e) {
    var v = e.target.closest("#version-select"); if (v) { window.location.href = v.getAttribute("data-base") + v.value; return; }
    var c = e.target.closest("#compare-select"); if (c && c.value) { FE.review.compare(c.value); c.value = ""; $("#stop-compare").hidden = false; c.closest("label").hidden = true; }
  });
  document.addEventListener("click", function (e) {
    var s = e.target.closest("#stop-compare"); if (s) { FE.review.compare(null); s.hidden = true; var l = $("#compare-select").closest("label"); l.hidden = false; }
    var cb = e.target.closest("[data-open-changes]"); if (cb) { var n = $("[data-open-notes]"); var modalCount = $("#changes-count"); if (modalCount && n) modalCount.textContent = n.textContent; }
  });
  FE.handlers.approveDone = function () { return true; };
  FE.handlers.approvePrep = function (body, form) { if (!form.querySelector('[name=sure]').checked) { FE.showFieldErrors(form, { sure: "Tick the box to confirm." }); return false; } delete body.sure; body.confirmVersionNumber = Number(body.confirmVersionNumber); return body; };
})();
