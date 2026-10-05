#!/bin/sh
# Vercel build command for the `backend` service (see vercel.json at the repo root).
#
# Vercel runs no migration step of its own, so alembic and the user seed run
# here — at build time, where project env vars (unlike service bindings) exist.
#
# DATABASE_URL comes from the Vercel dashboard, scoped per environment:
#   * set for production  -> migrations + seed run on every production deploy
#   * unset for preview   -> skip with a warning instead of failing the build,
#                            so the frontend can still be previewed
#   * unset for production (or an unknown VERCEL_ENV) -> fail: the API would
#                            fall back to the localhost default and every
#                            request would 500.
#
# Deliberately fail-closed: only preview/development may skip.
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  case "${VERCEL_ENV:-}" in
    preview | development)
      echo "warning: DATABASE_URL is not set for '${VERCEL_ENV}' — skipping alembic migrations and seeding." >&2
      exit 0
      ;;
    *)
      echo "error: DATABASE_URL is not set for the '${VERCEL_ENV:-unknown}' environment." >&2
      echo "Set it in Project -> Settings -> Environment Variables, then redeploy." >&2
      echo "Note: Vercel/Neon/Supabase hand out postgres://... but SQLAlchemy needs" >&2
      echo "postgresql+psycopg://... — swap the scheme (add ?sslmode=require for Neon)." >&2
      exit 1
      ;;
  esac
fi

echo "Applying migrations for the '${VERCEL_ENV:-local}' environment..."
alembic upgrade head
python -m app.seed
