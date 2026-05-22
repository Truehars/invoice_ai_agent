"""
main.py
───────
Invoice Agent — FastAPI backend

Endpoints:
  GET  /                        → health check
  POST /api/invoices/upload     → upload PDF, return metadata
  POST /api/invoices/analyse    → run 3-agent pipeline, return report
  GET  /api/invoices            → list all stored invoices
  POST /api/chat                → LLM chat with optional pipeline context
  POST /api/invoices/chart      → generate confidence bar chart PNG (matplotlib)
"""

import io
import uvicorn
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from config import settings
from services.file_service import save_invoice_file, extract_text_from_pdf, list_invoice_files
from services.chat_agent import chat_with_agent
from orchestrator import run_pipeline_from_text


# ─────────────────────────────────────────────────────────────────
# APP SETUP
# ─────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Invoice Agent API",
    description="LLM-powered invoice validation — upload, extract, validate, chat.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────────────────────────
# REQUEST MODELS
# ─────────────────────────────────────────────────────────────────

class AnalyseRequest(BaseModel):
    file_path: str


class ChatRequest(BaseModel):
    message: str
    history: list[dict] | None = None
    pipeline_result: dict | None = None


class ChartRequest(BaseModel):
    pipeline_result: dict          # full pipeline report


# ─────────────────────────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────────────────────────

@app.get("/", tags=["Health"])
def health_check():
    return {"status": "ok", "version": "2.0.0"}


@app.post("/api/invoices/upload", tags=["Invoices"])
async def upload_invoice(file: UploadFile = File(...)):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")
    result = await save_invoice_file(file)
    return JSONResponse(status_code=200, content=result)


@app.post("/api/invoices/analyse", tags=["Invoices"])
def analyse_invoice(req: AnalyseRequest):
    try:
        raw_text = extract_text_from_pdf(req.file_path)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not read PDF: {exc}")

    if not raw_text.strip():
        raise HTTPException(
            status_code=422,
            detail=(
                "No text could be extracted. The PDF may be a scanned image. "
                "Please upload a text-based PDF."
            ),
        )

    try:
        report = run_pipeline_from_text(raw_text)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return JSONResponse(status_code=200, content=report)


@app.get("/api/invoices", tags=["Invoices"])
def get_invoices():
    return {"invoices": list_invoice_files()}


@app.post("/api/chat", tags=["Chat"])
def chat(req: ChatRequest):
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")
    try:
        reply = chat_with_agent(
            user_message=req.message,
            history=req.history,
            pipeline_result=req.pipeline_result,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"LLM error: {exc}")
    return {"reply": reply}


@app.post("/api/invoices/chart", tags=["Invoices"])
def generate_chart(req: ChartRequest):
    """
    Generate a matplotlib bar chart of field confidence scores.
    Returns a PNG image stream — frontend embeds it as <img src=…>.
    Uses only matplotlib (already in most Python envs).
    """
    try:
        import matplotlib
        matplotlib.use("Agg")          # headless — no display needed
        import matplotlib.pyplot as plt
        import matplotlib.patches as mpatches
        import numpy as np
    except ImportError:
        raise HTTPException(status_code=500, detail="matplotlib is not installed.")

    fields = (
        req.pipeline_result
        .get("extractor_agent", {})
        .get("extracted_fields", {})
    )

    if not fields:
        raise HTTPException(status_code=422, detail="No extracted fields in pipeline result.")

    # Prepare data — top 10 by confidence
    items = sorted(
        [(k.replace("_", " ").title(), v.get("confidence", 0)) for k, v in fields.items()],
        key=lambda x: x[1],
        reverse=True,
    )[:10]

    labels  = [x[0] for x in items]
    values  = [x[1] for x in items]
    colors  = ["#28c840" if v >= 85 else "#ffbd2e" if v >= 60 else "#e05c5c" for v in values]

    # ── Plot ──────────────────────────────────────────────────────
    fig, ax = plt.subplots(figsize=(7, max(3, len(labels) * 0.55)))
    fig.patch.set_facecolor("#1a2236")
    ax.set_facecolor("#1a2236")

    y_pos = np.arange(len(labels))
    bars  = ax.barh(y_pos, values, color=colors, height=0.6, zorder=3)

    # Value labels on bars
    for bar, val in zip(bars, values):
        ax.text(
            min(val + 1.5, 102), bar.get_y() + bar.get_height() / 2,
            f"{val}%", va="center", ha="left",
            fontsize=8.5, color="#e2e8f0", fontweight="bold",
        )

    ax.set_yticks(y_pos)
    ax.set_yticklabels(labels, color="#9ca3af", fontsize=9)
    ax.set_xlim(0, 115)
    ax.set_xlabel("Confidence (%)", color="#9ca3af", fontsize=9)
    ax.set_title("Field Confidence Scores", color="#ffffff", fontsize=11, fontweight="bold", pad=10)
    ax.tick_params(colors="#9ca3af", which="both")
    ax.spines[:].set_color("#1f2f4a")
    ax.xaxis.set_tick_params(color="#1f2f4a")
    ax.grid(axis="x", color="#1f2f4a", linewidth=0.8, zorder=0)

    # Legend
    legend_patches = [
        mpatches.Patch(color="#28c840", label="Good (≥85%)"),
        mpatches.Patch(color="#ffbd2e", label="OK (60–84%)"),
        mpatches.Patch(color="#e05c5c", label="Low (<60%)"),
    ]
    ax.legend(handles=legend_patches, loc="lower right", fontsize=7.5,
              facecolor="#111827", edgecolor="#1f2f4a", labelcolor="#9ca3af")

    plt.tight_layout()

    buf = io.BytesIO()
    plt.savefig(buf, format="png", dpi=130, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)
    buf.seek(0)

    return StreamingResponse(buf, media_type="image/png")


# ─────────────────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
