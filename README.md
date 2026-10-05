# Dataset Request Desk

Internal platform for a robotics data collection company: clients request datasets,
operators fulfil them by assigning recorded episodes, clients accept or reject deliveries.

- Backend: Python 3.14, FastAPI, SQLAlchemy 2 (sync), PostgreSQL 16, Alembic migrations
- Frontend: Next.js 16 (App Router, TypeScript, Tailwind, SWR), talks to the API via `/api/*` rewrites
- Tests: pytest (40 tests); CI via GitHub Actions

## Run it

Prerequisites: Docker and Docker Compose.

```bash
docker compose up --build
```

This starts Postgres, runs Alembic migrations, seeds users, starts the API, and serves the web UI.

- Web: http://localhost:3000
- API: http://localhost:8000
- API docs: http://localhost:8000/docs
- Health: http://localhost:8000/health

### Seed users

| Email | Password | Role |
|---|---|---|
| admin@example.com | admin123 | admin |
| ops1@example.com | ops123 | operator |
| ops2@example.com | ops123 | operator |
| client-a@example.com | client123 | client |
| client-b@example.com | client123 | client |

Seed episodes are imported separately — except on Vercel, where the build step
runs the importer for you (see [Deploy to Vercel](#deploy-to-vercel)).

## Import the CSV

CLI (inside the backend container or a local venv):

```bash
docker compose exec api python -m app.import_episodes seed/episodes.csv
```

Or via API (operator/admin only, multipart upload, max 10 MB):

```bash
curl -b cookies.txt -F "file=@seed/episodes.csv" http://localhost:8000/episodes/import
```

Both are idempotent (unique key `episode_id`, `INSERT ... ON CONFLICT DO NOTHING`) and return a
report: `total_rows`, `imported`, `skipped_duplicate_in_file`, `skipped_existing`,
`rejected: [{row, reason}]`.

## Tests

One command:

```bash
make test
```

This starts the compose Postgres, creates `desk_test` if needed, and runs pytest inside the API
container. Equivalent manual run:

```bash
cd backend && TEST_DATABASE_URL=postgresql+psycopg://desk:desk@localhost:5432/desk_test python -m pytest tests/ -v
```

CI: `.github/workflows/ci.yml` runs the same suite on every push/PR.

## Analytics

`GET /analytics?from=YYYY-MM-DD&to=YYYY-MM-DD` (operator/admin). All aggregation happens in SQL:

1. episodes recorded per day per robot (`date_trunc('day', recorded_at)`, grouped),
2. requests by status (count) and median hours from `submitted` to latest `delivered`
   (`percentile_cont(0.5) WITHIN GROUP` over `request_status_history`),
3. top 5 task names by count of `quality='good'` episodes.

Range is half-open (`recorded_at >= from AND < to + 1 day`); `from <= to` and the range is capped
(default 366 days, `ANALYTICS_MAX_RANGE_DAYS`), otherwise 422.

### Analytics at 5 million episodes

- **Indexes**: `episodes(recorded_at)` for the range scan; composite
  `episodes(quality, recorded_at)` for the top-tasks query; `request_status_history(request_id, to_status)`
  for the median pairing. Verify with `EXPLAIN ANALYZE` — expect index range scans, not seq scans.
- **Range cap matters**: an unbounded request forces a full scan/group. The cap keeps the working set small.
- **Partitioning**: at that scale, partition `episodes` by `recorded_at` (monthly) so the planner prunes
  irrelevant partitions.
- **Daily rollup**: if the endpoint is hit often, precompute `episodes_daily(day, robot_id, task_name, quality, count)`
  (or a materialized view) refreshed nightly/incrementally after import, and serve from it.
- **EXPLAIN ANALYZE** on a production-sized dataset is how you verify rows scanned, index usage, timing.

## API overview

| Endpoint | Roles |
|---|---|
| `GET /health` | public |
| `POST /auth/login` | public |
| `POST /auth/logout` | any authenticated user |
| `GET /auth/me` | any authenticated user |
| `GET /users` | admin |
| `POST /users` | admin |
| `PATCH /users/{id}` | admin |
| `POST /requests` | client |
| `GET /requests` | client (own only), operator, admin |
| `GET /requests/{id}` | client (own only), operator, admin |
| `POST /requests/{id}/transition` | operator/admin (most), client (accept/reject own) |
| `POST /requests/{id}/assignments` | operator, admin |
| `DELETE /requests/{id}/assignments/{episode_id}` | operator, admin |
| `GET /episodes` | operator, admin |
| `POST /episodes/import` | operator, admin |
| `GET /analytics` | operator, admin |

## Deploy to Vercel

`vercel.json` at the repo root configures **one project with two services**:

| Service | Root | Framework | Exposed on |
|---|---|---|---|
| `backend` | `backend/` | FastAPI (Python) | `/api/(.*)` |
| `frontend` | `frontend/` | Next.js | `/(.*)` (catch-all, last) |

Top-level rewrites run in order, so:

| Request | Handled by | Path the service sees |
|---|---|---|
| `GET /api/episodes` | `backend` | `/episodes` |
| `POST /api/auth/login` | `backend` | `/auth/login` |
| `GET /analytics` | `frontend` | `/analytics` |

The backend service declares Vercel's documented `request.path` transform to
strip the `/api` prefix, **and** `StripApiPrefix` (`backend/app/middleware.py`)
strips it again inside FastAPI. The transform did not apply on the live
deployment — `/api/health` came back 404 instead of `{"status":"ok"}` — so
routing now relies on the middleware, which is covered by
`tests/test_api_prefix.py` and is a no-op once the prefix is already gone. That
is what lets the FastAPI routes, the tests and the docker setup keep their
current `/episodes` / `/auth/login` shape.

**There is deliberately no service binding.** The browser calls the API directly
over the public `/api/*` route on the same origin, so no service ever calls
another service; `frontend/next.config.ts`'s `API_URL` rewrite exists only for
`next dev` and docker compose.

### Setup

1. Import the repo in Vercel. Leave Root Directory empty — `vercel.json` sits at the repo root.
2. **Before the first deploy**, set environment variables (Project → Settings →
   Environment Variables, Production): `DATABASE_URL`, `SECRET_KEY`,
   `COOKIE_SECURE=true`. A production build fails on purpose until `DATABASE_URL`
   exists, because the API would otherwise fall back to the localhost default.
   See `.env.example` for details and the `postgres://` → `postgresql+psycopg://` conversion.
3. Deploy. The backend build command is `sh scripts/vercel_build.sh`:
   `alembic upgrade head`, then `python -m app.seed` (users) and
   `python -m app.import_episodes ../seed/episodes.csv` (episodes) — all
   idempotent, so a redeploy never duplicates rows. It fails production builds
   that have no `DATABASE_URL` and skips with a warning on previews, so the
   frontend can still be previewed without a database.

Smoke test: `https://<domain>/api/health` → `{"status":"ok"}`.

Local development is unchanged — `docker compose up --build` (API `:8000`,
web `:3000`), or `next dev` against `API_URL`. `vercel dev` runs both services
together locally and injects the same routing.

### Known limits on Vercel

- The image optimizer `/_next/image` is not served — every optimizer URL returns
  the app's own not-found page while the raw file is `200 image/jpeg`. So
  `next.config.ts` sets `images.unoptimized: true` and the login photo loads
  straight from `public/robot.jpeg`. Verified on the live deployment.
- FastAPI's `/docs` and `/openapi.json` are not under `/api`, so they are not
  routed to the backend (they would land on the frontend). Use `/api/health`.
- Vercel caps request bodies at 4.5 MB, below the API's own 10 MB CSV upload cap,
  so very large episode imports fail at the edge before reaching FastAPI.
- The build seeds `seed/users.json` demo accounts wherever `DATABASE_URL` is set —
  including preview deployments pointed at the production database.

## Configuration

See `.env.example`. Defaults work out of the box for local dev; set a real `SECRET_KEY` in production.

## Stretch item

None.
