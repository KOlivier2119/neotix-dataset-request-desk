"""Workflow service: state machine for DatasetRequest status transitions."""
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Assignment, DatasetRequest, RequestStatusHistory, User

# Maps from_status -> list of (to_status, allowed_roles)
TRANSITIONS: dict[str, list[tuple[str, set[str]]]] = {
    "submitted": [("in_progress", {"operator", "admin"})],
    "in_progress": [("delivered", {"operator", "admin"})],
    "delivered": [
        ("accepted", {"client"}),
        ("rejected", {"client"}),
    ],
    "rejected": [("in_progress", {"operator", "admin"})],
}


def transition_request(
    db: Session,
    request_id: int,
    to_status: str,
    actor: User,
) -> DatasetRequest:
    """Apply a status transition to a DatasetRequest.

    Raises:
        HTTPException 404 – request not found
        HTTPException 409 – transition not valid from current status
        HTTPException 403 – actor role not allowed, or client not owner
        HTTPException 409 – delivery gate: not enough assignments
    """
    req = db.query(DatasetRequest).filter(DatasetRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    from_status = req.status

    # Find matching transition
    allowed = TRANSITIONS.get(from_status, [])
    match = next((roles for (ts, roles) in allowed if ts == to_status), None)
    if match is None:
        raise HTTPException(
            status_code=409,
            detail=f"Invalid transition: {from_status} -> {to_status}",
        )

    # Check role
    if actor.role not in match:
        raise HTTPException(status_code=403, detail="Insufficient permissions for this transition")

    # For client transitions on delivered -> accepted/rejected, verify ownership
    if actor.role == "client" and from_status == "delivered":
        if req.client_id != actor.id:
            raise HTTPException(status_code=403, detail="You do not own this request")

    # Delivery gate: moving to delivered requires enough assignments
    if to_status == "delivered":
        # Lock the row to prevent race conditions
        locked_req = db.execute(
            select(DatasetRequest)
            .where(DatasetRequest.id == request_id)
            .with_for_update()
        ).scalar_one()

        count = (
            db.query(Assignment)
            .filter(Assignment.request_id == request_id)
            .count()
        )
        if count < locked_req.episodes_requested:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Need {locked_req.episodes_requested} assignments, have {count}"
                ),
            )
        # Use the locked instance going forward
        req = locked_req

    # Apply transition
    req.status = to_status
    history = RequestStatusHistory(
        request_id=request_id,
        actor_id=actor.id,
        from_status=from_status,
        to_status=to_status,
    )
    db.add(history)
    db.commit()
    db.refresh(req)
    return req
