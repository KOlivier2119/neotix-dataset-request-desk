from fastapi import FastAPI

from app.middleware import LoggingMiddleware
from app.routers.auth import router as auth_router

app = FastAPI(title="Dataset Request Desk")
app.add_middleware(LoggingMiddleware)
app.include_router(auth_router, prefix="/auth", tags=["auth"])


@app.get("/health")
def health():
    return {"status": "ok"}
