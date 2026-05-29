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
    style: str = "textbook"
    language: str = "ja"
    max_results: int = 25
    import_to_zotero: bool = True
    zotero_collection: str = ""
    rag_year_filter: str = ""
    rag_source_filter: str = ""
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
    if not data.get("keywords"):
        raise ValueError("Brief must include at least one 'keywords' entry")
    return Brief(
        title=str(data["title"]).strip(),
        keywords=[str(k).strip() for k in data["keywords"] if str(k).strip()],
        slug=str(data.get("slug", "")).strip(),
        outline=[str(o).strip() for o in (data.get("outline") or [])],
        style=str(data.get("style", "textbook")).strip(),
        language=str(data.get("language", "ja")).strip(),
        max_results=int(data.get("max_results", 25)),
        import_to_zotero=bool(data.get("import_to_zotero", True)),
        zotero_collection=str(data.get("zotero_collection", "")).strip(),
        rag_year_filter=str(data.get("rag_year_filter", "")).strip(),
        rag_source_filter=str(data.get("rag_source_filter", "")).strip(),
        source_path=str(p),
    )
