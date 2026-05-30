"""Chapter brief loader."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml

from . import paths


@dataclass
class Brief:
    title: str
    keywords: list[str]
    slug: str = ""
    outline: list[str] = field(default_factory=list)
    style: str = "textbook"  # textbook | report | medical_tribune
    language: str = "ja"
    max_results: int = 25
    import_to_zotero: bool = True
    zotero_collection: str = ""
    rag_year_filter: str = ""
    rag_source_filter: str = ""
    # --- Source paper fields (used by style=medical_tribune commentary) ---
    source_doi: str = ""
    source_url: str = ""
    source_title: str = ""
    angle: str = ""  # the editorial hook / 面白さの中心
    source_path: str = ""

    def __post_init__(self):
        if not self.slug:
            self.slug = paths.slugify(self.title)


def load_brief(path: str | Path) -> Brief:
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"Brief not found: {p}")
    data = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    if not data.get("title"):
        raise ValueError("Brief must include 'title'")
    style = str(data.get("style", "textbook")).strip()
    # medical_tribune commentary can be driven by a source paper alone; keywords (for
    # supporting references) are optional there. Other styles still require keywords.
    keywords = [str(k).strip() for k in (data.get("keywords") or []) if str(k).strip()]
    if style != "medical_tribune" and not keywords:
        raise ValueError("Brief must include at least one 'keywords' entry")
    return Brief(
        title=str(data["title"]).strip(),
        keywords=keywords,
        slug=str(data.get("slug", "")).strip(),
        outline=[str(o).strip() for o in (data.get("outline") or [])],
        style=style,
        language=str(data.get("language", "ja")).strip(),
        max_results=int(data.get("max_results", 25)),
        import_to_zotero=bool(data.get("import_to_zotero", True)),
        zotero_collection=str(data.get("zotero_collection", "")).strip(),
        rag_year_filter=str(data.get("rag_year_filter", "")).strip(),
        rag_source_filter=str(data.get("rag_source_filter", "")).strip(),
        source_doi=str(data.get("source_doi", "")).strip(),
        source_url=str(data.get("source_url", "")).strip(),
        source_title=str(data.get("source_title", "")).strip(),
        angle=str(data.get("angle", "")).strip(),
        source_path=str(p),
    )
