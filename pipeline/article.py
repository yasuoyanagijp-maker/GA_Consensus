"""Media-article mode (style=medical_tribune): commentary on a source paper.

Reuses the existing building blocks instead of duplicating logic:
  - source paper metadata via Europe PMC REST (PubMed-by-title fallback)
  - references.Reference + Reference.vancouver() for the bibliography
  - rag_client / synthesize._rag_context for optional grounding context
  - adapters.llm for generation, prompts.MEDICAL_TRIBUNE_SYSTEM for the voice/format
  - assemble.assemble() downstream for the footer + publication gate + .docx

The article itself is written by the google_pro (Gemini) adapter in 柳's "my tone".
"""
from __future__ import annotations

import re
import sqlite3
from datetime import date
from pathlib import Path

import requests

from . import harvest, paths, prompts
from .adapters.llm import LLMAdapter, get_llm
from .brief import Brief
from .references import Reference

EUROPEPMC = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
ZOTERO_API = "https://api.zotero.org"


# ----------------------------------------------------------------- PDF text extraction
def extract_pdf_text(pdf_bytes: bytes | None = None, pdf_path: Path | None = None) -> str:
    """Extract text from a PDF (PyMuPDF preferred, pdfminer.six fallback)."""
    try:
        import fitz  # PyMuPDF

        doc = fitz.open(stream=pdf_bytes, filetype="pdf") if pdf_bytes else fitz.open(pdf_path)
        return "\n".join(page.get_text() for page in doc)
    except Exception as exc:  # noqa: BLE001 - try the secondary backend
        print(f"[article] PyMuPDF extraction failed ({exc}); trying pdfminer")
    try:
        from io import BytesIO

        from pdfminer.high_level import extract_text

        return extract_text(BytesIO(pdf_bytes)) if pdf_bytes else extract_text(str(pdf_path))
    except Exception as exc:  # noqa: BLE001
        print(f"[article] pdfminer extraction failed: {exc}")
        return ""


# ----------------------------------------------------------------- Zotero full text
def _zotero_data_dir() -> Path:
    return Path(paths.env("ZOTERO_DATA_DIR") or (Path.home() / "Zotero"))


def _zotero_creds_ok() -> bool:
    uid, key = paths.env("ZOTERO_USER_ID"), paths.env("ZOTERO_API_KEY")
    placeholders = {"", "your_api_key", "your_user_id"}
    return uid not in placeholders and key not in placeholders


def _zotero_headers() -> dict:
    return {"Zotero-API-Key": paths.env("ZOTERO_API_KEY"), "Zotero-API-Version": "3"}


def _zotero_api_fulltext(doi: str, title: str) -> tuple[str, dict] | None:
    """Find the paper in the Zotero Web API by DOI/title and download its PDF bytes.

    Mirrors app/editor/server/index.ts PDF logic (imported_url vs stored file).
    """
    uid = paths.env("ZOTERO_USER_ID")
    for q in [doi, title]:
        if not q:
            continue
        try:
            r = requests.get(
                f"{ZOTERO_API}/users/{uid}/items",
                headers=_zotero_headers(),
                params={"q": q, "itemType": "-attachment", "limit": "10", "format": "json"},
                timeout=60,
            )
            if not r.ok:
                print(f"[article] Zotero API search ({q[:40]!r}) -> {r.status_code}")
                continue
            items = r.json()
        except Exception as exc:  # noqa: BLE001
            print(f"[article] Zotero API error: {exc}")
            continue
        for it in items:
            key = it.get("key")
            if not key:
                continue
            ch = requests.get(
                f"{ZOTERO_API}/users/{uid}/items/{key}/children",
                headers=_zotero_headers(), params={"format": "json"}, timeout=60,
            )
            if not ch.ok:
                continue
            for c in ch.json():
                d = c.get("data", {})
                is_pdf = d.get("contentType") == "application/pdf" or str(d.get("filename", "")).endswith(".pdf")
                if d.get("itemType") != "attachment" or not is_pdf:
                    continue
                fr = requests.get(
                    f"{ZOTERO_API}/users/{uid}/items/{c.get('key')}/file",
                    headers=_zotero_headers(), timeout=120,
                )
                if fr.ok and fr.content:
                    text = extract_pdf_text(pdf_bytes=fr.content)
                    if text.strip():
                        return text, {"method": "zotero_api", "item_key": key, "attachment_key": c.get("key")}
    return None


