import json

from fastapi.testclient import TestClient

from app.main import app


def test_log_line_fields(capsys):
    with TestClient(app) as client:
        client.get("/health")

    captured = capsys.readouterr()
    # The middleware prints one JSON line per request; grab the last non-empty line
    lines = [l for l in captured.out.splitlines() if l.strip()]
    assert lines, "No log output captured"
    log = json.loads(lines[-1])

    assert log["method"] == "GET"
    assert log["path"] == "/health"
    assert log["status_code"] == 200
    assert log["user_id"] is None
    assert isinstance(log["duration_ms"], int)
    assert log["duration_ms"] >= 0
