import pytest
from fastapi.testclient import TestClient

from app.auth import create_access_token, hash_password
from app.database import get_db
from app.main import app
from app.models import User
from app.seed import seed


# ---------------------------------------------------------------------------
# Fixtures
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


def login(client, email, password):
    """Helper to log in and return the response."""
    return client.post("/auth/login", json={"email": email, "password": password})


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_unauthenticated_me_returns_401(client):
    resp = client.get("/auth/me")
    assert resp.status_code == 401


def test_login_sets_cookie_and_returns_user(client, db_session):
    make_user(db_session, "login@test.com", "pass123", "operator")
    resp = login(client, "login@test.com", "pass123")
    assert resp.status_code == 200
    assert "access_token" in client.cookies
    data = resp.json()
    assert data["email"] == "login@test.com"
    assert data["role"] == "operator"


def test_login_wrong_password_returns_401(client, db_session):
    make_user(db_session, "wrong@test.com", "correct", "operator")
    resp = login(client, "wrong@test.com", "wrong")
    assert resp.status_code == 401


def test_client_cannot_access_users_list(client, db_session):
    """Client role hitting GET /users (admin-only) returns 403."""
    make_user(db_session, "client@test.com", "pass", "client")
    login(client, "client@test.com", "pass")
    resp = client.get("/users/")
    assert resp.status_code == 403


def test_operator_cannot_create_user(client, db_session):
    """Operator role hitting POST /users (admin-only) returns 403."""
    make_user(db_session, "op@test.com", "pass", "operator")
    login(client, "op@test.com", "pass")
    resp = client.post("/users/", json={
        "email": "new@test.com", "name": "New", "password": "x", "role": "client"
    })
    assert resp.status_code == 403


def test_deactivated_user_cannot_login(client, db_session):
    make_user(db_session, "dead@test.com", "pass", "operator", is_active=False)
    resp = login(client, "dead@test.com", "pass")
    assert resp.status_code == 401


def test_deactivated_user_token_rejected(client, db_session):
    """A valid JWT for a deactivated user is rejected on GET /auth/me."""
    user = make_user(db_session, "deact@test.com", "pass", "operator")
    # Manually set cookie with a valid token
    token = create_access_token({"sub": str(user.id)})
    client.cookies.set("access_token", token)
    # Deactivate the user directly in DB
    user.is_active = False
    db_session.commit()
    resp = client.get("/auth/me")
    assert resp.status_code == 401


def test_seed_idempotent(db_session):
    """Running seed twice does not create duplicate users."""
    seed(db_session)
    seed(db_session)
    count = db_session.query(User).count()
    # seed/users.json has 5 users
    assert count == 5


def test_admin_cannot_deactivate_self(client, db_session):
    admin = make_user(db_session, "admin@test.com", "pass", "admin", name="Admin")
    login(client, "admin@test.com", "pass")
    resp = client.patch(f"/users/{admin.id}", json={"is_active": False})
    assert resp.status_code == 422
