"""Requests router: CRUD and workflow for DatasetRequests."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models import DatasetRequest, RequestStatusHistory, User
from app.schemas import (
    AssignmentRequest,
    RequestCreate,
    RequestDetail,
    RequestRead,
    StatusHistoryEntry,
    TransitionRequest,
)
from app.services import assignments as assignment_service
from app.services import workflow

router = APIRouter()


# ---------------------------------------------------------------------------
# POST /requests  (client only)
# ---------------------------------------------------------------------------

@router.post("/", response_model=RequestRead, status_code=status.HTTP_201_CREATED)
def create_request(
    body: RequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("client")),
):
    if body.episodes_requested <= 0:
        raise HTTPException(
            status_code=422, detail="episodes_requested must be greater than 0"
        )
    if body.deadline <= datetime.utcnow():
        raise HTTPException(status_code=422, detail="deadline must be in the future")
    if not body.task_name.strip():
        raise HTTPException(status_code=422, detail="task_name is required")

    req = DatasetRequest(
        client_id=current_user.id,
        title=body.title.strip() or body.task_name.strip(),
        task_name=body.task_name.strip(),
        notes=body.notes,
        episodes_requested=body.episodes_requested,
        deadline=body.deadline,
        status="submitted",
    )
    db.add(req)
    db.flush()  # get req.id

    history = RequestStatusHistory(
        request_id=req.id,
        actor_id=current_user.id,
        from_status=None,
        to_status="submitted",
    )
    db.add(history)
    db.commit()
    db.refresh(req)
    return req


# ---------------------------------------------------------------------------
# GET /requests  (client: own; operator/admin: all, optional ?status=)
# ---------------------------------------------------------------------------

@router.get("/", response_model=list[RequestRead])
def list_requests(
    request_status: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(DatasetRequest)

    if current_user.role == "client":
        query = query.filter(DatasetRequest.client_id == current_user.id)
    elif request_status is not None:
        query = query.filter(DatasetRequest.status == request_status)

    return query.all()


# ---------------------------------------------------------------------------
# GET /requests/{id}  (client: own only; else 404)
# ---------------------------------------------------------------------------

@router.get("/{request_id}", response_model=RequestDetail)
def get_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    req = db.query(DatasetRequest).filter(DatasetRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    if current_user.role == "client" and req.client_id != current_user.id:
        raise HTTPException(status_code=404, detail="Request not found")

    history = (
        db.query(RequestStatusHistory)
        .filter(RequestStatusHistory.request_id == request_id)
        .order_by(RequestStatusHistory.changed_at)
        .all()
    )

    return RequestDetail(
        id=req.id,
        client_id=req.client_id,
        title=req.title,
        task_name=req.task_name,
        notes=req.notes,
        episodes_requested=req.episodes_requested,
        deadline=req.deadline,
        status=req.status,
        created_at=req.created_at,
        history=[StatusHistoryEntry.model_validate(h) for h in history],
    )


# ---------------------------------------------------------------------------
# POST /requests/{id}/transition  (any authenticated user, role checked in service)
# ---------------------------------------------------------------------------

@router.post("/{request_id}/transition", response_model=RequestRead)
def transition_request(
    request_id: int,
    body: TransitionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    req = workflow.transition_request(
        db=db,
        request_id=request_id,
        to_status=body.to_status,
        actor=current_user,
    )
    return req


# ---------------------------------------------------------------------------
# POST /requests/{id}/assignments  (operator/admin)
# ---------------------------------------------------------------------------

@router.post("/{request_id}/assignments")
def assign_episodes(
    request_id: int,
    body: AssignmentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("operator", "admin")),
):
    req = db.query(DatasetRequest).filter(DatasetRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    assigned = assignment_service.assign_episodes(
        db=db,
        request=req,
        episode_ids=body.episode_ids,
        actor=current_user,
    )
    return {"assigned": len(assigned)}


# ---------------------------------------------------------------------------
# DELETE /requests/{id}/assignments/{episode_id}  (operator/admin)
# ---------------------------------------------------------------------------

@router.delete("/{request_id}/assignments/{episode_id}", status_code=status.HTTP_204_NO_CONTENT)
def unassign_episode(
    request_id: int,
    episode_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("operator", "admin")),
):
    req = db.query(DatasetRequest).filter(DatasetRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    assignment_service.unassign_episode(db=db, request=req, episode_id=episode_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
