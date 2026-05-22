"""
orchestrator.py
───────────────
LLM-driven Multi-Agent Orchestrator.
The router LLM decides which agent to call next — no hardcoded sequence.

Agents:
    extractor_agent  → Agent 1 — extracts structured fields from raw document
    validator_agent  → Agent 2 — validates extracted fields
    exception_agent  → Agent 3 — classifies exceptions and produces final decision

Public API used by main.py:
    report = run_pipeline_from_text(raw_text: str) -> dict

CLI usage (for testing):
    python orchestrator.py --input output.txt [--save]
"""

import argparse
import json
import time

from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, ToolMessage

from services.llm_client import get_llm, parse_llm_json


# ─────────────────────────────────────────────────────────────────
# EXTRACTOR AGENT — Agent 1
# ─────────────────────────────────────────────────────────────────

_EXTRACTOR_AGENT_PROMPT = """
# Role
You are the Extraction Agent in a multi-agent document processing pipeline.
you got any type of invoice from any sector.
Your sole responsibility is to extract structured, accurate information from financial and business documents — invoices, bank statements, loan documents, and similar.

# Objective
Extract every field that is explicitly present in the document.
Return a single, valid JSON object and nothing else.

# Example Output Schema
{
  "document_type": string,
  "extraction_status": "success" | "partial" | "failed",
  "overall_confidence": integer (0–100),
  "extracted_fields": {
    "<field_name>": {
      "value": string,
      "confidence": integer (0–100)
    }
  },
  "line_items": [
    {
      "description": string,
      "quantity": string,
      "unit_price": string,
      "amount": string,
      "confidence": integer (0–100)
    }
  ],
  "missing_fields": [string]
}

#Example Recognized Field Names
Document Identity   : invoice_number, invoice_date, due_date
Parties             : vendor_name, customer_name
Addresses           : billing_address, shipping_address
Contact             : phone_number, email
Tax & Identity      : gst_number, pan_number
Banking             : loan_account_number, bank_name, account_number, ifsc_code
Financials          : currency, subtotal, tax_amount, total_amount

# Extraction Rules
1. Include only fields that are explicitly present in the document.
2. Never fabricate, infer, or guess a value that is not visible.
3. Preserve the exact original value as it appears in the source.
4. If a field is ambiguous or partially legible, include it with a low confidence score.
5. Omit any field that is absent — do not create keys with null or empty values.
6. Populate missing_fields only with field names you attempted to find but could not locate.
7. Set document_type to "unknown" if the document type cannot be determined.
8. Set extraction_status based on outcome:
   - "success"  → all expected fields extracted cleanly
   - "partial"  → some fields missing or low-confidence
   - "failed"   → document unreadable or no fields could be extracted

# Output Rules
- Return valid JSON only — no markdown, no code fences, no explanation.
- All confidence scores must be integers between 0 and 100.
- overall_confidence should reflect the average quality of the full extraction.
""".strip()


# VALIDATOR AGENT — Agent 2


