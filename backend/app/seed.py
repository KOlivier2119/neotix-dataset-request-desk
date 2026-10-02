"""Idempotent seed: inserts users from seed/users.json if they don't exist."""
import json
import os

from sqlalchemy.orm import Session

from app.auth import hash_password
from app.models import User

# Path to users.json relative to this file: ../../seed/users.json
_USERS_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "seed", "users.json")


def seed(db: Session) -> None:
    with open(_USERS_FILE) as f:
        users = json.load(f)
    for data in users:
        existing = db.query(User).filter(User.email == data["email"]).first()
        if existing:
            print(f"Skipped (exists): {data['email']}")
            continue
        user = User(
            email=data["email"],
            name=data["name"],
            password_hash=hash_password(data["password"]),
            role=data["role"],
            organisation=data.get("organisation"),
        )
        db.add(user)
        db.commit()
        print(f"Created user: {data['email']}")


if __name__ == "__main__":
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        seed(db)
    finally:
        db.close()
