"""Stage 6: figures.

Parses [!FIGURE] placeholders from the draft, builds BioRender-style English prompts
(per textbook_illustrator.md: white bg, 2x2 A/B/C/D, minimal in-image text) plus the
Japanese caption, and -- depending on the image backend -- renders 4-panel PNGs,
emits prompts only, or leaves the work for the pptx placeholder deck.
"""
from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path

from . import paths
from .adapters.image import ImageAdapter, get_image_backend

# Matches a blockquote-style [!FIGURE] callout: consecutive lines starting with '>'.
_FIGURE_RE = re.compile(
    r"(?:^>.*\[!FIGURE\].*$\n)(?:^>.*$\n?)*",
    re.MULTILINE,
)

_BIORENDER_PREFIX = (
    "Professional medical illustration in the style of BioRender and scientific journals. "
    "High-resolution, clean vector-style lines, sharp detail, pure white background (#FFFFFF). "
    "Four discrete panels labeled A, B, C, and D in a 2x2 grid layout. "
    "Minimal in-image text (only the letters A, B, C, D as panel labels). "
    "Color palette: light/signal = blue, cyan, neon yellow; tissue = red (choroid/vessels), "
    "purple/pink (neural retina), brown (RPE). Subject: "
)


@dataclass
class Figure:
    index: int
    title: str = ""
    description: str = ""
    key_takeaway: str = ""
    raw: str = ""
    prompt: str = ""
    caption_ja: str = ""
    image_path: str = ""  # relative path if rendered


def _strip_quote(block: str) -> str:
    lines = []
    for line in block.splitlines():
        lines.append(re.sub(r"^>\s?", "", line))
    return "\n".join(lines).strip()


def _field(text: str, label: str) -> str:
    m = re.search(rf"\[{label}\]\s*:?\s*(.*?)(?=\n\[[A-Za-z ]+\]|\Z)", text, re.S)
    return m.group(1).strip() if m else ""


def _title(text: str) -> str:
    m = re.search(r"\[!FIGURE\]\s*\*{0,2}\[?(.*?)\]?\*{0,2}\s*$", text.splitlines()[0])
    return m.group(1).strip() if m else ""


def parse_figures(draft_md: str) -> list[Figure]:
    figs: list[Figure] = []
    for i, match in enumerate(_FIGURE_RE.finditer(draft_md), 1):
        raw = match.group(0)
        text = _strip_quote(raw)
        desc = _field(text, "Description")
        figs.append(
            Figure(
                index=i,
                title=_title(text),
                description=desc,
                key_takeaway=_field(text, "Key Takeaway"),
                raw=raw,
            )
        )
    return figs


def build_prompt(fig: Figure) -> str:
    subject = fig.description or fig.title or "retinal pathology mechanism"
    return _BIORENDER_PREFIX + subject


def build_caption(fig: Figure) -> str:
    parts = [f"**図{fig.index}. {fig.title}**" if fig.title else f"**図{fig.index}**"]
    if fig.key_takeaway:
        parts.append(fig.key_takeaway)
    return "  \n".join(parts)


def process_figures(draft_md: str, topic_slug: str, out_dir: Path, backend: ImageAdapter | None = None) -> list[Figure]:
    backend = backend or get_image_backend()
    figs = parse_figures(draft_md)
    asset_dir = paths.ASSETS_DIR / topic_slug
    asset_dir.mkdir(parents=True, exist_ok=True)

    for fig in figs:
        fig.prompt = build_prompt(fig)
        fig.caption_ja = build_caption(fig)
        if backend.renders:
            png = asset_dir / f"figure_{fig.index:02d}.png"
            try:
                res = backend.render(fig.prompt, png)
                if res.rendered and res.path:
                    fig.image_path = str(res.path.relative_to(paths.ROOT))
            except Exception as exc:  # noqa: BLE001 - degrade to prompt-only
                print(f"[figures] render failed for figure {fig.index}: {exc}")

    # Persist prompts + captions for manual generation / review.
    manifest = out_dir / "figures.json"
    manifest.write_text(
        json.dumps([asdict(f) for f in figs], ensure_ascii=False, indent=2), encoding="utf-8"
    )
    prompts_md = out_dir / "figure_prompts.md"
    blocks = [f"# 図表プロンプト: {topic_slug}\n"]
    for f in figs:
        blocks.append(
            f"## 図{f.index}: {f.title}\n\n"
            f"**English prompt (画像生成用):**\n\n```\n{f.prompt}\n```\n\n"
            f"**日本語キャプション:**\n\n{f.caption_ja}\n\n"
            + (f"**生成画像:** `{f.image_path}`\n" if f.image_path else "**生成画像:** (未生成 — 手動生成 or gemini_imagen)\n")
        )
    prompts_md.write_text("\n".join(blocks), encoding="utf-8")
    print(f"[figures] {len(figs)} figures parsed -> {manifest} ; backend={backend.provider}")
    return figs