def _zotero_local_db() -> Path | None:
    db = _zotero_data_dir() / "zotero.sqlite"
    return db if db.exists() else None


def _query_local_attachment(doi: str, title: str) -> tuple[str, str, dict] | None:
    """Resolve (attachment_key, filename, item_meta) from the local Zotero SQLite by DOI then title.

    Opens a copy (immutable) so a running Zotero process never blocks the read.
    """
    db = _zotero_local_db()
    if db is None:
        return None
    con = sqlite3.connect(f"file:{db}?immutable=1", uri=True)
    try:
        cur = con.cursor()

        def field_lookup(field: str, value: str) -> list[tuple[int, str]]:
            cur.execute(
                """SELECT i.itemID, i.key FROM items i
                   JOIN itemData d ON d.itemID=i.itemID
                   JOIN itemDataValues v ON v.valueID=d.valueID
                   JOIN fields f ON f.fieldID=d.fieldID
                   WHERE f.fieldName=? AND v.value=?""",
                (field, value),
            )
            return cur.fetchall()

        rows = field_lookup("DOI", doi) if doi else []
        if not rows and title:
            rows = field_lookup("title", title)
        for item_id, item_key in rows:
            cur.execute(
                "SELECT itemID, path FROM itemAttachments WHERE parentItemID=? AND contentType='application/pdf'",
                (item_id,),
            )
            for attach_id, path in cur.fetchall():
                cur.execute("SELECT key FROM items WHERE itemID=?", (attach_id,))
                attach_key = cur.fetchone()[0]
                filename = (path or "").split("storage:", 1)[-1] if path else ""
                return attach_key, filename, {"item_key": item_key, "doi": doi}
    finally:
        con.close()
    return None


def _zotero_local_fulltext(doi: str, title: str) -> tuple[str, dict] | None:
    found = _query_local_attachment(doi, title)
    if not found:
        return None
    attach_key, filename, _meta = found
    storage = _zotero_data_dir() / "storage" / attach_key
    pdf = storage / filename if filename and (storage / filename).exists() else None
    if pdf is None and storage.exists():
        pdfs = sorted(storage.glob("*.pdf"))
        pdf = pdfs[0] if pdfs else None
    if pdf is None or not pdf.exists():
        print(f"[article] local Zotero attachment {attach_key} has no PDF on disk ({storage})")
        return None
    text = extract_pdf_text(pdf_path=pdf)
    if not text.strip():
        return None
    return text, {"method": "zotero_local", "attachment_key": attach_key, "pdf_path": str(pdf)}


def fetch_zotero_fulltext(doi: str = "", title: str = "") -> tuple[str, dict] | None:
    """Generic source full-text fetch: Zotero Web API -> local Zotero storage. None if unavailable."""
    if _zotero_creds_ok():
        api = _zotero_api_fulltext(doi, title)
        if api:
            return api
        print("[article] Zotero API: no downloadable PDF; falling back to local storage")
    else:
        print("[article] Zotero API creds not configured; using local Zotero storage")
    return _zotero_local_fulltext(doi, title)


def _ref_from_epmc(rec: dict) -> Reference:
    journal_info = rec.get("journalInfo") or {}
    journal = journal_info.get("journal") or {}
    authors = [a.strip() for a in (rec.get("authorString") or "").rstrip(".").split(",") if a.strip()]
    return Reference(
        pmid=str(rec.get("pmid", "")),
        title=(rec.get("title") or "").strip().rstrip("."),
        authors=authors,
        journal=(journal.get("isoabbreviation") or journal.get("title") or "").strip(),
        year=str(rec.get("pubYear") or journal_info.get("yearOfPublication") or ""),
        volume=str(journal_info.get("volume") or ""),
        issue=str(journal_info.get("issue") or ""),
        pages=str(rec.get("pageInfo") or ""),
        doi=(rec.get("doi") or "").strip(),
        abstract=(rec.get("abstractText") or "").strip(),
        source="europepmc",
    )


