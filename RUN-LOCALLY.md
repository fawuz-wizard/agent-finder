# Run Agent Finder on your machine

Two apps from one codebase: **Agent Finder** (the customer's side, inside the Orange Money app)
and the **Agent App** (agents and aggregators). You need **Git** and **Node 20** (`node -v`).
Nothing else for the demo: all the data is simulated in the browser.

## 1. Get the code

```bash
git clone https://github.com/fawuz-wizard/agent-finder.git
cd agent-finder/apps/web
npm install
```

## 2. The customer's side

```bash
npm run dev
```

Open http://localhost:5173. The first screen is a simulated Orange Money home; tap the
**Agent Finder** banner. Allow location when the browser asks (the app names the place you
are in and searches around it; "Change" picks an area by hand). Keep **Cash out**, tap
**2,000**, then **Find agent**. Open a shop with **Get details**, then **Get Directions**.

## 3. The Agent App

In a second terminal, same folder:

```bash
VITE_APP_SURFACE=agent npm run dev -- --port 5174
```

Open http://localhost:5174. Sign in: **Agent**, code `024`, PIN `1234`. Four tabs:

| Tab | What it shows |
|---|---|
| **Dashboard** | Your own listing as customers see it, Open / Away / Closed, "low on cash out or cash in today", today's commission and figures, the float request |
| **Activity** | Today's commission, each transaction and what it earned, the chart, the rest of the day |
| **Services** | Record a cash in (customer's number and amount) or a cash out (amount); float: your position, request, history |
| **Profile** | Orange's record (read only, "Report a mistake"), the shop pin, a photo of the shop (the camera on a phone, a file on a laptop; customers see it at once), working hours, the phone switch, alerts, PIN, phones signed in, sign out |

Other demo agents: `031`, `009`, `017`, `038`. Aggregator: sign out, choose **Aggregator**,
number `kissy`, PIN `1234`: Overview, Agents, Float, Attention, Profile.

Everything is simulated and resets when you reload. The commission figures come from an
indicative table until Orange's tariff is loaded; every screen says so.

## 4. On your phone (same Wi‑Fi)

Run either dev server with `--host` and open the "Network" address it prints on the phone.
Location only works over HTTPS in a phone browser, so on the phone the finder falls back to
an area. For the real thing, install the apps: scan the QR codes in `docs/demo/demo-kit.html`
(or the PDF the team shares). They download the newest build from
https://github.com/fawuz-wizard/agent-finder/releases/tag/pilot-latest.

## 5. Optional: the real server

You need **Python 3.11+**.

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
APP_ENV=development SEED_ON_START=false uvicorn app.main:app --reload --port 8000
```

That creates an empty SQLite database (`apps/api/agentfinder.db`). Fill it with Orange's
agent file, which the team holds outside the repo:

```bash
python scripts/import_orange.py ~/Downloads/orange-agents-clean.csv --apply
python scripts/set_pin.py <agent code or aggregator line> 1234
```

Then point the web app at it: copy `apps/web/.env.example` to `apps/web/.env.local`, set
`VITE_API_MODE=live` and `VITE_API_BASE_URL=http://localhost:8000`, restart `npm run dev`.
Agents sign in with their agent code or Orange Money line; aggregators with their line.
Imported shops appear to customers only once an aggregator has confirmed their pin.

## 6. Checks before you push

```bash
cd apps/web && npm run typecheck && npm run lint && npm test && npm run build
cd apps/api && ruff check . && ruff format --check . && python -m pytest -q
```

Every push to `main` rebuilds both Android apps and replaces them on the `pilot-latest`
release, so the QR codes always serve the newest build.

## 7. Where things are

| | |
|---|---|
| Customer screens | `apps/web/src/features/end-user` |
| Agent screens | `apps/web/src/features/agent` |
| Aggregator screens | `apps/web/src/features/dealer` |
| Shared design pieces | `apps/web/src/features/end-user/components/finder.tsx`, `apps/web/src/features/agent/components/agentChrome.tsx`, tokens in `apps/web/src/design/tokens.css` |
| Demo network (mock mode) | `apps/web/src/services/operatorDemo.ts`, `demoNetwork.ts` |
| API | `apps/api/app` (FastAPI); ranking and wording in `app/services` |
| Commission table | `apps/api/app/services/commission.py` and `apps/web/src/features/agent/commission.ts` |
| Design doc, roadmap, demo kit | `docs/designs`, `docs/roadmap`, `docs/demo` |
| More detail | `apps/web/RUNNING.md` |
