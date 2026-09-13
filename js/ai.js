const ArcAI = (() => {
  const KEY = "arc.ai.v1";
  let lastUsage = null;

  const DEFAULTS = {
    openai: "gpt-4o-mini",
    openrouter: "thinkingmachines/inkling:free",
    groq: "llama-3.3-70b-versatile",
    anthropic: "claude-3-5-haiku-latest",
  };

  const LANG =
    "The speaker may mix English and Urdu (including Roman Urdu). Understand both. Keep names as spoken. Return loop text in the language the person would actually send.";

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { provider: "openrouter", model: DEFAULTS.openrouter, apiKey: "" };
      const data = JSON.parse(raw);
      return {
        provider: data.provider || "openrouter",
        model: data.model || DEFAULTS.openrouter,
        apiKey: data.apiKey || "",
      };
    } catch {
      return { provider: "openrouter", model: DEFAULTS.openrouter, apiKey: "" };
    }
  }

  function save(config) {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        provider: config.provider,
        model: config.model || "",
        apiKey: config.apiKey || "",
      })
    );
  }

  function ready() {
    return true;
  }

  function usage() {
    return lastUsage;
  }

  function receiptLine() {
    if (!lastUsage) return "";
    const n = lastUsage.chars || 0;
    const via = lastUsage.model ? ` via ${lastUsage.model}` : "";
    return `Sent ${n.toLocaleString()} characters to OpenRouter${via}. Nothing stored by us.`;
  }

  async function complete(messages) {
    const cfg = load();
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: cfg.provider,
        model: cfg.model || DEFAULTS[cfg.provider] || "",
        apiKey: cfg.apiKey,
        messages,
      }),
    });
    let payload;
    try {
      payload = await res.json();
    } catch {
      throw new Error("Arc server did not return JSON. Run python3 server.py, not a static file server.");
    }
    if (!res.ok || !payload.ok) {
      throw new Error(payload.error || `AI request failed (${res.status})`);
    }
    lastUsage = payload.usage || { chars: 0 };
    return payload.data;
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(new Error("Could not read audio"));
      reader.readAsDataURL(blob);
    });
  }

  function audioFormat(blob) {
    const type = (blob && blob.type) || "";
    if (type.includes("ogg")) return "ogg";
    if (type.includes("mp4") || type.includes("m4a")) return "m4a";
    if (type.includes("wav")) return "wav";
    if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
    return "webm";
  }

  async function transcribe(blob) {
    if (!blob || !blob.size) return "";
    const cfg = load();
    const audio = await blobToBase64(blob);
    const res = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: cfg.apiKey,
        audio,
        format: audioFormat(blob),
      }),
    });
    let payload;
    try {
      payload = await res.json();
    } catch {
      throw new Error("Transcription server did not return JSON.");
    }
    if (!res.ok || !payload.ok) {
      throw new Error(payload.error || "Whisper failed");
    }
    lastUsage = payload.usage || lastUsage;
    return String(payload.text || "").trim();
  }

  function normalizeLoops(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item) => {
        if (typeof item === "string") return { text: item, person: "" };
        return {
          text: String(item.text || item.loop || "").trim(),
          person: String(item.person || "").trim(),
        };
      })
      .filter((item) => item.text.length >= 4);
  }

  async function analyze(text, { recent, openLoops, messy } = {}) {
    const data = await complete([
      {
        role: "system",
        content:
          `You are Arc, a private witness for one person's life. Not a chatbot, coach, or therapist. ${LANG} Read tonight in context of recent nights AND still-open loops. Do not extract a loop that is already open unless the person restated it with new detail. If the transcript is messy speech-to-text, reconstruct meaning without inventing facts. Return ONLY JSON: summary (one vivid sentence), people (names actually present), loops (array of {text, person}), wants (short strings). No advice. No moralizing.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          tonight: String(text || "").slice(0, 8000),
          messySpeech: Boolean(messy),
          recent: recent || [],
          alreadyOpen: (openLoops || []).map((loop) => ({
            text: loop.text,
            person: loop.person,
          })),
        }),
      },
    ]);
    return {
      summary: String(data.summary || "").trim() || "A quiet note.",
      people: Array.isArray(data.people) ? data.people.map(String).filter(Boolean) : [],
      loops: normalizeLoops(data.loops),
      wants: Array.isArray(data.wants) ? data.wants.map(String).filter(Boolean) : [],
    };
  }

  async function analyzeMany(notes) {
    const data = await complete([
      {
        role: "system",
        content: `You are Arc. ${LANG} Analyze each note separately. Return ONLY JSON: { items: [ { summary, people, loops: [{text, person}], wants } ] } in the same order. No advice. Do not invent people.`,
      },
      {
        role: "user",
        content: JSON.stringify(notes.map((note, i) => ({ index: i, text: note.text }))),
      },
    ]);
    const items = Array.isArray(data.items) ? data.items : [];
    return notes.map((note, i) => {
      const row = items[i] || {};
      return {
        summary: String(row.summary || "").trim() || "A quiet note.",
        people: Array.isArray(row.people) ? row.people.map(String).filter(Boolean) : [],
        loops: normalizeLoops(row.loops),
        wants: Array.isArray(row.wants) ? row.wants.map(String).filter(Boolean) : [],
      };
    });
  }

  async function writeFilm({ weekLabel, notes, openLoops }) {
    const data = await complete([
      {
        role: "system",
        content:
          `You are Arc's Sunday Film director. ${LANG} Write a private cinematic recap from their notes. Return ONLY JSON: title, scenes (3 to 6 of {label, text}), people, drift (who they said they would be vs who they were), closing. Tone: A24 still, not self-help. Never give advice. Never cheerlead.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          weekLabel,
          notes: notes.map((note) => ({
            when: note.createdAt,
            text: note.text,
            summary: note.summary,
          })),
          openLoops: openLoops.map((loop) => loop.text),
        }),
      },
    ]);
    return {
      title: String(data.title || "Don't lose the plot").trim(),
      weekLabel,
      noteCount: notes.length,
      people: Array.isArray(data.people) ? data.people.map(String).filter(Boolean) : [],
      openLoops,
      drift: String(data.drift || "").trim(),
      scenes: Array.isArray(data.scenes)
        ? data.scenes
            .map((scene) => ({
              label: String(scene.label || "Scene").trim(),
              text: String(scene.text || "").trim(),
            }))
            .filter((scene) => scene.text)
        : [],
      closing: String(data.closing || "").trim(),
      source: "ai",
    };
  }

  async function morningBrief({ openLoops, notes, film }) {
    const data = await complete([
      {
        role: "system",
        content:
          `You are Arc's morning brief. ${LANG} Three things, no more. Return ONLY JSON: { headline, items: [ { text, person } ] (max 3 open loops that matter today), drift (one sentence) }. No advice. No cheerleading. No chatbot.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          openLoops: (openLoops || []).slice(0, 12).map((loop) => ({
            text: loop.text,
            person: loop.person,
            ageDays: loop.createdAt
              ? Math.floor((Date.now() - loop.createdAt) / 86400000)
              : 0,
          })),
          recent: (notes || []).slice(0, 5).map((note) => note.summary || note.text),
          lastFilmDrift: film ? film.drift : "",
        }),
      },
    ]);
    return {
      headline: String(data.headline || "Show up.").trim(),
      items: Array.isArray(data.items)
        ? data.items
            .map((item) => ({
              text: String(item.text || item).trim(),
              person: String(item.person || "").trim(),
            }))
            .filter((item) => item.text)
            .slice(0, 3)
        : [],
      drift: String(data.drift || "").trim(),
      date: new Date().toDateString(),
    };
  }

  async function draftMessage(loop, note) {
    const data = await complete([
      {
        role: "system",
        content:
          `Write a short message the user could send to close this loop. ${LANG} Return ONLY JSON { message }. Sound like a text, not an email. No advice. No quotation marks wrapping the whole message.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          loop: loop.text,
          person: loop.person,
          note: note ? note.text : "",
        }),
      },
    ]);
    return String(data.message || "").trim();
  }

  return {
    load,
    save,
    ready,
    complete,
    analyze,
    analyzeMany,
    writeFilm,
    transcribe,
    morningBrief,
    draftMessage,
    usage,
    receiptLine,
    DEFAULTS,
  };
})();
