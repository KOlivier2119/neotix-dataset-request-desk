"""Search and filter tests for the list endpoints."""
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.database import get_db
from app.main import app
from app.models import DatasetRequest, Episode, RequestStatusHistory
from tests.test_domain import login_as, make_user


@pytest.fixture
def client(db_session):
    """TestClient with get_db overridden to use the test transaction."""
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def make_episode(db, episode_id, robot_id="arm-01", task_name="pick", operator_name="op"):
    ep = Episode(
        episode_id=episode_id,
        robot_id=robot_id,
        task_name=task_name,
        recorded_at=datetime.utcnow(),
        duration_seconds=30,
        operator_name=operator_name,
        quality="good",
    )
    db.add(ep)
    db.commit()
    db.refresh(ep)
    return ep


def make_request(db, client_user, title):
    req = DatasetRequest(
        client_id=client_user.id,
        title=title,
        task_name=title.lower().replace(" ", "-"),
        episodes_requested=2,
        deadline=datetime.utcnow() + timedelta(days=5),
        status="submitted",
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    db.add(RequestStatusHistory(
        request_id=req.id, actor_id=client_user.id, from_status=None, to_status="submitted",
    ))
    db.commit()
    return req


def test_episode_search_covers_id_robot_task_and_operator(db_session, client):
    make_episode(db_session, "EP-100", robot_id="arm-01", task_name="pick cup", operator_name="ana")
    make_episode(db_session, "EP-200", robot_id="humanoid-01", task_name="pour water", operator_name="bob")
    make_episode(db_session, "EP-300", robot_id="arm-02", task_name="wipe table", operator_name="zoe")
    login_as(client, db_session, "operator")

    assert [e["episode_id"] for e in client.get("/episodes?q=humanoid").json()] == ["EP-200"]
    assert [e["episode_id"] for e in client.get("/episodes?q=pour").json()] == ["EP-200"]
    assert [e["episode_id"] for e in client.get("/episodes?q=zoe").json()] == ["EP-300"]
    assert [e["episode_id"] for e in client.get("/episodes?q=EP-1").json()] == ["EP-100"]


def test_episode_search_is_combined_with_filters_and_pagination(db_session, client):
    make_episode(db_session, "EP-1", robot_id="arm-01", task_name="pick cup")
    make_episode(db_session, "EP-2", robot_id="arm-01", task_name="pour water")
    make_episode(db_session, "EP-3", robot_id="arm-01", task_name="pour water")
    login_as(client, db_session, "operator")

    resp = client.get("/episodes?q=pour&task_name=pour+water&robot_id=arm-01&limit=1&offset=1")
    assert resp.status_code == 200
    assert [e["episode_id"] for e in resp.json()] == ["EP-2"]

    assert client.get("/episodes?q=pour&robot_id=arm-02").json() == []


def test_episode_search_treats_like_wildcards_literally(db_session, client):
    make_episode(db_session, "pick_1")
    make_episode(db_session, "pickx1")
    make_episode(db_session, "100%")
    login_as(client, db_session, "operator")

    assert [e["episode_id"] for e in client.get("/episodes?q=pick_1").json()] == ["pick_1"]
    assert [e["episode_id"] for e in client.get("/episodes?q=100%25").json()] == ["100%"]


def test_robot_filter_is_exact(db_session, client):
    make_episode(db_session, "EP-1", robot_id="arm-01")
    make_episode(db_session, "EP-2", robot_id="arm-02")
    make_episode(db_session, "EP-3", robot_id="arm-03")
    login_as(client, db_session, "operator")

    assert [e["episode_id"] for e in client.get("/episodes?robot_id=arm-01").json()] == ["EP-1"]
    # A partial robot id matches nothing: the filter is equality, not substring.
    assert client.get("/episodes?robot_id=arm").json() == []


def test_request_search_matches_title_and_client_name(db_session, client):
    acme = make_user(db_session, "acme@t.test", "p", "client", name="Acme Robotics")
    beta = make_user(db_session, "beta@t.test", "p", "client", name="Beta Labs")
    make_request(db_session, acme, "Pour water dataset")
    make_request(db_session, beta, "Wipe table dataset")
    login_as(client, db_session, "operator")

    titles = lambda path: [r["title"] for r in client.get(path).json()]  # noqa: E731
    assert titles("/requests?q=pour") == ["Pour water dataset"]
    assert titles("/requests?q=beta+labs") == ["Wipe table dataset"]
    assert sorted(titles("/requests?q=dataset&status=submitted")) == [
        "Pour water dataset",
        "Wipe table dataset",
    ]
    assert titles("/requests?q=nothing-matches") == []


def test_client_search_still_only_returns_own_requests(db_session, client):
    owner = make_user(db_session, "own@t.test", "p", "client", name="Solo Client")
    other = make_user(db_session, "other@t.test", "p", "client", name="Other Client")
    make_request(db_session, owner, "My dataset")
    make_request(db_session, other, "Their dataset")

    client.post("/auth/login", json={"email": "own@t.test", "password": "p"})
    resp = client.get("/requests?q=dataset")
    assert resp.status_code == 200
    assert [r["title"] for r in resp.json()] == ["My dataset"]


def test_user_search_and_role_filter(db_session, client):
    make_user(db_session, "ann@t.test", "p", "operator", name="Ann Operator", organisation="Acme")
    make_user(db_session, "bob@t.test", "p", "client", name="Bob Client", organisation="Beta")
    make_user(db_session, "cyd@t.test", "p", "admin", name="Cyd Admin", organisation="Acme")
    login_as(client, db_session, "admin")

    names = lambda path: sorted(u["name"] for u in client.get(path).json())  # noqa: E731
    assert names("/users?q=acme") == ["Ann Operator", "Cyd Admin"]
    assert names("/users?q=bob") == ["Bob Client"]
    assert names("/users?role=client") == ["Bob Client"]
    assert names("/users?q=acme&role=admin") == ["Cyd Admin"]
