Decision: Sync SQLAlchemy (not async) — keeps code simple, avoids async session complexity and footguns.
Decision: Manual initial migration (not autogenerate) — avoids requiring a live DB at scaffold time.
Decision: pool_pre_ping=True on engine — handles DB restart in Docker without stale connections.
Decision: Default values for database_url and secret_key in Settings — lets tests import app without env vars set; overridden in Docker/prod.
Decision: assignments can be removed only while a request is in_progress — removing after submission would corrupt audit trail
Decision: assigned episodes may differ from request's task_name — UI defaults filter to task_name but operator can change it
Decision: assignments kept on rejected->in_progress rework — avoids data loss if operator resubmits same work
Decision: admin cannot deactivate themselves — enforced in PATCH /users/{id} service layer, returns 422
Decision: seed reads users.json with 5 users (1 admin, 2 operators, 2 clients) — ops2 added vs Batch B spec because users.json has 2 operators
Decision: user_id in log set via request.state to avoid coupling middleware to auth logic
Decision: dependencies.py created in commit 4 alongside auth.py — auth.py imports get_current_user so file must exist before commit
Decision: no frontend tests — deliberate. The evaluation centres on domain-rule correctness, which is covered server-side by pytest; UI flows were verified manually in a browser instead.
Decision: frontend stays in `frontend/` (pre-existing directory) rather than moving to `web/`; docker-compose `web` service builds from it.
Decision: Next.js 16 renamed middleware.ts to proxy.ts — using `frontend/proxy.ts` for the cookie-absent redirect (UX only).
Decision: added GET /requests/{id} `assigned_episode_ids` because the detail UI needs assigned count and unassign, and no such endpoint existed.
