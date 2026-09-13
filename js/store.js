const ArcStore = (() => {
  const KEY = "arc.v1";

  function empty() {
    return {
      notes: [],
      loops: [],
      films: [],
      briefs: {},
      demoLoaded: false,
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return empty();
      const data = JSON.parse(raw);
      return { ...empty(), ...data, briefs: data.briefs || {} };
    } catch {
      return empty();
    }
  }

  function save(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
    return state;
  }

  function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
  }

  function addNote(state, note) {
    const row = { id: uid(), createdAt: note.createdAt || Date.now(), ...note };
    if (!row.id) row.id = uid();
    state.notes.unshift(row);
    return save(state);
  }

  function upsertLoops(state, extracted, noteId) {
    extracted.forEach((item) => {
      const existing = state.loops.find(
        (loop) => loop.status === "open" && loop.text.toLowerCase() === item.text.toLowerCase()
      );
      if (existing) {
        existing.updatedAt = Date.now();
        existing.noteId = noteId;
        if (item.person && !existing.person) existing.person = item.person;
        return;
      }
      state.loops.unshift({
        id: uid(),
        text: item.text,
        person: item.person || "",
        status: "open",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        noteId,
      });
    });
    return save(state);
  }

  function setLoopStatus(state, id, status) {
    const loop = state.loops.find((item) => item.id === id);
    if (!loop) return state;
    loop.status = status;
    loop.updatedAt = Date.now();
    if (status !== "open") loop.closedAt = Date.now();
    return save(state);
  }

  function saveFilm(state, film) {
    state.films.unshift({ id: uid(), createdAt: Date.now(), ...film });
    return save(state);
  }

  function saveBrief(state, brief) {
    state.briefs = state.briefs || {};
    state.briefs[brief.date] = brief;
    return save(state);
  }

  function reset() {
    localStorage.removeItem(KEY);
    return empty();
  }

  return {
    load,
    save,
    addNote,
    upsertLoops,
    setLoopStatus,
    saveFilm,
    saveBrief,
    reset,
    uid,
    empty,
  };
})();
