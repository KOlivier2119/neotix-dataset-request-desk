"""Domain tests: requests, workflow transitions, assignments, episodes."""
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.auth import hash_password
from app.database import get_db
from app.main import app
from app.models import (
    Assignment,
    DatasetRequest,
    Episode,
    RequestStatusHistory,
    User,
)


# ---------------------------------------------------------------------------
# Fixtures (copied verbatim from test_auth.py)
# ---------------------------------------------------------------------------

@pytest.fixture
def client(db_session):
    """TestClient with get_db overridden to use the test transaction."""
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def make_user(db, email, password, role, name="Test User", organisation=None, is_active=True):
    """Insert a user directly, bypassing the endpoint."""
    user = User(
        email=email,
        name=name,
        password_hash=hash_password(password),
        role=role,
        organisation=organisation,
        is_active=is_active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# ---------------------------------------------------------------------------
# Domain helpers
# ---------------------------------------------------------------------------

_episode_counter = 0


def make_episode(db, episode_id=None, quality="good", task_name="pick"):
    """Insert an Episode directly into DB."""
    global _episode_counter
    _episode_counter += 1
    if episode_id is None:
        episode_id = f"ep-{_episode_counter:03d}"
    ep = Episode(
        episode_id=episode_id,
        robot_id="arm-01",
        task_name=task_name,
        recorded_at=datetime.utcnow(),
        duration_seconds=60,
        operator_name="op",
        quality=quality,
    )
    db.add(ep)
    db.commit()
    db.refresh(ep)
    return ep


def make_request(db, client_user, episodes_requested=2, days_ahead=10):
    """Insert a DatasetRequest (status='submitted') + initial history row."""
    req = DatasetRequest(
        client_id=client_user.id,
        title="Test Request",
        episodes_requested=episodes_requested,
        deadline=datetime.utcnow() + timedelta(days=days_ahead),
        status="submitted",
    )
    db.add(req)
    db.flush()

    history = RequestStatusHistory(
        request_id=req.id,
        actor_id=client_user.id,
        from_status=None,
        to_status="submitted",
    )
    db.add(history)
    db.commit()
    db.refresh(req)
    return req


_login_counter = 0


def login_as(http_client, db, role, email_prefix=None):
    """Create a user with the given role, log in, and return the User object."""
    global _login_counter
    _login_counter += 1
    if email_prefix is None:
        email_prefix = f"{role}{_login_counter}"
    email = f"{email_prefix}@domain.test"
    password = "testpass"
    user = make_user(db, email, password, role)
    http_client.post("/auth/login", json={"email": email, "password": password})
    return user


# ---------------------------------------------------------------------------
# Transition tests
# ---------------------------------------------------------------------------

def test_operator_can_move_submitted_to_in_progress(client, db_session):
    client_user = make_user(db_session, "c1@t.test", "p", "client")
    req = make_request(db_session, client_user)
    op = login_as(client, db_session, "operator", "op1")

    resp = client.post(f"/requests/{req.id}/transition", json={"to_status": "in_progress"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "in_progress"


def test_admin_can_move_submitted_to_in_progress(client, db_session):
    client_user = make_user(db_session, "c2@t.test", "p", "client")
    req = make_request(db_session, client_user)
    login_as(client, db_session, "admin", "adm1")

    resp = client.post(f"/requests/{req.id}/transition", json={"to_status": "in_progress"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "in_progress"


def test_operator_can_move_in_progress_to_delivered(client, db_session):
    """Move to delivered requires episodes_requested assignments."""
    client_user = make_user(db_session, "c3@t.test", "p", "client")
    req = make_request(db_session, client_user, episodes_requested=2)
    op = login_as(client, db_session, "operator", "op2")

    # Move to in_progress
    req.status = "in_progress"
    db_session.commit()

    # Assign 2 episodes
    ep1 = make_episode(db_session, quality="good")
    ep2 = make_episode(db_session, quality="good")
    db_session.add(Assignment(request_id=req.id, episode_id=ep1.id))
    db_session.add(Assignment(request_id=req.id, episode_id=ep2.id))
    db_session.commit()

    resp = client.post(f"/requests/{req.id}/transition", json={"to_status": "delivered"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "delivered"


def test_client_can_accept_delivered_request(client, db_session):
    client_user = make_user(db_session, "c4@t.test", "p", "client")
    req = make_request(db_session, client_user, episodes_requested=1)
    req.status = "delivered"
    db_session.commit()

    # Log in as the owning client
    client.post("/auth/login", json={"email": "c4@t.test", "password": "p"})

    resp = client.post(f"/requests/{req.id}/transition", json={"to_status": "accepted"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "accepted"


def test_client_can_reject_delivered_request(client, db_session):
    client_user = make_user(db_session, "c5@t.test", "p", "client")
    req = make_request(db_session, client_user, episodes_requested=1)
    req.status = "delivered"
    db_session.commit()

    client.post("/auth/login", json={"email": "c5@t.test", "password": "p"})

    resp = client.post(f"/requests/{req.id}/transition", json={"to_status": "rejected"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "rejected"


def test_operator_can_move_rejected_to_in_progress(client, db_session):
    client_user = make_user(db_session, "c6@t.test", "p", "client")
    req = make_request(db_session, client_user)
    req.status = "rejected"
    db_session.commit()

    login_as(client, db_session, "operator", "op3")

    resp = client.post(f"/requests/{req.id}/transition", json={"to_status": "in_progress"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "in_progress"


def test_invalid_transition_returns_409(client, db_session):
    """submitted -> delivered is not a valid transition."""
    client_user = make_user(db_session, "c7@t.test", "p", "client")
    req = make_request(db_session, client_user)
    login_as(client, db_session, "operator", "op4")

    resp = client.post(f"/requests/{req.id}/transition", json={"to_status": "delivered"})
    assert resp.status_code == 409


def test_wrong_role_transition_returns_403(client, db_session):
    """A client cannot move submitted -> in_progress (operator/admin only)."""
    client_user = make_user(db_session, "c8@t.test", "p", "client")
    req = make_request(db_session, client_user)
    # Log in as the client
    client.post("/auth/login", json={"email": "c8@t.test", "password": "p"})

    resp = client.post(f"/requests/{req.id}/transition", json={"to_status": "in_progress"})
    assert resp.status_code == 403


def test_other_client_cannot_accept(client, db_session):
    """A different client cannot accept a delivered request they don't own."""
    owner = make_user(db_session, "owner@t.test", "p", "client")
    req = make_request(db_session, owner, episodes_requested=1)
    req.status = "delivered"
    db_session.commit()

    # Log in as a different client
    make_user(db_session, "other@t.test", "p", "client")
    client.post("/auth/login", json={"email": "other@t.test", "password": "p"})

    resp = client.post(f"/requests/{req.id}/transition", json={"to_status": "accepted"})
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Isolation tests
# ---------------------------------------------------------------------------

def test_client_cannot_see_other_clients_request(client, db_session):
    owner = make_user(db_session, "own2@t.test", "p", "client")
    req = make_request(db_session, owner)

    make_user(db_session, "spy@t.test", "p", "client")
    client.post("/auth/login", json={"email": "spy@t.test", "password": "p"})

    resp = client.get(f"/requests/{req.id}")
    assert resp.status_code == 404


def test_client_list_shows_only_own_requests(client, db_session):
    owner = make_user(db_session, "list1@t.test", "p", "client")
    other = make_user(db_session, "list2@t.test", "p", "client")
    make_request(db_session, owner)
    make_request(db_session, other)

    client.post("/auth/login", json={"email": "list1@t.test", "password": "p"})

    resp = client.get("/requests/")
    assert resp.status_code == 200
    data = resp.json()
    assert all(r["client_id"] == owner.id for r in data)
    assert len(data) == 1


def test_client_cannot_transition_other_clients_request(client, db_session):
    owner = make_user(db_session, "own3@t.test", "p", "client")
    req = make_request(db_session, owner)
    req.status = "delivered"
    db_session.commit()

    make_user(db_session, "spy2@t.test", "p", "client")
    client.post("/auth/login", json={"email": "spy2@t.test", "password": "p"})

    resp = client.post(f"/requests/{req.id}/transition", json={"to_status": "accepted"})
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# History tests
# ---------------------------------------------------------------------------

def test_history_row_recorded_with_actor(client, db_session):
    client_user = make_user(db_session, "hist@t.test", "p", "client")
    req = make_request(db_session, client_user)
    op = login_as(client, db_session, "operator", "op5")

    client.post(f"/requests/{req.id}/transition", json={"to_status": "in_progress"})

    # Fetch detailed view to check history
    # Log back in as client to view
    client.post("/auth/login", json={"email": "hist@t.test", "password": "p"})
    resp = client.get(f"/requests/{req.id}")
    assert resp.status_code == 200
    history = resp.json()["history"]

    # The second history entry (transition) should have the operator's actor_id
    assert len(history) >= 2
    transition_entry = history[-1]
    assert transition_entry["actor_id"] == op.id
    assert transition_entry["from_status"] == "submitted"
    assert transition_entry["to_status"] == "in_progress"


# ---------------------------------------------------------------------------
# Assignment tests
# ---------------------------------------------------------------------------

def test_bad_quality_episode_cannot_be_assigned(client, db_session):
    client_user = make_user(db_session, "badq@t.test", "p", "client")
    req = make_request(db_session, client_user, episodes_requested=1)
    req.status = "in_progress"
    db_session.commit()

    ep = make_episode(db_session, quality="bad")
    op = login_as(client, db_session, "operator", "op6")

    resp = client.post(f"/requests/{req.id}/assignments", json={"episode_ids": [ep.id]})
    assert resp.status_code == 409
    assert "quality" in resp.json()["detail"].lower() or "not assignable" in resp.json()["detail"]


def test_episode_cannot_be_assigned_to_two_requests(client, db_session):
    client_user = make_user(db_session, "dup@t.test", "p", "client")
    req1 = make_request(db_session, client_user, episodes_requested=1)
    req2 = make_request(db_session, client_user, episodes_requested=1)
    req1.status = "in_progress"
    req2.status = "in_progress"
    db_session.commit()

    ep = make_episode(db_session, quality="good")
    op = login_as(client, db_session, "operator", "op7")

    # Assign to first request — should succeed
    resp1 = client.post(f"/requests/{req1.id}/assignments", json={"episode_ids": [ep.id]})
    assert resp1.status_code == 200

    # Assign the same episode to second request — should fail 409
    resp2 = client.post(f"/requests/{req2.id}/assignments", json={"episode_ids": [ep.id]})
    assert resp2.status_code == 409


def test_delivery_blocked_below_count(client, db_session):
    client_user = make_user(db_session, "dblk@t.test", "p", "client")
    req = make_request(db_session, client_user, episodes_requested=2)
    req.status = "in_progress"
    db_session.commit()

    # Only assign 1 episode, need 2
    ep = make_episode(db_session, quality="good")
    db_session.add(Assignment(request_id=req.id, episode_id=ep.id))
    db_session.commit()

    op = login_as(client, db_session, "operator", "op8")

    resp = client.post(f"/requests/{req.id}/transition", json={"to_status": "delivered"})
    assert resp.status_code == 409
    assert "Need" in resp.json()["detail"]


def test_delivery_allowed_at_count(client, db_session):
    client_user = make_user(db_session, "dok@t.test", "p", "client")
    req = make_request(db_session, client_user, episodes_requested=2)
    req.status = "in_progress"
    db_session.commit()

    ep1 = make_episode(db_session, quality="good")
    ep2 = make_episode(db_session, quality="good")
    db_session.add(Assignment(request_id=req.id, episode_id=ep1.id))
    db_session.add(Assignment(request_id=req.id, episode_id=ep2.id))
    db_session.commit()

    op = login_as(client, db_session, "operator", "op9")

    resp = client.post(f"/requests/{req.id}/transition", json={"to_status": "delivered"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "delivered"


def test_rework_keeps_assignments(client, db_session):
    """After delivered->rejected->in_progress, assignments remain intact."""
    client_user = make_user(db_session, "rework@t.test", "p", "client")
    req = make_request(db_session, client_user, episodes_requested=1)
    req.status = "delivered"
    db_session.commit()

    ep = make_episode(db_session, quality="good")
    db_session.add(Assignment(request_id=req.id, episode_id=ep.id))
    db_session.commit()

    # Client rejects
    client.post("/auth/login", json={"email": "rework@t.test", "password": "p"})
    resp = client.post(f"/requests/{req.id}/transition", json={"to_status": "rejected"})
    assert resp.status_code == 200

    # Operator reworks
    op = login_as(client, db_session, "operator", "op10")
    resp = client.post(f"/requests/{req.id}/transition", json={"to_status": "in_progress"})
    assert resp.status_code == 200

    # Assignments should still exist
    count = (
        db_session.query(Assignment)
        .filter(Assignment.request_id == req.id)
        .count()
    )
    assert count == 1
