# Run Agent Finder on your machine

You need **Git** and **Node 20** (check with `node -v`). Nothing else for the demo.

## 1. Get the code

```bash
git clone https://github.com/fawuz-wizard/agent-finder.git
cd agent-finder
```

In VS Code: File › Open Folder › `agent-finder`.

## 2. Run the app (demo mode, no backend needed)

Open the VS Code terminal (Ctrl + `) and run:

```bash
cd apps/web
npm install
npm run dev
```

Open http://localhost:5173 in your browser. It runs on the in-browser demo network: all the
data is simulated in the app and resets on reload. To use it from a phone on the same wifi,
run `npm run dev -- --host` and open the "Network" address it prints.

## 3. What to try

**Demo host shell** (`/`): the simulated Max it home. The switch "Orange Money feed (demo)"
flips the whole product between "capacity from the agents' history and the dealer's notes"
(off) and "capacity read from Orange Money transactions" (on).

**Customer**: tap the Agent Finder banner, pick Cash out and 8,000 in Lumley. Tap
"Get directions" on an agent: the way there opens under the agent, inside the app. Tap
"I'm going there"; about 20 seconds later the home screen asks how it went (15 minutes in
live mode).

**Agent**: go to `/sign-in`, choose Agent, ref `Agent 024`, PIN `1234`. The home shows
presence, working hours, what customers see, and float. Availability is Open / Away /
Closed only. Working hours has the weekly pattern and today-only changes; set a half day
ending a few minutes from now and the home screen warns you with "Stay open 1 more hour".

**Dealer**: sign out, sign in as Dealer, ref `kissy`, PIN `1234`. Dashboard tiles filter the
register; the Float tab opens on "Likely to run short"; Attention rows have Nudge, Call,
Snooze, Resolve. Open an agent and fill "Usually handles" — that is what sets what customers
are told the agent can cover, until Orange Money's records replace it.

## 4. Optional: run the real API too

You need **Python 3.11+**.

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

That creates a local SQLite database seeded with the demo agents (PIN 1234). Then point the
web app at it: copy `apps/web/.env.example` to `apps/web/.env.local`, set
`VITE_API_MODE=live`, and restart `npm run dev`.

To see a real Google map under an agent instead of the sketch, add a Maps browser key to
`apps/web/.env.local` as `VITE_GOOGLE_MAPS_API_KEY` (see `docs/google-cloud-setup.md`).

## 5. Checks

```bash
cd apps/web && npm run typecheck && npm run lint && npm test
cd apps/api && ruff check . && ruff format --check . && python -m pytest -q
```
