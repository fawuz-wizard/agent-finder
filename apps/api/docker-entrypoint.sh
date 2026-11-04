#!/bin/sh
# The app brings the database to the current schema itself at start-up (app/db/migrate.py):
# a new database by the migrations, an older one by stamping it at the baseline first. Running
# `alembic upgrade head` here as well would try to create tables that already exist.
#
# Uvicorn's own proxy handling and access log are off: the app reads X-Forwarded-For only from
# FORWARDED_ALLOW_IPS, and its request log keeps the path without the query string, which can
# hold a customer's position.
set -e
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --no-proxy-headers --no-access-log
