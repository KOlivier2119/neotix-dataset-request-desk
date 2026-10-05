# NOTES

## 1. Design

**Stack.** FastAPI (Python) + PostgreSQL 16, SQLAlchemy 2 sync (`db.query()` style), Alembic
hand-written migrations, Next.js 16 frontend that only talks to the API via `/api/*` rewrites
(no CORS exposure, cookies stay first-party).

**Data model.**

- `users(id, email, name, password_hash, role, organisation, is_active, created_at)` — role in
  `admin|operator|client` (CHECK constraint).
- `episodes(id, episode_id UNIQUE, robot_id, task_name, recorded_at, duration_seconds,
  operator_name, quality)` — CHECK constraints on robot list, `quality IN ('good','usable','bad')`,
  `duration_seconds > 0`.
- `dataset_requests(id, client_id FK, title, task_name, notes, episodes_requested, deadline,
  status, created_at)` — status CHECK constraint.
- `request_status_history(id, request_id FK, actor_id FK, from_status, to_status, changed_at)` —
  every transition recorded, append-only.
- `assignments(id, request_id FK, episode_id FK, assigned_at)` — UNIQUE(request_id, episode_id).

State lives in Postgres. The workflow lives in `app/services/workflow.py` (a transition table
statuses × roles); assignment rules in `app/services/assignments.py`. Routers stay thin.

**Hardest decisions.**

1. *Idempotent import counting.* `INSERT ... ON CONFLICT (episode_id) DO NOTHING` does not give an
   accurate per-row count back through psycopg 3 (`rowcount` came back -1 on batched executemany).
   I switched to `... RETURNING id` and count the returned rows. Without this, the report would
   have been wrong (negative imported counts — caught by the tests).
2. *Where the delivery-time gate lives.* "Cannot move to delivered with fewer than
   `episodes_requested` assignments" is enforced in the workflow service inside the same
   transaction, with a `SELECT ... FOR UPDATE` on the request row, so two concurrent operators
   cannot both deliver. All-or-nothing: the status change and the history row commit together.
3. *Timezone handling in deadlines.* JSON deadlines arrive tz-aware (`...Z`) while the DB column
   is naive. Comparing them crashed with a 500 (offset-naive vs offset-aware). Normalise to naive
   UTC before validating/storing.

**Lists, search and charts.**

- **Everything that filters does it on the server.** `GET /episodes` accepts `q` (ILIKE over
  episode id, robot, task, operator) and an exact `robot_id`; `GET /requests` accepts `q` (title,
  task, notes, client name/email via join); `GET /users` accepts `q` (name/email/organisation) and
  `role`. Client-side filtering was the first attempt and it is wrong the moment rows are paginated
  — it only ever searched the current page. `%` and `_` are escaped in user input
  (`app/services/search.py`) so searching for `pick_1` cannot match `pickx1`.
- **Page size is 10** everywhere (`PAGE_SIZE`), with a `pageSize + 1` fetch to detect a next page
  without a COUNT query. `/requests` and `/users` are deliberately uncapped when no `limit` is sent
  so the dashboard KPI counts stay correct. Ordering is always `created_at/recorded_at DESC, id DESC`
  so pages never overlap or skip a row.
- **Filters live in the URL** (`?q=…&quality=…&page=2`) on `/episodes`, `/requests` and `/users` —
  a refresh or a shared link keeps the same view, and the search input is debounced (300 ms) so a
  keystroke does not fire a request per character.
- **Charts are hand-rolled SVG** (`LineChart.tsx`, `BarChart.tsx`) rather than a charting library:
  no new dependency, full control of the styling, and it needs `viewBox`-free responsive sizing via
  `ResizeObserver` so labels stay crisp. Nice-number y ticks (1/2/2.5/5/10 × 10ⁿ), gradient area
  fill for single series, a hover guide + tooltip card, a clickable legend that toggles per-robot
  series, horizontal bars with share % for ranked counts, and explicit empty states. The axis is
  scaled to the tallest *point* — scaling by series totals flattened every line against the
  baseline (caught in a screenshot pass).

**Deployment (Vercel services).** One project, two services (`backend`, `frontend`) split by the
top-level rewrites in `vercel.json`:

- *The path mismatch is the interesting part.* Services receive the **original** request path, so
  `/api/episodes` would reach FastAPI as `/api/episodes` while the app declares `/episodes`. Fixed
  with a `request.path` transform in the backend service's own `routes`
  (`src: "/api/(.*)"`, `args: "/$1"`), which rewrites only the path the runtime observes while the
  top-level rewrite still picks the service. Zero backend code changes — tests, CI and docker are
  untouched.
- *No binding, on purpose.* A binding exists for service-to-service calls, and after routing
  there are none left: the browser hits `/api/*` on the same origin. The one internal URL in the
  codebase (`API_URL` = `http://api:8000`) is a local-dev/docker concern, so it stayed rather than
  becoming a binding nothing would read. Bindings also don't resolve at build time or in middleware,
  so the frontend's `proxy.ts` could not have used one anyway.
- *Migrations live in `buildCommand`* (`sh scripts/vercel_build.sh` → `alembic upgrade head &&
  python -m app.seed`) because Vercel runs no migration step, and project env vars — unlike
  bindings — do exist at build time. The first deploy failed on the missing `DATABASE_URL`, so the
  script is now fail-closed: production (or an unknown `VERCEL_ENV`) without `DATABASE_URL` fails
  the build with instructions, while previews skip with a warning so the frontend can still ship.
  The cost of the happy path remains that every deploy holding `DATABASE_URL` migrates *and seeds*
  whatever it points at, previews included.

