"""OpenRouter chat completions service.

Calls https://openrouter.ai/api/v1/chat/completions with a user-resolved API
key. Multi-tenant by design: each request passes its own key, no shared state.

OpenRouter is OpenAI-compatible, so the request shape is the standard chat
completions one. Model slugs follow `provider/model` (e.g. `anthropic/claude-sonnet-4-6`).
"""
from __future__ import annotations

import os
from typing import Any, Optional

import httpx


OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# Optional ranking headers — OpenRouter uses these on their leaderboard.
APP_REFERER = os.environ.get("OPENROUTER_REFERER", "https://nomad-api.mgdesign.cloud")
APP_TITLE = os.environ.get("OPENROUTER_APP_TITLE", "NOMAD")


class OpenRouterError(Exception):
    def __init__(self, status: int, body: str):
        self.status = status
        self.body = body
        super().__init__(f"OpenRouter HTTP {status}: {body[:200]}")


class OpenRouterMissingKey(Exception):
    pass


async def chat(
    *,
    api_key: Optional[str],
    model: str,
    system: Optional[str],
    user_message: str,
    max_tokens: int = 4096,
    temperature: float = 0.4,
    timeout: float = 120.0,
) -> dict[str, Any]:
    """Single-turn chat completion. Returns dict with `text`, `tokens_input`,
    `tokens_output`, `model_used`. Raises OpenRouterError on non-2xx."""
    if not api_key:
        raise OpenRouterMissingKey("OpenRouter API key missing for this user")

    messages: list[dict[str, Any]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": user_message})

    payload = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": APP_REFERER,
        "X-Title": APP_TITLE,
    }

    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(OPENROUTER_URL, headers=headers, json=payload)

    if resp.status_code >= 400:
        raise OpenRouterError(resp.status_code, resp.text)

    data = resp.json()
    choices = data.get("choices") or []
    if not choices:
        raise OpenRouterError(502, f"empty choices: {data!r}")
    message = choices[0].get("message") or {}
    text = (message.get("content") or "").strip()
    usage = data.get("usage") or {}

    return {
        "text": text,
        "tokens_input": usage.get("prompt_tokens"),
        "tokens_output": usage.get("completion_tokens"),
        "model_used": data.get("model") or model,
    }
