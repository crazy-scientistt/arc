# Arc — Don't lose the plot.

A private web app that turns **90 seconds of talking** into a living story of your life. Whisper hears it. Inkling reads the plot. Regex does not.

## Run it (required for AI)

```bash
cd arc
cp .env.example .env   # add OPENROUTER_API_KEY
python3 server.py
```

Then open [http://127.0.0.1:5173/app.html](http://127.0.0.1:5173/app.html)

Default model: `thinkingmachines/inkling:free` via OpenRouter.
If Inkling is down, Arc retries other OpenRouter models. It never falls back to guessing.

`.env` is gitignored. Never commit keys.

## What it does

- **Whisper** transcribes the recording (English, Urdu, mixed)
- **Tonight's card** — people, loops, wants, with memory of nights already open
- **Open loops** — draft the text, then confirm you sent it before marking done
- **Morning brief** — three things. Nothing else.
- **Sunday Film** — a cinematic recap, not a chatbot
- **Privacy receipt** after every AI call

## Privacy

Notes stay in `localStorage`. Audio/text go to OpenRouter only to transcribe and extract. Use **Erase this device** to wipe local data.
