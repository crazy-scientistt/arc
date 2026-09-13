# Arc

**Don't lose the plot.**

Arc is a private web app that turns 90 seconds of talking into a living story of your life: the people in it, the promises you made, and the person you are becoming.

Agents do your work. Arc keeps you from disappearing inside your own life.

It is **not** a journal, **not** a chatbot, **not** a habit tracker, and **not** a personal CRM. Conversation is not the product. Cards, loops, and the Sunday Film are.

---

## 1. Why it exists

People already have AI that *does* tasks. What they still lose is the plot:

- “I’ll send that tonight” vanishes.
- Weeks feel like nothing, then a month is gone.
- You tell yourself you’re done with a job and stay until 1am.
- Friendships fade because nobody tracked the human thread.

Productivity apps fail because they need you to maintain a system. AI chat apps convert, then people quit. Arc compounds: the longer you stay, the more of your life it holds.

**Positioning**

| Arc is | Arc is not |
| --- | --- |
| A witness | ChatGPT with memory |
| A conscience for open loops | Salesforce for your friends |
| A weekly film of your actual life | A memoir app for later |
| Sight | A streak / guilt machine |

---

## 2. Product at a glance

Three rituals. That is the product.

| Ritual | What you do | What you get |
| --- | --- | --- |
| **Tonight’s card** | Talk or type for 90 seconds | One page: who appeared, what you promised, what you wanted |
| **Open loops** | Nothing to file | Inbox-zero for being a decent human |
| **Sunday Film** | One tap | A cinematic recap of the week you actually lived |

Plus:

- **Morning brief** — three things. Nothing else.
- **Draft the text** — a message you could send to close a loop. Arc never sends it.
- **Privacy receipt** — after every AI call, how much left the device.

**Intended pricing (not charged in this preview)**

- Arc — $9 / month or $72 / year
- Arc+ — $16 / month (longer films, year-in-your-life export, iPhone later)
- 7-day free trial — later

---

## 3. Features (complete list)

### 3.1 Landing

File: `index.html`

- Brand: Arc, serif display, “Don’t lose the plot.”
- Hero still + “Not a journal. Not a chatbot. A witness.”
- Three rituals, how it works, what it is not, pricing, final CTA
- Links into the app and a sample week

### 3.2 Tonight’s card

File: `app.html` + `js/app.js`

- Big record button, 90-second timer
- **Real audio recording** (MediaRecorder), not captions-only
- Live captions in Chrome/Safari as a preview while you talk
- On save:
  1. Audio goes to **Whisper** (`openai/whisper-large-v3`, free first)
  2. Transcript (or cleaned live captions if Whisper fails) goes to **Inkling**
  3. Inkling returns summary, people, loops, wants
- Typing always works if the mic is blocked
- English, Urdu, and mixed / Roman Urdu are in the model instructions
- Each card shows chips for people, loops, and wants
- If AI fails, Arc **does not guess** with regex

### 3.3 Plot memory

Every night, the model also sees:

- Recent nights (summaries / snippets)
- Loops that are **still open**

It should not re-extract “text Sara” if that loop is already hanging, unless you restated it with new detail.

### 3.4 Open loops

- Promises, intentions, unfinished human threads
- Status: open / done / let go
- Age: today, stale (~7 days), overdue (~14 days)
- **Done is not a checkbox.** Arc asks *Did you send it?*
  - Yes, mark done
  - Draft the text first
  - Not yet
- **Draft the text** writes a short message you could send. Copy it. Arc does not send messages.

### 3.5 Morning brief

- Three open loops that matter today
- One drift line
- No feed, no cheerleading, no chatbot
- Button: “Write this morning’s brief” / rewrite
- Auto-attempts before noon if you already have open loops
- Cached per calendar day in the browser

### 3.6 Sunday Film

- AI-written recap, not a template
- Title, 3–6 scenes, cast, open loops, drift, closing line
- Tone: A24 still, not self-help
- Stored per week so you can reopen it
- Rewrite anytime

### 3.7 Sample week

- Five canned nights, **analyzed by AI** (not regex)
- Then writes the film
- URL: `/app.html?demo=1`

### 3.8 Settings / AI

- Header pill: **AI on · Inkling** (opens Settings)
- Provider: OpenRouter (default), OpenAI, Groq, Anthropic
- Default model: `thinkingmachines/inkling:free`
- API key optional in the UI if `.env` is set on the server
- Fallback chain if Inkling is down:
  1. `thinkingmachines/inkling:free`
  2. `meta-llama/llama-3.3-70b-instruct:free`
  3. `google/gemini-2.0-flash-exp:free`
- Never falls back to pattern matching

### 3.9 Privacy receipt

After each AI call, a line like:

> Sent 1,240 characters to OpenRouter via thinkingmachines/inkling:free. Nothing stored by us.

