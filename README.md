# Agent Finder

A mobile-money agent finder for Sierra Leone, built for the Orange Summer Challenge with Orange Sierra
Leone. Three apps from one code base, one API behind them:

- **Customer app**: a customer says what they need (cash out or cash in, optional amount), sees the
  nearby agents most likely to serve it, and gets directions. Customers see words and a percentage,
  never an agent's money.
- **Agent App**: the agent opens and closes their shop, records transactions, sets hours, pins and
  photographs the shop, and sees how customers see them.
- **Aggregator console**: the aggregator registers agents, confirms their pins, handles float requests,
  and downloads reports (CSV, or a zip of CSVs).

This package is for the developer who takes it to live. It runs as a demo with no server, or live
against the API.

---

## 1. Run the demo (no server, no database)

Needs Node 20 or newer.

### In VS Code
1. File > Open Folder, choose this folder.
2. Terminal > Run Task > **Demo: install** (first time only).
3. Terminal > Run Task > **Demo: run both**. Two terminals open, one per app.
4. Open http://localhost:5175 (customer) and http://localhost:5177 (agent and aggregator).
5. To stop, click the bin icon on each terminal.

### In any terminal
```
cd apps/web
npm install
VITE_API_MODE=mock npx vite --port 5175                          # customer app
VITE_API_MODE=mock VITE_APP_SURFACE=agent npx vite --port 5177   # agent and aggregator
```
Windows PowerShell:
```
cd apps/web
$env:VITE_API_MODE="mock"; npx vite --port 5175
$env:VITE_API_MODE="mock"; $env:VITE_APP_SURFACE="agent"; npx vite --port 5177
```

### Signing in on the agent and aggregator app
Nobody chooses a role; the number decides.

| Who | Number | PIN |
|---|---|---|
| Aggregator (Kissy Distribution) | `kissy` | `1234` |
| Agents | `024`, `031`, `009`, `017`, `038` | `1234` |

`024` shows the most: an old declaration, a pending float request, two customer-reported problems. The
customer app opens on a simulated phone home screen; tap the Agent Finder banner.

In the demo each browser keeps its own copy of the data, so an agent's change is not seen by a customer
on another phone. Live mode is what makes them share one database.

---

## 2. How it is built

```
 Customer app ─┐
 Agent App ────┼── HTTPS, JSON ──►  API (FastAPI, /api/v1)  ──►  database
 Aggregator ───┘                     │                           SQLite on a laptop,
 (React, one build per surface)      │                           PostgreSQL + PostGIS live
                                     └── operator adapter (read-only, for Orange's data later)
```

### Front end: `apps/web`
- React 18 + TypeScript, built with Vite, styled with Tailwind 4 on Orange design tokens
  (`src/design/tokens.css`: Poppins for the customer module, square Orange style for the platform,
  light and dark).
- One code base, two builds: `VITE_APP_SURFACE=customer` (default) or `agent` (the Agent App and the
  aggregator console together).
- Two data modes: `VITE_API_MODE=mock` runs everything in the browser from demo data
  (`src/services/operatorDemo.ts`, `demoNetwork.ts`); `live` calls the API (`src/services/*Api.ts`).
  The two must behave the same.
- Maps: OpenStreetMap tiles and place search, no key needed. A Google Maps key is optional for the
  route map.
- Android: Capacitor wraps the same build into two APKs (customer, agent), built by GitHub Actions
  (`.github/workflows/android.yml`).

### Back end: `apps/api`
- Python 3.11+, **FastAPI** with async **SQLAlchemy 2**. Tables are created by the app at start
  (`Base.metadata.create_all`); Alembic holds only the Postgres extensions migration.
- **Database**: one SQLite file (`agentfinder.db`) by default, nothing to install. Live:
  PostgreSQL 16 + PostGIS through `DATABASE_URL=postgresql+asyncpg://...`;
  `infra/docker-compose.yml` starts one locally. Hosting is planned on AWS; `apps/api/Dockerfile`
  builds the API as one container.
