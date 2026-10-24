# Sample Flight Itinerary Generator

A single-page web app that builds sample flight boarding passes and exports
them as PNG or PDF. No build step, no framework, no server required — open
`index.html` in a browser and it works.

```
open index.html          # double-click it, or:
start index.html
```

---

## What it does

| | |
|---|---|
| **Ticket preview** | Boarding-pass layout: route hero row, main body, tear-off stub, barcode + QR code |
| **Multi-passenger** | Add/duplicate/remove passengers; **Download all** exports one PNG per passenger |
| **Round trip** | Trip type toggle adds a return leg (date, flight no., times) and a return strip on the ticket |
| **QR code** | Real, scannable QR encoding passenger, route, seat, gate, booking ref and ETKT |
| **Live flight data** | Optional real scheduled flights via Aviationstack; falls back to demo data |
| **Styling** | Airline name, font, logo size, logo colour and text colour |
| **Backdrops** | Ticket-only, "on table", "on bed", or your own uploaded photo (download only) |
| **Templates** | Save named presets and reload them later |
| **Recent tickets** | Auto-history of the last 12 generated tickets, restorable |
| **Persistence** | Everything except uploaded photos survives a page reload (localStorage) |
| **Validation** | ETKT format, booking-ref format, same-airport warning |

---

## Live flight data (read this before pasting a key)

The flight-API market changed substantially in 2026, and it affects what a
hobby project can actually use:

| Provider | 2026 status |
|---|---|
| **Kiwi.com Tequila** | Closed to self-service. Partner access only, by invitation. |
| **Amadeus Self-Service** | Portal decommissioned 17 July 2026; keys no longer work. |
| **Duffel** | Free test mode, but it is sandbox data — not real flights. |
| **Aviationstack** | **Still self-service.** 100 free requests/month, 1 request per 60 s. |

So this app uses **Aviationstack** as the live source by default. It was chosen
because it is genuinely free, needs no credit card, and sends
`Access-Control-Allow-Origin: *` — verified — so a browser page can call it
directly with no backend proxy.

### Getting a key

1. Go to <https://aviationstack.com/signup/free> — the free-plan signup page.
2. Fill in the form: name, email, password, then your address details
   (they ask for these even on the free plan).
3. When prompted to **Select Plan**, choose **Free — 100 Requests/mo, $0.00/mo**.
   No credit card is taken.
4. Confirm the email if they ask you to.
5. Open your dashboard and copy the **Access Key**.
6. In this app click **Flight data settings** → **Aviationstack** → paste the key.

Once the source is switched to Aviationstack and no key is set, the "Find a
flight" panel shows a setup card with a direct **Get free key** button — so you
can come back to this later and the app will point you to it.

### Two caveats about the free plan

- **Non-commercial use only.** Fine for a personal tool, a mockup or a
  portfolio piece. If you ever ship this as a paid or ad-supported product you
  need the Basic plan ($49.99/mo).
- **Real-time flights only.** No history, no future schedules, no fares — so the
  fare field shows "—".

### Free-plan limits you will hit

- **1 request per 60 seconds.** The app enforces this client-side and shows a
  countdown; results are cached for 15 minutes so re-searching is free.
- **100 requests per month.**
- **Live flights only** — no history, no future schedules, no fares. Prices
  will show as "—" because Aviationstack does not supply them on the free plan.
- Searching by **flight number** (e.g. `SK 284`) works; route search uses
  `dep_iata`/`arr_iata`.

### Tequila-compatible option

If you have approved Kiwi.com partner access, or you run your own proxy, pick
**Kiwi.com Tequila / Tequila-compatible proxy** and set the base URL. It speaks
the Tequila `/v2/search` shape.

### Without a key

Everything still works. Search generates the demo list (fictional, but the same
route always returns the same five flights) and the header badge reads
**Demo data**. If a live call fails for any reason, the error is explained and
the demo list is offered automatically — the app is never a dead end.

---

## Security note about keys

The key is stored in `localStorage` in **your** browser and sent straight from
the page to the provider. That is fine for personal use and testing.

Do **not** publish this page with your key pasted in, and do not commit a key to
source control — anyone who loads the page can read it out of the JS. If you
ever put this on the public web, add a small server-side proxy and keep the key
there instead.

---

## Use it on your phone (hosting)

> **Live now:** <https://gufghu91-cpu.github.io/flight-ticket-generator/>
> served straight from this repo's `main` branch via GitHub Pages.

The app is static — seven files, no build step, no server code — so any free
static host works. Your phone can't open `index.html` off your PC the way your
PC can, so hosting is how you get a URL your phone can load anywhere.

### Package the upload folder first

```bash
node dev/package.js
```

This writes:

- `deploy/` — exactly the 7 files the browser loads, nothing else
- `flight-ticket-generator.zip` — the same 7 files, zipped (60 KB)

Do **not** upload the project root: it contains the `dev/` test harness and the
generated `_smoke.html` / `_probe.html` pages, which you don't want public.
The packaging script also asserts the staged page references no `dev/` files
and that every asset it does reference is present.

### Option A — Netlify Drop (fastest, drag-and-drop)

