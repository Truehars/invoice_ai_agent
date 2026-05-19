"""
orchestrator.py
───────────────
Multi-Agent Orchestrator: runs Agent 1 → Agent 2 → Agent 3 sequentially.

Usage:
    python orchestrator.py                  # reads output.txt by default
    python orchestrator.py --input doc.txt  # reads a custom file
    python orchestrator.py --save           # saves each agent's JSON to disk
"""

import os
import sys
import json
import time
import argparse
from dotenv import load_dotenv
from langchain_openai import AzureChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

load_dotenv()

# ─────────────────────────────────────────────
# SHARED LLM FACTORY
# ─────────────────────────────────────────────

def get_llm():
    api_key = os.getenv("AZURE_OPENAI_API_KEY")
    if not api_key:
        raise ValueError("AZURE_OPENAI_API_KEY not found in environment")
    return AzureChatOpenAI(
        azure_deployment="gpt-4o-mini",
        azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
        api_key=api_key,
        api_version="2024-02-01",
    )


# ─────────────────────────────────────────────
# SHARED HELPER: parse LLM JSON response
# ─────────────────────────────────────────────

def parse_llm_json(response_text: str, agent_name: str) -> dict:
    text = response_text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        print(f"\n[{agent_name} ERROR] Failed to parse JSON: {e}")
        print(f"[{agent_name} RAW RESPONSE]:\n{text}")
        return {}


# ─────────────────────────────────────────────
# AGENT 1 — EXTRACTION
# ─────────────────────────────────────────────

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


def run_agent1(raw_text: str) -> dict:
    llm = get_llm()
    messages = [
        SystemMessage(content=EXTRACTION_SYSTEM_PROMPT),
        HumanMessage(content=raw_text),
    ]
    response = llm.invoke(messages)
    return parse_llm_json(response.content, "Agent 1")


# ─────────────────────────────────────────────
# AGENT 2 — VALIDATION
# ─────────────────────────────────────────────

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
    llm = get_llm()
    messages = [
        SystemMessage(content=VALIDATION_SYSTEM_PROMPT),
        HumanMessage(content=json.dumps(agent1_output, indent=2)),
    ]
    response = llm.invoke(messages)
    return parse_llm_json(response.content, "Agent 2")


# ─────────────────────────────────────────────
# AGENT 3 — EXCEPTION & ESCALATION
# ─────────────────────────────────────────────

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
    llm = get_llm()
    combined_input = {
        "agent1_extraction": agent1_output,
        "agent2_validation": agent2_output,
    }
    messages = [
        SystemMessage(content=EXCEPTION_SYSTEM_PROMPT),
        HumanMessage(content=json.dumps(combined_input, indent=2)),
    ]
    response = llm.invoke(messages)
    return parse_llm_json(response.content, "Agent 3")


# ─────────────────────────────────────────────
# PRETTY PRINTER
# ─────────────────────────────────────────────

def print_banner(text: str):
    width = 60
    print("\n" + "═" * width)
    print(f"  {text}")
    print("═" * width)


def print_step(step: int, label: str, elapsed: float):
    print(f"\n✅ Agent {step} ({label}) completed in {elapsed:.2f}s")


def print_final_decision(agent3_output: dict):
    decision = agent3_output.get("final_decision", "unknown")
    icons = {
        "auto_approve":     "🟢 AUTO APPROVE",
        "flag_for_review":  "🟡 FLAG FOR REVIEW",
        "request_resubmit": "🟠 REQUEST RESUBMIT",
        "reject_document":  "🔴 REJECT DOCUMENT",
    }
    counts = agent3_output.get("exception_counts", {})
    print_banner("FINAL PIPELINE DECISION")
    print(f"  Decision   : {icons.get(decision, decision.upper())}")
    print(f"  Escalation : {'Yes' if agent3_output.get('escalation_required') else 'No'}")
    print(f"  Exceptions : CRITICAL={counts.get('CRITICAL',0)}  HIGH={counts.get('HIGH',0)}  "
          f"MEDIUM={counts.get('MEDIUM',0)}  LOW={counts.get('LOW',0)}")
    print(f"\n  Audit Summary:\n  {agent3_output.get('audit_summary', '')}")
    notes = agent3_output.get("processing_notes", [])
    if notes:
        print("\n  Processing Notes:")
        for note in notes:
            print(f"    • {note}")