- **Layout**
  | Folder | What it holds |
  |---|---|
  | `app/api/v1/` | the HTTP routes: `search` (customers), `agents` (public shop page), `agent_app` (the Agent App), `dealer` (the aggregator console, reports, CSV exports), `float_requests`, `reports` (visit reports, ratings), `auth` |
  | `app/domain/` | pure rules with no I/O: freshness, visibility (closed, hidden at night 20:00 to 07:00), ranking order. Checked by `tests/test_boundaries.py` |
  | `app/services/` | the logic: `ranker` (served percentage), `phrasing` (the words customers read), `evidence` and `ledger` (what an agent has served), `points` (who is on the map), `commission`, `photo`, `schedule`, `trust`, `usage` |
  | `app/integrations/operator/` | the one read-only adapter for Orange's transaction data; `none` until Orange gives access |
  | `app/db/models.py` | the tables (below) |
  | `scripts/` | `import_orange.py` (Orange's agent file into the database), `issue_code.py` (a one-time sign-in code), `place_agents.py`, `train_ranker.py` |
- **Tables**: `dealers` (aggregators), `agents`, `agent_transactions` (what agents record),
  `availability_events`, `outcome_reports` (customer visit reports), `float_requests` and
  `float_request_events`, `actions` and `audit_log` (who did what, when), `sessions`,
  `search_impressions` (what was shown, for the ranker), `ranker_models`, `usage_events`.
- **Sign-in**: nobody signs up; the aggregator or the team issues the account. First sign-in with a
  six-digit one-time code, then the person chooses a 4 to 6 digit PIN. PINs are stored as salted
  PBKDF2-SHA256 hashes; five failures lock the account for 15 minutes. Sessions are random bearer
  tokens, 30 days, ended on sign-out. The number typed decides agent or aggregator.
- **Access**: every route is scoped to a role and a subject; an aggregator sees only their own agents;
  a wrong role gets 404, not 403. Public routes never return a balance, float or threshold, by test.
- **Privacy**: a customer's position is rounded to about 110 m on the phone and never stored. A shop
  appears to customers only after its aggregator confirms the pin. Orange's file is imported without
  date of birth, ID, e-mail or contact person.
- **Logs**: JSON lines on stdout, one request id per request.

### What a customer search does
1. `POST /api/v1/search` with the transaction, optional amount, and a point.
2. The API finds open, confirmed agents within 500 m (wider only when nobody near can serve).
3. For each, it scores how likely the visit is to succeed and rounds it to a served percentage.
4. It returns the agents with words, the percentage, the distance and how fresh the information is,
   never a money figure.

---

## 3. Run it live (API + database)

```
cd apps/api
python -m venv .venv
.venv/bin/pip install -e ".[dev]"              # Windows: .venv\Scripts\pip
SEED_ON_START=true APP_ENV=development .venv/bin/python -m uvicorn app.main:app --port 8000

cd apps/web
printf 'VITE_API_MODE=live\nVITE_API_BASE_URL=http://localhost:8000\n' > .env.local
npx vite --port 5173                                         # customer
VITE_APP_SURFACE=agent npx vite --port 5174                  # agent and aggregator
```
API docs: http://localhost:8000/docs. `SEED_ON_START=true` fills an empty database once with the demo accounts (aggregator `kissy`, agents `024`, `031`, `009`, `017`, `038`, PIN `1234`); without it the live database starts empty and real accounts are issued with `scripts/issue_code.py`; Orange's agent file
is not in this package (it is Orange's data) and is imported with `scripts/import_orange.py` when
provided. `.env.example` lists every setting. More detail: `apps/web/RUNNING.md`.

## 4. Checks
```
cd apps/api && .venv/bin/python -m pytest -q
cd apps/web && npm run typecheck && npm run lint && npm test
```

## 5. Changing before going live (not in this code yet)
- The served percentage moves to a 7-day rule: days the agent was active, whether they did the exact
  transaction type and size, and customer reports. Never 100; 95 at best. The subtraction ledger is
  retired. Agents and aggregators see a plain note, never the percentage or points. The rule and its
  picture come as separate documents.
- Activity will come from Orange's transaction SMS or API if access is granted; until then agents
  record their transactions.
- Hosting on AWS; the date is set by the account holder.