## 2. Deliberately left out / simplified

- **No frontend tests.** Domain correctness is enforced server-side and covered by pytest; UI flows
  verified manually via curl through the Next proxy and a headless-Chrome pass over `/login`,
  `/`, `/analytics`, `/episodes`, `/requests` and `/users` (login photo, Power Grotesk, pagination
  controls, filtered/empty list states, charts). Screenshots drive the checklist: the URL-synced
  filters make `/episodes?q=water` and `/episodes?q=zzzznope` directly renderable states.
- **Analytics median uses latest delivered entry**; no handling of re-delivery edge cases beyond that.
- **Episode uniqueness is the file's external `episode_id` string**, not (robot, task, timestamp).
  A recording-system ID collision is the right failure mode to skip on, and we log it as
  `skipped_existing`.
- **`title` kept alongside `task_name`** on requests (brief asked for `task_name`; earlier
  iterations had `title`). Empty title defaults to `task_name`.
- **Sanity checks skipped**: future `recorded_at` (e.g. `2031-01-01`) imports fine;
  absurd-but-positive durations (e.g. `999999`) import fine. Noted in the import report only
  indirectly via `rejected` for clear violations; a follow-up could add a flagged-not-rejected list.
- **Auth tokens in httpOnly cookies**; no refresh-token rotation, no password reset flow.
- With two more days: export-job simulation stretch, WebSocket live updates, daily rollup table for
  analytics. Offset pagination (`limit`/`offset` + prev/next) now ships on `/episodes`, `/requests`
  and `/users`; cursors would be the next step for very large episode tables.

## 3. Something that went wrong

Three bugs found while wiring the frontend to the API:

1. **CSV import reported `imported: -1`.** Cause: batched `INSERT ... ON CONFLICT DO NOTHING` via
   psycopg 3 returned `rowcount = -1`. Diagnosed by writing a minimal reproduction outside the app
   and observing the same -1, then checking sqlalchemy/psycopg docs; fixed by switching to
   `RETURNING id` and counting returned ids. The count-add-up test (`imported + skipped +
   rejected == total_rows`) is what caught the original symptom.
2. **POST /requests 500'd** with `TypeError: can't compare offset-naive and offset-aware datetimes`
   when the client sent `2026-12-31T00:00:00Z`. Diagnosed from the uvicorn traceback; fixed by
   converting aware datetimes to naive UTC before comparison/storage. Also fixed in the same pass:
   FastAPI's trailing-slash redirects (308, method-changing for POST) leaked through the Next
   rewrite, so collection routes were re-registered without the trailing slash and the frontend
   stopped using trailing slashes.
3. **The login photo never rendered.** `frontend/proxy.ts` matched every path except
   `api|_next/static|_next/image|favicon.ico`, so a request for `/robot.jpeg` was redirected to
   `/login` — including the internal fetch `/_next/image` performs, which then got HTML back and
   answered `400 The requested resource isn't a valid image`. Fixed by also excluding anything with
   a file extension (`.*\\..*`) from the matcher, as the Next docs warn for exactly this case.

## 4. Security

- Passwords hashed with argon2; JWT (HS256) in an `httpOnly`, `SameSite=lax` cookie — not readable
  from JS, not stored anywhere client-side.
- `COOKIE_SECURE` flag exists for HTTPS deployments.
- Every endpoint except `/health` and `/auth/login` has a server-side auth dependency; role checks
  are server-side (`require_role`), never just hidden buttons.
- Input validation via Pydantic schemas; row-level CSV validation before any insert; 413 on upload
  size > 10 MB.
- Two vulnerabilities I would worry about most:
  1. **IDOR / broken object-level authorization** — clients must never read or transition other
     clients' requests. Covered by tests (404 on read, 403/409 on transition) but remains the
     highest-risk class as the API grows.
  2. **Injection via un-parameterised SQL** — all analytics are written as `text()` with bound
     parameters; any future string interpolation of dates/ids would be a SQLi hole. Secondarily,
     CSV formula injection if reports are opened in a spreadsheet (low risk, internal tool).

## 5. Scale

What breaks first at 10× users and 100× episodes:

- **`episodes` table scans** in `GET /episodes` and the analytics queries. Fixes: indexes
  (`recorded_at`, `(quality, recorded_at)`), monthly partitioning by `recorded_at`, and a daily
  rollup table/materialized view for analytics. The new `q` search is an unanchored
  `ILIKE '%term%'`, which can never use a btree — at 100× rows it needs a `pg_trgm` GIN index
  (and a *anchored* prefix match, `term%`, for the common "type the episode id" case).
- **Single Postgres primary** becomes the write bottleneck for imports; batch imports already exist,
  next step is a background worker (e.g. pgmq/arq) for large files instead of a synchronous import
  request.
- **Connection pool on the API** under many concurrent operators; add PgBouncer and set pool sizes.
- **Session-per-request import pattern** is fine at current volume; at 100× we'd also stream large
  uploads to disk instead of holding 10 MB in memory.
- The **transition check-then-act** under concurrency is already guarded by `FOR UPDATE`;
  assignment races are handled by the UNIQUE constraint plus savepoints.

## 6. AI tooling

TODO — fill in which tools were used and for what.
