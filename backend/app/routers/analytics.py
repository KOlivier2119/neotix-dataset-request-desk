"""Analytics router: aggregated stats over a date range."""
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.dependencies import require_role
from app.models import User

router = APIRouter()

EPISODES_PER_DAY_PER_ROBOT = text(
    """
    SELECT date_trunc('day', recorded_at)::date AS day, robot_id, count(*) AS count
    FROM episodes
    WHERE recorded_at >= :start AND recorded_at < :end
    GROUP BY day, robot_id
    ORDER BY day, robot_id
    """
)

REQUESTS_BY_STATUS = text(
    """
    SELECT status, count(*) AS count
    FROM dataset_requests
    WHERE created_at >= :start AND created_at < :end
    GROUP BY status
    ORDER BY status
    """
)

MEDIAN_HOURS_TO_DELIVERED = text(
    """
    WITH pairs AS (
        SELECT
            h1.request_id,
            h1.changed_at AS submitted_at,
            (
                SELECT max(h2.changed_at)
                FROM request_status_history h2
                WHERE h2.request_id = h1.request_id AND h2.to_status = 'delivered'
            ) AS delivered_at
        FROM request_status_history h1
        WHERE h1.to_status = 'submitted'
          AND h1.changed_at >= :start AND h1.changed_at < :end
    )
    SELECT percentile_cont(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (delivered_at - submitted_at)) / 3600.0
    ) AS median_hours
    FROM pairs
    WHERE delivered_at IS NOT NULL
    """
)

TOP_TASKS_BY_GOOD_EPISODES = text(
    """
    SELECT task_name, count(*) AS count
    FROM episodes
    WHERE quality = 'good' AND recorded_at >= :start AND recorded_at < :end
    GROUP BY task_name
    ORDER BY count DESC, task_name ASC
    LIMIT 5
    """
)


@router.get("")
def get_analytics(
    from_: date = Query(..., alias="from"),
    to: date = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_role("operator", "admin")),
):
    if to < from_:
        raise HTTPException(status_code=422, detail="'to' must be >= 'from'")
    if (to - from_).days > settings.analytics_max_range_days:
        raise HTTPException(
            status_code=422,
            detail=f"Range too large (max {settings.analytics_max_range_days} days)",
        )

    start = datetime.combine(from_, datetime.min.time())
    end = datetime.combine(to, datetime.min.time()) + timedelta(days=1)
    params = {"start": start, "end": end}

    episodes = [
        {"day": str(r.day), "robot_id": r.robot_id, "count": r.count}
        for r in db.execute(EPISODES_PER_DAY_PER_ROBOT, params)
    ]
    statuses = [
        {"status": r.status, "count": r.count}
        for r in db.execute(REQUESTS_BY_STATUS, params)
    ]
    median_row = db.execute(MEDIAN_HOURS_TO_DELIVERED, params).first()
    median_hours = float(median_row.median_hours) if median_row and median_row.median_hours is not None else None
    top_tasks = [
        {"task_name": r.task_name, "count": r.count}
        for r in db.execute(TOP_TASKS_BY_GOOD_EPISODES, params)
    ]

    return {
        "from": str(from_),
        "to": str(to),
        "episodes_per_day_per_robot": episodes,
        "requests_by_status": statuses,
        "median_hours_submitted_to_delivered": median_hours,
        "top_tasks_by_good_episodes": top_tasks,
    }
