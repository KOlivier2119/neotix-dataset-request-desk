import json
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send

API_PREFIX = "/api"


class StripApiPrefix:
    """Serve every route at both `/episodes` and `/api/episodes`.

    The two deployments disagree about the prefix:

    * local docker / `next dev` — the Next.js rewrite sends `/:path*`, i.e. the
      prefix is already gone by the time it reaches here;
    * Vercel services — `/api/*` is routed to this service **with the original
      path**, so `/api/episodes` arrives as `/api/episodes` while every route in
      this app is declared without it.

    `vercel.json` declares Vercel's documented `request.path` transform to strip
    the prefix at the edge, but on the live deployment the API still answered
    every request with a 404, i.e. the transform never applied. Stripping here
    makes routing independent of that, and the two are idempotent: if the
    transform ever does apply, the prefix is already gone and this is a no-op.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            path: str = scope.get("path", "")
            if path == API_PREFIX or path.startswith(API_PREFIX + "/"):
                stripped = path[len(API_PREFIX):] or "/"
                scope["path"] = stripped
                scope["raw_path"] = stripped.encode("utf-8")
        await self.app(scope, receive, send)


class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        start = time.monotonic()
        response = await call_next(request)
        duration_ms = round((time.monotonic() - start) * 1000)
        user_id = getattr(request.state, "user_id", None)
        print(json.dumps({
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": duration_ms,
            "user_id": user_id,
        }))
        return response
