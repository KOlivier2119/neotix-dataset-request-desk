"""Pagination tests: limit/offset on the list endpoints."""
import pytest
from fastapi.testclient import TestClient

from app.database import get_db
from app.main import app
from tests.test_domain import login_as, make_episode, make_request, make_user


@pytest.fixture
def client(db_session):
    """TestClient with get_db overridden to use the test transaction."""
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def collect_pages(client, path, limit=2):
    """Fetch every page of `path` and return the concatenated rows."""
    rows, offset = [], 0
    while True:
        resp = client.get(f"{path}?limit={limit}&offset={offset}")
        assert resp.status_code == 200
        page = resp.json()
        rows.extend(page)
        if len(page) < limit:
            return rows
        offset += limit


def test_requests_limit_and_offset_do_not_overlap(client, db_session):
    owner = make_user(db_session, "page1@t.test", "p", "client")
    ids = {make_request(db_session, owner).id for _ in range(3)}
    login_as(client, db_session, "operator")

    first = client.get("/requests?limit=2&offset=0").json()
    second = client.get("/requests?limit=2&offset=2").json()

    assert len(first) == 2
    assert len(second) == 1
    assert {r["id"] for r in first + second} == ids
    assert not {r["id"] for r in first} & {r["id"] for r in second}


def test_requests_without_limit_returns_everything(client, db_session):
    owner = make_user(db_session, "page2@t.test", "p", "client")
    for _ in range(3):
        make_request(db_session, owner)
    login_as(client, db_session, "operator")

    resp = client.get("/requests")
    assert resp.status_code == 200
    assert len(resp.json()) >= 3


def test_users_are_paginated_for_admins(client, db_session):
    expected = {make_user(db_session, f"pageuser{i}@t.test", "p", "operator").id for i in range(3)}
    expected.add(login_as(client, db_session, "admin", "pageadmin").id)

    rows = collect_pages(client, "/users", limit=2)

    assert {u["id"] for u in rows} == expected
    assert len(rows) == len({u["id"] for u in rows})


def test_episodes_pages_are_deterministic(client, db_session):
    expected = {make_episode(db_session).id for _ in range(3)}
    login_as(client, db_session, "operator")

    rows = collect_pages(client, "/episodes", limit=1)
    assert {e["id"] for e in rows} == expected
    assert len(rows) == 3

    # Repeating the first page returns the same row: ordering is stable.
    assert client.get("/episodes?limit=1&offset=0").json()[0]["id"] == rows[0]["id"]


def test_invalid_pagination_is_rejected(client, db_session):
    login_as(client, db_session, "operator")
    for query in ("limit=0", "offset=-1", "limit=9999"):
        assert client.get(f"/episodes?{query}").status_code == 422
        assert client.get(f"/requests?{query}").status_code == 422