_VALIDATOR_AGENT_PROMPT = """
# Role
You are the Validation Agent in a multi-agent document processing pipeline.
You receive structured JSON from the Extraction Agent and apply a strict rules engine to validate every field.
You do not extract — you only validate what was extracted.

# Input
A JSON object produced by the Extraction Agent containing:
- document_type, extraction_status, overall_confidence
- extracted_fields (each with value and confidence)
- line_items, missing_fields

# Example Output Schema
Return a single valid JSON object and nothing else.

{
  "document_type": string,
  "validation_status": "passed" | "failed" | "needs_review",
  "mandatory_fields_check": {
    "status": "passed" | "failed",
    "missing_mandatory_fields": [string]
  },
  "field_validations": {
    "<field_name>": {
      "value": string,
      "confidence": integer,
      "confidence_status": "PASS" | "WARN" | "FAIL",
      "format_valid": boolean,
      "format_note": string,
      "cross_check_valid": boolean,
      "cross_check_note": string
    }
  },
  "cross_field_checks": [
    {
      "check": string,
      "result": "passed" | "failed" | "not_applicable",
      "note": string
    }
  ],
  "flagged_fields": [string],
  "validation_summary": string
}

# Mandatory Field Rules
Validate presence based on document_type. Flag any missing mandatory field.

  invoice        → invoice_number, invoice_date, vendor_name, total_amount
  bank_statement → bank_name, account_number, ifsc_code
  loan_document  → loan_account_number, borrower_name, total_amount
  unknown        → flag all fields for manual review

# Confidence Threshold Rules
Apply to every field individually.

  confidence >= 80   → PASS
  confidence 60-80   → WARN
  confidence < 60    → FAIL

# Format Validation Rules
Apply format checks to these fields if present.

  invoice_date, due_date   → Accept: DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD, Month DD YYYY
                             Flag:   ambiguous formats (e.g. 01/02/03)
                             Flag:   due_date that is earlier than invoice_date

  gst_number               → Must be exactly 15 characters
  pan_number               → Must match pattern: [A-Z]{5}[0-9]{4}[A-Z]
  ifsc_code                → Must be exactly 11 characters, first 4 must be letters
  currency                 → Must be a valid ISO 4217 3-letter code (e.g. INR, USD, EUR)

# Cross-Field Validation Rules
Run these checks when the relevant fields are present.

  Amount integrity   → subtotal + tax_amount must equal total_amount (+-1 rounding tolerance)
  Date logic         → due_date must not be earlier than invoice_date
  Line item total    → sum of all line_item amounts must approximately equal subtotal (+-1 tolerance)

# Validation Status Logic
Determine overall validation_status after all checks.

  "passed"       → all mandatory fields present, all formats valid, no FAIL confidence scores
  "needs_review" → any WARN confidence score, ambiguous format, or minor cross-field discrepancy
  "failed"       → any missing mandatory field, format violation, FAIL confidence score, or cross-field check failure

# flagged_fields
List the field names of every field that has:
- confidence_status of WARN or FAIL
- format_valid of false
- cross_check_valid of false

# validation_summary
Write one concise sentence describing the overall outcome and the most important issue found, if any.

# Output Rules
- Return valid JSON only — no markdown, no code fences, no explanation.
- Include every extracted field in field_validations, even if it passed all checks.
- cross_check_note and format_note must be empty strings if no issue was found.
- Do not add fields that were not present in the Extraction Agent output.
""".strip()


# EXCEPTION AGENT — Agent 3


_EXCEPTION_AGENT_PROMPT = """
# Role
You are the Exception and Escalation Agent in a multi-agent document processing pipeline.
You receive the combined output from the Extraction Agent and the Validation Agent.
Your job is to review all findings, classify every problem by severity, and decide what happens next.
You do not extract or validate — you only assess, classify, and decide.

# Input
A combined JSON object containing:
- Extraction Agent output: document_type, extraction_status, overall_confidence, extracted_fields, missing_fields
- Validation Agent output: validation_status, mandatory_fields_check, field_validations, cross_field_checks, flagged_fields

#Example Output Schema
Return a single valid JSON object and nothing else.

{
  "document_type": string,
  "final_decision": "auto_approve" | "flag_for_review" | "request_resubmit" | "reject_document",
  "escalation_required": boolean,
  "exceptions": [
    {
      "exception_id": string,
      "field": string,
      "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
      "reason": string,
      "extracted_value": string,
      "confidence": integer,
      "recommended_action": string
    }
  ],
  "exception_counts": {
    "CRITICAL": integer,
    "HIGH": integer,
    "MEDIUM": integer,
    "LOW": integer,
    "total": integer
  },
  "audit_summary": string,
  "processing_notes": [string]
}

# Severity Classification Rules
Assign a severity level to every problem found across both agent outputs.

  CRITICAL — Document cannot move forward at all.
    - validation_status is "failed"
    - extraction_status is "failed"
    - Any mandatory field is missing
    - if overall_confidence is below 60
    - total_amount is missing or has confidence below 60

  HIGH — Document needs human review before it can be processed.
    - Any field has confidence_status of "FAIL"
    - Any cross-field check has failed (e.g. amounts do not add up)
    - gst_number, pan_number, or ifsc_code failed format check
    - due_date is earlier than invoice_date

  MEDIUM — Document has minor issues worth a quick look.
    - Any field has confidence_status of "WARN"
    - A date field has an ambiguous or non-standard format
    - overall_confidence is between 60 and 84

  LOW — Small gaps that do not affect document processing.
    - if overall_confidence is between 80 and 100 but some fields are missing.
    - Optional fields are absent (email, phone, shipping_address)
    - Minor inconsistencies that do not affect totals or identity

# Example Final Decision Rules based on llm
Derive final_decision from the highest severity present.

  No exceptions at all          → "auto_approve"
  Only MEDIUM or LOW exceptions → "flag_for_review"
  Any HIGH exception            → "request_resubmit"
  Any CRITICAL exception        → "reject_document"

# ExampleField-Level Rules
  exception_id        → Sequential, formatted as EX-001, EX-002, EX-003, and so on.
  escalation_required → true for any decision other than "auto_approve", false otherwise.
  exception_counts    → Always include all four severity counts even if some are zero.

# Example audit_summary
Write 2 to 3 plain, friendly sentences a non-technical person can understand.
Describe what the document is, what was found, and what will happen next.
Do not use technical terms, field names, error codes, or jargon.

# processing_notes
Write clear, actionable instructions for the human reviewer.
Each note is one sentence explaining a specific action to take.
Use plain language — avoid field names, codes, and technical terms where possible.
If final_decision is "auto_approve", return an empty list.

# reason and recommended_action (per exception)
  reason             → Explain the problem in one plain sentence without jargon.
  recommended_action → State exactly what should be done to fix it, in one plain sentence.

# Output Rules
- Return valid JSON only — no markdown, no code fences, no explanation.
- Every problem found in either agent output must appear as its own exception entry.
- Do not invent exceptions for fields that passed all checks.
- exception_counts must always be present, even when all values are zero.
""".strip()


