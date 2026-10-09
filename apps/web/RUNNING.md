# Running Agent Finder

Both experiences — the customer module and the agent/dealer app — run from the **same dev server**. They are different URLs, not different projects.

Two ways to run it:

- **Mock mode** (default) — everything runs in the browser from demo data. No server. Good for a quick look; each browser has its own private copy, so an agent's change is NOT seen by a customer on another phone.
- **Live mode** — the browser talks to the API in `apps/api`. One shared server, one shared database: what an agent declares on their phone changes what every customer sees. This is the mode for the pilot (10+ real users) and the mode gstack should review.

Requires Node 20+ (`node -v`). Live mode also needs Python 3.11+ (`python --version`).

## Start it

```bash
cd apps/web
npm install      # first time only
npm run dev
```

Vite prints a local address, usually `http://localhost:5173`.

## Customer side

| URL | What it is |
|---|---|
| `/` | **The demo starts here.** Simulated host app home; tap the Agent Finder banner |
| `/find` | Agent Finder home — choose a transaction and an amount |
| `/search?tx=cash_out&amount=2000&area=Lumley` | Results, deep-linked |
| `/how-availability-works` | Plain-language explanation |
| `/report-a-visit` | Outcome report |

The outcome prompt appears on the home screen about 20 seconds after taking directions (15 minutes in a live deployment — `outcomePromptAfterMs` in `src/lib/config.ts`).

## Agent and dealer side

| URL | What it is |
|---|---|
| `/agent` | Redirects to sign-in when signed out |
| `/sign-in` | Choose **Agent** or **Dealer** |
| `/agent/availability` · `/agent/float` · `/agent/dashboard` · `/agent/profile` | The other four modules |

**Demo credentials:** PIN `1234`. Agent numbers: `Agent 024`, `Agent 031`, `Agent 009`, `Agent 017`, `Agent 038`. Choosing **Dealer** signs you in as Kissy Distribution.

| URL | What it is |
|---|---|
| `/dealer` | Dashboard — counts, float queue, needs attention |
| `/dealer/agents` · `/dealer/agents/Agent%20024` | Agent register and detail (masked money, 60-second reveal) |
| `/dealer/float` · `/dealer/float/fr-1` | Float queue and review |
| `/dealer/attention` · `/dealer/attention/sig-1` | Needs attention and signal detail |
| `/dealer/profile` | Permissions and your reveal record |

`Agent 024` is the one to demo: a stale declaration so "Still correct?" appears, a pending float request, and two customer-reported problems.

## Registering a real agent (dealer)

Sign in as the dealer, open **Agents → Register agent**. Any agent you work with can be
registered, whether or not Orange's file lists them: shop and person, the agent number (or the
next free one from 101), the shop's location (stand at the shop and tap *Use my location*, or
type the coordinates), hours, phone, the initial PIN, and what the agent usually handles. Tick
*checked against Orange's record* only when you did: that alone shows customers the
"Verified agent" badge. The note on what they usually handle sets what amounts read as likely;
customers never see the figures.

Customers see the shop once the agent signs in with that number and PIN and sets **Open**.
The record, location and hours can be corrected later (`PUT /api/v1/dealer/agents/{ref}`), and
the PIN reset (`POST /api/v1/dealer/agents/{ref}/pin`).

This needs the dealer permission `MANAGE_AGENT`. The seed grants it; a database created before
it existed needs it added once:

```bash
cd apps/api && .venv/bin/python -c "import sqlite3;c=sqlite3.connect('agentfinder.db');c.execute(\"update dealers set permissions=permissions||',MANAGE_AGENT' where permissions not like '%MANAGE_AGENT%'\");c.commit()"
```

## Showing both at once

Open two browser windows (or two phones on the same network):

1. **Agent phone** — `/sign-in` → Agent 024 → PIN 1234 → set Cash out to **Most** → Save.
2. **Customer phone** — `/` → tap Agent Finder → Cash out → 5000 → Find an agent → Fatmata's Shop shows *can likely handle your request*.
3. **Agent phone** — Availability → Cash out **Small** → Save.
4. **Customer phone** — search again → the same agent now reads *limited — may not cover this amount*.

