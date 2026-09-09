# Anchor — Setup

"Anchor" is a placeholder name — it's just the app title in `index.html` and
`manifest.json`, one line each to change whenever you want.

## Project structure (modular)
```
index.html         <- lists every script; add one line here per new module
manifest.json
sw.js              <- service worker: caches the app for full offline use
style.css
icons/             <- Home Screen icons (generated, brass diamond)
core/
  storage.js        <- generic local database, don't touch when adding modules
  utils.js           <- shared helpers (money/date formatting, escaping, sha256, charts)
  shell.js            <- PIN lock, top navigation, backup, service worker, boots the app
modules/
  finance.js          <- Overview / Spending / Net Worth / History
  family.js           <- call reminders
  personal.js          <- Habits / My Will / In Case Of...
  settings.js          <- currency / change PIN / backup export+restore
```

**When you ship an update:** bump `CACHE` in `sw.js` (e.g. `anchor-v3` ->
`anchor-v4`). On the next launch the new worker replaces the old cache and the
app reloads itself once with the fresh files. Without the bump, phones keep
serving the cached old version.

**To add a new section later:** create `modules/whatever.js`, call
`registerModule({ id, label, icon, render })` in it, add one
`<script src="modules/whatever.js"></script>` line in `index.html`. Nothing
else needs to change — the database has no fixed schema, so a new module can
invent its own `Storage.put('whatever.something', {...})` collections
immediately.

## Get it onto your iPhone

Modern iOS can't open a local `index.html` in Safari from the Files app, so the
app has to be served from a URL **once**. After that first load the service
worker (`sw.js`) caches every file and the app runs fully offline forever —
open it from the Home Screen with Airplane Mode on and it still works.

Your financial data never touches the network either way: it lives only in this
app's IndexedDB database on the phone. The only thing fetched is the ~70 KB of
app code, on that first visit and whenever you publish an update.

### Publish the files (pick one, both free)
- **Netlify Drop** — go to app.netlify.com/drop in any browser, drag the
  unzipped `app` folder onto the page. You get a URL like
  `https://something.netlify.app` in a few seconds.
- **GitHub Pages** — create a repo, upload the contents of `app/` (so
  `index.html` is at the repo root), then Settings -> Pages -> deploy from
  `main` / root. URL is `https://<you>.github.io/<repo>/`.

Both serve over HTTPS, which the service worker requires.

### Install on the phone
1. Open the URL in **Safari** on the iPhone (not Chrome — only Safari can
   install a PWA on iOS).
2. Let it finish loading once (this is when the offline cache is built).
3. Share icon -> **Add to Home Screen** -> Add.
4. Always launch it from the Home Screen icon — that's what gives the
   full-screen, no-browser-bar app feel and its own private storage.
5. You can now delete the Safari tab; the Home Screen app is self-contained.

### Updating later
Re-publish the new files to the same URL and bump `CACHE` in `sw.js`. Next time
you open the Home Screen app it fetches the changed files, swaps the cache, and
reloads itself once. If you're offline at that moment it keeps running the old
version until you're back online.

## First run
- You'll set a PIN (min 4 digits) — required every time you open the app.
  Change it later in **Settings**.
- Nothing is sent anywhere. There are zero network calls in the app code —
  everything lives in this app's local database on your phone.
- There is no cloud backup and never will be. Use **Settings -> Export backup
  file** regularly and keep the JSON somewhere safe; **Restore from file**
  brings it back.

## What's working right now
- **Finance**:
  - Overview — net worth, this month's Fixed/Variable/Total spend, and a
    net-worth history line chart
  - Spending — Fixed/Variable transactions with your categories
  - Net Worth — Assets / Investments / Debits
  - History — Fixed vs Variable trend bars (last 12 months) + per-month
    category breakdown
  - Net-worth snapshots record automatically, once per day, when you unlock
    the app — that's what feeds the history chart
- **Family**: add people with a call frequency, see who's overdue, one tap
  to mark "called today"
- **Personal**: daily habit checklist with streaks (Prayer/Gym/Water seeded
  by default), a free-text "My Will" page, and an "In Case Of..." checklist +
  notes page
- **Settings** (its own tab):
  - Currency — changes every money value in the app
  - Change PIN — current / new / confirm
  - Backup — Export a full JSON file, or Restore from one (restore replaces
    everything currently in the app). No cloud copy exists, so export often.

## Not built yet
- Net-worth chart on its own is a simple line; no zoom / range picker
- Family per-contact notes, Personal habit calendar view
- PIN retry limits / lockout, `navigator.storage.persist()`
- New top-level sections beyond Finance / Family / Personal
- Anything beyond what's listed above — tell me what's next
