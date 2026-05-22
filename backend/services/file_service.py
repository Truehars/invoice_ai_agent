"""
services/file_service.py
────────────────────────
PDF upload, storage, text extraction, and listing helpers.
"""

import uuid
from datetime import datetime
from pathlib import Path

import fitz  # PyMuPDF
from fastapi import UploadFile

from config import settings

UPLOAD_DIR: Path = settings.UPLOAD_DIR


async def save_invoice_file(file: UploadFile) -> dict:
    """Save an uploaded PDF and return its metadata."""
    unique_id = uuid.uuid4().hex[:10]
    safe_name = file.filename.replace(" ", "_")
    saved_filename = f"{unique_id}_{safe_name}"
    save_path = UPLOAD_DIR / saved_filename

    content = await file.read()
    save_path.write_bytes(content)

    return {
        "message": "Invoice uploaded successfully.",
        "file_id": unique_id,
        "original_name": file.filename,
        "saved_as": saved_filename,
        "size_bytes": len(content),
        "uploaded_at": datetime.utcnow().isoformat() + "Z",
        "path": str(save_path),
    }


def extract_text_from_pdf(file_path: str) -> str:
    """Extract plain text from every page of a PDF using PyMuPDF."""
    text = ""
    with fitz.open(file_path) as doc:
        for page in doc:
            text += page.get_text()
    return text.strip()


def list_invoice_files() -> list[dict]:
    """Return metadata for all stored PDFs, newest first."""
    files = []
    for f in sorted(
        UPLOAD_DIR.glob("*.pdf"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    ):
        stat = f.stat()
        files.append({
            "filename": f.name,
            "size_bytes": stat.st_size,
            "modified_at": datetime.utcfromtimestamp(stat.st_mtime).isoformat() + "Z",
        })
    return files