1. Go to <https://app.netlify.com/drop> and sign in (free).
2. Drag the **`deploy` folder** onto the page — or upload the zip.
3. Netlify publishes it in seconds and gives you a URL like
   `https://random-name.netlify.app`.
4. Open that URL on your phone and **Add to Home Screen** for an app icon.

To pick your own name: *Site settings → Change site name*.

### Option B — GitHub Pages (permanent, needs a GitHub account)

1. Create a new public repo, e.g. `flight-ticket-generator`.
2. Upload the **contents of `deploy/`** to the repo root (drag-and-drop in the
   GitHub web UI works — commit to `main`).
3. Repo → **Settings → Pages → Build and deployment**:
   Source = *Deploy from a branch*, Branch = `main` / `root`, Save.
4. Your app is at `https://<you>.github.io/flight-ticket-generator/`.

**This repo is already wired up that way.** The whole project (not just
`deploy/`) sits at the repo root and Pages serves it fine — `dev/` is only a
bunch of static test scripts that nothing loads unless you ask for them, and
`deploy/` + the zip are gitignored as generated artifacts. Push to `main` and
Pages republishes automatically.

**Verified:** the full test suite passes when served from a nested subpath
(`…/demo-repo/`), not just a domain root — so a GitHub Pages project URL
(`user.github.io/repo/`) works. Every asset reference in the page is relative
and every runtime request is `https://`, so there are no mixed-content issues.

### After you host it

- **Your API key does not carry over.** `localStorage` is per-browser, so the
  phone has its own empty storage. Paste the key again on the phone (Flight
  data settings → Aviationstack → key). It stays in that phone's browser.
- Add the page to your home screen so it launches without browser chrome.
- The page uses classic scripts rather than ES modules — modules are blocked by
  CORS on `file://`, and this keeps the app runnable both from disk and hosted.

---

## Files

```
flight-ticket-generator/
├── index.html              page structure
├── styles.css              all styling, incl. print + phone (≤640px) rules
├── app.js                  form state, rendering, export, templates, search UI
├── flight-api.js           provider adapters + the built-in demo generator
├── qrcode.js               qrcode-generator 1.4.4 (MIT, Kazuhiko Arase)
├── html-to-image.js        PNG export library
├── deploy/                 staged copy of the 7 runtime files (via dev/package.js)
├── flight-ticket-generator.zip   same, zipped, for drag-and-drop hosts
└── dev/                    test harness (not needed to run the app)
    ├── check.js            static id/asset consistency check
    ├── build-smoke.js      builds ../_smoke.html (behavioural suite)
    ├── build-probe.js      builds ../_probe.html (phone layout probe)
    ├── trap.js             window error trap for the smoke run
    ├── assert.js           behavioural assertions
    ├── probe.js            overflow / tap-target / input-size checks
    ├── mobile.js           real phone-viewport driver (CDP) + screenshots
    ├── subpath.js          serves the app from a nested path (GitHub Pages)
    ├── package.js          builds deploy/ + the zip
    └── serve.js            static server (http:// beats file:// for debugging)
```

`qrcode.js` and `html-to-image.js` are bundled locally so the app works
offline; both fall back to a CDN if a local copy is ever missing.

The page uses **classic scripts, not ES modules**, on purpose — ES modules are
blocked by CORS when a page is opened from `file://`.

---

## Development

```bash
node dev/check.js        # every id used in JS exists in the HTML; assets resolve
node dev/build-smoke.js  # generate _smoke.html
node dev/serve.js        # serve on http://127.0.0.1:<port>
node dev/build-probe.js  # generate _probe.html (phone layout audit)
node dev/package.js      # stage deploy/ + zip for hosting
```

Then open `_smoke.html` — it runs the app plus 55 behavioural assertions
(rendering, search, fallback, throttle, round trip, passengers, templates,
onboarding) and prints PASS/FAIL into the page.

Serve over `http://` rather than `file://` when debugging: Chromium redacts
every page error to `"Script error."` on `file://` origins.

### Testing at real phone width

`--window-size` is **not** a way to test mobile layout — headless Edge clamps
its window to a ~496px minimum, so `--window-size=390` silently renders ~496px
and reports a false pass. `dev/mobile.js` drives the browser over the DevTools
protocol instead, which can set a true device viewport:

```bash
node dev/serve.js                    # shell 1
node dev/build-probe.js              # shell 2
node dev/mobile.js 390 844 /_probe.html
node dev/mobile.js 390 844 "/_probe.html#ticket"   # ticket close-up
```

It prints the probe report (horizontal overflow, elements past the viewport,
children clipped by `overflow:hidden`, tap targets under 40px, inputs under
16px) and writes a PNG to the temp directory.

**Known iOS behaviour:** Safari auto-zooms any input with `font-size < 16px`
on focus, which makes the page jump mid-typing. The ≤640px media query raises
inputs to 16px and tap targets to ≥44px for this reason. Keep it that way when
editing.

---

## Exporting

- **Download PNG** — current ticket at 2× resolution, with the backdrop if one is set.
- **Download all** — one PNG per passenger.
- **Save as PDF** — opens the browser print dialog; choose *Save as PDF*. The
  print stylesheet strips the interface and the photo backdrop and leaves only
  the ticket, in vector quality.
