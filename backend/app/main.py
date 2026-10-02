from fastapi import FastAPI

from app.middleware import LoggingMiddleware

app = FastAPI(title="Dataset Request Desk")
app.add_middleware(LoggingMiddleware)


@app.get("/health")
def health():
    return {"status": "ok"}
