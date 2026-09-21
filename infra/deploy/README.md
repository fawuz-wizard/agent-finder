# Deployment

| Piece | Target | Notes |
|---|---|---|
| `apps/web` | Vercel | Root directory `apps/web`, build `npm run build`, output `dist`. Set `VITE_*` env vars. SPA rewrite to `index.html` is handled by `vercel.json`. |
| `apps/api` | Render or Fly.io | `uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Set `DATABASE_URL` (Supabase, asyncpg prefix), `CORS_ORIGINS`, `APP_ENV=production`, `AUTH_MODE`. Run `alembic upgrade head` as a release step. |
| Database + Auth | Supabase | Enable `postgis`, `pgcrypto`. See `infra/supabase/README.md`. |

Both `render.yaml` and `fly.toml` templates will be added when the first deployment is made
(Stage 12), so that they reflect real settings rather than guesses.
