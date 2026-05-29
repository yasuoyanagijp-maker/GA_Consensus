"""Stage 3: knowledge synthesis (NotebookLM replacement).

Feeds CONTEXT to the LLM backend and produces a structured Japanese summary + a list
of claims to fact-check. CONTEXT comes from two sources:
  1. RAG retriever (rag_client.RagRetriever) — ranked chunks of the user's Zotero
     papers + local PDFs (the RETRIEVER, not a generator). Prepended first.
  2. Harvested PubMed abstracts (this run's literature.json).

Generation itself stays on the LLM backend (google_pro / rag_openai_compat / none-dry).
If the retriever endpoint is unreachable, we warn and continue with PubMed abstracts only.
In dry mode (llm provider=none) the assembled prompt is written to synthesis.prompt.txt
for manual paste into NotebookLM/Google Pro.
"""
from __future__ import annotations

from pathlib import Path

from . import prompts
from .adapters.llm import LLMAdapter, get_llm
from .brief import Brief
from .rag_client import RagError, get_retriever
from .references import Reference


def _rag_context(brief: Brief) -> list[str]:
    """Best-effort RAG retrieval; never fails the pipeline if the endpoint is down."""
    retriever = get_retriever()
    if retriever is None:
        return []
    queries = list(brief.keywords) + [brief.title]
    # Brief-level filters override the config defaults baked into the retriever; pass
    # None when the brief does not specify so the retriever falls back to its config defaults.
    try:
        chunks = retriever.retrieve_context(
            queries,
            year_filter=brief.rag_year_filter or None,
            source_filter=brief.rag_source_filter or None,
        )
        if chunks:
            print(f"[synthesize] RAG retriever: {len(chunks)} context chunks from {retriever.url}")
        else:
            print("[synthesize] RAG retriever: 0 chunks returned (continuing with PubMed only)")
        return chunks
    except RagError as exc:
        print(f"[synthesize] WARNING: RAG retriever unavailable ({exc}); continuing with PubMed abstracts only")
        return []


def _context_docs(refs: list[Reference], limit: int = 40) -> list[str]:
    docs = []
    for r in refs[:limit]:
        head = f"PMID:{r.pmid or 'NA'} | {r.title} | {r.journal} {r.year}"
        body = r.abstract or "(no abstract available)"
        docs.append(f"{head}\n{body}")
    return docs


def synthesize(brief: Brief, refs: list[Reference], out_dir: Path, llm: LLMAdapter | None = None) -> Path:
    llm = llm or get_llm()
    kw = ", ".join(brief.keywords)
    task = (
        f"章タイトル: {brief.title}\n"
        f"検索キーワード: {kw}\n\n"
        "上記テーマについて、CONTEXT の抄録群のみを根拠に教科書執筆用の知見サマリーを作成せよ。"
    )
    # RAG chunks first (grounding in the user's own corpus), then PubMed abstracts.
    context_docs = _rag_context(brief) + _context_docs(refs)
    result = llm.generate(
        system=prompts.SYNTHESIS_SYSTEM,
        prompt=task,
        context_docs=context_docs,
        prompt_dump=out_dir / "synthesis.prompt.txt",
    )
    out_path = out_dir / "synthesis.md"
    header = f"# 知見サマリー: {brief.title}\n\n> provider: {result.provider}{' (dry/手動)' if result.dry else ''}\n\n"
    out_path.write_text(header + result.text, encoding="utf-8")
    print(f"[synthesize] -> {out_path}" + (" (dry mode: prompt emitted)" if result.dry else ""))
    return out_path