To reach it from a phone on the same wifi, run `npm run dev -- --host` and use the Network address Vite prints.

## Live mode — the real server (pilot)

**1. Start the API** (terminal 1):

```bash
cd apps/api
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -e ".[dev]"                               # first time only
uvicorn app.main:app --reload --port 8000
```

On first start it creates `apps/api/agentfinder.db` (SQLite — nothing to install) and seeds the demo network: dealer **kissy** and eight agents (024, 031, 009, 017, 038, 073, 019, 066), all with PIN **1234**. Delete that file to start clean. Interactive docs at `http://localhost:8000/docs`.

**2. Point the web app at it** (terminal 2):

```bash
cd apps/web
printf 'VITE_API_MODE=live\nVITE_API_BASE_URL=http://localhost:8000\n' > .env.local
npm run dev
```

Set `VITE_API_MODE=mock` (or delete `.env.local`) to go back to in-browser demo data.

**3. Real PINs before real people use it:**

```bash
cd apps/api
python scripts/set_pin.py "Agent 024" 4821
python scripts/set_pin.py kissy 9090
```

**Phones on the same wifi:** run `uvicorn ... --host 0.0.0.0` and `npm run dev -- --host`, set `VITE_API_BASE_URL` to your laptop's network address (e.g. `http://192.168.1.20:8000`) and start the API with `CORS_ORIGINS=http://192.168.1.20:5173` in `apps/api/.env`.

**Counting pilot users:** sign in as the dealer and open `GET /api/v1/dealer/usage` (from `/docs`) — it reports distinct customers, agents and dealers who actually used the shared server. Customers are counted by a random per-browser key; no names, numbers or locations are stored.

**API checks:**

```bash
cd apps/api
python -m pytest -q     # 58 tests
ruff check . && ruff format --check .
```

## Android APK (phones)

The customer, agent and dealer screens also ship as an Android app. The Android project is
`apps/web/android` (Capacitor); the screens inside it are the normal web build, untouched.
Nothing is built on your machine: the **Android APK** workflow on GitHub (Actions → Android APK)
builds a debug APK on every push to `main` that touches `apps/web`, or on demand with
"Run workflow". Download the `agent-finder-apk` artifact from the run, copy the `.apk` to the
phone and open it (allow installs from this source when the phone asks).

- With no repository variable set, the APK runs in **mock mode** on the in-app demo network —
  every screen works with no server at all.
- Set the repository variable `API_BASE_URL` (Settings → Secrets and variables → Actions →
  Variables) to the hosted API, or type it into "Run workflow", and the APK runs in **live
  mode** against it. The API's `CORS_ORIGINS` must then include `https://localhost`, the app's
  origin on Android; the development default already does.
- Debug builds may talk to a plain-http API, so for a demo the API can run on a laptop on the
  phone's hotspot: `uvicorn app.main:app --host 0.0.0.0 --port 8000` and
  `API_BASE_URL=http://<laptop-ip>:8000`. Such builds serve the page from `http://localhost`
  instead of `https://localhost` (a page on https may not call a plain-http API), so that
  origin is in the API's CORS default too; builds against an https API stay on https. The
  laptop's firewall must accept the port, e.g. `sudo ufw allow 8000/tcp`.
- iPhone: there is no APK. Open the hosted web app in Safari and use Share → Add to Home Screen.

Every build is signed with one pilot key kept in the repository secrets `ANDROID_KEYSTORE_B64`,
`ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_ALIAS` (the file itself lives outside git, in
`~/.android/agent-finder-signing.p12` on the maintainer's laptop, with its password in
`agent-finder-signing.env` beside it — back both up). The same key on every build is what lets a
new APK update the one already on a phone; a phone that got an APK signed with a different key
must uninstall it once.

Building locally needs Java 21 and the Android SDK (source `~/.android/agent-finder-signing.env`
first to sign with the pilot key):
`cd apps/web && npm run build && npx cap sync android && cd android && ./gradlew assembleDebug`.

## Other commands

```bash
npm test          # 70 tests
npm run typecheck
npm run lint
npm run build     # production build
npm run preview   # serve the production build
```
