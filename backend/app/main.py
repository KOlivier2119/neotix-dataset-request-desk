from fastapi import FastAPI

app = FastAPI(title="Dataset Request Desk")


@app.get("/health")
def health():
    return {"status": "ok"}
