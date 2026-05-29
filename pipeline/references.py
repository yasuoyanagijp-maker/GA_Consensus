"""Shared reference model + Vancouver formatter (ported from app/editor)."""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path


@dataclass
class Reference:
    pmid: str = ""
    title: str = ""
    authors: list[str] = field(default_factory=list)  # "Lastname AB"
    journal: str = ""
    year: str = ""
    volume: str = ""
    issue: str = ""
    pages: str = ""
    doi: str = ""
    abstract: str = ""
    source: str = "pubmed"  # pubmed | rag

    def vancouver(self) -> str:
        """Mirror of formatVancouver() in app/editor/server/index.ts."""
        authors = _format_authors(self.authors)
        title = (self.title or "").strip().rstrip(".")
        journal = (self.journal or "").strip().rstrip(".")
        vol_issue = f"{self.volume}({self.issue})" if self.volume and self.issue else self.volume
        year_vol = (
            f"{self.year};{vol_issue}" if self.year and vol_issue else (self.year or vol_issue)
        )
        year_vol_pages = (
            f"{year_vol}:{self.pages}" if year_vol and self.pages else (year_vol or self.pages)
        )
        parts = []
        if authors:
            parts.append(authors)
        if title:
            parts.append(f"{title}.")
        if journal:
            parts.append(f"{journal}.")
        if year_vol_pages:
            parts.append(f"{year_vol_pages}.")
        if self.doi:
            parts.append(f"[doi:{self.doi}](https://doi.org/{self.doi}).")
        elif self.pmid:
            parts.append(
                f"[PMID:{self.pmid}](https://pubmed.ncbi.nlm.nih.gov/{self.pmid}/)."
            )
        return " ".join(parts)


def _format_authors(authors: list[str]) -> str:
    authors = [a.strip() for a in authors if a.strip()]
    if not authors:
        return ""
    if len(authors) > 6:
        return ", ".join(authors[:6]) + ", et al."
    return ", ".join(authors) + "."


def save_references(refs: list[Reference], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps([asdict(r) for r in refs], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def load_references(path: Path) -> list[Reference]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return [Reference(**d) for d in data]