# ─────────────────────────────────────────────
# MAIN ORCHESTRATION PIPELINE
# ─────────────────────────────────────────────

def run_pipeline(input_file: str, save_outputs: bool = False) -> dict:
    print_banner("MULTI-AGENT DOCUMENT PROCESSING PIPELINE")
    print(f"  Input file : {input_file}")

    # Read raw document text
    with open(input_file, "r", encoding="utf-8") as f:
        raw_text = f.read()

    # ── AGENT 1: EXTRACTION ──────────────────
    print("\n⏳ Running Agent 1 — Extraction...")
    t0 = time.time()
    agent1_output = run_agent1(raw_text)
    elapsed1 = time.time() - t0

    if not agent1_output:
        print("[PIPELINE HALTED] Agent 1 returned no output.")
        sys.exit(1)

    print_step(1, "Extraction", elapsed1)
    print(json.dumps(agent1_output, indent=4, ensure_ascii=False))

    if save_outputs:
        with open("agent1_output.json", "w", encoding="utf-8") as f:
            json.dump(agent1_output, f, indent=4, ensure_ascii=False)
        print("  → Saved: agent1_output.json")

    # Early exit if extraction completely failed
    if agent1_output.get("extraction_status") == "failed":
        print("\n[PIPELINE WARNING] Extraction failed. Continuing to validation for audit purposes...")

    # ── AGENT 2: VALIDATION ──────────────────
    print("\n⏳ Running Agent 2 — Validation...")
    t0 = time.time()
    agent2_output = run_agent2(agent1_output)
    elapsed2 = time.time() - t0

    if not agent2_output:
        print("[PIPELINE HALTED] Agent 2 returned no output.")
        sys.exit(1)

    print_step(2, "Validation", elapsed2)
    print(json.dumps(agent2_output, indent=4, ensure_ascii=False))

    if save_outputs:
        with open("agent2_output.json", "w", encoding="utf-8") as f:
            json.dump(agent2_output, f, indent=4, ensure_ascii=False)
        print("  → Saved: agent2_output.json")

    # ── AGENT 3: EXCEPTION & ESCALATION ─────
    print("\n⏳ Running Agent 3 — Exception & Escalation...")
    t0 = time.time()
    agent3_output = run_agent3(agent1_output, agent2_output)
    elapsed3 = time.time() - t0

    if not agent3_output:
        print("[PIPELINE HALTED] Agent 3 returned no output.")
        sys.exit(1)

    print_step(3, "Exception & Escalation", elapsed3)
    print(json.dumps(agent3_output, indent=4, ensure_ascii=False))

    if save_outputs:
        with open("agent3_output.json", "w", encoding="utf-8") as f:
            json.dump(agent3_output, f, indent=4, ensure_ascii=False)
        print("  → Saved: agent3_output.json")

    # ── FINAL COMBINED REPORT ────────────────
    final_report = {
        "pipeline_version": "1.0",
        "input_file": input_file,
        "agent1_extraction": agent1_output,
        "agent2_validation": agent2_output,
        "agent3_exception": agent3_output,
    }

    if save_outputs:
        with open("final_report.json", "w", encoding="utf-8") as f:
            json.dump(final_report, f, indent=4, ensure_ascii=False)
        print("\n  → Saved: final_report.json")

    print_final_decision(agent3_output)
    print("\n" + "═" * 60 + "\n")

    return final_report


# ─────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Multi-Agent Document Processing Pipeline")
    parser.add_argument(
        "--input", "-i",
        default="output.txt",
        help="Path to the raw document text file (default: output.txt)"
    )
    parser.add_argument(
        "--save", "-s",
        action="store_true",
        help="Save each agent's JSON output to disk"
    )
    args = parser.parse_args()

    run_pipeline(input_file=args.input, save_outputs=args.save)