def _europepmc_query(query: str) -> Reference | None:
    params = {"query": query, "resultType": "core", "format": "json", "pageSize": "1"}
    try:
        resp = requests.get(EUROPEPMC, params=params, timeout=60)
        resp.raise_for_status()
        results = (resp.json().get("resultList") or {}).get("result") or []
    except Exception as exc:  # noqa: BLE001 - network/parse issues fall through to fallback
        print(f"[article] Europe PMC query failed ({query!r}): {exc}")
        return None
    if not results:
        return None
    return _ref_from_epmc(results[0])


def _norm_title(t: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (t or "").lower()).strip()


def _same_paper(a: Reference, b: Reference) -> bool:
    """True only when two records are confidently the same paper."""
    if a.doi and b.doi and a.doi.lower() == b.doi.lower():
        return True
    if a.pmid and b.pmid and a.pmid == b.pmid:
        return True
    na, nb = _norm_title(a.title), _norm_title(b.title)
    return bool(na) and na == nb


def fetch_source_reference(
    doi: str = "", title: str = "", url: str = ""
) -> tuple[Reference, bool]:
    """Fetch source-paper metadata. Returns (Reference, abstract_found).

    The DOI (or exact title) match from Europe PMC is treated as the AUTHORITATIVE
    record for citation. The abstract is only enriched from another source when that
    source is confidently the SAME paper (matching DOI/PMID/normalized title) — a loose
    keyword search must never silently swap in a different article. Never raises; if no
    abstract is indexed anywhere (paywall), returns the correct metadata with
    abstract_found=False so the caller can generate from title+angle with a warning.
    """
    auth: Reference | None = None
    if doi:
        auth = _europepmc_query(f"DOI:{doi}")
    if auth is None and title:
        by_title = _europepmc_query(f'TITLE:"{title}"')
        if by_title and (not title or _norm_title(by_title.title) == _norm_title(title)):
            auth = by_title

    if auth is None:
        auth = Reference(title=title, doi=doi, source="manual")
    if doi and not auth.doi:
        auth.doi = doi
    if title and not auth.title:
        auth.title = title

    # Enrich abstract ONLY from the same paper.
    if not auth.abstract.strip():
        try:
            if auth.pmid:
                pm = harvest.efetch([auth.pmid])
                if pm and pm[0].abstract and _same_paper(auth, pm[0]):
                    auth.abstract = pm[0].abstract
            if not auth.abstract.strip() and title:
                pmids = harvest.esearch(title, 3)
                for cand in harvest.efetch(pmids):
                    if cand.abstract and _same_paper(auth, cand):
                        auth.abstract = cand.abstract
                        if not auth.pmid:
                            auth.pmid = cand.pmid
                        break
        except Exception as exc:  # noqa: BLE001
            print(f"[article] abstract enrichment skipped: {exc}")

    abstract_found = bool(auth.abstract.strip())
    note = "abstract取得" if abstract_found else "抄録なし(タイトル+angleから生成)"
    print(f"[article] source: {auth.title[:70]!r} ({note}; doi={auth.doi or 'NA'} pmid={auth.pmid or 'NA'})")
    return auth, abstract_found


def _dedupe(refs: list[Reference]) -> list[Reference]:
    seen: set[str] = set()
    out: list[Reference] = []
    for r in refs:
        key = (r.doi.lower() or r.pmid or r.title.lower()).strip()
        if key and key in seen:
            continue
        if key:
            seen.add(key)
        out.append(r)
    return out


def _ref_block(refs: list[Reference]) -> str:
    lines = ["## 参考文献", ""]
    for i, r in enumerate(refs, 1):
        lines.append(f"{i}. {r.vancouver()}")
    return "\n".join(lines)


