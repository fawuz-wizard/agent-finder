#!/bin/sh
# Migrations only where they apply: the Alembic baseline enables PostGIS and pgcrypto, which
# exist on Postgres (Supabase) and not on SQLite. Tables themselves are created by the app.
set -e
case "${DATABASE_URL:-}" in
  postgresql*) alembic upgrade head ;;
  *) echo "entrypoint: not Postgres, skipping migrations" ;;
esac
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
