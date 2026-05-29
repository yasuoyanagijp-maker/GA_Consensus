"""Push harvested references into Zotero so app/editor can link citations.

Uses the Zotero write API with the same credentials as the editor
(app/editor/.env.local is read as a fallback).
"""
from __future__ import annotations

from pathlib import Path

import requests

from . import paths
from .references import Reference

ZOTERO_API = "https://api.zotero.org"


def _headers(write: bool = False) -> dict:
    h = {
        "Zotero-API-Key": paths.env("ZOTERO_API_KEY"),
        "Zotero-API-Version": "3",
    }
    if write:
        h["Content-Type"] = "application/json"
    return h


def _user_id() -> str:
    uid = paths.env("ZOTERO_USER_ID")
    if not uid or not paths.env("ZOTERO_API_KEY"):
        raise RuntimeError(
            "ZOTERO_USER_ID / ZOTERO_API_KEY not set (pipeline/.env.local or app/editor/.env.local)"
        )
    return uid


def _existing_keys(query: str) -> list[str]:
    uid = _user_id()
    params = {"q": query, "itemType": "-attachment", "limit": "5", "format": "json"}
    resp = requests.get(f"{ZOTERO_API}/users/{uid}/items", headers=_headers(), params=params, timeout=60)
    if not resp.ok:
        return []
    return [it.get("key") for it in resp.json() if it.get("key")]


def _to_zotero_item(ref: Reference, collection: str = "") -> dict:
    creators = []
    for a in ref.authors:
        parts = a.rsplit(" ", 1)
        if len(parts) == 2 and parts[1].isupper():
            last, initials = parts
            creators.append({"creatorType": "author", "firstName": initials, "lastName": last})
        else:
            creators.append({"creatorType": "author", "name": a})
    extra = f"PMID: {ref.pmid}" if ref.pmid else ""
    item = {
        "itemType": "journalArticle",
        "title": ref.title,
        "creators": creators,
        "abstractNote": ref.abstract,
        "publicationTitle": ref.journal,
        "volume": ref.volume,
        "issue": ref.issue,
        "pages": ref.pages,
        "date": ref.year,
        "DOI": ref.doi,
        "url": f"https://pubmed.ncbi.nlm.nih.gov/{ref.pmid}/" if ref.pmid else "",
        "extra": extra,
    }
    if collection:
        item["collections"] = [collection]
    return item


def sync(refs: list[Reference], collection: str = "", skip_existing: bool = True) -> dict:
    uid = _user_id()
    to_create: list[dict] = []
    skipped = 0
    for ref in refs:
        if skip_existing:
            probe = ref.doi or ref.title[:60]
            if probe and _existing_keys(probe):
                skipped += 1
                continue
        to_create.append(_to_zotero_item(ref, collection))

    created = 0
    failed = 0
    # Zotero accepts up to 50 items per write request.
    for i in range(0, len(to_create), 50):
        batch = to_create[i : i + 50]
        resp = requests.post(
            f"{ZOTERO_API}/users/{uid}/items", headers=_headers(write=True), json=batch, timeout=120
        )
        if not resp.ok:
            raise RuntimeError(f"Zotero write {resp.status_code}: {resp.text[:300]}")
        result = resp.json()
        created += len(result.get("successful", {}))
        failed += len(result.get("failed", {}))

    summary = {"created": created, "skipped": skipped, "failed": failed, "total": len(refs)}
    print(f"[zotero] created={created} skipped={skipped} failed={failed}")
    return summary
