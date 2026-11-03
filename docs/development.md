# Development

## Prerequisites
- Node 22+, Python 3.11+, Docker (for the local PostGIS database), `make`.

## First run
```bash
cp .env.example .env                    # root: API + docker compose
cp apps/web/.env.example apps/web/.env.local
make install
make dev                                # db (docker) → migrations → api :8000 + web :5173
```
- Web: http://localhost:5173 · API: http://localhost:8000/health · OpenAPI: http://localhost:8000/docs

Without Docker: start any PostgreSQL 16 with PostGIS, point `DATABASE_URL` at it, then run
`make migrate`, `make api`, `make web` in separate terminals.

## Everyday commands
```bash
make test        # api tests
make lint        # eslint + ruff
make typecheck   # tsc
make build       # production web build
make check       # everything CI runs
```

## Conventions
- Colours only from `apps/web/src/design/tokens.css` (ESLint blocks hex literals in components).
- Domain code (`apps/api/app/domain`) does no I/O; put orchestration in `services/`.
- Public response models live in `app/schemas/public` and may never carry categories or thresholds.
- Migrations: `cd apps/api && alembic revision -m "describe change"` then edit the file; never edit
  an applied migration.
- Google Maps: import only from `features/map`, and only via a lazy route or dynamic import.

## Auth in development
`AUTH_MODE=demo` (default). Demo accounts and PINs are created by the seed script in the database
stage and are labelled as demo in the UI. Real phone OTP is a later stage.

## Database changes, limits and backups

**Migrations.** The API migrates the database at start-up (`app/db/migrate.py`). A new database
is built by `alembic/versions` alone; one made before migrations (the pilot's) is given any
missing tables, marked as at `0002_baseline`, then migrated forward. Any change to a model is a
new migration, written in `apps/api`:

    .venv/bin/alembic revision --autogenerate -m "what changed"

Read the generated file before committing it. `tests/test_migrations.py` fails if the models
and the migrations disagree, so a forgotten migration is caught in CI, not on the live server.

**Limits** (`app/core/limits.py`, kept in the `rate_events` table so a restart or a second
server does not reset them): five wrong PINs lock an account for 15 minutes (sign-in and the
transaction keypad), and twenty in a day lock it until the next day. Orange's national account
needs a 6-digit PIN. Anyone who knows an account's name can trigger the day lock on purpose;
the way back the same day is a new one-time code, which also lifts the lock: for an agent,
their aggregator issues it in the app; for an aggregator or the national account, the team
runs `.venv/bin/python scripts/issue_code.py <account>` and reads the code out in person. Each
agent may record at most 120 transactions an hour. Every download of the agents list is kept
in `export_log` (who, when, filter, row count). Customer search allows 60 a minute per device and 600 per network
address (many phones share one address on mobile networks); the public agent page 120 and
1,200; sign-in 30 and 300 per 10 minutes. Behind a load balancer, make sure the API sees the
customer's address, not the balancer's, or the address limits will be shared by everyone.

**Backups**, from `apps/api`, on a schedule (daily at least), each followed by its check:

    .venv/bin/python scripts/backup_db.py backup --dir /secure/backups --keep 14
    .venv/bin/python scripts/backup_db.py check  --dir /secure/backups

`check` restores the newest backup into a scratch database and counts every table; for
PostgreSQL set `RESTORE_CHECK_URL` to an empty scratch database. Keep backups encrypted, off
GitHub (`backups/` and `*.dump` are git-ignored) and copied to a second place.

**Before going live** (from the security review of 2026-11-01):
- `APP_ENV=production` exactly: it hides `/docs`, refuses localhost CORS origins and never seeds
  demo PINs. Production also refuses to start without `CORS_ORIGINS` and `CUSTOMER_HASH_KEY`.
- Behind a load balancer, start the API with `--forwarded-allow-ips` set to the balancer's
  addresses only (never `*`), so the per-address limits see each customer's own address.
- Still open: one-time sign-in codes do not expire yet (an aggregator re-issues one if lost).

