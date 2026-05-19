from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import uvicorn
from config import settings
from services.file_service import save_invoice_file, list_invoice_files

app = FastAPI(
    title="Invoice Agent API",
    description="Backend for Invoice Extractor — handles PDF upload, storage, and chat.",
    version="1.1.0",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Chat Q&A 

FAQ = [
    {
        "patterns": ["hi", "hello", "hey", "greetings", "good morning", "good afternoon"],
        "response": (
            "👋 Hi there! I'm your Invoice Validation Agent. "
            "Upload an invoice PDF and I'll validate it — extracting all key fields "
            "and flagging any missing or suspicious data. How can I help you?"
        ),
    },
    {
        "patterns": ["what can you do", "help", "how does this work", "capabilities"],
        "response": (
            "🤖 I can: extract invoice fields (number, date, vendor, totals, GST, PAN, etc.), "
            "validate document structure, flag missing fields, summarise line items, "
            "and assign confidence scores. Just upload a PDF to get started!"
        ),
    },
    {
        "patterns": ["what fields", "which fields", "what data", "what does it extract"],
        "response": (
            "🔍 Extractable fields include: invoice_number, invoice_date, due_date, "
            "vendor_name, customer_name, billing_address, shipping_address, phone_number, "
            "email, gst_number, pan_number, bank_name, ifsc_code, currency, "
            "subtotal, tax_amount, total_amount — plus line items."
        ),
    },
    {
        "patterns": ["gst", "gstin", "gst number"],
        "response": (
            "🏛️ I extract the GSTIN from your invoice. A valid GSTIN is 15 characters "
            "(e.g. 22AAAAA0000A1Z5). If missing or malformed, it will be flagged."
        ),
    },
    {
        "patterns": ["how long", "processing time", "how fast"],
        "response": "⚡ Most invoices are processed in under 10 seconds — upload takes ~2s, extraction ~5s.",
    },
    {
        "patterns": ["secure", "security", "privacy", "confidential", "safe"],
        "response": (
            "🔒 Files are stored locally with a unique ID and are not shared with third parties. "
            "For production, we recommend encrypted storage and API authentication."
        ),
    },
    {
        "patterns": ["error", "failed", "not working", "issue", "problem"],
        "response": (
            "🔧 Troubleshooting: ensure the file is a text-based PDF (not scanned image only), "
            "under 10MB, and the backend is running on port 8000. Check browser console for details."
        ),
    },
    {
        "patterns": ["confidence", "accuracy", "confidence score"],
        "response": (
            "📊 Each field gets a score 0–100: 90–100 = very high, 70–89 = good, "
            "50–69 = moderate (review recommended), below 50 = low (possibly unclear text)."
        ),
    },
    {
        "patterns": ["supported formats", "file types", "what file"],
        "response": (
            "📁 Only PDF files are supported right now. Use text-based, non-password-protected PDFs "
            "for best results. OCR support for scanned PDFs is planned."
        ),
    },
    {
        "patterns": ["thank", "thanks", "awesome", "great", "perfect"],
        "response": "😊 You're welcome! Upload an invoice anytime and I'll validate it for you.",
    },
    {
        "patterns": ["bye", "goodbye", "see you"],
        "response": "👋 Goodbye! Come back anytime you need invoice validation.",
    },
]


class ChatRequest(BaseModel):
    message: str
    upload_status: str | None = None   # "idle" | "uploading" | "success" | "error"
    file_id: str | None = None


def resolve_chat_response(message: str, upload_status: str | None, file_id: str | None) -> str:
    msg = message.lower().strip()

    # Context-aware responses when a file has been processed
    if upload_status == "success" and file_id:
        if any(k in msg for k in ["result", "show", "output", "extracted", "what did you find"]):
            return (
                f"✅ Invoice uploaded successfully! File ID: **{file_id}**. "
                "The file is stored on the backend and ready for AI extraction. "
                "Switch to the Upload Info tab to see full metadata."
            )
        if any(k in msg for k in ["valid", "ok", "good", "correct"]):
            return (
                f"✅ Your invoice (ID: {file_id}) was received and saved successfully. "
                "The extraction agent can now process it to validate all fields."
            )

    if upload_status == "error":
        if any(k in msg for k in ["why", "error", "failed", "problem"]):
            return (
                "❌ The upload failed. Possible causes: backend not running on port 8000, "
                "file too large, or network issue. Try clicking Retry."
            )

    # FAQ matching
    for faq in FAQ:
        for pattern in faq["patterns"]:
            if pattern in msg:
                return faq["response"]

    # Default
    return (
        "🤔 I'm not sure I understood that. Try asking: "
        "\"What can you do?\", \"What fields can you extract?\", "
        "\"How do I upload?\", or \"Is my data secure?\" — "
        "or just upload an invoice and I'll get to work!"
    )


# ── Routes 

@app.get("/", tags=["Health"])
def health_check():
    return {"status": "ok", "message": "Invoice Agent API is running."}


@app.post("/api/invoices/upload", tags=["Invoices"])
async def upload_invoice(file: UploadFile = File(...)):
    """Accept a PDF, validate, save to local storage, return metadata."""
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")
    result = await save_invoice_file(file)
    return JSONResponse(status_code=200, content=result)


@app.get("/api/invoices", tags=["Invoices"])
def get_invoices():
    """Return metadata for all uploaded invoices."""
    files = list_invoice_files()
    return {"invoices": files}


@app.post("/api/chat", tags=["Chat"])
def chat(req: ChatRequest):
    """
    Simple rule-based chat endpoint.
    Accepts a user message plus optional upload context and returns a bot reply.
    """
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    reply = resolve_chat_response(req.message, req.upload_status, req.file_id)
    return {"reply": reply}


# ── Entry point 
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