def _source_credit(source_ref: Reference, url: str) -> str:
    """Authoritative source-credit footer (real bibliographic data, not LLM text)."""
    line = source_ref.vancouver() or source_ref.title
    credit = f"---\n\n**出典**: {line}"
    if url:
        credit += f"\n\n原文: {url}"
    return credit


def _authoritative_references(prose: str, source_ref: Reference, refs: list[Reference], url: str) -> str:
    """Render the verifiable reference list + credit tail from real bibliographic data."""
    return f"{prose.rstrip()}\n\n{_ref_block(refs)}\n\n{_source_credit(source_ref, url)}\n"


_CITE_RE = re.compile(r"\[(\d+(?:\s*,\s*\d+)*)\]")


def _trim_and_renumber(prose: str, refs: list[Reference]) -> tuple[str, list[Reference], list[Reference]]:
    """Keep ONLY references actually cited in the body, renumber 1..k without gaps.

    Conservative-citation cleanup: drops uncited / uncertain refs from the bibliography
    and rewrites every [n] (incl. grouped [a, b]) to the compacted numbering. The source
    paper ([1]) is always retained as [1]. Returns (new_prose, kept_refs, dropped_refs).
    """
    # Safety net: RAG context must never surface as a numbered citation in the body.
    prose = re.sub(r"\s*\[RAG[^\]]*\]", "", prose)
    order: list[int] = []
    for m in _CITE_RE.finditer(prose):
        for num in re.findall(r"\d+", m.group(1)):
            n = int(num)
            if 1 <= n <= len(refs) and n not in order:
                order.append(n)
    if 1 not in order:  # always keep the source paper as [1]
        order.insert(0, 1)
    mapping = {old: i + 1 for i, old in enumerate(order)}

    def repl(m: re.Match) -> str:
        nums = sorted({mapping[int(x)] for x in re.findall(r"\d+", m.group(1)) if int(x) in mapping})
        return "[" + ", ".join(str(n) for n in nums) + "]" if nums else ""

    new_prose = _CITE_RE.sub(repl, prose)
    kept = [refs[old - 1] for old in order]
    dropped = [refs[i] for i in range(len(refs)) if (i + 1) not in order]
    return new_prose, kept, dropped


def _audit_citations(prose: str, refs: list[Reference], llm: "LLMAdapter | None") -> tuple[str, list[int]]:
    """Strict, reusable citation audit: drop supporting refs [2..] that don't clearly match.

    The model judges, by reference title vs. the sentence each [n] is attached to, whether the
    match is unambiguous; doubtful / 孫引き mappings are removed (the source [1] is never dropped).
    This is the conservative-citation default for medical_tribune. Graceful: any failure is a no-op.
    """
    import json

    if llm is None or len(refs) < 2:
        return prose, []
    ref_lines = "\n".join(f"[{i + 1}] {r.title}" for i, r in enumerate(refs))
    system = (
        "あなたは医学論文の引用監査者である。出力は JSON オブジェクト 1 個のみ。説明文を書かない。"
    )
    task = (
        "次の【本文】中の参考文献番号 [2] 以降について、その番号が付された文の具体的な主張を、"
        "【文献リスト】の当該タイトルが『明確かつ具体的に』裏づけているか判定せよ。\n"
        "- 少しでも曖昧、間接的、孫引き的（出典論文 [1] が引用している事実を別番号で付けている等）な"
        "ものは drop に入れる。判断に迷えば drop する（保守的）。\n"
        "- [1] は出典論文なので決して drop しない。\n"
        '- drop すべき番号のみを {"drop": [n, ...]} 形式で返す。drop が無ければ {"drop": []}。\n\n'
        f"【文献リスト】\n{ref_lines}\n\n【本文】\n{prose}"
    )
    try:
        res = llm.generate(system=system, prompt=task, context_docs=[])
        m = re.search(r"\{.*\}", res.text, re.S)
        drop = {int(x) for x in json.loads(m.group(0)).get("drop", []) if 2 <= int(x) <= len(refs)}
    except Exception as exc:  # noqa: BLE001 - audit is best-effort
        print(f"[article] citation audit skipped ({exc})")
        return prose, []
    if not drop:
        return prose, []

    def repl(m: re.Match) -> str:
        keep = [int(x) for x in re.findall(r"\d+", m.group(1)) if int(x) not in drop]
        return "[" + ", ".join(str(n) for n in keep) + "]" if keep else ""

    return _CITE_RE.sub(repl, prose), sorted(drop)


