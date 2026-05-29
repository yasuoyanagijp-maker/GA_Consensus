"""Shared paths, environment loading, and backend config for the Textbook Studio pipeline."""
from __future__ import annotations

import json
import os
import re
from functools import lru_cache
from pathlib import Path

PIPELINE_DIR = Path(__file__).resolve().parent
ROOT = PIPELINE_DIR.parent

DRAFTS_DIR = ROOT / "content" / "drafts"
PUBLISHED_DIR = ROOT / "content" / "published"
ASSETS_DIR = ROOT / "content" / "assets"
TEMPLATES_DIR = ROOT / "content" / "templates"
OUT_DIR = PIPELINE_DIR / "out"
CONFIG_DIR = PIPELINE_DIR / "config"
BRIEFS_DIR = PIPELINE_DIR / "briefs"

# style_engine is reached through the in-repo symlink so the path stays portable.
STYLE_ENGINE_DIR = Path(
    os.environ.get(
        "STYLE_ENGINE_DIR",
        str(ROOT / ".agents" / "my_clone_for_textbook" / "style_engine"),
    )
)

PUBLICATION_CHECKLIST = ASSETS_DIR / "publication_checklist.md"


def _parse_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key:
            values[key] = val
    return values


@lru_cache(maxsize=1)
def load_env() -> dict[str, str]:
    """Load pipeline/.env.local, then fall back to the editor's .env.local for Zotero keys."""
    env: dict[str, str] = {}
    # Editor env first (so pipeline/.env.local can override), then pipeline env.
    env.update(_parse_env_file(ROOT / "app" / "editor" / ".env.local"))
    env.update(_parse_env_file(PIPELINE_DIR / ".env.local"))
    # Real process env wins over files.
    for key in list(env.keys()):
        if os.environ.get(key):
            env[key] = os.environ[key]
    return env


def env(key: str, default: str = "") -> str:
    return os.environ.get(key) or load_env().get(key, default)


@lru_cache(maxsize=1)
def load_backends() -> dict:
    with (CONFIG_DIR / "backends.json").open(encoding="utf-8") as fh:
        return json.load(fh)


def slugify(text: str) -> str:
    """ASCII-friendly slug for output dirs/filenames; keeps it filesystem safe."""
    text = text.strip().lower()
    text = re.sub(r"[^\w\s-]", "", text, flags=re.UNICODE)
    text = re.sub(r"[\s_-]+", "_", text)
    return text.strip("_")[:60] or "topic"


def topic_out_dir(topic_slug: str) -> Path:
    d = OUT_DIR / topic_slug
    d.mkdir(parents=True, exist_ok=True)
    return d
