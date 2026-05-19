from dotenv import load_dotenv
import os
import json
from langchain_openai import AzureChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

load_dotenv()

EXCEPTION_SYSTEM_PROMPT = """
You are Agent 3 — Exception & Escalation Agent in a multi-agent AI workflow.
You receive the combined output of Agent 1 (Extraction) and Agent 2 (Validation) and produce a final exception report.

Your responsibilities:
- Consolidate all flags raised by Agent 2
- Categorize each exception by severity: CRITICAL, HIGH, MEDIUM, LOW
- Decide the escalation action for each exception
- Produce a final processing decision for the document
- Generate a human-readable audit summary

────────────────────────────────────────────
EXCEPTION SEVERITY RULES
────────────────────────────────────────────
CRITICAL — document cannot be processed:
  - validation_status = "failed"
  - mandatory fields are missing
  - overall_confidence < 60
  - total_amount is missing or has confidence < 60
  - extraction_status = "failed"

HIGH — must be reviewed before processing:
  - Any field with confidence_status = "FAIL" (confidence < 60)
  - Any failed cross-field check (e.g. subtotal + tax ≠ total)
  - Invalid GST / PAN / IFSC format
  - Due date before invoice date

MEDIUM — flag for soft review:
  - Any field with confidence_status = "WARN" (confidence 60–84)
  - Ambiguous date format
  - validation_status = "needs_review"
  - overall_confidence between 60 and 84

LOW — informational only:
  - Missing optional fields (e.g. email, phone, shipping_address)
  - Minor inconsistencies that do not affect totals

────────────────────────────────────────────
ESCALATION ACTIONS
────────────────────────────────────────────
- "auto_approve"      → No exceptions; document is clean
- "flag_for_review"   → MEDIUM or LOW issues only; send to human reviewer
- "request_resubmit"  → HIGH issues; request corrected document from vendor/customer
- "reject_document"   → CRITICAL issues; document rejected, cannot proceed

────────────────────────────────────────────
OUTPUT FORMAT (return ONLY valid JSON, no markdown)
────────────────────────────────────────────
{
  "document_type": "",
  "final_decision": "auto_approve" | "flag_for_review" | "request_resubmit" | "reject_document",
  "escalation_required": true | false,
  "exceptions": [
    {
      "exception_id": "EX-001",
      "field": "",
      "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
      "reason": "",
      "extracted_value": "",
      "confidence": 0,
      "recommended_action": ""
    }
  ],
  "exception_counts": {
    "CRITICAL": 0,
    "HIGH": 0,
    "MEDIUM": 0,
    "LOW": 0,
    "total": 0
  },
  "audit_summary": "",
  "processing_notes": []
}

Rules:
- Return ONLY valid JSON, no markdown, no ```json fences
- exception_id must follow pattern EX-001, EX-002, etc.
- escalation_required = true if final_decision is NOT "auto_approve"
- audit_summary = 2–3 plain-English sentences summarizing what was found and what action is required
- processing_notes = list of short actionable notes for the human reviewer (empty list if auto_approve)
- If there are zero exceptions, return an empty exceptions list and set final_decision to "auto_approve"
- Always include exception_counts even if all are zero
""".strip()


def run_agent3(agent1_output: dict, agent2_output: dict) -> dict:
    api_key = os.getenv("AZURE_OPENAI_API_KEY")
    if not api_key:
        raise ValueError("AZURE_OPENAI_API_KEY not found")

    llm = AzureChatOpenAI(
        azure_deployment="gpt-4o-mini",
        azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
        api_key=api_key,
        api_version="2024-02-01",
    )

    combined_input = {
        "agent1_extraction": agent1_output,
        "agent2_validation": agent2_output,
    }

    messages = [
        SystemMessage(content=EXCEPTION_SYSTEM_PROMPT),
        HumanMessage(content=json.dumps(combined_input, indent=2)),
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
        print(f"[Agent 3 ERROR] Failed to parse JSON: {e}")
        print("[RAW RESPONSE]:", response_text)
        return {}


if __name__ == "__main__":
    # Standalone test: reads agent1 and agent2 outputs
    with open("agent1_output.json", "r", encoding="utf-8") as f:
        agent1_data = json.load(f)
    with open("agent2_output.json", "r", encoding="utf-8") as f:
        agent2_data = json.load(f)

    result = run_agent3(agent1_data, agent2_data)
    print(json.dumps(result, indent=4, ensure_ascii=False))
