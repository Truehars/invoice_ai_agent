from dotenv import load_dotenv
import os
import json

from langchain.agents import create_agent

# Load environment variables
load_dotenv()

# Check API key
api_key = os.getenv("OPENROUTER_API_KEY")

if not api_key:
    raise ValueError("OPENROUTER_API_KEY not found")

# Create Agent
agent = create_agent(
    model="openrouter:openai/gpt-oss-120b:free",

    system_prompt="""
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
    "value": "₹45,000",
    "confidence": 98
  }
}

Possible fields:
- invoice_number
- invoice_date
- due_date
- vendor_name
- customer_name
- billing_address
- shipping_address
- phone_number
- email
- gst_number
- pan_number
- loan_account_number
- bank_name
- account_number
- ifsc_code
- currency
- subtotal
- tax_amount
- total_amount

Line Item Format:

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
- extraction_status should be:
  - "success"
  - "partial"
  - "failed"
"""
)

# Read extracted raw text
with open("output.txt", "r", encoding="utf-8") as f:
    file_content = f.read()

# Invoke agent
result = agent.invoke({
    "messages": [
        {
            "role": "user",
            "content": file_content
        }
    ]
})

# Get response text
response_text = result["messages"][-1].content

# Convert JSON string to Python object
parsed_json = json.loads(response_text)

# Pretty print
print(json.dumps(parsed_json, indent=4))