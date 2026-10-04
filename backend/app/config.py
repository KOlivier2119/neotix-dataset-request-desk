from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://desk:desk@localhost:5432/desk"
    secret_key: str = "dev-secret-key-change-in-prod"
    jwt_algorithm: str = "HS256"
    jwt_expiry_minutes: int = 60
    cookie_secure: bool = False
    environment: str = "development"
    analytics_max_range_days: int = 366

    class Config:
        env_file = ".env"


settings = Settings()
