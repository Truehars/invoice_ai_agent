from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

from config import settings
from services.file_service import save_invoice_file, list_invoice_files

app = FastAPI(
    title="Invoice Agent API",
    description="Backend for Invoice Extractor — handles PDF upload and storage.",
    version="1.0.0",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Routes 

@app.get("/", tags=["Health"])
def health_check():
    return {"status": "ok", "message": "Invoice Agent API is running."}


@app.post("/api/invoices/upload", tags=["Invoices"])
async def upload_invoice(file: UploadFile = File(...)):
    """
    Accept a PDF file, validate it, save it to local storage,
    and return metadata about the saved file.
    """
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    result = await save_invoice_file(file)
    return JSONResponse(status_code=200, content=result)


@app.get("/api/invoices", tags=["Invoices"])
def get_invoices():
    """
    Return a list of all uploaded invoices stored locally.
    """
    files = list_invoice_files()
    return {"invoices": files}


#  Entry point 
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)