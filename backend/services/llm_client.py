"""
services/llm_client.py
──────────────────────
Shared LLM factory.  All agents and the chat endpoint get their LLM
instance from here so config lives in exactly one place.
"""

import json

from langchain_openai import AzureChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from config import settings


def get_llm() -> AzureChatOpenAI:
    """Return a configured AzureChatOpenAI instance."""
    if not settings.AZURE_OPENAI_API_KEY:
        raise ValueError("AZURE_OPENAI_API_KEY is not set in .env")

    return AzureChatOpenAI(
        azure_deployment=settings.AZURE_OPENAI_DEPLOYMENT,
        azure_endpoint=settings.AZURE_OPENAI_ENDPOINT,
        api_key=settings.AZURE_OPENAI_API_KEY,
        api_version=settings.AZURE_OPENAI_API_VERSION,
    )


def invoke_llm(system_prompt: str, user_content: str) -> str:
    """Single system+user turn → raw reply text."""
    llm = get_llm()
    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_content),
    ]
    return llm.invoke(messages).content


def parse_llm_json(response_text: str, agent_name: str = "Agent") -> dict:
    """Strip optional markdown fences and parse JSON from an LLM reply."""
    text = response_text.strip()
    if text.startswith("```"):
        parts = text.split("```")
        text = parts[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        print(f"[{agent_name}] JSON parse error: {exc}\nRaw:\n{text}")
        return {}
