# Dataset Request Desk

Internal platform for tracking robot teleoperation episode collection and dataset requests.

## Analytics at 5 million episodes

The analytics endpoint runs three queries, each going to the database (no Python-side
aggregation):

1. `episodes_per_day_per_robot` — `date_trunc('day', recorded_at)`, `GROUP BY day, robot_id`
2. `requests_by_status` + `median_hours_submitted_to_delivered` — status counts on
   `dataset_requests`; median via `percentile_cont(0.5) WITHIN GROUP` over
   `request_status_history` pairs (submitted entry paired with the latest delivered entry)
3. `top_tasks_by_good_episodes` — `GROUP BY task_name` on episodes with `quality='good'`, `LIMIT 5`

All queries filter on a half-open range (`recorded_at >= from AND recorded_at < to + 1 day`).

How they behave at 5M episodes:

- **Indexes.** `episodes(recorded_at)` for the range scan, plus a composite
  `episodes(quality, recorded_at)` for the top-tasks query so the `quality='good'`
  filter rides the index. `request_status_history(request_id, to_status)` for the
  median pairing. Verify with `EXPLAIN ANALYZE` on real data — the plan should show an
  index range scan, not a sequential scan.
- **Range cap matters.** The default is 366 days (configurable via
  `ANALYTICS_MAX_RANGE_DAYS`, see `app/config.py`). An unbounded "all time" request
  forces a full scan/group of the table; a bounded window keeps the working set small.
- **Partitioning.** At that size, partition `episodes` by `recorded_at` (monthly
  `PARTITION BY RANGE`). The planner prunes partitions outside the requested range, so
  only one or two month partitions are scanned.
- **Daily rollup.** If the endpoint is hit often, precompute a
  `episode_daily_stats(day, robot_id, task_name, quality, count)` table (or a materialized
  view) refreshed on a schedule (e.g. nightly via pg_cron, or incrementally after import),
  and serve analytics from it. The endpoint's query shapes are the same GROUP BYs, so
  switching the source table is a small change.
- **EXPLAIN ANALYZE** is the way to verify: run each query with it on a production-sized
  dataset and check rows scanned, index usage, and execution time.