# ─────────────────────────────────────────────────────────────────
# ROUTER — Tool Definitions  (OpenAI / LangChain-OpenAI format)
# ─────────────────────────────────────────────────────────────────

_ROUTER_TOOLS = [
    {
        "type": "function",                          # ← required by OpenAI API
        "function": {                                # ← all tool details live inside "function"
            "name": "extractor_agent",
            "description": (
                "Extracts all structured fields from a raw document. "
                "Always call this first if extraction has not been done yet."
            ),
            "parameters": {                          # ← "parameters", NOT "input_schema"
                "type": "object",
                "properties": {
                    "document_text": {
                        "type": "string",
                        "description": "The raw document text to extract fields from."
                    }
                },
                "required": ["document_text"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "validator_agent",
            "description": (
                "Validates the extracted fields for format correctness, confidence thresholds, "
                "and mandatory field presence. Call this after extractor_agent has completed."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "extraction_output": {
                        "type": "object",
                        "description": "The full JSON output returned by extractor_agent."
                    }
                },
                "required": ["extraction_output"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "exception_agent",
            "description": (
                "Reviews extraction and validation results, classifies all exceptions by severity, "
                "and produces a final processing decision. Call this after validator_agent has completed."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "extraction_output": {
                        "type": "object",
                        "description": "The full JSON output returned by extractor_agent."
                    },
                    "validation_output": {
                        "type": "object",
                        "description": "The full JSON output returned by validator_agent."
                    }
                },
                "required": ["extraction_output", "validation_output"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "finish",
            "description": (
                "Signals that the pipeline is complete. "
                "Call this only after all three agents have run successfully."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "summary": {
                        "type": "string",
                        "description": "One sentence describing the final pipeline outcome."
                    }
                },
                "required": ["summary"]
            }
        }
    }
]


# ─────────────────────────────────────────────────────────────────
# ROUTER — System Prompt
# ─────────────────────────────────────────────────────────────────

_ROUTER_PROMPT = """
# Role
You are the Orchestrator of a document processing pipeline.
You have four tools available: extractor_agent, validator_agent, exception_agent, and finish.

# Your job
Call tools one at a time in the correct order based on what has already been completed.
Pass the correct outputs from previous steps as inputs to the next tool.
When all three agents have run, call finish.

# Decision rules
- If no extraction exists yet                               → call extractor_agent
- If extraction exists but no validation                    → call validator_agent
- If extraction and validation exist but no exception report → call exception_agent
- If all three are complete                                 → call finish

# Rules
- Never skip a step.
- Never call the same agent twice.
- Always pass previous agent outputs as inputs to the next agent.
- Do not produce any text outside of tool calls.
""".strip()


# ─────────────────────────────────────────────────────────────────
# AGENT RUNNERS — invoked by the tool executor
# ─────────────────────────────────────────────────────────────────

def _run_extractor_agent(document_text: str) -> dict:
    llm = get_llm()
    response = llm.invoke([
        SystemMessage(content=_EXTRACTOR_AGENT_PROMPT),
        HumanMessage(content=f"Extract all fields from the following document:\n\n{document_text}"),
    ])
    return parse_llm_json(response.content, "extractor_agent")


def _run_validator_agent(extraction_output: dict) -> dict:
    llm = get_llm()
    response = llm.invoke([
        SystemMessage(content=_VALIDATOR_AGENT_PROMPT),
        HumanMessage(content=(
            "Validate the following extraction output:\n\n"
            f"{json.dumps(extraction_output, indent=2)}"
        )),
    ])
    return parse_llm_json(response.content, "validator_agent")


def _run_exception_agent(extraction_output: dict, validation_output: dict) -> dict:
    llm = get_llm()
    combined = {
        "extraction_agent_output": extraction_output,
        "validation_agent_output": validation_output,
    }
    response = llm.invoke([
        SystemMessage(content=_EXCEPTION_AGENT_PROMPT),
        HumanMessage(content=(
            "Review the extraction and validation results below and produce the exception report.\n\n"
            f"{json.dumps(combined, indent=2)}"
        )),
    ])
    return parse_llm_json(response.content, "exception_agent")


# ─────────────────────────────────────────────────────────────────
# TOOL EXECUTOR — dispatches whichever tool the router chose
# ─────────────────────────────────────────────────────────────────

def _execute_tool(tool_name: str, tool_input: dict, state: dict) -> tuple[str, bool]:
    """
    Runs the tool chosen by the router LLM.
    Updates pipeline state in place with the agent result.
    Returns (result_json_string, is_pipeline_done).

    Note: OpenAI-backed routers often omit large object args (e.g. they call
    validator_agent without passing extraction_output because they assume the
    orchestrator already holds it from the previous turn).  We always fall back
    to pipeline state so the pipeline never crashes on a missing arg — state is
    the single source of truth for inter-agent data.
    """
    print(f"[Tool Input] {tool_name} received args: {list(tool_input.keys())}")

    if tool_name == "extractor_agent":
        document_text = tool_input.get("document_text", "")
        result = _run_extractor_agent(document_text)
        state["extractor_agent"] = result
        return json.dumps(result), False

    elif tool_name == "validator_agent":
        # Fall back to pipeline state if the LLM did not echo extraction_output
        extraction_output = tool_input.get("extraction_output") or state.get("extractor_agent")
        if not extraction_output:
            return json.dumps({"error": "validator_agent called before extractor_agent completed"}), False
        result = _run_validator_agent(extraction_output)
        state["validator_agent"] = result
        return json.dumps(result), False

    elif tool_name == "exception_agent":
        # Fall back to pipeline state for either missing arg
        extraction_output = tool_input.get("extraction_output") or state.get("extractor_agent")
        validation_output = tool_input.get("validation_output") or state.get("validator_agent")
        if not extraction_output:
            return json.dumps({"error": "exception_agent called before extractor_agent completed"}), False
        if not validation_output:
            return json.dumps({"error": "exception_agent called before validator_agent completed"}), False
        result = _run_exception_agent(extraction_output, validation_output)
        state["exception_agent"] = result
        return json.dumps(result), False

    elif tool_name == "finish":
        return json.dumps({"summary": tool_input.get("summary", "")}), True

    else:
        return json.dumps({"error": f"Unknown tool: {tool_name}"}), False


# ─────────────────────────────────────────────────────────────────
# ORCHESTRATOR — PUBLIC API
# ─────────────────────────────────────────────────────────────────

def run_pipeline_from_text(raw_text: str, max_iterations: int = 10) -> dict:
    """
    LLM-driven pipeline.
    The router decides which agent to call next on every turn.
    Loops until the router calls 'finish' or max_iterations is reached.

    Called by the FastAPI /api/invoices/analyse endpoint.
    Returns the combined pipeline report dict.
    Raises RuntimeError on fatal failure.
    """
    llm = get_llm()
    state = {}

    messages = [
        SystemMessage(content=_ROUTER_PROMPT),
        HumanMessage(content=f"Process this document:\n\n{raw_text}"),
    ]

    for iteration in range(max_iterations):
        print(f"\n[Router] Turn {iteration + 1}...")

        response = llm.invoke(messages, tools=_ROUTER_TOOLS)

        # ── FIX: use LangChain's normalised tool_calls attribute ──────────────
        # LangChain-OpenAI returns tool calls via response.tool_calls (a list of
        # dicts with keys: id, name, args).  The old code parsed response.content
        # looking for Anthropic-style {"type": "tool_use"} blocks, which do not
        # exist when using an OpenAI-backed LLM.
        tool_calls = response.tool_calls  # ← replaces the block-scanning loop

        # Append the raw AIMessage so the conversation history stays intact.
        # Pass tool_calls explicitly so LangChain serialises them correctly even
        # when response.content is an empty string (common with tool-only turns).
        messages.append(
            AIMessage(
                content=response.content or "",
                tool_calls=tool_calls,
            )
        )

        if not tool_calls:
            print("[Router] No tool call returned — stopping.")
            break

        for tool_call in tool_calls:
            tool_name  = tool_call["name"]
            tool_input = tool_call["args"]   # ← OpenAI uses "args", not "input"
            tool_id    = tool_call["id"]

            print(f"[Router] -> {tool_name}")

            result_str, is_done = _execute_tool(tool_name, tool_input, state)

            messages.append(ToolMessage(
                content=result_str,
                tool_call_id=tool_id,
            ))

            if is_done:
                print("[Router] Pipeline complete.")
                return {
                    "pipeline_version": "3.0-agentic",
                    "extractor_agent":  state.get("extractor_agent"),
                    "validator_agent":  state.get("validator_agent"),
                    "exception_agent":  state.get("exception_agent"),
                }

    raise RuntimeError(
        f"Router did not complete the pipeline within {max_iterations} iterations."
    )


# ─────────────────────────────────────────────────────────────────
# CLI ENTRY POINT (for local testing)
# ─────────────────────────────────────────────────────────────────

def _cli():
    parser = argparse.ArgumentParser(description="Invoice Multi-Agent Pipeline (CLI)")
    parser.add_argument("--input", "-i", default="output.txt",
                        help="Path to raw document text file (default: output.txt)")
    parser.add_argument("--save", "-s", action="store_true",
                        help="Save each agent's JSON output to disk")
    args = parser.parse_args()

    print(f"\n{'=' * 60}")
    print(f"  INVOICE AGENT PIPELINE  (LLM-driven)")
    print(f"  Input : {args.input}")
    print(f"{'=' * 60}")

    with open(args.input, encoding="utf-8") as f:
        raw_text = f.read()

    t0 = time.time()
    report = run_pipeline_from_text(raw_text)
    elapsed = time.time() - t0

    extractor_output = report.get("extractor_agent", {})
    validator_output = report.get("validator_agent", {})
    exception_output = report.get("exception_agent", {})

    print(f"\n{'-' * 60}")
    print("  EXTRACTOR AGENT OUTPUT")
    print('-' * 60)
    print(json.dumps(extractor_output, indent=2, ensure_ascii=False))

    print(f"\n{'-' * 60}")
    print("  VALIDATOR AGENT OUTPUT")
    print('-' * 60)
    print(json.dumps(validator_output, indent=2, ensure_ascii=False))

    print(f"\n{'-' * 60}")
    print("  EXCEPTION AGENT OUTPUT")
    print('-' * 60)
    print(json.dumps(exception_output, indent=2, ensure_ascii=False))

    if args.save:
        for filename, data in [
            ("extractor_agent_output.json", extractor_output),
            ("validator_agent_output.json", validator_output),
            ("exception_agent_output.json", exception_output),
        ]:
            with open(filename, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            print(f"  Saved -> {filename}")

    decision = exception_output.get("final_decision", "unknown")
    icons = {
        "auto_approve":     "AUTO APPROVE",
        "flag_for_review":  "FLAG FOR REVIEW",
        "request_resubmit": "REQUEST RESUBMIT",
        "reject_document":  "REJECT DOCUMENT",
    }
    counts = exception_output.get("exception_counts", {})

    print(f"\n{'=' * 60}")
    print(f"  FINAL DECISION : {icons.get(decision, decision.upper())}")
    print(f"  Exceptions     — "
          f"CRITICAL:{counts.get('CRITICAL', 0)}  "
          f"HIGH:{counts.get('HIGH', 0)}  "
          f"MEDIUM:{counts.get('MEDIUM', 0)}  "
          f"LOW:{counts.get('LOW', 0)}")
    print(f"  Audit          : {exception_output.get('audit_summary', '')}")
    print(f"  Time           : {elapsed:.2f}s")
    print(f"{'=' * 60}\n")


if __name__ == "__main__":
    _cli()