# ----------------------------------------------------------------- concept figure
MEDICAL_TRIBUNE_FIGURE_PREFIX = (
    "Professional 2D medical illustration in the style of BioRender and scientific journals. "
    "Clean vector-style lines, flat 2D schematic, pure white background (#FFFFFF). "
    "ABSOLUTELY MINIMAL in-image text: no sentences and no word labels; at most the single "
    "capital letters A and B as panel markers. Color palette: choroid/vessels red, RPE brown, "
    "neural retina purple/pink, light/signal blue-cyan. Two side-by-side comparison panels. Subject: "
)

_FIGURE_SPEC_RE = re.compile(r"<<<FIGURE_SPEC>>>(.*?)<<<END_FIGURE_SPEC>>>", re.S)
_FIGURE_MARKER = "[[CONCEPT_FIGURE]]"


def _parse_figure_spec(text: str) -> tuple[str, str] | None:
    m = _FIGURE_SPEC_RE.search(text)
    if not m:
        return None
    block = m.group(1)
    pm = re.search(r"PROMPT:\s*(.*?)(?=\nCAPTION:|\Z)", block, re.S)
    cm = re.search(r"CAPTION:\s*(.*?)\Z", block, re.S)
    prompt = (pm.group(1).strip() if pm else "").strip()
    caption = (cm.group(1).strip() if cm else "").strip()
    return (prompt, caption) if prompt else None


def build_concept_figure(brief: Brief, subject: str, caption_ja: str, out_dir: Path, image_backend) -> "object":
    """Build (and render, if the backend can) one 2D concept figure for the paper's new idea."""
    from .figures import Figure

    fig = Figure(
        index=1,
        title=brief.title,
        prompt=MEDICAL_TRIBUNE_FIGURE_PREFIX + subject,
        caption_ja=caption_ja or "",
    )
    if image_backend is not None and getattr(image_backend, "renders", False):
        png = paths.ASSETS_DIR / brief.slug / "concept_01.png"
        try:
            res = image_backend.render(fig.prompt, png)
            if res.rendered and res.path:
                fig.image_path = str(res.path.relative_to(paths.ROOT))
                print(f"[article] concept figure rendered -> {fig.image_path} (via {res.provider})")
        except Exception as exc:  # noqa: BLE001 - degrade to prompt-only
            print(f"[article] concept figure render failed ({exc}); prompt-only fallback")
    (out_dir / "figure_prompt.md").write_text(
        f"# 概念図プロンプト: {brief.slug}\n\n**English prompt (画像生成用):**\n\n```\n{fig.prompt}\n```\n\n"
        f"**日本語キャプション:**\n\n{fig.caption_ja}\n\n"
        + (f"**生成画像:** `{fig.image_path}`\n" if fig.image_path
           else "**生成画像:** (未生成 — prompt_only fallback。手動生成 or 課金/quota 解消後に再実行)\n"),
        encoding="utf-8",
    )
    return fig


def _embed_concept_figure(prose: str, fig) -> str:
    """Replace the [[CONCEPT_FIGURE]] marker with the rendered image (or a prompt placeholder)."""
    if fig.image_path:
        block = (
            f"![{fig.title}]({fig.image_path})\n\n"
            f"**図1（図：柳 靖雄氏提供）**  \n{fig.caption_ja}"
        )
    else:
        cap = (fig.caption_ja or "").replace("\n", "\n> ")
        block = (
            f"> **[図1 ここに挿入]（図：柳 靖雄氏提供）**\n>\n> {cap}\n>\n"
            f"> _生成プロンプト（BioRender系・要手動生成）:_ `{fig.prompt[:200]}...`"
        )
    if _FIGURE_MARKER in prose:
        return prose.replace(_FIGURE_MARKER, block, 1)
    idx = prose.find("### 私の考察")
    if idx != -1:
        return prose[:idx] + block + "\n\n" + prose[idx:]
    return prose.rstrip() + "\n\n" + block + "\n"


