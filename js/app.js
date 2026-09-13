(() => {
  const views = ["today", "loops", "film", "notes"];
  let state = ArcStore.load();
  let active = "today";
  let recognizing = null;
  let seconds = 90;
  let tick = null;
  let draft = "";
  let busy = false;
  let mediaRecorder = null;
  let audioChunks = [];
  let audioBlob = null;
  let pendingLoopId = null;
  let briefAttempted = false;

  const $ = (id) => document.getElementById(id);

  function greeting() {
    const hour = new Date().getHours();
    if (hour < 12) return "Morning.";
    if (hour < 18) return "Afternoon.";
    return "Tonight.";
  }

  function prettyDate(ts) {
    return new Date(ts).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function daysAgo(ts) {
    const days = Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000));
    if (days <= 0) return "today";
    if (days === 1) return "1 day ago";
    return `${days} days ago`;
  }

  function ageClass(ts) {
    const days = Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000));
    if (days >= 14) return "overdue";
    if (days >= 7) return "stale";
    return "";
  }

  function todayKey() {
    return new Date().toDateString();
  }

  function todayNotes() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return state.notes.filter((note) => note.createdAt >= start.getTime());
  }

  function openLoops() {
    return state.loops.filter((loop) => loop.status === "open");
  }

  function chips(list, kind) {
    return (list || [])
      .map((item) => `<span class="chip ${kind}">${escapeHtml(item)}</span>`)
      .join("");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showReceipt(text) {
    const el = $("receipt");
    if (!el || !text) return;
    el.hidden = false;
    el.textContent = text;
  }

  function setStatus(on) {
    const el = $("ai-status");
    if (!el) return;
    el.textContent = on ? "AI on · Inkling" : "Connect AI";
    el.classList.toggle("ready", on);
  }

  function show(name) {
    active = name;
    views.forEach((view) => {
      const node = $(`view-${view}`);
      if (node) node.classList.toggle("active", view === name);
      const btn = document.querySelector(`[data-view="${view}"]`);
      if (btn) btn.setAttribute("aria-current", view === name ? "page" : "false");
    });
    render();
  }

  function renderBrief() {
    const root = $("brief-root");
    if (!root) return;
    const brief = (state.briefs || {})[todayKey()];
    if (!brief) {
      root.innerHTML = `
        <article class="card brief-card">
          <p class="meta">Morning brief</p>
          <h3>Three things. Nothing else.</h3>
          <p class="meta">Inkling writes this from open loops — not a feed.</p>
          <div class="toolbar">
            <button class="btn" id="btn-brief" type="button">Write this morning's brief</button>
          </div>
        </article>`;
      const btn = $("btn-brief");
      if (btn) btn.addEventListener("click", writeBrief);
      return;
    }
    root.innerHTML = `
      <article class="card brief-card">
        <p class="meta">Morning brief · Inkling</p>
        <h3>${escapeHtml(brief.headline)}</h3>
        <ol class="brief-list">
          ${(brief.items || [])
            .map(
              (item) =>
                `<li>${escapeHtml(item.text)}${item.person ? ` <span class="meta">${escapeHtml(item.person)}</span>` : ""}</li>`
            )
            .join("")}
        </ol>
        ${brief.drift ? `<p>${escapeHtml(brief.drift)}</p>` : ""}
        <div class="toolbar">
          <button class="btn btn-ghost" id="btn-brief" type="button">Rewrite brief</button>
        </div>
      </article>`;
    const btn = $("btn-brief");
    if (btn) btn.addEventListener("click", writeBrief);
  }

  function renderToday() {
    const notes = todayNotes();
    $("greet-title").textContent = greeting();
    $("greet-sub").textContent = new Date().toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    const openCount = openLoops().length;
    $("today-open").textContent = openCount
      ? `${openCount} open loop${openCount === 1 ? "" : "s"}`
      : "No open loops";
    renderBrief();

    if (!notes.length) {
      $("today-cards").innerHTML = "";
      return;
    }
    $("today-cards").innerHTML = notes
      .map(
        (note) => `
        <article class="card">
          <p class="meta">Tonight's card · ${prettyDate(note.createdAt)}${note.whisper ? " · Whisper" : " · Inkling"}</p>
          <h3>${escapeHtml(note.summary)}</h3>
          <p class="note-text">${escapeHtml(note.text)}</p>
          <div class="chips">
            ${chips(note.people, "person")}
            ${chips((note.loops || []).map((loop) => loop.text || loop), "loop")}
            ${chips(note.wants, "want")}
          </div>
        </article>`
      )
      .join("");
  }

  function renderLoops() {
    const open = openLoops();
    const closed = state.loops.filter((loop) => loop.status !== "open").slice(0, 8);
    if (!state.loops.length) {
      $("loops-list").innerHTML = `
        <div class="card empty">
          <h2>No threads yet</h2>
          <p>Speak a night. AI pulls the promises — not a pattern matcher.</p>
        </div>`;
      return;
    }
    const row = (loop) => `
      <article class="card loop ${loop.status !== "open" ? "closed" : ""}">
        <div>
          <p>${escapeHtml(loop.text)}</p>
          <p class="age ${ageClass(loop.createdAt)}">${loop.person ? escapeHtml(loop.person) + " · " : ""}${daysAgo(loop.createdAt)}${loop.status !== "open" ? " · " + loop.status : ""}</p>
        </div>
        <div class="loop-actions">
          ${
            loop.status === "open"
              ? `<button class="btn" data-close="${loop.id}">Done</button>
                 <button class="btn" data-draft="${loop.id}">Draft the text</button>
                 <button class="btn btn-ghost" data-loop="${loop.id}" data-status="let-go">Let it go</button>`
              : ""
          }
        </div>
      </article>`;
    $("loops-list").innerHTML = `
      <p class="meta">${open.length} open · inbox-zero for being a decent human</p>
      ${open.map(row).join("") || "<div class=\"card\"><p>All loops closed. Rare.</p></div>"}
      ${closed.length ? `<h2 class="closed-heading">Closed</h2>${closed.map(row).join("")}` : ""}
    `;
  }

  function currentFilm() {
    const label = ArcFilm.weekLabel();
    return (state.films || []).find((film) => film.weekLabel === label && film.source === "ai") || null;
  }

  function renderFilm() {
    const notes = ArcFilm.weekNotes(state.notes);
    const film = currentFilm();
    const open = openLoops();
    if (!film) {
      $("film-root").innerHTML = `
        <div class="card empty">
          <h2>${escapeHtml(ArcFilm.weekLabel())}</h2>
          <p>${notes.length ? `${notes.length} scene${notes.length === 1 ? "" : "s"} waiting. Inkling writes the film.` : "Talk through the week first. Then generate the film."}</p>
          <div class="toolbar" style="justify-content:center;margin-top:16px">
            <button class="btn btn-primary" id="btn-write-film" type="button" ${notes.length ? "" : "disabled"}>Write this week's film</button>
          </div>
        </div>`;
      const btn = $("btn-write-film");
      if (btn) btn.addEventListener("click", writeFilm);
      return;
    }
    const people = film.people.length
      ? film.people.map((p) => `<span class="chip person">${escapeHtml(p)}</span>`).join("")
      : `<span class="chip">No names yet</span>`;
    const loops = (film.openLoops || open).length
      ? (film.openLoops || open).map((loop) => `<p>${escapeHtml(loop.text || loop)}</p>`).join("")
      : "<p>Nothing left hanging.</p>";
    const scenes = (film.scenes || [])
      .map((scene) => `<div class="scene"><h3>${escapeHtml(scene.label)}</h3><p>${escapeHtml(scene.text)}</p></div>`)
      .join("");
    $("film-root").innerHTML = `
      <article class="film">
        <div class="film-hero">
          <p>${escapeHtml(film.weekLabel)} · ${film.noteCount} scene${film.noteCount === 1 ? "" : "s"} · Inkling</p>
          <h2>${escapeHtml(film.title)}</h2>
        </div>
        <div class="film-body">
          ${scenes}
          <div class="scene"><h3>Cast</h3><div class="chips">${people}</div></div>
          <div class="scene"><h3>Open loops</h3>${loops}</div>
          <div class="scene"><h3>Drift</h3><p>${escapeHtml(film.drift)}</p></div>
          <div class="scene"><h3>Closing</h3><p>${escapeHtml(film.closing)}</p></div>
          <div class="toolbar" style="margin-top:16px">
            <button class="btn" id="btn-write-film" type="button">Rewrite film</button>
          </div>
        </div>
      </article>`;
    const btn = $("btn-write-film");
    if (btn) btn.addEventListener("click", writeFilm);
  }

  function renderNotes() {
    if (!state.notes.length) {
      $("notes-list").innerHTML = `<div class="card empty"><h2>No notes</h2><p>Your private reel lives in this browser.</p></div>`;
      return;
    }
    $("notes-list").innerHTML = state.notes
      .map(
        (note) => `
        <article class="card">
          <p class="meta">${prettyDate(note.createdAt)}${note.whisper ? " · Whisper" : " · AI"}</p>
          <p class="note-text">${escapeHtml(note.text)}</p>
        </article>`
      )
      .join("");
  }

  function render() {
    setStatus(true);
    if (active === "today") renderToday();
    if (active === "loops") renderLoops();
    if (active === "film") renderFilm();
    if (active === "notes") renderNotes();
  }

  function openRecorder() {
    draft = "";
    audioBlob = null;
    audioChunks = [];
    seconds = 90;
    $("draft").value = "";
    $("timer").textContent = "1:30";
    $("listening").textContent = "";
    $("recorder").classList.add("open");
    $("draft").focus();
  }

  function closeRecorder() {
    stopCapture();
    $("recorder").classList.remove("open");
  }

  function openSettings(message) {
    const cfg = ArcAI.load();
    $("ai-provider").value = cfg.provider || "openrouter";
    $("ai-model").value = cfg.model || "thinkingmachines/inkling:free";
    $("ai-key").value = cfg.apiKey || "";
    $("settings-msg").textContent = message || "Key stays in this browser or in a local .env file.";
    $("settings").classList.add("open");
  }

  function closeSettings() {
    $("settings").classList.remove("open");
  }

  function saveSettings() {
    ArcAI.save({
      provider: $("ai-provider").value,
      model: $("ai-model").value.trim(),
      apiKey: $("ai-key").value.trim(),
    });
    closeSettings();
    render();
  }

  function speechEngine() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  async function startCapture() {
    stopCapture();
    audioChunks = [];
    audioBlob = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      mediaRecorder = mime ? new MediaRecorder(stream) : new MediaRecorder(stream);
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size) audioChunks.push(event.data);
      };
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (audioChunks.length) {
          audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || "audio/webm" });
        }
      };
      mediaRecorder.start();
    } catch {
      $("listening").textContent = "Mic blocked. Type instead — Inkling still reads it.";
    }

    const Ctor = speechEngine();
    if (Ctor) {
      const rec = new Ctor();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = navigator.language || "en-US";
      rec.onresult = (event) => {
        let finalText = "";
        let interim = "";
        for (let i = 0; i < event.results.length; i += 1) {
          const chunk = event.results[i][0].transcript;
          if (event.results[i].isFinal) finalText += chunk + " ";
          else interim += chunk;
        }
        draft = (finalText + interim).trim();
        $("draft").value = draft;
      };
      rec.onend = () => {
        recognizing = null;
      };
      rec.start();
      recognizing = rec;
    }
    $("btn-listen").textContent = "Recording…";
    $("listening").textContent = "Recording. Whisper will transcribe on save.";
    if (!tick) {
      tick = setInterval(() => {
        seconds -= 1;
        const m = Math.floor(Math.max(seconds, 0) / 60);
        const s = String(Math.max(seconds, 0) % 60).padStart(2, "0");
        $("timer").textContent = `${m}:${s}`;
        if (seconds <= 0) saveNote();
      }, 1000);
    }
  }

  function stopCapture() {
    if (recognizing) {
      try {
        recognizing.stop();
      } catch {}
      recognizing = null;
    }
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      try {
        mediaRecorder.stop();
      } catch {}
    }
    mediaRecorder = null;
    clearInterval(tick);
    tick = null;
    $("btn-listen").textContent = "Start recording";
  }

  async function waitForAudio() {
    if (audioBlob) return audioBlob;
    if (!audioChunks.length) return null;
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (!audioBlob && audioChunks.length) {
      audioBlob = new Blob(audioChunks, { type: "audio/webm" });
    }
    return audioBlob;
  }

  async function saveNote() {
    if (busy) return;
    stopCapture();
    const live = ($("draft").value || draft).trim();
    $("listening").textContent = "Whisper is listening to the recording…";
    $("btn-save").disabled = true;
    busy = true;
    try {
      const blob = await waitForAudio();
      let text = live;
      let whisper = false;
      let messy = Boolean(live);
      if (blob && blob.size > 1000) {
        try {
          const heard = await ArcAI.transcribe(blob);
          if (heard) {
            text = heard;
            $("draft").value = heard;
            whisper = true;
            messy = false;
          }
        } catch (err) {
          $("listening").textContent = `${err.message} Using the live transcript. Inkling will clean it.`;
          messy = true;
        }
      }
      text = (text || live).trim();
      if (!text) throw new Error("Say or type something first.");
      $("listening").textContent = "Inkling is reading the night…";
      const analysis = await ArcAI.analyze(text, {
        recent: ArcFilm.recentContext(state.notes),
        openLoops: openLoops(),
        messy,
      });
      state = ArcStore.addNote(state, {
        text,
        summary: analysis.summary,
        people: analysis.people,
        loops: analysis.loops,
        wants: analysis.wants,
        source: "ai",
        whisper,
      });
      state = ArcStore.upsertLoops(state, analysis.loops, state.notes[0].id);
      closeRecorder();
      showReceipt(ArcAI.receiptLine());
      show("today");
    } catch (err) {
      $("listening").textContent = err.message || "AI failed. Nothing was guessed.";
    } finally {
      busy = false;
      $("btn-save").disabled = false;
    }
  }

  async function writeFilm() {
    if (busy) return;
    const notes = ArcFilm.weekNotes(state.notes);
    if (!notes.length) return;
    busy = true;
    $("film-root").innerHTML = `<div class="card empty"><h2>Writing the film…</h2><p>Inkling is watching the week, not a template.</p></div>`;
    try {
      const film = await ArcAI.writeFilm({
        weekLabel: ArcFilm.weekLabel(),
        notes,
        openLoops: openLoops(),
      });
      state.films = (state.films || []).filter((item) => item.weekLabel !== film.weekLabel);
      state = ArcStore.saveFilm(state, film);
      showReceipt(ArcAI.receiptLine());
      show("film");
    } catch (err) {
      $("film-root").innerHTML = `<div class="card empty"><h2>Could not write the film</h2><p>${escapeHtml(err.message || "AI failed")}</p><div class="toolbar" style="justify-content:center;margin-top:16px"><button class="btn" id="btn-write-film" type="button">Try again</button></div></div>`;
      const btn = $("btn-write-film");
      if (btn) btn.addEventListener("click", writeFilm);
    } finally {
      busy = false;
    }
  }

  async function writeBrief() {
    if (busy) return;
    if (!openLoops().length && !state.notes.length) return;
    busy = true;
    const root = $("brief-root");
    if (root) root.innerHTML = `<article class="card brief-card"><h3>Writing the brief…</h3></article>`;
    try {
      const brief = await ArcAI.morningBrief({
        openLoops: openLoops(),
        notes: state.notes,
        film: currentFilm(),
      });
      state = ArcStore.saveBrief(state, brief);
      showReceipt(ArcAI.receiptLine());
      renderToday();
    } catch (err) {
      if (root) {
        root.innerHTML = `<article class="card brief-card"><h3>Could not write the brief</h3><p class="meta">${escapeHtml(err.message || "AI failed")}</p><button class="btn" id="btn-brief" type="button">Try again</button></article>`;
        const btn = $("btn-brief");
        if (btn) btn.addEventListener("click", writeBrief);
      }
    } finally {
      busy = false;
    }
  }

  async function loadDemo() {
    if (state.demoLoaded && state.notes.length) {
      show("film");
      return;
    }
    busy = true;
    $("today-cards").innerHTML = `<div class="card empty"><h2>Reading a sample week…</h2><p>Five nights, one Inkling pass.</p></div>`;
    try {
      const raw = ArcFilm.sampleTexts();
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;
      const analyses = await ArcAI.analyzeMany(raw.map((item) => ({ text: item.text })));
      raw.forEach((item, i) => {
        const analysis = analyses[i];
        state = ArcStore.addNote(state, {
          text: item.text,
          createdAt: now - item.daysAgo * day - 3 * 60 * 60 * 1000,
          summary: analysis.summary,
          people: analysis.people,
          loops: analysis.loops,
          wants: analysis.wants,
          source: "demo",
        });
        state = ArcStore.upsertLoops(state, analysis.loops, state.notes[0].id);
      });
      state.demoLoaded = true;
      ArcStore.save(state);
      showReceipt(ArcAI.receiptLine());
      await writeFilm();
    } catch (err) {
      alert(err.message || "AI failed on the sample week.");
      render();
    } finally {
      busy = false;
    }
  }

  async function draftLoop(id) {
    const loop = state.loops.find((item) => item.id === id);
    if (!loop) return;
    busy = true;
    try {
      const note = state.notes.find((item) => item.id === loop.noteId);
      const message = await ArcAI.draftMessage(loop, note);
      $("close-draft").hidden = false;
      $("close-draft").value = message;
      if (!$("close-loop").classList.contains("open")) {
        window.prompt("Copy this. Arc does not send it.", message);
      }
      showReceipt(ArcAI.receiptLine());
    } catch (err) {
      alert(err.message || "Could not draft.");
    } finally {
      busy = false;
    }
  }

  function askClose(id) {
    const loop = state.loops.find((item) => item.id === id);
    if (!loop) return;
    pendingLoopId = id;
    $("close-copy").textContent = loop.person
      ? `${loop.person}: ${loop.text}`
      : loop.text;
    $("close-draft").hidden = true;
    $("close-draft").value = "";
    $("close-loop").classList.add("open");
  }

  function markDone() {
    if (!pendingLoopId) return;
    state = ArcStore.setLoopStatus(state, pendingLoopId, "done");
    pendingLoopId = null;
    $("close-loop").classList.remove("open");
    renderLoops();
  }

  function clearAll() {
    if (!confirm("Erase this browser's Arc? This cannot be undone.")) return;
    state = ArcStore.reset();
    show("today");
  }

  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => show(btn.dataset.view));
  });
  $("btn-record").addEventListener("click", openRecorder);
  $("btn-close").addEventListener("click", closeRecorder);
  $("btn-listen").addEventListener("click", startCapture);
  $("btn-save").addEventListener("click", saveNote);
  $("btn-demo").addEventListener("click", loadDemo);
  $("btn-clear").addEventListener("click", clearAll);
  $("ai-status").addEventListener("click", () => openSettings());
  $("btn-save-settings").addEventListener("click", saveSettings);
  $("btn-close-settings").addEventListener("click", closeSettings);
  $("btn-sent").addEventListener("click", markDone);
  $("btn-draft-close").addEventListener("click", () => {
    if (pendingLoopId) draftLoop(pendingLoopId);
  });
  $("btn-cancel-close").addEventListener("click", () => {
    pendingLoopId = null;
    $("close-loop").classList.remove("open");
  });
  $("recorder").addEventListener("click", (event) => {
    if (event.target.id === "recorder") closeRecorder();
  });
  $("settings").addEventListener("click", (event) => {
    if (event.target.id === "settings") closeSettings();
  });
  $("close-loop").addEventListener("click", (event) => {
    if (event.target.id === "close-loop") {
      pendingLoopId = null;
      $("close-loop").classList.remove("open");
    }
  });
  $("loops-list").addEventListener("click", (event) => {
    const closeBtn = event.target.closest("[data-close]");
    if (closeBtn) {
      askClose(closeBtn.dataset.close);
      return;
    }
    const draftBtn = event.target.closest("[data-draft]");
    if (draftBtn) {
      draftLoop(draftBtn.dataset.draft);
      return;
    }
    const btn = event.target.closest("[data-loop]");
    if (!btn) return;
    state = ArcStore.setLoopStatus(state, btn.dataset.loop, btn.dataset.status);
    renderLoops();
  });

  const boot = ArcAI.load();
  if (!boot.model) boot.model = "thinkingmachines/inkling:free";
  if (!boot.provider) boot.provider = "openrouter";
  ArcAI.save(boot);
  render();
  if (new URLSearchParams(location.search).get("demo") === "1") loadDemo();
  else if (openLoops().length && !(state.briefs || {})[todayKey()] && !briefAttempted) {
    briefAttempted = true;
    if (new Date().getHours() < 12) writeBrief();
  }
})();
