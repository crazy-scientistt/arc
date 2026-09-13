const ArcFilm = (() => {
  function startOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = (day + 6) % 7;
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - diff);
    return d;
  }

  function endOfWeek(date) {
    const start = startOfWeek(date);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
  }

  function fmt(date) {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function weekNotes(notes, now = Date.now()) {
    const start = startOfWeek(now).getTime();
    const end = endOfWeek(now).getTime();
    return notes.filter((note) => note.createdAt >= start && note.createdAt <= end);
  }

  function uniquePeople(notes) {
    const set = new Set();
    notes.forEach((note) => (note.people || []).forEach((p) => set.add(p)));
    return [...set];
  }

  function titleFrom(notes) {
    const wants = notes.flatMap((note) => note.wants || []);
    if (wants.length) return wants[0].replace(/^(Want to|Done with|Keep)\s+/i, "");
    if (!notes.length) return "A quiet week";
    const words = notes.map((n) => n.summary).join(" ");
    if (/job|work|office/i.test(words)) return "The same week, again";
    if (/tired|sleep|late/i.test(words)) return "Running on fumes";
    if (/sara|friend|dad|mom/i.test(words)) return "People, then silence";
    return "Don't lose the plot";
  }

  function driftLine(notes) {
    const wants = notes.flatMap((n) => n.wants || []);
    const done = wants.filter((w) => /^done with/i.test(w));
    if (done.length >= 2) {
      return `You said you were done more than once this week. The plot did not change.`;
    }
    if (done.length) {
      return `You said you were ${done[0].toLowerCase()}. Check whether this week moved at all.`;
    }
    if (!notes.length) return "There is not enough story yet. Talk for 90 seconds tonight.";
    if (notes.length === 1) return "One scene is not a week. Come back tomorrow.";
    return `You showed up ${notes.length} times. The thread is starting to hold.`;
  }

  function generate(state, now = Date.now()) {
    const notes = weekNotes(state.notes, now);
    const start = startOfWeek(now);
    const end = endOfWeek(now);
    const people = uniquePeople(notes);
    const open = state.loops.filter((loop) => loop.status === "open");
    const scenes = notes.slice(0, 6).map((note, i) => ({
      label: i === 0 ? "Opening" : `Scene ${i + 1}`,
      text: note.summary,
    }));

    return {
      title: titleFrom(notes),
      weekLabel: `${fmt(start)} – ${fmt(end)}`,
      noteCount: notes.length,
      people,
      openLoops: open.slice(0, 5),
      drift: driftLine(notes),
      scenes,
      closing: open.length
        ? `${open.length} loop${open.length === 1 ? "" : "s"} still open. The credits can wait.`
        : "No open loops. Rare, and worth keeping.",
    };
  }

  function sampleWeek() {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const notes = [
      {
        text: "Long day. I told Sara I'd send the notes tonight and I didn't. I keep saying I'm done with this job and then I stay until 1. I should call dad on Sunday.",
        daysAgo: 6,
      },
      {
        text: "Walked home in the rain. I want to leave by 6 this week. Met Malik for coffee. We should actually hang out instead of saying we should.",
        daysAgo: 5,
      },
      {
        text: "I promised to look at the apartment listing. I will text the broker tomorrow. I am done with pretending this city is temporary.",
        daysAgo: 3,
      },
      {
        text: "Sara's mom is still in the hospital. I need to check in. Work was fine. I keep scrolling instead of sleeping.",
        daysAgo: 2,
      },
      {
        text: "Almost a quiet night. I told myself I'd apply to one role. I didn't. I want to feel like the protagonist again.",
        daysAgo: 0,
      },
    ];

    return notes.map((item) => {
      const analysis = ArcExtract.analyze(item.text);
      return {
        text: item.text,
        createdAt: now - item.daysAgo * day - 3 * 60 * 60 * 1000,
        summary: analysis.summary,
        people: analysis.people,
        loops: analysis.loops,
        wants: analysis.wants,
        source: "demo",
      };
    });
  }

  return { generate, sampleWeek, weekNotes, startOfWeek, endOfWeek };
})();
