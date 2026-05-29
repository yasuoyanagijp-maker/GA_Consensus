"""Literature harvesting: PubMed E-utilities (+ optional RAG retrieval).

Replaces the manual consensus.app + PubMed search step. Free; an NCBI API key only
raises the rate limit. Results are normalized to references.Reference and de-duplicated.
"""
from __future__ import annotations

import time
import xml.etree.ElementTree as ET
from pathlib import Path

import requests

from . import paths
from .brief import Brief
from .references import Reference, save_references

EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"


def _eutils_params(extra: dict) -> dict:
    params = dict(extra)
    api_key = paths.env("NCBI_API_KEY")
    email = paths.env("NCBI_EMAIL")
    if api_key:
        params["api_key"] = api_key
    if email:
        params["email"] = email
    params["tool"] = "dr-yanagi-textbook-studio"
    return params


def _rate_limit_sleep() -> None:
    # 10 req/s with API key, 3 req/s without.
    time.sleep(0.12 if paths.env("NCBI_API_KEY") else 0.34)


def esearch(query: str, retmax: int) -> list[str]:
    params = _eutils_params(
        {"db": "pubmed", "term": query, "retmax": str(retmax), "retmode": "json", "sort": "relevance"}
    )
    resp = requests.get(f"{EUTILS}/esearch.fcgi", params=params, timeout=60)
    resp.raise_for_status()
    _rate_limit_sleep()
    return resp.json().get("esearchresult", {}).get("idlist", [])


def _text(node, default: str = "") -> str:
    return node.text.strip() if node is not None and node.text else default


def _parse_article(art: ET.Element) -> Reference:
    medline = art.find("MedlineCitation")
    pmid = _text(medline.find("PMID")) if medline is not None else ""
    article = medline.find("Article") if medline is not None else None
    if article is None:
        return Reference(pmid=pmid)

    title = "".join(article.find("ArticleTitle").itertext()).strip() if article.find("ArticleTitle") is not None else ""

    # Abstract (may have multiple labeled sections).
    abstract_parts = []
    abs_node = article.find("Abstract")
    if abs_node is not None:
        for at in abs_node.findall("AbstractText"):
            label = at.get("Label")
            txt = "".join(at.itertext()).strip()
            abstract_parts.append(f"{label}: {txt}" if label else txt)
    abstract = "\n".join(abstract_parts)

    authors = []
    alist = article.find("AuthorList")
    if alist is not None:
        for a in alist.findall("Author"):
            last = _text(a.find("LastName"))
            initials = _text(a.find("Initials"))
            collective = _text(a.find("CollectiveName"))
            if last:
                authors.append(f"{last} {initials}".strip())
            elif collective:
                authors.append(collective)

    journal = article.find("Journal")
    jtitle = ""
    year = ""
    volume = ""
    issue = ""
    if journal is not None:
        jabbr = journal.find("ISOAbbreviation")
        jfull = journal.find("Title")
        jtitle = _text(jabbr) or _text(jfull)
        ji = journal.find("JournalIssue")
        if ji is not None:
            volume = _text(ji.find("Volume"))
            issue = _text(ji.find("Issue"))
            pubdate = ji.find("PubDate")
            if pubdate is not None:
                year = _text(pubdate.find("Year")) or _text(pubdate.find("MedlineDate"))[:4]

    pages = _text(article.find("Pagination/MedlinePages"))

    doi = ""
    for eid in art.iter("ELocationID"):
        if eid.get("EIdType") == "doi":
            doi = (eid.text or "").strip()
            break
    if not doi:
        for aid in art.iter("ArticleId"):
            if aid.get("IdType") == "doi":
                doi = (aid.text or "").strip()
                break

    return Reference(
        pmid=pmid,
        title=title,
        authors=authors,
        journal=jtitle,
        year=year,
        volume=volume,
        issue=issue,
        pages=pages,
        doi=doi,
        abstract=abstract,
        source="pubmed",
    )


def efetch(pmids: list[str]) -> list[Reference]:
    if not pmids:
        return []
    params = _eutils_params({"db": "pubmed", "id": ",".join(pmids), "retmode": "xml"})
    resp = requests.post(f"{EUTILS}/efetch.fcgi", data=params, timeout=120)
    resp.raise_for_status()
    _rate_limit_sleep()
    root = ET.fromstring(resp.content)
    return [_parse_article(art) for art in root.findall("PubmedArticle")]


def _dedupe(refs: list[Reference]) -> list[Reference]:
    seen_pmid: set[str] = set()
    seen_doi: set[str] = set()
    seen_title: set[str] = set()
    out: list[Reference] = []
    for r in refs:
        key_title = r.title.lower().strip()
        if r.pmid and r.pmid in seen_pmid:
            continue
        if r.doi and r.doi.lower() in seen_doi:
            continue
        if key_title and key_title in seen_title:
            continue
        if r.pmid:
            seen_pmid.add(r.pmid)
        if r.doi:
            seen_doi.add(r.doi.lower())
        if key_title:
            seen_title.add(key_title)
        out.append(r)
    return out


def harvest(brief: Brief, out_dir: Path) -> list[Reference]:
    # NOTE on RAG: harvest builds the NEW bibliography from PubMed only. The remote RAG
    # endpoint is a RETRIEVER over the user's EXISTING Zotero papers + local PDFs, so its
    # hits are not new citations and must not be written back into literature.json/Zotero
    # (that would duplicate already-indexed content). RAG retrieval is wired into the
    # synthesize stage instead, where chunks are used as grounding CONTEXT (see
    # synthesize._rag_context / pipeline.rag_client.RagRetriever).
    all_refs: list[Reference] = []
    per_kw = max(5, brief.max_results // max(1, len(brief.keywords)))
    for kw in brief.keywords:
        pmids = esearch(kw, per_kw)
        all_refs.extend(efetch(pmids))

    refs = _dedupe(all_refs)[: max(brief.max_results, len(brief.keywords) * 5)]
    out_path = out_dir / "literature.json"
    save_references(refs, out_path)
    print(f"[harvest] {len(refs)} references -> {out_path}")
    return refs