def build_article(
    brief: Brief,
    source_ref: Reference,
    refs: list[Reference],
    abstract_found: bool,
    out_dir: Path,
    llm: LLMAdapter | None = None,
    rag_context: list[str] | None = None,
    source_fulltext: str = "",
    fulltext_limit: int = 60000,
    image_backend=None,
) -> Path:
    """Generate the Medical Tribune commentary in 柳's tone and save it.

    Source precedence for grounding: full text (Zotero PDF) > abstract (Europe PMC/PubMed)
    > title+angle only. When the full text is present the article must cite the paper's
    real reported numbers, and the "abstract未取得・要確認" caveat is dropped.
    """
    llm = llm or get_llm()

    grounded = bool(source_fulltext.strip())
    if grounded:
        ft = source_fulltext.strip()[:fulltext_limit]
        source_body = (
            "### 出典論文の全文（Zotero PDFより抽出）\n"
            "以下は出典論文の本文である。Methods/Results に記載された実際の数値"
            "（症例数、増大速度、95%CI、p値、期間など）を正確に引用して解説すること。\n\n"
            + ft
        )
    else:
        source_body = "### 出典論文の抄録\n" + (
            source_ref.abstract if abstract_found
            else "(抄録を取得できなかった。タイトルと編集angleから、一般に確立した知見の範囲で慎重に解説し、"
                 "数値・固有の結果は断定しないこと。)"
        )

    source_block = (
        f"### 出典論文メタデータ\n"
        f"- タイトル: {source_ref.title or brief.source_title or '(不明)'}\n"
        f"- 著者: {', '.join(source_ref.authors) or '(不明)'}\n"
        f"- 誌名/年: {source_ref.journal} {source_ref.year}\n"
        f"- DOI: {source_ref.doi or brief.source_doi or '(不明)'}\n"
        f"- URL: {brief.source_url or '(不明)'}\n\n"
        f"{source_body}"
    )
    support_block = "\n\n".join(
        f"[{i}] PMID:{r.pmid or 'NA'} | {r.title} | {r.journal} {r.year}\n{r.abstract}"
        for i, r in enumerate(refs, 1)
        if r.abstract
    ) or "(関連文献の抄録なし)"

    ref_list_preview = "\n".join(f"[{i}] {r.title} ({r.year})" for i, r in enumerate(refs, 1))

    if grounded:
        verify_note = (
            "\n\n【厳守】出典論文 [1] の実際の報告数値（症例数・GA増大速度・95%CI・p値・追跡期間等）を"
            "本文に正確に引用すること。全文に無い数値を創作しないこと。抄録未取得の断り書きは不要。"
        )
    else:
        verify_note = (
            "\n\n【重要】出典論文の抄録を取得できなかった。本文冒頭の編集注記で「著者は全文で図表・数値を"
            "要確認」である旨を明示し、具体的な数値結果の断定を避けること。"
        )

    task = (
        f"記事タイトル(仮): {brief.title}\n"
        f"対象読者: 眼科医（Medical Tribune / ドクターズアイ 掲載想定）\n\n"
        f"## 編集の angle（面白さの中心に据える）\n{brief.angle or '(指定なし: 出典論文の最も臨床的示唆に富む点を中心に)'}\n\n"
        f"{source_block}\n\n"
        "上記出典論文を主題に、CONTEXT の文体サンプル・口調・語尾を厳守して、"
        "Medical Tribune コラム形式（研究の背景→研究のポイント→私の考察）の解説記事を執筆せよ。\n"
        "出典論文を参考文献 [1] とし、関連文献があれば [2] 以降で引用、章末に Vancouver 形式の"
        "「## 参考文献」を置く。記事末尾に出典クレジット行（書誌+DOI/URL）を付す。"
        f"{verify_note}\n\n"
        f"## 参考文献リスト（[n] の対応・この番号で引用すること）\n{ref_list_preview}"
    )

    context = prompts.medical_tribune_tone_context() + [
        "## 関連文献の抄録（任意の裏付け）\n" + support_block,
    ]
    if rag_context:
        context += ["## RAG 文脈（ローカル資料）\n" + c for c in rag_context]

    result = llm.generate(
        system=prompts.MEDICAL_TRIBUNE_SYSTEM,
        prompt=task,
        context_docs=context,
        prompt_dump=out_dir / "article.prompt.txt",
    )

    raw = result.text
    # 1. Pull the figure spec, then drop it + any LLM-written reference tail from the prose.
    spec = _parse_figure_spec(raw)
    raw = _FIGURE_SPEC_RE.sub("", raw)
    idx = raw.find("## 参考文献")
    prose = raw[:idx].rstrip() if idx != -1 else raw.rstrip()

    # 2. Build + (try to) render the single concept figure, then embed it at the marker.
    subject = spec[0] if spec else (
        "Two-panel A/B comparison of the macula in age-related macular degeneration. "
        "A: geographic atrophy only, with a fast-expanding atrophic RPE area. "
        "B: geographic atrophy with an incident type 1 macular neovascularization forming a "
        "neochoriocapillaris that perfuses and supports the overlying outer retina/RPE, with a "
        "slower-expanding atrophic area (a protective 'brake')."
    )
    caption = spec[1] if spec else (
        "A：GA単独では萎縮（RPE/外網膜の地図状萎縮）が速く拡大する。"
        "B：type 1 MNVが発生すると neochoriocapillaris が上層の外網膜・RPEを灌流・支持し、"
        "萎縮の拡大が緩徐となる（保護的「ブレーキ」仮説）。"
    )
    fig = build_concept_figure(brief, subject, caption, out_dir, image_backend)
    prose = _embed_concept_figure(prose, fig)

    # 3. Conservative citation: strict audit (drop doubtful/孫引き maps) then keep-only-cited + renumber.
    prose, audited = _audit_citations(prose, refs, llm)
    if audited:
        print(f"[article] citation audit dropped doubtful refs: {audited}")
    prose, kept_refs, dropped_refs = _trim_and_renumber(prose, refs)
    if dropped_refs:
        print(f"[article] dropped {len(dropped_refs)} uncited/doubtful refs; kept {len(kept_refs)}")
    # Tidy artifacts left where a citation token was removed (orphan spaces / empty brackets).
    prose = re.sub(r"\[\s*\]", "", prose)
    prose = re.sub(r"[ \t]+([。、，．）」』])", r"\1", prose)
    prose = re.sub(r"[ \t]{2,}", " ", prose)

    # 4. Render the verifiable reference list + credit from real bibliographic data.
    body = _authoritative_references(prose, source_ref, kept_refs, brief.source_url)

    grounding = "zotero_fulltext" if grounded else ("abstract" if abstract_found else "title_only")
    front = (
        f"<!-- generated by Textbook Studio pipeline (style=medical_tribune) | "
        f"provider: {result.provider}{' (dry/手動)' if result.dry else ''} | "
        f"source_doi: {brief.source_doi or source_ref.doi or 'NA'} | "
        f"grounding: {grounding} -->\n\n"
    )

    # Stage copy + dated draft for the editor.
    (out_dir / "article.md").write_text(front + body, encoding="utf-8")
    today = date.today().strftime("%Y%m%d")
    out_name = f"{today}_{brief.slug}_medical_tribune.md"
    out_path = paths.DRAFTS_DIR / out_name
    out_path.write_text(front + body, encoding="utf-8")
    print(f"[article] -> {out_path}" + (" (dry mode)" if result.dry else ""))
    return out_path
