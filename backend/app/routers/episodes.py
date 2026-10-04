"""Episodes router: list episodes with filtering and pagination."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_role
from app.models import Assignment, Episode, User
from app.schemas import EpisodeRead

router = APIRouter()


@router.get("/", response_model=list[EpisodeRead])
def list_episodes(
    task_name: str | None = None,
    quality: str | None = None,
    unassigned_only: bool = False,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("operator", "admin")),
):
    query = db.query(Episode)

    if task_name is not None:
        query = query.filter(Episode.task_name == task_name)

    if quality is not None:
        query = query.filter(Episode.quality == quality)

    if unassigned_only:
        assigned_ids = db.query(Assignment.episode_id)
        query = query.filter(~Episode.id.in_(assigned_ids))

    query = query.offset(offset).limit(limit)
    return query.all()
