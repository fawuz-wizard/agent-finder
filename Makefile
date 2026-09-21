.PHONY: help dev db api web install seed test lint typecheck build check migrate

help:
	@echo "Agent Finder — development commands"
	@echo "  make install    install web and api dependencies"
	@echo "  make dev        start db (docker), api and web together"
	@echo "  make db         start PostGIS via docker compose"
	@echo "  make api        run the FastAPI server (reload)"
	@echo "  make web        run the Vite dev server"
	@echo "  make migrate    apply database migrations"
	@echo "  make test       run api tests"
	@echo "  make lint       lint web and api"
	@echo "  make typecheck  typecheck web"
	@echo "  make build      production build of web"
	@echo "  make check      lint + typecheck + test + build (what CI runs)"

install:
	cd apps/web && npm ci
	cd apps/api && python -m pip install -e ".[dev]"

db:
	docker compose -f infra/docker-compose.yml up -d db

migrate:
	cd apps/api && alembic upgrade head

api:
	cd apps/api && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

web:
	cd apps/web && npm run dev -- --host

# Starts everything for local development. Requires Docker for the database.
dev: db
	@echo "Waiting for PostGIS..."
	@until docker compose -f infra/docker-compose.yml exec -T db pg_isready -U agentfinder -d agentfinder >/dev/null 2>&1; do sleep 1; done
	$(MAKE) migrate
	@trap 'kill 0' INT TERM; \
	  ( $(MAKE) api ) & ( $(MAKE) web ) & wait

test:
	cd apps/api && pytest -q

lint:
	cd apps/web && npm run lint
	cd apps/api && ruff check . && ruff format --check .

typecheck:
	cd apps/web && npm run typecheck

build:
	cd apps/web && npm run build

check: lint typecheck test build
