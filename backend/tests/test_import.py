import io

import pytest
from fastapi.testclient import TestClient

from app.auth import create_access_token, hash_password
from app.database import get_db
from app.main import app
from app.models import User
from app.services.importer import import_csv

HEADER = "episode_id,robot_id,task_name,recorded_at,duration_seconds,operator_name,quality\n"

GOOD_ROW_1 = "EP-T001,arm-01,pick cup,2026-08-01T10:00:00,30,Aline,good\n"
GOOD_ROW_2 = "EP-T002,mobile-01,wipe table,2026-08-02T11:00:00,45,Eric,usable\n"
DUP_IN_FILE = "ep-t001,arm-02,open drawer,2026-08-03T09:00:00,20,Eric,bad\n"
BAD_ROBOT = "EP-T003,arm-99,pick cup,2026-08-01T10:00:00,30,Aline,good\n"
BAD_DATE = "EP-T004,arm-01,pick cup,not a date,30,Aline,good\n"
ALT_DATE = "EP-T005,arm-01,pick cup,03/08/2026 12:00,30,Aline,Good\n"

SAMPLE = HEADER + GOOD_ROW_1 + GOOD_ROW_2 + DUP_IN_FILE + BAD_ROBOT + BAD_DATE + ALT_DATE


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


def import_text(db, text):
    return import_csv(db, io.StringIO(text))


def test_counts_add_up_to_total(db_session):
    report = import_text(db_session, SAMPLE)
    assert report["total_rows"] == 6
    assert report["imported"] == 3  # T001, T002, T005
    assert report["skipped_duplicate_in_file"] == 1  # ep-t001 (case variant of EP-T001)
    assert report["skipped_existing"] == 0
    assert len(report["rejected"]) == 2
    assert (
        report["imported"]
        + report["skipped_duplicate_in_file"]
        + report["skipped_existing"]
        + len(report["rejected"])
    ) == report["total_rows"]


def test_bad_row_appears_with_row_number(db_session):
    report = import_text(db_session, SAMPLE)
    by_row = {r["row"]: r["reason"] for r in report["rejected"]}
    assert by_row[5].startswith("unknown robot_id")  # row 5 = BAD_ROBOT
    assert by_row[6].startswith("invalid recorded_at")  # row 6 = BAD_DATE


def test_second_run_imports_zero(db_session):
    first = import_text(db_session, SAMPLE)
    second = import_text(db_session, SAMPLE)
    assert first["imported"] == 3
    assert second["imported"] == 0
    assert second["skipped_existing"] == 3
    assert second["skipped_duplicate_in_file"] == 1
    assert len(second["rejected"]) == 2


def test_normalisation_accepted_row(db_session):
    import_text(db_session, SAMPLE)
    from app.models import Episode

    ep = db_session.query(Episode).filter(Episode.episode_id == "EP-T005").one()
    assert ep.quality == "good"  # "Good" lowercased
    assert ep.task_name == "pick cup"
    assert ep.recorded_at.year == 2026 and ep.recorded_at.month == 8 and ep.recorded_at.day == 3


def test_endpoint_imports_for_operator(client, db_session):
    make_user(db_session, "op@example.com", "operator")
    client.post("/auth/login", json={"email": "op@example.com", "password": "pw123456"})
    resp = client.post(
        "/episodes/import",
        files={"file": ("episodes.csv", SAMPLE, "text/csv")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["imported"] == 3
    assert body["skipped_duplicate_in_file"] == 1
    assert len(body["rejected"]) == 2


def test_endpoint_forbidden_for_client(client, db_session):
    make_user(db_session, "c@example.com", "client")
    client.post("/auth/login", json={"email": "c@example.com", "password": "pw123456"})
    resp = client.post(
        "/episodes/import",
        files={"file": ("episodes.csv", SAMPLE, "text/csv")},
    )
    assert resp.status_code == 403


def test_endpoint_requires_auth(client):
    resp = client.post(
        "/episodes/import",
        files={"file": ("episodes.csv", SAMPLE, "text/csv")},
    )
    assert resp.status_code == 401
