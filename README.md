# Agent Finder

A real-time **agent service availability network** for Sierra Leone. Customers find a mobile-money
agent who can likely handle a specific transaction right now; agents share what they can do today
without ever exposing how much money they hold.

Agent Finder is an independent platform. It is not a wallet, not a bank, not a mobile-money service,
and not a public "who has money" board. It lists agents of any mobile-money network; Orange Money
agents are the first network shown in the demo. Agent Finder has no partnership with, and makes no
claims about, any operator.

## The problem

When someone in Freetown needs to withdraw or deposit money they walk to an agent and ask, "do you
have cash?" or "can you take this deposit?" If the answer is no, they walk to the next one and ask
again. That wasted trip is invisible to everyone: it never appears in any system, and the agent
loses a transaction they might have wanted.

## How it works

1. A customer says what they need: **Withdraw · Le 500**, near Lumley.
2. Agents have each tapped one of four words — **Most / Some / Small / None** — for cash and for
   deposits, as often as things change. Those words are compared on the server against the agent's
   own private thresholds.
3. The customer sees a ranked list: *Can likely handle your request · 0.4 km · Updated 18 min ago*,
   with a real Google Map available on request, and gets directions.
4. Freshness is first-class: a status ages visibly (fresh → ageing → may have changed → expired)
   and an expired status is never shown as available.
5. Agents stay in control: one-tap hide, close, and automatic night-time hiding for safety.

Nothing public ever contains an amount, a balance, a category or a threshold. That rule is enforced
by tests, not by convention.

## Architecture

```
React + TypeScript (Vite, Tailwind, PWA)  ──►  FastAPI (/api/v1)  ──►  PostgreSQL + PostGIS (Supabase)
             │
             └──► Google Maps JavaScript API (loaded lazily, only when the customer asks for the map)
```

- **Domain logic** (freshness, capacity comparison, visibility, ranking) is pure Python with no I/O.
- **Geospatial search** runs in PostGIS (`ST_DWithin` on a GIST index); the browser never computes distances.
- **Ranking** is deterministic and explainable: outcome tier → freshness → distance.
- **Operator integration** is an interface with a null adapter, so official operator data can enrich
  records later without a rebuild — and there is no fake operator API today.

See `docs/architecture.md`.

## Repository

```
agent-finder/
├── apps/web/        React PWA — customer, agent and admin shells (code-split)
├── apps/api/        FastAPI — domain, services, versioned API, Alembic migrations
├── infra/           docker-compose (local PostGIS), Supabase notes, deployment notes
├── docs/            architecture, development, Google Cloud setup
├── .env.example     every environment variable, documented
└── Makefile         make dev / test / lint / typecheck / build / check
```

## Development

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
make install
make dev      # PostGIS (Docker) → migrations → API on :8000 → web on :5173
```

Web http://localhost:5173 · API health http://localhost:8000/health · OpenAPI http://localhost:8000/docs

Details, conventions and the no-Docker path: `docs/development.md`.

## Environment

All variables are listed and explained in `.env.example`. The important ones:

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | API | PostgreSQL/PostGIS connection (asyncpg) |
| `CORS_ORIGINS` | API | Browser origins allowed to call the API |
| `AUTH_MODE` | API, web | `demo` (labelled demo PIN login) or `otp` (Supabase phone OTP, later) |
| `SUPABASE_*` | API only | Only used in `otp` mode. The service-role key never reaches the browser |
| `VITE_GOOGLE_MAPS_API_KEY` | web | Browser key restricted by HTTP referrer — see `docs/google-cloud-setup.md` |
| `VITE_GOOGLE_MAPS_MAP_ID` | web | Map ID with Advanced Markers |

Secrets are never committed.

## Testing

```bash
make test        # API: domain logic, HTTP, and architectural boundary tests
make lint        # ESLint + ruff
make typecheck   # TypeScript
make check       # everything CI runs
```

CI (`.github/workflows/ci.yml`) runs the web lint/typecheck/build and the API lint/tests, applies
migrations against a PostGIS container and confirms PostGIS is enabled, on every push and pull request.

## Investor demo

The demo build runs with `AUTH_MODE=demo`: demo accounts sign in with a labelled PIN, and the agent
network is **seeded demo data** ("Demo Agent — Lumley", "Demo Agent — Kissy", …) flagged as demo in
the database and in the interface. No agent in the demo is presented as verified by any operator.
The demo shows the full loop: a customer finds a suitable agent on real PostGIS search, sees freshness
and gets directions on a real Google Map; an agent changes availability and the customer's results
change with it.

## Status

Stage 3 (foundation) complete. Next: design system components (Stage 4), customer flow (5),
Google Maps (6), API (7), database (8), real data flow (9), agent dashboard (10), admin (11),
security and performance (12), demo QA (13).

## Licence

Proprietary. All rights reserved.
