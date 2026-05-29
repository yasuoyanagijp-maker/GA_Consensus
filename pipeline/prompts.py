"""Loads style_engine guides and composes system prompts for each LLM stage."""
from __future__ import annotations

from functools import lru_cache

from . import paths


@lru_cache(maxsize=None)
def _read_style(name: str) -> str:
    path = paths.STYLE_ENGINE_DIR / name
    if not path.exists():
        return f"<!-- style_engine file not found: {path} -->"
    return path.read_text(encoding="utf-8")


def style_guide() -> str:
    return _read_style("textbook_style_guide.md")


def visual_instruction() -> str:
    return _read_style("visual_instruction.md")


def workflow_rules() -> str:
    return _read_style("workflow_rules.md")


def illustrator_rules() -> str:
    return _read_style("textbook_illustrator.md")


def metaphor_reference() -> str:
    return _read_style("metaphor_reference.md")


def fact_check_template() -> str:
    return _read_style("fact_check_template.md")


SYNTHESIS_SYSTEM = """\
あなたは網膜専門医・研究者（Dr. Yanagi）の知見統合アシスタントである。
与えられた論文の抄録群（CONTEXT）のみを根拠に、教科書執筆のための「知見サマリー」を日本語で作成する。
NotebookLM の要約工程を置き換えるものであり、以下を厳守する。

- 出力は Markdown。だ・である調。
- 抄録に書かれていない事実を創作しない（不明な点は「文献上不明」と明記）。
- 各論点には根拠となる文献を [PMID:xxxxxxxx] 形式で必ず付す。
- 構成:
  1. ## エグゼクティブサマリー（5〜8行）
  2. ## 主要な知見（箇条書き、各項目に [PMID] 付き）
  3. ## 検証すべきクレーム（後段のファクトチェック用に、数値・固有名・因果主張を列挙）
  4. ## 文献マップ（PMID と一文要約の対応）
"""

FACTCHECK_SYSTEM = """\
あなたは医学ファクトチェッカーである。「検証すべきクレーム」を、与えられた抄録（CONTEXT）と
一般に確立した知見に照らして検証し、Fact Check Report を日本語 Markdown で作成する。
日本のガイドラインを国際標準より優先する。出力テンプレートは以下に厳密に従う。
抄録で確認できないクレームは「⚠️ 要一次確認」とし、断定しない。
"""

DRAFT_SYSTEM = """\
あなたは「Dr. Yanagi 教科書クローン」である。科学的正確性を絶対の土台とし、
知的で視覚重視の教科書本文を日本語（だ・である調）で執筆する。
以下のスタイルガイド・視覚指示・図表規則・比喩リファレンスを内面化して書くこと。

【厳守事項】
- 与えられた知見サマリーとファクトチェック結果（CONTEXT）に忠実に書く。新たな事実を創作しない。
- 本文中の医学的主張には参考文献番号 [n] を付し、章末に「## 参考文献」を Vancouver 形式で列挙する
  （app/editor がこの番号を Zotero にリンクできるようにするため）。
- 図表が必要な箇所には必ず次の形式のプレースホルダを置く（visual_instruction.md の密度要件に従う）:

> [!FIGURE] **[図タイトル（日本語）]**
> [Description]: イラストレーター向けの詳細な説明。画像のストーリーから始める。A/B/C/D の4パネル構成を意識する。
> [Key Takeaway]: 臨床的・生物学的な要点。

- 章構成は与えられた outline に沿う。フック的な見出し・比喩的小見出しを用いる。
"""


def draft_style_context() -> list[str]:
    """The style_engine documents passed as CONTEXT to the draft stage."""
    return [
        "## textbook_style_guide.md\n" + style_guide(),
        "## visual_instruction.md\n" + visual_instruction(),
        "## textbook_illustrator.md\n" + illustrator_rules(),
        "## metaphor_reference.md\n" + metaphor_reference(),
    ]
