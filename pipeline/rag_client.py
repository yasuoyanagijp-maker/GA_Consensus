"""RAG RETRIEVER client (semantic search over Zotero papers + local PDFs).

IMPORTANT — retriever vs generator (do not confuse the two):

  * THIS module (RagRetriever) talks to the remote RAG /query endpoint, which is a
    RETRIEVER: it returns ranked CHUNKS of indexed documents (Zotero + local PDFs).
    It does NOT write prose. Its output is fed as CONTEXT into the synthesize stage.

  * adapters/llm.py::CustomRestAdapter ('rag_custom_rest') is a GENERATOR adapter:
    it expects the endpoint to return a finished generated answer. Different contract.

  Both can coexist: the retriever supplies grounding chunks, while text generation
  stays on the configured LLM backend (google_pro / rag_openai_compat / none-dry).

Finalized endpoint contract (user's FastAPI server, port 8503; LIVE):
  POST http://192.168.10.101:8503/query
  request : {"query": str, "limit": int=5,
             "year_filter": "2024"?, "source_filter": "zotero"|"chunks"?}
  response: {"status":"success","query":"...",
             "results":[{"id":str,"title":str,"content":str,"year":"2024",
                         "source":"zotero"|"chunk","similarity":0.895}, ...]}
  backend : intfloat/multilingual-e5-base + pgvector; returns similarity >= 0.4,
            merges zotero + local-file chunks sorted by similarity desc.
            First request warms the model (5-10s) -> covered by read=60s timeout.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import requests

from . import paths

DEFAULT_QUERY_URL = "http://192.168.10.101:8503/query"


class RagError(RuntimeError):
    pass


@dataclass
class RetrievedChunk:
    source: str          # "zotero" | "chunk" | ...
    title: str
    content: str
    similarity: float
    id: str = ""
    year: str = ""

    def as_context(self) -> str:
        """Format suitable to pass as a context_doc to the LLM adapter."""
        tag = f"{self.source}, {self.year}" if self.year else self.source
        return f"[{tag}] {self.title} (sim {self.similarity:.2f})\n{self.content}"


class RagRetriever:
    """Thin client for the remote RAG retriever (/query)."""

    def __init__(
        self,
        url: Optional[str] = None,
        api_key: Optional[str] = None,
        limit: Optional[int] = None,
        min_similarity: Optional[float] = None,
        year_filter: Optional[str] = None,
        source_filter: Optional[str] = None,
        connect_timeout: float = 3.0,
        read_timeout: float = 60.0,
    ):
        self.url = url or paths.env("RAG_QUERY_URL") or DEFAULT_QUERY_URL
        self.api_key = api_key if api_key is not None else paths.env("RAG_QUERY_API_KEY")
        self.limit = limit if limit is not None else _int_env("RAG_QUERY_LIMIT", 5)
        self.min_similarity = (
            min_similarity if min_similarity is not None else _float_env("RAG_MIN_SIMILARITY", 0.0)
        )
        # Global default filters (from config); per-call args override these.
        self.year_filter = year_filter or None
        self.source_filter = source_filter or None
        # (connect, read) timeouts: fail fast if the box is down, but allow slow searches
        # incl. the 5-10s first-request model warm-up.
        self.timeout = (connect_timeout, read_timeout)

    def _headers(self) -> dict:
        h = {"Content-Type": "application/json"}
        if self.api_key:
            h["Authorization"] = f"Bearer {self.api_key}"
        return h

    def retrieve(
        self,
        query: str,
        limit: Optional[int] = None,
        min_similarity: Optional[float] = None,
        year_filter: Optional[str] = None,
        source_filter: Optional[str] = None,
    ) -> list[RetrievedChunk]:
        q = (query or "").strip()
        if not q:
            return []
        lim = limit if limit is not None else self.limit
        floor = min_similarity if min_similarity is not None else self.min_similarity
        yf = year_filter if year_filter is not None else self.year_filter
        sf = source_filter if source_filter is not None else self.source_filter
        body: dict = {"query": q, "limit": lim}
        # Only send optional filters when set (omit nulls; safer than sending null keys).
        if yf:
            body["year_filter"] = yf
        if sf:
            body["source_filter"] = sf
        try:
            resp = requests.post(
                self.url, headers=self._headers(), json=body, timeout=self.timeout
            )
        except requests.RequestException as exc:
            raise RagError(f"RAG retriever unreachable at {self.url}: {exc}") from exc
        if not resp.ok:
            raise RagError(f"RAG retriever {resp.status_code}: {resp.text[:300]}")
        try:
            data = resp.json()
        except ValueError as exc:
            raise RagError(f"RAG retriever returned non-JSON: {resp.text[:200]}") from exc

        results = data.get("results")
        if results is None:
            # Defensive: tolerate a bare list or alternate key.
            results = data if isinstance(data, list) else data.get("hits", [])
        chunks: list[RetrievedChunk] = []
        for r in results or []:
            if not isinstance(r, dict):
                continue
            try:
                sim = float(r.get("similarity", 0.0) or 0.0)
            except (TypeError, ValueError):
                sim = 0.0
            if sim < floor:
                continue
            chunks.append(
                RetrievedChunk(
                    source=str(r.get("source", "") or "RAG"),
                    title=str(r.get("title", "") or "").strip(),
                    content=str(r.get("content", "") or r.get("text", "") or "").strip(),
                    similarity=sim,
                    id=str(r.get("id", "") or ""),
                    year=str(r.get("year", "") or ""),
                )
            )
        return chunks

    def retrieve_context(
        self,
        queries: list[str],
        limit: Optional[int] = None,
        min_similarity: Optional[float] = None,
        year_filter: Optional[str] = None,
        source_filter: Optional[str] = None,
    ) -> list[str]:
        """Query each keyword, dedupe by (title, content) + similarity floor, return context strings.

        Best-effort across queries: a failure on one query does not lose the others; if
        every query fails, RagError is raised so callers can decide to warn-and-continue.
        """
        seen: set[tuple[str, str]] = set()
        merged: list[RetrievedChunk] = []
        errors = 0
        for q in queries:
            try:
                for chunk in self.retrieve(
                    q,
                    limit=limit,
                    min_similarity=min_similarity,
                    year_filter=year_filter,
                    source_filter=source_filter,
                ):
                    key = (chunk.title.lower(), chunk.content[:200].lower())
                    if key in seen:
                        continue
                    seen.add(key)
                    merged.append(chunk)
            except RagError:
                errors += 1
        if errors and not merged:
            raise RagError(f"RAG retrieval failed for all {errors} queries at {self.url}")
        merged.sort(key=lambda c: c.similarity, reverse=True)
        return [c.as_context() for c in merged]

    def health(self) -> bool:
        """Tiny test query; returns True if the endpoint responds parseably."""
        try:
            self.retrieve("health check", limit=1)
            return True
        except RagError:
            return False

    # Alias requested in the spec.
    def is_available(self) -> bool:
        return self.health()


def _int_env(key: str, default: int) -> int:
    try:
        return int(paths.env(key) or default)
    except (TypeError, ValueError):
        return default


def _float_env(key: str, default: float) -> float:
    try:
        return float(paths.env(key) or default)
    except (TypeError, ValueError):
        return default


def get_retriever() -> Optional[RagRetriever]:
    """Return a retriever if enabled, else None.

    Disabled when config retriever.provider == 'none', or when the process sets
    PIPELINE_DISABLE_RAG=1 (used by `run.py --no-rag`).
    """
    if paths.env("PIPELINE_DISABLE_RAG") == "1":
        return None
    cfg = paths.load_backends().get("retriever", {})
    if cfg.get("provider", "rag_query") == "none":
        return None
    return RagRetriever(
        limit=cfg.get("limit"),
        min_similarity=cfg.get("min_similarity"),
        year_filter=cfg.get("year_filter") or None,
        source_filter=cfg.get("source_filter") or None,
    )
