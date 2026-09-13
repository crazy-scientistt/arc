(() => {
  const views = ["today", "loops", "film", "notes"];
  let state = ArcStore.load();
  let active = "today";
  let recognizing = null;
  let seconds = 90;
  let tick = null;
  let draft = "";

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

  function todayNotes() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return state.notes.filter((note) => note.createdAt >= start.getTime());
  }

  function chips(list, kind) {
    return (list || []).map((item) => `<span class="chip ${kind}">${escapeHtml(item)}</span>`).join("");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function show(name) {
    active = name;
    views.forEach((view) => {
      $(`view-${view}`).classList.toggle("active", view === name);
      const btn = document.querySelector(`[data-view="${view}"]`);
      if (btn) btn.setAttribute("aria-current", view === name ? "page" : "false");
    });
    render();
  }

  function renderToday() {
    const notes = todayNotes();
    $("greet-title").textContent = greeting();
    $("greet-sub").textContent = new Date().toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    const openCount = state.loops.filter((loop) => loop.status === "open").length;
    $("today-open").textContent = openCount
      ? `${openCount} open loop${openCount === 1 ? "" : "s"}`
      : "No open loops";

    if (!notes.length) {
      $("today-cards").innerHTML = "";
      return;
    }

    $("today-cards").innerHTML = notes
      .map(
        (note) => `
        <article class="card">
          <p class="meta">Tonight's card · ${prettyDate(note.createdAt)}</p>
          <h3>${escapeHtml(note.summary)}</h3>
          <p class="note-text">${escapeHtml(note.text)}</p>
          <div class="chips">
            ${chips(note.people, "person")}
            ${chips((note.loops || []).map((loop) => loop.text), "loop")}
            ${chips(note.wants, "want")}
          </div>
        </article>`
      )
      .join("");
  }

  function renderLoops() {
    const open = state.loops.filter((loop) => loop.status === "open");
    const closed = state.loops.filter((loop) => loop.status !== "open").slice(0, 8);
    if (!state.loops.length) {
      $("loops-list").innerHTML = `
        <div class="card empty">
          <h2>No threads yet</h2>
          <p>Promises hide in ordinary sentences. Record a night and Arc will pull them out.</p>
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
              ? `<button class="btn" data-loop="${loop.id}" data-status="done">Done</button>
                 <button class="btn" data-loop="${loop.id}" data-status="open">Still open</button>
                 <button class="btn btn-ghost" data-loop="${loop.id}" data-status="let-go">Let it go</button>`
              : ""
          }
        </div>
      </article>`;

    $("loops-list").innerHTML = `
      <p class="meta">${open.length} open · inbox-zero for being a decent human</p>
      ${open.map(row).join("") || "<div class=\"card\"><p>All loops closed. Rare.</p></div>"}
      ${closed.length ? `<h2 style="font-family:var(--serif);font-weight:400;margin:32px 0 12px">Closed</h2>${closed.map(row).join("")}` : ""}
    `;
  }

  function renderFilm() {
    const film = ArcFilm.generate(state);
    const people = film.people.length
      ? film.people.map((p) => `<span class="chip person">${escapeHtml(p)}</span>`).join("")
      : `<span class="chip">No names yet</span>`;
    const loops = film.openLoops.length
      ? film.openLoops.map((loop) => `<p>${escapeHtml(loop.text)}</p>`).join("")
      : "<p>Nothing left hanging.</p>";
    const scenes = film.scenes.length
      ? film.scenes.map((scene) => `<div class="scene"><h3>${escapeHtml(scene.label)}</h3><p>${escapeHtml(scene.text)}</p></div>`).join("")
      : `<div class="scene"><h3>Opening</h3><p>The week is still blank. That is the plot, if you let it be.</p></div>`;

    $("film-root").innerHTML = `
      <article class="film">
        <div class="film-hero">
          <p>${escapeHtml(film.weekLabel)} · ${film.noteCount} scene${film.noteCount === 1 ? "" : "s"}</p>
          <h2>${escapeHtml(film.title)}</h2>
        </div>
        <div class="film-body">
          ${scenes}
          <div class="scene"><h3>Cast</h3><div class="chips">${people}</div></div>
          <div class="scene"><h3>Open loops</h3>${loops}</div>
          <div class="scene"><h3>Drift</h3><p>${escapeHtml(film.drift)}</p></div>
          <div class="scene"><h3>Closing</h3><p>${escapeHtml(film.closing)}</p></div>
        </div>
      </article>`;
  }

  function renderNotes() {
    if (!state.notes.length) {
      $("notes-list").innerHTML = `<div class="card empty"><h2>No notes</h2><p>Your private reel lives in this browser until you export it.</p></div>`;
      return;
    }
    $("notes-list").innerHTML = state.notes
      .map(
        (note) => `
        <article class="card">
          <p class="meta">${prettyDate(note.createdAt)}${note.source === "demo" ? " · sample week" : ""}</p>
          <p class="note-text">${escapeHtml(note.text)}</p>
        </article>`
      )
      .join("");
  }

  function render() {
    if (active === "today") renderToday();
    if (active === "loops") renderLoops();
    if (active === "film") renderFilm();
    if (active === "notes") renderNotes();
  }

  function openRecorder() {
    draft = "";
    seconds = 90;
    $("draft").value = "";
    $("timer").textContent = "1:30";
    $("listening").textContent = "";
    $("recorder").classList.add("open");
    $("draft").focus();
  }

  function closeRecorder() {
    stopSpeech();
    clearInterval(tick);
    tick = null;
    $("recorder").classList.remove("open");
  }

  function speechEngine() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  function startSpeech() {
    const Ctor = speechEngine();
    if (!Ctor) {
      $("listening").textContent = "Live voice needs Chrome or Safari. Type instead — it still counts.";
      return;
    }
    stopSpeech();
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
    rec.onerror = () => {
      $("listening").textContent = "Microphone blocked or unavailable. Type the night instead.";
    };
    rec.onend = () => {
      recognizing = null;
      $("btn-listen").textContent = "Start listening";
    };
    rec.start();
    recognizing = rec;
    $("btn-listen").textContent = "Listening…";
    $("listening").textContent = "Listening. Talk.";
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

  function stopSpeech() {
    if (recognizing) {
      try { recognizing.stop(); } catch {}
      recognizing = null;
    }
    $("btn-listen").textContent = "Start listening";
  }

  function saveNote() {
    const text = ($("draft").value || draft).trim();
    if (!text) {
      $("listening").textContent = "Say or type something first.";
      return;
    }
    const analysis = ArcExtract.analyze(text);
    state = ArcStore.addNote(state, {
      text,
      summary: analysis.summary,
      people: analysis.people,
      loops: analysis.loops,
      wants: analysis.wants,
      source: "live",
    });
    const noteId = state.notes[0].id;
    state = ArcStore.upsertLoops(state, analysis.loops, noteId);
    closeRecorder();
    show("today");
  }

  function loadDemo() {
    if (state.demoLoaded && state.notes.length) {
      show("film");
      return;
    }
    const sample = ArcFilm.sampleWeek();
    sample.forEach((note) => {
      state = ArcStore.addNote(state, note);
      state = ArcStore.upsertLoops(state, note.loops, state.notes[0].id);
    });
    state.demoLoaded = true;
    ArcStore.save(state);
    show("film");
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
  $("btn-listen").addEventListener("click", startSpeech);
  $("btn-save").addEventListener("click", saveNote);
  $("btn-demo").addEventListener("click", loadDemo);
  $("btn-clear").addEventListener("click", clearAll);
  $("recorder").addEventListener("click", (event) => {
    if (event.target.id === "recorder") closeRecorder();
  });
  $("loops-list").addEventListener("click", (event) => {
    const btn = event.target.closest("[data-loop]");
    if (!btn) return;
    state = ArcStore.setLoopStatus(state, btn.dataset.loop, btn.dataset.status);
    renderLoops();
  });

  if (new URLSearchParams(location.search).get("demo") === "1") loadDemo();
  else render();
})();
