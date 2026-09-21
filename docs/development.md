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
