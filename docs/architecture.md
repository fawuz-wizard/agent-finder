# Architecture

Agent Finder is a real-time mobile-money agent service availability network. Customers ask
"who near me can likely handle a Le 500 withdrawal right now?"; agents answer with four words
(Most / Some / Small / None) that are compared server-side against their own private thresholds.
Customers only ever see the comparison result and how fresh it is.

```
Browser (React PWA) ──HTTPS JSON──► FastAPI (/api/v1) ──asyncpg──► PostgreSQL + PostGIS (Supabase)
        │                                │
        └──── Google Maps JS SDK ────────┘ (loaded lazily, only when the customer asks for the map;
                                            browser key restricted by HTTP referrer)
```

## Boundaries that matter

| Boundary | Rule | Enforced by |
|---|---|---|
| Domain layer (`apps/api/app/domain`) | Pure Python, no I/O | `tests/test_boundaries.py` |
| Public schemas (`apps/api/app/schemas/public`) | Never import internal models; no field named like `category`, `threshold`, `capacity`, `balance` | `tests/test_boundaries.py` |
| Browser ↔ database | The browser never holds a database or Supabase key; the API is the only writer | Configuration + RLS (later) |
| Google Maps | One import site: `apps/web/src/features/map`; SDK loads on first request | Code review + lazy routes |
| Colours | Every colour is a token in `apps/web/src/design/tokens.css` | ESLint `no-restricted-syntax` |
| Operator integration | Interface + null adapter; data flows in to enrich, never out | `app/integrations/operator` |

## Request path for a search (from the API stage onward)

1. `POST /api/v1/search` validates `{tx_type, amount_sle?, lat, lng | area, radius_m?}`.
2. PostGIS `ST_DWithin` on the GIST index returns agents within the radius with `ST_Distance`.
3. For each agent the service fetches the private category and thresholds, calls
   `domain.capacity.compare`, then discards the private values.
4. `domain.freshness` classifies the status age; `domain.visibility` applies closed / hidden / night.
5. `domain.ranking` orders by outcome tier → freshness → distance → id (deterministic).
6. The public response carries the phrase, freshness label, distance and location — nothing else.

## Layout

See `README.md` for the tree. Frontend shells (customer, agent, admin) are separate lazy chunks;
customers never download agent or admin code.
