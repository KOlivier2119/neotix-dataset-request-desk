from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.auth import create_access_token, hash_password
from app.database import get_db
from app.main import app
from app.models import DatasetRequest, Episode, RequestStatusHistory, User


@pytest.fixture
def client(db_session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def make_user(db, email, role, password="pw123456"):
    u = User(email=email, name=email, password_hash=hash_password(password), role=role)
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def ep(db, episode_id, robot_id, task_name, quality, recorded_at):
    e = Episode(
        episode_id=episode_id,
        robot_id=robot_id,
        task_name=task_name,
        recorded_at=recorded_at,
        duration_seconds=30,
        operator_name="Op",
        quality=quality,
    )
    db.add(e)
    db.commit()
    return e


def req_with_history(db, client_id, title, created, history):
    """history: list of (to_status, changed_at)."""
    r = DatasetRequest(
        client_id=client_id, title=title, episodes_requested=2,
        deadline=created + timedelta(days=7), status=history[-1][0],
        created_at=created,
    )
    db.add(r)
    db.flush()
    prev = None
    for to_status, changed_at in history:
        db.add(RequestStatusHistory(
            request_id=r.id, actor_id=client_id, from_status=prev,
            to_status=to_status, changed_at=changed_at,
        ))
        prev = to_status
    db.commit()
    return r


@pytest.fixture
def dataset(db_session):
    op = make_user(db_session, "op@x.com", "operator")
    c1 = make_user(db_session, "c1@x.com", "client")

    # 2026-08-01: arm-01 x2 (good "pick cup", bad "pick cup"), mobile-01 x1 (good "wipe table")
    ep(db_session, "E1", "arm-01", "pick cup", "good", datetime(2026, 8, 1, 10))
    ep(db_session, "E2", "arm-01", "pick cup", "bad", datetime(2026, 8, 1, 11))
    ep(db_session, "E3", "mobile-01", "wipe table", "good", datetime(2026, 8, 1, 12))
    # 2026-08-02: arm-01 x1 good "pick cup"; outside range: 2026-08-10
    ep(db_session, "E4", "arm-01", "pick cup", "good", datetime(2026, 8, 2, 9))
    ep(db_session, "E5", "arm-01", "pick cup", "good", datetime(2026, 8, 10, 9))

    # requests: created_at in August
    req_with_history(db_session, c1.id, "r1", datetime(2026, 8, 1, 8), [
        ("submitted", datetime(2026, 8, 1, 8)),
        ("in_progress", datetime(2026, 8, 1, 9)),
        ("delivered", datetime(2026, 8, 3, 8)),  # 48h
    ])
    req_with_history(db_session, c1.id, "r2", datetime(2026, 8, 1, 8), [
        ("submitted", datetime(2026, 8, 1, 8)),
        ("delivered", datetime(2026, 8, 1, 20)),  # 12h
    ])
    req_with_history(db_session, c1.id, "r3", datetime(2026, 8, 2, 8), [
        ("submitted", datetime(2026, 8, 2, 8)),  # never delivered
    ])
    req_with_history(db_session, c1.id, "r4", datetime(2026, 8, 2, 8), [
        ("submitted", datetime(2026, 8, 2, 8)),
        ("delivered", datetime(2026, 8, 2, 8)),
        ("accepted", datetime(2026, 8, 2, 9)),
    ])
    return op, c1


def test_analytics_known_dataset(client, db_session, dataset):
    op, _ = dataset
    client.post("/auth/login", json={"email": "op@x.com", "password": "pw123456"})
    resp = client.get("/analytics", params={"from": "2026-08-01", "to": "2026-08-02"})
    assert resp.status_code == 200
    body = resp.json()

    assert body["episodes_per_day_per_robot"] == [
        {"day": "2026-08-01", "robot_id": "arm-01", "count": 2},
        {"day": "2026-08-01", "robot_id": "mobile-01", "count": 1},
        {"day": "2026-08-02", "robot_id": "arm-01", "count": 1},
    ]
    assert body["requests_by_status"] == [
        {"status": "accepted", "count": 1},
        {"status": "delivered", "count": 2},
        {"status": "submitted", "count": 1},
    ]
    # median of [48h, 12h, 0h] (r4 submitted->delivered = 0h) = 12h
    assert body["median_hours_submitted_to_delivered"] == pytest.approx(12.0)
    assert body["top_tasks_by_good_episodes"] == [
        {"task_name": "pick cup", "count": 2},
        {"task_name": "wipe table", "count": 1},
    ]


def test_analytics_excludes_request_without_delivery(client, db_session, dataset):
    op, _ = dataset
    client.post("/auth/login", json={"email": "op@x.com", "password": "pw123456"})
    body = client.get("/analytics", params={"from": "2026-08-01", "to": "2026-08-02"}).json()
    # r3 (no delivered entry) must not drag the median down: median over r1=48h, r2=12h, r4=0h
    assert body["median_hours_submitted_to_delivered"] == pytest.approx(12.0)


def test_analytics_forbidden_for_client(client, db_session, dataset):
    _, c1 = dataset
    client.post("/auth/login", json={"email": "c1@x.com", "password": "pw123456"})
    resp = client.get("/analytics", params={"from": "2026-08-01", "to": "2026-08-02"})
    assert resp.status_code == 403


def test_analytics_validates_range(client, db_session, dataset):
    client.post("/auth/login", json={"email": "op@x.com", "password": "pw123456"})
    resp = client.get("/analytics", params={"from": "2026-08-02", "to": "2026-08-01"})
    assert resp.status_code == 422
    resp = client.get("/analytics", params={"from": "2024-01-01", "to": "2026-01-01"})
    assert resp.status_code == 422
