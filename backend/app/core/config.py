from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    mongodb_url: str
    mongodb_db: str = "app"
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_access_expire_minutes: int = 60
    jwt_refresh_expire_days: int = 30
    redis_url: str

    llm_provider: str = "anthropic" 
    llm_model: str = "claude-haiku-4-5-20251001"

    # --- Add these lines to recognize the keys ---
    groq_api_key: str | None = None
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    google_api_key: str | None = None

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore"  # This prevents the crash if other random env vars exist
    )
    
settings = Settings()