"""Textbook Studio orchestrator.

Examples:
  python -m pipeline.run --brief pipeline/briefs/example_muller_cell.yaml
  python -m pipeline.run --brief brief.yaml --from synthesize --to draft
  python -m pipeline.run --brief brief.yaml --estimate
  python -m pipeline.run --brief brief.yaml --no-zotero --open-pages

Brief-less (GUI) invocation:
  python -m pipeline.run --title "Muller細胞と網膜疾患" \\
      --keywords "Muller cell cone;Muller glia macular hole" \\
      --max-results 10 --no-zotero --no-figures --json-progress
"""
from __future__ import annotations

import argparse
import dataclasses
import json
import os
import sys
from pathlib import Path

from . import paths
from .adapters.image import get_image_backend
from .adapters.llm import get_llm
from .brief import Brief, load_brief
from .rag_client import RagError, RagRetriever
from .references import Reference, load_references

STAGES = ["harvest", "zotero", "synthesize", "factcheck", "draft", "figures", "assemble"]

# --json-progress: JSON lines go to the real stdout; human logs are redirected to stderr.
_REAL_STDOUT = sys.stdout
_PROGRESS = False


def emit(obj: dict) -> None:
    """Emit one machine-readable JSON event on the real stdout (when --json-progress)."""
    if not _PROGRESS:
        return
    _REAL_STDOUT.write(json.dumps(obj, ensure_ascii=False) + "\n")
    _REAL_STDOUT.flush()


def _stage_start(name: str) -> None:
    emit({"event": "stage", "stage": name, "status": "start"})


def _stage_done(name: str, detail: str = "", status: str = "done") -> None:
    emit({"event": "stage", "stage": name, "status": status, "detail": detail})


def build_brief_from_args(args: argparse.Namespace) -> Brief:
    """Construct an in-memory Brief from CLI args (no YAML)."""
    keywords: list[str] = []
    for k in args.keyword or []:
        keywords.append(k)
    if args.keywords:
        keywords.extend(p for p in args.keywords.split(";"))
    keywords = [k.strip() for k in keywords if k.strip()]
    if not keywords:
        sys.exit("[run] --keyword/--keywords が必要です (--brief 未指定時)")
    title = (args.title or keywords[0]).strip()
    outline = [h.strip() for h in (args.outline or "").split(";") if h.strip()]
    return Brief(
        title=title,
        keywords=keywords,
        outline=outline,
        max_results=args.max_results,
        import_to_zotero=args.zotero,
        rag_year_filter=args.rag_year or "",
        rag_source_filter=args.rag_source or "",
        source_path="(in-memory: GUI/CLI)",
    )


def _state_path(out_dir: Path) -> Path:
    return out_dir / "state.json"


def _load_state(out_dir: Path) -> dict:
    p = _state_path(out_dir)
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def _save_state(out_dir: Path, state: dict) -> None:
    _state_path(out_dir).write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def _require_refs(out_dir: Path) -> list[Reference]:
    lit = out_dir / "literature.json"
    if not lit.exists():
        sys.exit("[run] literature.json がありません。先に 'harvest' を実行してください。")
    return load_references(lit)


def estimate(brief: Brief) -> None:
    backends = paths.load_backends()
    n_sections = max(len(brief.outline), 5)
    figs_est = n_sections  # visual_instruction.md: ~1 figure per section
    print("=== コスト見積り (概算) ===")
    print(f"章: {brief.title}")
    print(f"キーワード数: {len(brief.keywords)} / PubMed 取得上限: {brief.max_results}")
    print("- 文献収集 (PubMed E-utilities + Zotero API): 無料")
    print(f"- LLM provider = {backends['llm']['provider']}")
    print("    none           : 無料 (手動で NotebookLM/Google Pro に貼り付け)")
    print("    rag_*          : 別PCの自前サーバ → 実質無料")
    print("    google_pro     : 既存 Google AI Pro サブスク内 → 追加課金ほぼ無し")
    print(f"- 図表 provider = {backends['image']['provider']} / 推定図数 = 約{figs_est}枚")
    print("    prompt_only / pptx_placeholder : 無料")
    print(f"    gemini_imagen : 画像生成 約{figs_est}枚分の従量 (Google AI Pro / Imagen 単価 × 枚数)")
    print("既定の最安構成: PubMed + none/rag + pptx_placeholder = 0円")


def check_rag() -> bool:
    """Probe the RAG retriever endpoint and print reachability + a sample chunk."""
    retriever = RagRetriever()
    print(f"=== RAG retriever check ===\nendpoint: {retriever.url}")
    print(f"limit={retriever.limit} min_similarity={retriever.min_similarity}")
    try:
        chunks = retriever.retrieve("retina", limit=3)
    except RagError as exc:
        print(f"status  : UNREACHABLE ❌\nreason  : {exc}")
        print("→ パイプラインは引き続き動作します (PubMed 抄録のみで synthesize)。")
        return False
    print(f"status  : reachable ✅ ({len(chunks)} chunks)")
    for c in chunks[:3]:
        preview = c.content[:120].replace("\n", " ")
        print(f"  - [{c.source}] {c.title[:60]} (sim {c.similarity:.2f}) :: {preview}...")
    return True


