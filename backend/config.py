from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    # Directory where uploaded PDFs are saved (relative to project root)
    UPLOAD_DIR: Path = Path("storage/invoices")

    # CORS — allow the Vite dev server
    ALLOWED_ORIGINS: list[str] = ["http://localhost:5173"]

    # OpenRouter API key — loaded from .env
    openrouter_api_key: str = ""

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


settings = Settings()

# Create the upload directory on startup if it doesn't exist
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)