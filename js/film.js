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

  function weekLabel(now = Date.now()) {
    return `${fmt(startOfWeek(now))} – ${fmt(endOfWeek(now))}`;
  }

  function weekNotes(notes, now = Date.now()) {
    const start = startOfWeek(now).getTime();
    const end = endOfWeek(now).getTime();
    return notes.filter((note) => note.createdAt >= start && note.createdAt <= end);
  }

  function recentContext(notes, limit = 6) {
    return notes.slice(0, limit).map((note) => ({
      summary: note.summary,
      text: String(note.text || "").slice(0, 280),
    }));
  }

  function sampleTexts() {
    return [
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
  }

  return { startOfWeek, endOfWeek, weekLabel, weekNotes, recentContext, sampleTexts };
})();