### 3.10 Local data

- Notes, loops, films, briefs in `localStorage` (`arc.v1`)
- AI settings in `arc.ai.v1`
- **Erase this device** wipes the reel
- No accounts in this preview

### 3.11 What it deliberately does not do

- No “ask Arc anything” chat
- No sending texts/emails for you
- No habit streaks
- No treating friends as CRM leads
- No training on your notes by Arc itself

---

## 4. How a night flows

```
You talk (≤90s)
    → browser records audio
    → POST /api/transcribe  (Whisper)
    → POST /api/ai          (Inkling: card + loops, with memory)
    → Tonight’s card + open loops update
    → privacy receipt
```

```
Morning
    → POST /api/ai  (brief from open loops + recent nights)
```

```
Sunday / on demand
    → POST /api/ai  (Sunday Film)
```

```
Close a loop
    → “Did you send it?”
    → optional draft message
    → mark done / let go
```

---

## 5. Architecture

```
Browser (app.html)
    │  localStorage = your life
    │
    ├─ POST /api/transcribe  ──► OpenRouter Whisper
    └─ POST /api/ai          ──► OpenRouter Inkling (+ fallbacks)
              ▲
              └── API key from .env (preferred) or Settings
```

- **Frontend:** static HTML / CSS / JS. No build step.
- **Backend:** `server.py` — serves files **and** proxies AI so the browser is not blocked by CORS and the key is not shipped in Git.
- You **must** run `python3 server.py`. Opening `index.html` as a file will not talk to AI.

### AI jobs (only these)

| Job | Endpoint | Model |
| --- | --- |
| Transcribe audio | `/api/transcribe` | Whisper large v3 (free, then paid) |
| Extract card / loops | `/api/ai` | Inkling, then fallbacks |
| Sunday Film | `/api/ai` | same |
| Morning brief | `/api/ai` | same |
| Draft a text | `/api/ai` | same |

---

## 6. File map

```
arc/
  index.html          Landing
  app.html            The product
  server.py           Static server + AI proxy
  PROJECT.md          This document
  README.md           Short run instructions
  LICENSE             MIT
  .env.example        Key template (no secrets)
  .env                Local secrets (gitignored)
  .gitignore
  css/styles.css
  js/
    app.js            UI, recording, rituals
    ai.js             AI client (analyze, film, brief, whisper, draft)
    store.js          localStorage
    film.js           Week helpers + sample nights
    extract.js        Old regex engine (unused; do not use)
  assets/
    hero.jpg          Landing / film still
    still.jpg         How-it-works still
```

**Do not commit `.env`.** It is gitignored.

---

## 7. How to run it now

On **your** computer (needs internet for OpenRouter):

1. Copy the `arc` folder (or clone the repo).
2. Put your OpenRouter key in `.env`:

```
OPENROUTER_API_KEY=your_key_here
OPENROUTER_MODEL=thinkingmachines/inkling:free
ARC_PROVIDER=openrouter
```

3. Start the server:

```bash
python3 server.py
```

4. Open [http://127.0.0.1:5173/app.html](http://127.0.0.1:5173/app.html)
5. Allow the microphone when you record.
6. Optional: click **AI on · Inkling** if you want to paste a key in Settings instead of `.env`.

If the key was ever pasted in chat, rotate it in OpenRouter and update `.env`.

---

## 8. Tech details

| Piece | Choice |
| --- | --- |
| UI | HTML + CSS, system sans + Georgia |
| State | `localStorage` |
| Recording | `MediaRecorder` (webm) |
| Live captions | Web Speech API (optional preview) |
| STT | OpenRouter `POST /api/v1/audio/transcriptions` |
| LLM | OpenRouter chat completions |
| Default LLM | `thinkingmachines/inkling:free` |
| Server | Python 3 stdlib (`http.server`) |
| Port | `5173` |

---

## 9. Status

**Built in this preview**

- Landing + app shell
- Voice + type capture
- Whisper + Inkling pipeline
- Loops with draft + “did you send it?”
- Morning brief
- Sunday Film
- Privacy receipts
- Model fallbacks
- Urdu/English instructions
- Local `.env` (not in git)

**Not built yet (later)**

- Real accounts / Stripe / 7-day trial
- Hosted backend so customers never see a key
- iOS app
- Push notifications for the morning brief
- Year-in-your-life export (Arc+)
- Sending messages on your behalf (intentionally never, unless you change the product)

GitHub: [github.com/crazy-scientistt/arc](https://github.com/crazy-scientistt/arc)

---

## 10. Product rules (do not break)

1. Do not add a chatbot.
2. Do not guess with regex if AI fails — show the error.
3. Do not treat people as CRM leads; only keep what the user said.
4. Do not send messages for the user.
5. Do not commit API keys.
