"""
config.py
─────────
Centralised settings loaded from .env via pydantic-settings.
All other modules import `settings` from here — never os.getenv directly.
"""

from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── Storage ──────────────────────────────────────────────────
    UPLOAD_DIR: Path = Path("storage/invoices")

    # ── CORS ─────────────────────────────────────────────────────
    ALLOWED_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    # ── Azure OpenAI ─────────────────────────────────────────────
    AZURE_OPENAI_API_KEY: str = ""
    AZURE_OPENAI_ENDPOINT: str = ""
    AZURE_OPENAI_DEPLOYMENT: str = "gpt-4o-mini"
    AZURE_OPENAI_API_VERSION: str = "2024-02-01"

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


settings = Settings()

# Create upload directory on import
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
