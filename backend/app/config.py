from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    environment: str = "development"

    # Supabase
    supabase_url: str = ""
    supabase_service_role_key: str = ""

    # Redis / Celery
    redis_url: str = "redis://localhost:6379/0"

    # Garmin session encryption
    garmin_encryption_key: str = ""

    # Routing
    graphhopper_api_key: str = ""

    # AI Coach
    openai_api_key: str = ""
    openai_coach_model: str = "gpt-4.1"
    openai_analysis_model: str = "gpt-4.1-mini"

    # CORS
    allowed_origins: list[str] = ["http://localhost:3000"]


settings = Settings()
