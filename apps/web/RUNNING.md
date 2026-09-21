# Running Agent Finder

Both experiences — the customer module and the agent/dealer app — run from the **same dev server**. They are different URLs, not different projects.

Two ways to run it:

- **Mock mode** (default) — everything runs in the browser from demo data. No server. Good for a quick look; each browser has its own private copy, so an agent's change is NOT seen by a customer on another phone.
- **Live mode** — the browser talks to the API in `apps/api`. One shared server, one shared database: what an agent declares on their phone changes what every customer sees. This is the mode for the pilot (10+ real users) and the mode gstack should review.

Requires Node 18+ (`node -v`). Live mode also needs Python 3.11+ (`python --version`).

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

## Other commands

```bash
npm test          # 39 tests
npm run typecheck
npm run lint
npm run build     # production build
npm run preview   # serve the production build
```