def run(args: argparse.Namespace) -> None:
    brief = load_brief(args.brief) if args.brief else build_brief_from_args(args)
    # CLI RAG filters override the brief (works for both YAML and in-memory briefs).
    if args.rag_year:
        brief.rag_year_filter = args.rag_year
    if args.rag_source:
        brief.rag_source_filter = args.rag_source
    # --no-rag disables retrieval for this process (rag_client.get_retriever honors it).
    if not args.rag:
        os.environ["PIPELINE_DISABLE_RAG"] = "1"

    out_dir = paths.topic_out_dir(brief.slug)
    state = _load_state(out_dir)
    state["brief"] = dataclasses.asdict(brief)

    start = STAGES.index(args.from_stage)
    end = STAGES.index(args.to_stage)
    if start > end:
        sys.exit(f"[run] --from ({args.from_stage}) は --to ({args.to_stage}) より前である必要があります")
    selected = STAGES[start : end + 1]
    # --no-figures: drop the figures stage cleanly and force a no-render image backend.
    if not args.figures and "figures" in selected:
        selected = [s for s in selected if s != "figures"]
    print(f"[run] topic={brief.slug} stages={selected} out={out_dir}")
    emit({"event": "run", "status": "start", "slug": brief.slug, "title": brief.title, "stages": selected})

    llm = get_llm(args.llm_provider) if args.llm_provider else None
    image_provider = args.image_provider
    if not args.figures:
        image_provider = "prompt_only"  # no-render mode
    img = get_image_backend(image_provider) if image_provider else None

    refs: list[Reference] | None = None

    if "harvest" in selected:
        from . import harvest as harvest_mod

        _stage_start("harvest")
        refs = harvest_mod.harvest(brief, out_dir)
        state["literature"] = str(out_dir / "literature.json")
        _stage_done("harvest", f"{len(refs)} refs")

    if "zotero" in selected and brief.import_to_zotero and args.zotero:
        from . import zotero_sync

        _stage_start("zotero")
        refs = refs or _require_refs(out_dir)
        try:
            state["zotero"] = zotero_sync.sync(refs, brief.zotero_collection)
            z = state["zotero"]
            _stage_done("zotero", f"created {z.get('created', 0)} / skipped {z.get('skipped', 0)}")
        except Exception as exc:  # noqa: BLE001 - never block the writing pipeline on Zotero
            print(f"[zotero] スキップ (失敗): {exc}")
            state["zotero"] = {"error": str(exc)}
            _stage_done("zotero", f"error: {exc}", status="error")
    elif "zotero" in selected:
        print("[zotero] スキップ (--no-zotero または import_to_zotero=false)")
        _stage_done("zotero", "skipped (--no-zotero)", status="skipped")

    if "synthesize" in selected:
        from . import synthesize as syn

        _stage_start("synthesize")
        refs = refs or _require_refs(out_dir)
        state["synthesis"] = str(syn.synthesize(brief, refs, out_dir, llm))
        _stage_done("synthesize", "RAG無効" if not args.rag else "RAG/PubMed CONTEXT")

    if "factcheck" in selected:
        from . import factcheck as fc

        _stage_start("factcheck")
        refs = refs or _require_refs(out_dir)
        syn_path = Path(state.get("synthesis", out_dir / "synthesis.md"))
        state["factcheck"] = str(fc.factcheck(brief, syn_path, refs, out_dir, llm))
        _stage_done("factcheck")

    if "draft" in selected:
        from . import draft as draft_mod

        _stage_start("draft")
        refs = refs or _require_refs(out_dir)
        syn_path = Path(state.get("synthesis", out_dir / "synthesis.md"))
        fc_path = Path(state.get("factcheck", out_dir / "fact_check.md"))
        draft_path = draft_mod.build_draft(brief, syn_path, fc_path, refs, out_dir, llm)
        state["draft"] = str(draft_path)
        _stage_done("draft", Path(draft_path).name)

    figures = None
    if "figures" in selected:
        from . import figures as fig_mod

        _stage_start("figures")
        draft_path = Path(state.get("draft", ""))
        if not draft_path or not draft_path.exists():
            draft_path = out_dir / "draft.md"
        draft_md = draft_path.read_text(encoding="utf-8")
        figures = fig_mod.process_figures(draft_md, brief.slug, out_dir, img)
        state["figures"] = str(out_dir / "figures.json")
        _stage_done("figures", f"{len(figures)} figures")

    if "assemble" in selected:
        from . import assemble as asm
        from .figures import Figure

        _stage_start("assemble")
        draft_path = Path(state.get("draft", out_dir / "draft.md"))
        if figures is None:
            fpath = out_dir / "figures.json"
            figures = (
                [Figure(**f) for f in json.loads(fpath.read_text(encoding="utf-8"))]
                if fpath.exists()
                else []
            )
        # No figures requested -> no slide deck either.
        make_pptx = (not args.no_pptx) and args.figures
        result = asm.assemble(
            draft_path,
            figures,
            out_dir,
            brief.title,
            make_pptx=make_pptx,
            open_pages=args.open_pages,
        )
        state["assemble"] = result
        _stage_done("assemble", "gate PASS" if result["gate_passed"] else "gate FAIL")

    _save_state(out_dir, state)
    print(f"[run] done. 成果物: {out_dir}")
    a = state.get("assemble") or {}
    if a:
        print(f"      final md : {a['final_md']}")
        print(f"      docx     : {a['docx']}")
        print(f"      pptx     : {a['pptx']}")
        print(f"      gate     : {'PASS' if a['gate_passed'] else 'FAIL'} ({a['gate_report']})")

    artifacts = {
        "outDir": str(out_dir),
        "literature": state.get("literature"),
        "synthesis": state.get("synthesis"),
        "factcheck": state.get("factcheck"),
        "draft": state.get("draft"),
        "figures": state.get("figures"),
        "finalMd": a.get("final_md"),
        "docx": a.get("docx"),
        "pptx": a.get("pptx"),
        "gateReport": a.get("gate_report"),
    }
    emit({
        "event": "done",
        "slug": brief.slug,
        "title": brief.title,
        "artifacts": artifacts,
        "gate_passed": bool(a.get("gate_passed", False)),
    })


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Textbook Studio end-to-end pipeline")
    parser.add_argument("--brief", required=False, help="章ブリーフ YAML へのパス")
    parser.add_argument("--check-rag", action="store_true", help="RAG リトリーバの疎通確認のみ")
    # Brief-less (GUI/CLI) inputs:
    parser.add_argument("--keyword", action="append", help="検索キーワード (繰り返し可)")
    parser.add_argument("--keywords", default="", help="検索キーワードを ';' 区切りで指定")
    parser.add_argument("--title", default="", help="章タイトル")
    parser.add_argument("--outline", default="", help="想定見出しを ';' 区切りで指定")
    parser.add_argument("--max-results", dest="max_results", type=int, default=25)
    # Stage range:
    parser.add_argument("--from", dest="from_stage", default="harvest", choices=STAGES)
    parser.add_argument("--to", dest="to_stage", default="assemble", choices=STAGES)
    parser.add_argument("--estimate", action="store_true", help="コスト見積りのみ表示して終了")
    # Backends:
    parser.add_argument("--llm-provider", default=None, help="config を上書き (none/rag_*/google_pro)")
    parser.add_argument("--image-provider", default=None, help="config を上書き (prompt_only/pptx_placeholder/gemini_imagen)")
    # Toggles (BooleanOptionalAction creates --x / --no-x):
    parser.add_argument("--figures", action=argparse.BooleanOptionalAction, default=True, help="図表ステージの有無")
    parser.add_argument("--zotero", action=argparse.BooleanOptionalAction, default=True, help="Zotero 登録の有無 (--no-zotero で無効)")
    parser.add_argument("--rag", action=argparse.BooleanOptionalAction, default=True, help="ローカル RAG リトリーバの有無")
    parser.add_argument("--rag-year", dest="rag_year", default="", help="RAG 年フィルタ (例 2024)")
    parser.add_argument("--rag-source", dest="rag_source", default="", choices=["", "zotero", "chunks"], help="RAG ソース絞り込み")
    parser.add_argument("--no-pptx", action="store_true", help="pptx 生成をスキップ")
    parser.add_argument("--open-pages", action="store_true", help="完成 .docx を Pages で開く")
    parser.add_argument("--json-progress", dest="json_progress", action="store_true", help="ステージ進捗を JSON 行で stdout に出力")
    args = parser.parse_args(argv)

    global _PROGRESS
    if args.json_progress:
        _PROGRESS = True
        # Keep stdout parseable: route all human/library logs to stderr.
        sys.stdout = sys.stderr

    if args.check_rag:
        check_rag()
        return
    if args.estimate:
        brief = load_brief(args.brief) if args.brief else build_brief_from_args(args)
        estimate(brief)
        return
    try:
        run(args)
    except Exception as exc:  # noqa: BLE001 - surface a terminal error event for the GUI
        emit({"event": "done", "error": str(exc)})
        raise


if __name__ == "__main__":
    main()
