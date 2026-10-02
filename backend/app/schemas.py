from datetime import datetime

from pydantic import BaseModel


# ---------- User ----------

class UserCreate(BaseModel):
    email: str
    name: str
    password: str
    role: str
    organisation: str | None = None


class UserRead(BaseModel):
    id: int
    email: str
    name: str
    role: str
    organisation: str | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------- Episode ----------

class EpisodeRead(BaseModel):
    id: int
    episode_id: str
    robot_id: str
    task_name: str
    recorded_at: datetime
    duration_seconds: int
    operator_name: str
    quality: str
    created_at: datetime

    model_config = {"from_attributes": True}
