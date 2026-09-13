# Arc — Don't lose the plot.

A private web app that turns **90 seconds of talking** into a living story of your life: the people in it, the promises you made, and the person you are becoming.

Agents do your work. Arc keeps you from disappearing inside your own life.

## What it is

- **Tonight's card** — speak or type the night. Arc pulls people, loops, and wants out of ordinary sentences.
- **Open loops** — inbox-zero for being a decent human. Done / still open / let it go.
- **Sunday Film** — a weekly recap of scenes, cast, drift, and unfinished threads.

This first version runs entirely in the browser. Notes are stored in `localStorage` on your device. No account. No server.

## Run it

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 5173
```

Then visit [http://localhost:5173](http://localhost:5173).

- Landing: `/`
- App: `/app.html`
- Sample week: `/app.html?demo=1`

Live listening uses the Web Speech API (Chrome or Safari, with microphone permission). Typing always works.

## Product notes

This is the v1 preview of the idea:

> Don't lose the plot.

Paid plans (`$9 / month`, `$16 / month` Arc+) are on the landing page as the intended model. They are not charged in this preview. A 7-day trial comes later.

## Privacy

Nothing leaves the device unless you deploy your own backend later. Use **Erase this device** in Notes to wipe local data.

## Stack

Static HTML, CSS, and JavaScript. No build step. Designed to ship on GitHub Pages.

## GitHub Pages

Repo: [github.com/crazy-scientistt/arc](https://github.com/crazy-scientistt/arc)

In the repo: **Settings → Pages → Deploy from a branch → `main` / root**.
The site will be at `https://crazy-scientistt.github.io/arc/`.
