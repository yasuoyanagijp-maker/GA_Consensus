"""LLM backend abstraction (NotebookLM / consensus.app replacement).

One interface, several providers selected via config/backends.json:

- none               : dry mode. Writes the assembled prompt to <out>/<stage>.prompt.txt
                       and returns a placeholder so the pipeline still completes. Paste the
                       prompt into NotebookLM / Google Pro manually, then drop the result in.
- rag_openai_compat  : OpenAI-compatible /chat/completions (RAG PC, Ollama, LM Studio, vLLM).
- rag_custom_rest    : a custom JSON RAG endpoint (field names are config-driven).
- google_pro         : Google Gemini (Google AI Pro).
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import requests

from .. import paths


class LLMError(RuntimeError):
    pass


@dataclass
class LLMResult:
    text: str
    provider: str
    dry: bool = False  # True when no real model ran (prompt was emitted for manual use)


class LLMAdapter:
    """Common interface: generate(system, prompt, context_docs) -> LLMResult."""

    provider = "base"

    def generate(
        self,
        system: str,
        prompt: str,
        context_docs: Optional[list[str]] = None,
        prompt_dump: Optional[Path] = None,
    ) -> LLMResult:
        raise NotImplementedError


def _compose_context(context_docs: Optional[list[str]]) -> str:
    if not context_docs:
        return ""
    blocks = []
    for i, doc in enumerate(context_docs, 1):
        blocks.append(f"[CONTEXT {i}]\n{doc.strip()}")
    return "\n\n".join(blocks)


def _build_full_prompt(system: str, prompt: str, context_docs: Optional[list[str]]) -> str:
    ctx = _compose_context(context_docs)
    parts = [f"# SYSTEM\n{system.strip()}"]
    if ctx:
        parts.append(f"# CONTEXT (収集した文献・要約)\n{ctx}")
    parts.append(f"# TASK\n{prompt.strip()}")
    return "\n\n".join(parts)


class NoneAdapter(LLMAdapter):
    """Dry mode: emit the prompt for manual NotebookLM/Google use."""

    provider = "none"

    def generate(self, system, prompt, context_docs=None, prompt_dump=None):
        full = _build_full_prompt(system, prompt, context_docs)
        if prompt_dump is not None:
            prompt_dump.parent.mkdir(parents=True, exist_ok=True)
            prompt_dump.write_text(full, encoding="utf-8")
        placeholder = (
            "<!-- LLM provider = none (dry mode).\n"
            f"     このステージのプロンプトは {prompt_dump} に保存されました。\n"
            "     NotebookLM / Google Pro に貼り付けて生成し、結果でこのファイルを置き換えてください。\n"
            "     RAGエンドポイント設定後は config/backends.json の llm.provider を切り替えると自動生成されます。 -->\n"
        )
        return LLMResult(text=placeholder, provider=self.provider, dry=True)


class OpenAICompatAdapter(LLMAdapter):
    """OpenAI-compatible chat completions (RAG PC / Ollama / LM Studio / vLLM)."""

    provider = "rag_openai_compat"

    def __init__(self, cfg: dict):
        self.base_url = paths.env("RAG_OPENAI_BASE_URL").rstrip("/")
        self.api_key = paths.env("RAG_OPENAI_API_KEY")
        self.model = paths.env("RAG_OPENAI_MODEL") or "default"
        self.temperature = cfg.get("temperature", 0.4)
        self.max_tokens = cfg.get("max_tokens", 4096)
        if not self.base_url:
            raise LLMError("RAG_OPENAI_BASE_URL is not set in pipeline/.env.local")

    def generate(self, system, prompt, context_docs=None, prompt_dump=None):
        user = prompt
        ctx = _compose_context(context_docs)
        if ctx:
            user = f"{ctx}\n\n---\n\n{prompt}"
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        body = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
        }
        resp = requests.post(
            f"{self.base_url}/chat/completions", headers=headers, json=body, timeout=600
        )
        if not resp.ok:
            raise LLMError(f"OpenAI-compat {resp.status_code}: {resp.text[:300]}")
        data = resp.json()
        text = data["choices"][0]["message"]["content"]
        return LLMResult(text=text, provider=self.provider)


class CustomRestAdapter(LLMAdapter):
    """Custom JSON RAG endpoint. Field/response paths are config-driven."""

    provider = "rag_custom_rest"

    def __init__(self, cfg: dict):
        self.url = paths.env("RAG_CUSTOM_URL")
        self.api_key = paths.env("RAG_CUSTOM_API_KEY")
        sub = cfg.get("rag_custom_rest", {})
        self.method = sub.get("method", "POST").upper()
        self.query_field = sub.get("query_field", "query")
        self.context_field = sub.get("context_field", "context")
        self.response_path = sub.get("response_path", "answer")
        if not self.url:
            raise LLMError("RAG_CUSTOM_URL is not set in pipeline/.env.local")

    def _dig(self, data, path: str):
        cur = data
        for key in path.split("."):
            if isinstance(cur, list):
                cur = cur[int(key)]
            else:
                cur = cur[key]
        return cur

    def generate(self, system, prompt, context_docs=None, prompt_dump=None):
        payload = {
            self.query_field: f"{system}\n\n{prompt}",
            self.context_field: context_docs or [],
        }
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        resp = requests.request(
            self.method, self.url, headers=headers, json=payload, timeout=600
        )
        if not resp.ok:
            raise LLMError(f"Custom RAG {resp.status_code}: {resp.text[:300]}")
        try:
            text = self._dig(resp.json(), self.response_path)
        except Exception as exc:  # noqa: BLE001
            raise LLMError(
                f"Could not read response_path '{self.response_path}' from RAG response: {exc}"
            ) from exc
        if not isinstance(text, str):
            text = json.dumps(text, ensure_ascii=False)
        return LLMResult(text=text, provider=self.provider)


class GoogleProAdapter(LLMAdapter):
    """Google Gemini (Google AI Pro)."""

    provider = "google_pro"

    def __init__(self, cfg: dict):
        self.api_key = paths.env("GEMINI_API_KEY")
        self.model = paths.env("GEMINI_MODEL") or "gemini-2.5-pro"
        self.temperature = cfg.get("temperature", 0.4)
        self.max_tokens = cfg.get("max_tokens", 4096)
        if not self.api_key:
            raise LLMError("GEMINI_API_KEY is not set in pipeline/.env.local")

    def generate(self, system, prompt, context_docs=None, prompt_dump=None):
        user = prompt
        ctx = _compose_context(context_docs)
        if ctx:
            user = f"{ctx}\n\n---\n\n{prompt}"
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.model}:generateContent?key={self.api_key}"
        )
        body = {
            "system_instruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": {
                "temperature": self.temperature,
                "maxOutputTokens": self.max_tokens,
            },
        }
        resp = requests.post(url, json=body, timeout=600)
        if not resp.ok:
            raise LLMError(f"Gemini {resp.status_code}: {resp.text[:300]}")
        data = resp.json()
        try:
            text = data["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError) as exc:
            raise LLMError(f"Unexpected Gemini response: {json.dumps(data)[:300]}") from exc
        return LLMResult(text=text, provider=self.provider)


_REGISTRY = {
    "none": NoneAdapter,
    "rag_openai_compat": OpenAICompatAdapter,
    "rag_custom_rest": CustomRestAdapter,
    "google_pro": GoogleProAdapter,
}


def get_llm(provider: Optional[str] = None) -> LLMAdapter:
    cfg = paths.load_backends().get("llm", {})
    name = provider or cfg.get("provider", "none")
    if name not in _REGISTRY:
        raise LLMError(f"Unknown LLM provider '{name}'. Options: {sorted(_REGISTRY)}")
    cls = _REGISTRY[name]
    if name == "none":
        return cls()
    return cls(cfg)
