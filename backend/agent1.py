from dotenv import load_dotenv
import os
import json
from langchain_openai import AzureChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

# Load environment variables
load_dotenv()

# Check API key
api_key = os.getenv("AZURE_OPENAI_API_KEY")
if not api_key:
    raise ValueError("AZURE_OPENAI_API_KEY not found")

# System prompt
EXTRACTION_SYSTEM_PROMPT = """
You are Agent 1 — Data Extraction Agent in a multi-agent AI workflow.
Your responsibility is to extract structured information from invoices, banking PDFs, financial documents, and other business documents.

You must:
- Extract only fields that are actually present in the document
- Generate confidence scores for every extracted field
- Preserve original values from the document
- Avoid hallucinating or guessing missing information
- Return ONLY valid JSON

The extracted data will later be validated by downstream validation and exception agents.

Required JSON structure:
{
  "document_type": "",
  "extracted_fields": {},
  "line_items": [],
  "missing_fields": [],
  "extraction_status": "",
  "overall_confidence": 0
}

Extraction Rules:
- Include ONLY fields found in the document
- Do NOT include empty fields
- Do NOT create keys for unavailable data
- If invoice_number is not present, do not include it
- If GST number is not present, do not include it
- Same rule applies for all fields
- don't miss any possible fields

Example extracted_fields format:
"extracted_fields": {
  "invoice_number": {
    "value": "INV-1023",
    "confidence": 96
  },
  "invoice_date": {
    "value": "12-05-2026",
    "confidence": 92
  },
  "total_amount": {
    "value": "45,000",
    "confidence": 98
  }
}

Possible fields:
- invoice_number, invoice_date, due_date
- vendor_name, customer_name
- billing_address, shipping_address
- phone_number, email
- gst_number, pan_number
- loan_account_number, bank_name, account_number, ifsc_code
- currency, subtotal, tax_amount, total_amount

Example Line Item Format:
"line_items": [
  {
    "description": "Laptop",
    "quantity": "2",
    "unit_price": "50000",
    "amount": "100000",
    "confidence": 95
  }
]

Rules:
- Return ONLY valid JSON
- Do not return markdown
- Do not use ```json
- Confidence score must be between 0 and 100
- Do not guess values not present in the document
- Preserve exact extracted values from the source document
- If a field is unclear or partially visible, assign low confidence
- If document type is unknown, set document_type as "unknown"
- extraction_status must be: "success", "partial", or "failed"
""".strip()

# Initialize LLM via Azure OpenAI
llm = AzureChatOpenAI(
    azure_deployment="gpt-4o-mini",
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
    api_key=os.getenv("AZURE_OPENAI_API_KEY"),
    api_version="2024-02-01",
)

# Read extracted raw text
with open("output.txt", "r", encoding="utf-8") as f:
    file_content = f.read()

# Build messages
messages = [
    SystemMessage(content=EXTRACTION_SYSTEM_PROMPT),
    HumanMessage(content=file_content),
]

# Invoke LLM
response = llm.invoke(messages)
response_text = response.content.strip()


# Strip accidental markdown fences if model ignores instructions
if response_text.startswith("```"):
    response_text = response_text.split("```")[1]
    if response_text.startswith("json"):
        response_text = response_text[4:]
    response_text = response_text.strip()

# Parse JSON
try:
    parsed_json = json.loads(response_text)
    print(json.dumps(parsed_json, indent=4, ensure_ascii=False))
except json.JSONDecodeError as e:
    print(f"[ERROR] Failed to parse JSON: {e}")
    print("[RAW RESPONSE]:", response_text)