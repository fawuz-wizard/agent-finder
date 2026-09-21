# Supabase notes

Production database and authentication run on Supabase. Nothing here is required for local development.

- Enable extensions `postgis` and `pgcrypto` (Database → Extensions). The Alembic baseline also issues
  `CREATE EXTENSION IF NOT EXISTS`, which succeeds on Supabase once the extension is enabled for the project.
- Run migrations from a developer machine or CI with `DATABASE_URL` set to the project's connection string
  (asyncpg driver prefix: `postgresql+asyncpg://…`).
- Row Level Security policies (defence in depth) are added in the database stage as SQL under this folder.
- The browser never holds a Supabase key. Only the API uses the service-role key, and only in `AUTH_MODE=otp`.
