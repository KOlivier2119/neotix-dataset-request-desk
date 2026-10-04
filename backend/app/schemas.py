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


# ---------- Auth ----------

class LoginRequest(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    id: int
    email: str
    name: str
    role: str
    organisation: str | None
    is_active: bool

    model_config = {"from_attributes": True}


# ---------- User management ----------

class CreateUserRequest(BaseModel):
    email: str
    name: str
    password: str
    role: str
    organisation: str | None = None


class UpdateUserRequest(BaseModel):
    role: str | None = None
    is_active: bool | None = None


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


# ---------- Dataset Requests ----------

class RequestCreate(BaseModel):
    title: str = ""
    task_name: str
    episodes_requested: int
    deadline: datetime
    notes: str | None = None


class RequestRead(BaseModel):
    id: int
    client_id: int
    title: str
    task_name: str
    notes: str | None
    episodes_requested: int
    deadline: datetime
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class StatusHistoryEntry(BaseModel):
    id: int
    actor_id: int
    from_status: str | None
    to_status: str
    changed_at: datetime

    model_config = {"from_attributes": True}


class RequestDetail(RequestRead):
    history: list[StatusHistoryEntry]
    assigned_episode_ids: list[int] = []


class TransitionRequest(BaseModel):
    to_status: str


class AssignmentRequest(BaseModel):
    episode_ids: list[int]


# ---------- Import ----------

class ImportReport(BaseModel):
    total_rows: int
    imported: int
    skipped_duplicate_in_file: int
    skipped_existing: int
    rejected: list[dict]  # each: {"row": int, "reason": str}
