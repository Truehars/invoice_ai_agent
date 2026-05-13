import uuid
from datetime import datetime
from pathlib import Path
from fastapi import UploadFile

from config import settings

UPLOAD_DIR: Path = settings.UPLOAD_DIR


async def save_invoice_file(file: UploadFile) -> dict:
    """
    Save an uploaded PDF to local storage with a unique name.
    Returns metadata dict with filename, path, size, and upload timestamp.
    """
    # Build a unique filename: <uuid>_<original_name>
    unique_id = uuid.uuid4().hex[:10]
    safe_name = file.filename.replace(" ", "_")
    saved_filename = f"{unique_id}_{safe_name}"
    save_path: Path = UPLOAD_DIR / saved_filename

    # Read and write in chunks to handle large files efficiently
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


def list_invoice_files() -> list[dict]:
    """
    Return metadata for all PDF files currently in local storage.
    """
    files = []
    for f in sorted(UPLOAD_DIR.glob("*.pdf"), key=lambda p: p.stat().st_mtime, reverse=True):
        stat = f.stat()
        files.append({
            "filename": f.name,
            "size_bytes": stat.st_size,
            "modified_at": datetime.utcfromtimestamp(stat.st_mtime).isoformat() + "Z",
        })
    return files