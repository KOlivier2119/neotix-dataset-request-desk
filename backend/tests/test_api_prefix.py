"""The API must answer both with and without the public `/api` prefix.

Vercel services routing hands the backend the original path (`/api/episodes`),
while docker compose and `next dev` send the prefix already stripped. The
`StripApiPrefix` middleware reconciles the two.
"""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_served_with_and_without_prefix():
    for path in ("/health", "/api/health"):
        response = client.get(path)
        assert response.status_code == 200, path
        assert response.json() == {"status": "ok"}


def test_protected_route_matches_under_the_prefix():
    # 401 (not 404) proves the request reached the route and auth ran.
    for path in ("/episodes", "/api/episodes"):
        response = client.get(path)
        assert response.status_code == 401, path


def test_prefix_is_stripped_exactly_once():
    # /api/api/health -> /api/health, which is not a route.
    assert client.get("/api/api/health").status_code == 404


def test_bare_prefix_maps_to_root():
    # /api alone becomes "/" — no route there, so 404 rather than a path error.
    assert client.get("/api").status_code == 404
