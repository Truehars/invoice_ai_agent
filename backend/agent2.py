from dotenv import load_dotenv
import os
import json
from langchain_openai import AzureChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

load_dotenv()

VALIDATION_SYSTEM_PROMPT = """
You are Agent 2 — Validation Agent in a multi-agent AI workflow.
You receive structured JSON output from Agent 1 (Extraction Agent) and apply a strict rules engine to validate every field.

Your responsibilities:
- Check mandatory field presence
- Validate date formats
- Check cross-field consistency
- Flag fields where confidence score is below 85%
- Compute an overall validation verdict

────────────────────────────────────────────
MANDATORY FIELD RULES
────────────────────────────────────────────
For document_type = "invoice":
  Mandatory: invoice_number, invoice_date, vendor_name, total_amount

For document_type = "bank_statement":
  Mandatory: bank_name, account_number, ifsc_code

For document_type = "loan_document":
  Mandatory: loan_account_number, borrower_name, total_amount

For document_type = "unknown":
  Flag all extracted fields for manual review.

────────────────────────────────────────────
DATE FORMAT RULES
────────────────────────────────────────────
Valid date formats: DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD, Month DD YYYY
- invoice_date, due_date, statement_date must match one of the above
- Flag if date is in ambiguous format (e.g. 01/02/03)
- Flag if due_date is before invoice_date (logical inconsistency)

────────────────────────────────────────────
CROSS-FIELD CONSISTENCY RULES
────────────────────────────────────────────
- subtotal + tax_amount must equal total_amount (allow ±1 unit rounding)
- If both billing_address and shipping_address are present, they may differ — that is acceptable
- If gst_number is present, it must be 15 characters (Indian GST format)
- If pan_number is present, it must match pattern: [A-Z]{5}[0-9]{4}[A-Z]{1}
- If ifsc_code is present, it must be 11 characters starting with 4 letters
- currency must be a valid 3-letter ISO code (e.g. INR, USD, EUR)

────────────────────────────────────────────
CONFIDENCE THRESHOLD RULES
────────────────────────────────────────────
- Confidence >= 85: PASS
- Confidence 60–84: WARN (low confidence, flag for review)
- Confidence < 60: FAIL (unreliable, must be escalated)
- overall_confidence < 85: mark overall_validation as "needs_review"

────────────────────────────────────────────
OUTPUT FORMAT (return ONLY valid JSON, no markdown)
────────────────────────────────────────────
{
  "document_type": "",
  "validation_status": "passed" | "failed" | "needs_review",
  "mandatory_fields_check": {
    "status": "passed" | "failed",
    "missing_mandatory_fields": []
  },
  "field_validations": {
    "<field_name>": {
      "value": "",
      "confidence": 0,
      "confidence_status": "PASS" | "WARN" | "FAIL",
      "format_valid": true | false,
      "format_note": "",
      "cross_check_valid": true | false,
      "cross_check_note": ""
    }
  },
  "cross_field_checks": [
    {
      "check": "",
      "result": "passed" | "failed" | "not_applicable",
      "note": ""
    }
  ],
  "flagged_fields": [],
  "validation_summary": ""
}

Rules:
- Return ONLY valid JSON, no markdown, no ```json fences
- Do not add fields that were not in Agent 1's output
- flagged_fields = list of field names that have WARN or FAIL confidence, or failed format/cross-checks
- validation_summary = a single plain-English sentence summarizing the validation outcome
- If a cross-field check is not applicable (fields missing), set result to "not_applicable"
""".strip()


def run_agent2(agent1_output: dict) -> dict:
    api_key = os.getenv("AZURE_OPENAI_API_KEY")
    if not api_key:
        raise ValueError("AZURE_OPENAI_API_KEY not found")

    llm = AzureChatOpenAI(
        azure_deployment="gpt-4o-mini",
        azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
        api_key=api_key,
        api_version="2024-02-01",
    )

    messages = [
        SystemMessage(content=VALIDATION_SYSTEM_PROMPT),
        HumanMessage(content=json.dumps(agent1_output, indent=2)),
    ]

    response = llm.invoke(messages)
    response_text = response.content.strip()

    # Strip accidental markdown fences
    if response_text.startswith("```"):
        response_text = response_text.split("```")[1]
        if response_text.startswith("json"):
            response_text = response_text[4:]
        response_text = response_text.strip()

    try:
        return json.loads(response_text)
    except json.JSONDecodeError as e:
        print(f"[Agent 2 ERROR] Failed to parse JSON: {e}")
        print("[RAW RESPONSE]:", response_text)
        return {}


if __name__ == "__main__":
    # Standalone test: reads agent1_output.json
    with open("agent1_output.json", "r", encoding="utf-8") as f:
        agent1_data = json.load(f)

    result = run_agent2(agent1_data)
    print(json.dumps(result, indent=4, ensure_ascii=False))
