# Deployment

One codebase, three hosted pieces, plus the two Android apps that point at them.

| Piece | Target | How |
|---|---|---|
| `apps/api` | Render (Docker) | `render.yaml` at the repository root is a Render blueprint: Dashboard → New → Blueprint → this repo. Fill `DATABASE_URL` and `CORS_ORIGINS` before the first deploy. The container runs `alembic upgrade head` then uvicorn; `APP_ENV=production` turns off `/docs`, demands `CORS_ORIGINS`, and `SEED_ON_START=false` keeps demo accounts out. Fly.io or Railway run the same `apps/api/Dockerfile`. |
| Database | Supabase | New project → Database → Extensions → enable `postgis` and `pgcrypto`. Use the **connection pooling** URL with the `postgresql+asyncpg://` prefix as `DATABASE_URL`. See `infra/supabase/README.md`. |
| `apps/web` | Vercel | Import the repo, root directory `apps/web`, build `npm run build`, output `dist`. Env: `VITE_API_MODE=live`, `VITE_API_BASE_URL=https://<api>.onrender.com`, `VITE_GOOGLE_MAPS_API_KEY` (restricted to the Vercel domain, see `docs/google-cloud-setup.md`). The SPA rewrite is in `vercel.json`. |
| Android apps | GitHub Actions | Set the repository variable `API_BASE_URL` to the API's https address; every push to `main` then builds both APKs live. `CORS_ORIGINS` on the API must include `https://localhost` and `capacitor://localhost` (the apps' origins) as well as the Vercel domain. |

## First boot on a real database

1. Deploy the API with `SEED_ON_START=false`. The tables are created on startup; the database is empty.
2. Create the dealer: `python -m scripts.set_pin` cannot create one, so insert the first dealer row
   (id, name, pin hash, permissions) with a one-off script against `DATABASE_URL`, or run the Orange
   import (`scripts/import_orange.py --apply`) which creates the aggregators, then set their PINs.
3. Register the venue agents from the dealer's app, or import and pin them.
4. Keep the Orange file out of every host; only its hash travels with imported rows.

## What is not hosted yet

The customer web app and the API are stateless apart from the database. Nothing caches
financial values. Logs are JSON on stdout with request ids; Render keeps them 7 days on the
starter plan, so export the records CSVs (dealer Profile) for anything the team wants to keep.
