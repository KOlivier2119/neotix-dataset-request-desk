"""Episodes router: list episodes with filtering and pagination."""
import io

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_role
from app.models import Assignment, Episode, User
from app.schemas import EpisodeRead, ImportReport
from app.services.importer import import_csv

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


@router.post("/import", response_model=ImportReport)
def import_episodes(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_role("operator", "admin")),
):
    """Upload a CSV file and import episodes idempotently."""
    # Size limit: 10 MB
    MAX_SIZE = 10 * 1024 * 1024
    content = file.file.read(MAX_SIZE + 1)
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 10 MB)")
    fileobj = io.TextIOWrapper(io.BytesIO(content), encoding="utf-8-sig", errors="replace")
    return import_csv(db, fileobj)
