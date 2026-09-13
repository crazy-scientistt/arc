const ArcExtract = (() => {
  const RELATIONS = ["mom", "dad", "mum", "mother", "father", "sister", "brother", "wife", "husband", "partner", "roommate"];
  const STOP = new Set([
    "I", "The", "This", "That", "Then", "Today", "Tomorrow", "Yesterday", "Monday", "Tuesday",
    "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Maybe", "Just", "Also", "When",
    "After", "Before", "Because", "Something", "Someone", "Everyone", "Anyone", "Please",
  ]);

  function clean(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function sentenceCase(text) {
    const value = clean(text).replace(/[.?!]+$/, "");
    if (!value) return "";
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function people(text) {
    const found = new Set();
    const lower = text.toLowerCase();
    RELATIONS.forEach((name) => {
      if (new RegExp(`\\b${name}\\b`, "i").test(lower)) found.add(name);
    });
    const named = text.matchAll(
      /\b(?:told|called|texted|messaged|asked|promised|saw|visited|met|with|from)\s+([A-Z][a-z]{2,})\b/g
    );
    for (const match of named) {
      if (!STOP.has(match[1])) found.add(match[1]);
    }
    return [...found];
  }

  function loops(text) {
    const items = [];
    const push = (raw, person) => {
      const value = sentenceCase(raw);
      if (value.length < 8) return;
      items.push({ text: value, person: person || "" });
    };

    for (const match of text.matchAll(/\bI told ([A-Z][a-z]+|mom|dad|Mum|Dad) I(?:'d| would)\s+([^.!?\n]{8,160})/gi)) {
      push(`${match[1]}: ${match[2]}`, match[1]);
    }
    for (const match of text.matchAll(/\bI(?:'ll| will)\s+([^.!?\n]{8,160})/gi)) {
      push(match[1]);
    }
    for (const match of text.matchAll(/\bI (?:need to|have to|should|gotta|promised to)\s+([^.!?\n]{8,160})/gi)) {
      push(match[1]);
    }
    for (const match of text.matchAll(/\bwe should\s+([^.!?\n]{8,160})/gi)) {
      push("We should " + match[1]);
    }

    const unique = [];
    const seen = new Set();
    items.forEach((item) => {
      const key = item.text.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      unique.push(item);
    });
    return unique.slice(0, 6);
  }

  function wants(text) {
    const found = [];
    for (const match of text.matchAll(/\bI(?:'m| am) done with\s+([^.!?\n]{4,80})/gi)) {
      found.push("Done with " + sentenceCase(match[1]));
    }
    for (const match of text.matchAll(/\bI want to\s+([^.!?\n]{4,80})/gi)) {
      found.push("Want to " + sentenceCase(match[1]));
    }
    for (const match of text.matchAll(/\bI keep\s+([^.!?\n]{4,80})/gi)) {
      found.push("Keep " + sentenceCase(match[1]));
    }
    return found.slice(0, 4);
  }

  function summary(text) {
    const first = clean(text).split(/[.!?\n]/)[0];
    if (!first) return "A quiet note.";
    return first.length > 140 ? first.slice(0, 137) + "…" : first;
  }

  function analyze(text) {
    const source = clean(text);
    return {
      summary: summary(source),
      people: people(source),
      loops: loops(source),
      wants: wants(source),
    };
  }

  return { analyze, people, loops, wants, summary, clean };
})();
