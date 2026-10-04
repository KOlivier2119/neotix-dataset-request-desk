"""Assignment service: assign/unassign episodes to DatasetRequests."""
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Assignment, DatasetRequest, Episode, User


def assign_episodes(
    db: Session,
    request: DatasetRequest,
    episode_ids: list[int],
    actor: User,
) -> list[Assignment]:
    """Assign a list of episodes to a request.

    Rules:
    - Request must be in_progress (409 otherwise)
    - Each episode must exist (422 if not)
    - Each episode must have quality 'good' or 'usable' (409 otherwise)
    - Duplicate assignment (race or explicit) raises 409

    Returns the list of created Assignment objects.
    """
    if request.status != "in_progress":
        raise HTTPException(
            status_code=409,
            detail=f"Request is not in_progress (current: {request.status})",
        )

    assignments: list[Assignment] = []

    for episode_id in episode_ids:
        episode = db.query(Episode).filter(Episode.id == episode_id).first()
        if not episode:
            raise HTTPException(
                status_code=422,
                detail=f"Episode {episode_id} not found",
            )

        if episode.quality not in ("good", "usable"):
            raise HTTPException(
                status_code=409,
                detail=f"Episode {episode_id} quality {episode.quality} not assignable",
            )

        # Check episode is not already assigned to any request (cross-request uniqueness)
        existing = (
            db.query(Assignment).filter(Assignment.episode_id == episode_id).first()
        )
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"Episode {episode_id} already assigned",
            )

        assignment = Assignment(
            request_id=request.id,
            episode_id=episode_id,
        )
        db.add(assignment)

        # Use a savepoint so an IntegrityError only rolls back this episode,
        # not the whole transaction (handles UNIQUE constraint races).
        savepoint = db.begin_nested()
        try:
            db.flush()
            savepoint.commit()
        except IntegrityError:
            savepoint.rollback()
            raise HTTPException(
                status_code=409,
                detail=f"Episode {episode_id} already assigned",
            )

        assignments.append(assignment)

    db.commit()
    return assignments


def unassign_episode(
    db: Session,
    request: DatasetRequest,
    episode_id: int,
) -> None:
    """Remove an episode assignment from a request.

    Rules:
    - Request must be in_progress (409 otherwise)
    - Assignment must exist (404 otherwise)
    """
    if request.status != "in_progress":
        raise HTTPException(
            status_code=409,
            detail=f"Request is not in_progress (current: {request.status})",
        )

    assignment = (
        db.query(Assignment)
        .filter(
            Assignment.request_id == request.id,
            Assignment.episode_id == episode_id,
        )
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    db.delete(assignment)
    db.commit()
