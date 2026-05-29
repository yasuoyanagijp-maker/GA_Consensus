"""Stage 4: fact-check (workflow_rules STEP 2).

Verifies the claims surfaced by synthesize.py against the harvested abstracts and
produces a Fact Check Report following style_engine/fact_check_template.md.
Japanese guidelines are prioritized over international standards.
"""
from __future__ import annotations

from pathlib import Path

from . import prompts
from .adapters.llm import LLMAdapter, get_llm
from .brief import Brief
from .references import Reference


def _context_docs(synthesis_md: str, refs: list[Reference], limit: int = 40) -> list[str]:
    docs = ["## 知見サマリー（検証対象）\n" + synthesis_md]
    for r in refs[:limit]:
        docs.append(f"PMID:{r.pmid or 'NA'} | {r.title} | {r.journal} {r.year}\n{r.abstract or '(no abstract)'}")
    return docs


def factcheck(
    brief: Brief,
    synthesis_path: Path,
    refs: list[Reference],
    out_dir: Path,
    llm: LLMAdapter | None = None,
) -> Path:
    llm = llm or get_llm()
    synthesis_md = synthesis_path.read_text(encoding="utf-8")
    task = (
        f"章タイトル: {brief.title}\n\n"
        "知見サマリー内の「## 検証すべきクレーム」を中心に、各クレームを CONTEXT の抄録で検証し、"
        "次のテンプレートに厳密に従って Fact Check Report を作成せよ。\n\n"
        "----- TEMPLATE -----\n" + prompts.fact_check_template()
    )
    result = llm.generate(
        system=prompts.FACTCHECK_SYSTEM,
        prompt=task,
        context_docs=_context_docs(synthesis_md, refs),
        prompt_dump=out_dir / "fact_check.prompt.txt",
    )
    out_path = out_dir / "fact_check.md"
    header = f"<!-- provider: {result.provider}{' (dry/手動)' if result.dry else ''} -->\n\n"
    out_path.write_text(header + result.text, encoding="utf-8")
    print(f"[factcheck] -> {out_path}" + (" (dry mode: prompt emitted)" if result.dry else ""))
    return out_path
