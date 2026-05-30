"""Image backend abstraction for BioRender-style 4-panel figures.

Providers (config/backends.json -> image.provider):

- prompt_only      : free. Never renders; figures.py just writes English prompts + JP captions.
- pptx_placeholder : free. No raster output here; assemble.py builds a 2x2 empty-panel .pptx
                     with captions so figures can be dropped in (replaces the slide+Codia step).
- gemini_imagen    : paid. Renders a PNG via the Imagen :predict API (IMAGEN_MODEL override).
- gemini_image     : renders a PNG via a gemini-*-image :generateContent model
                     (IMAGE_MODEL override; "Nano Banana"-style). Subject to the key's quota.
"""
from __future__ import annotations

import base64
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import requests

from .. import paths


class ImageError(RuntimeError):
    pass


@dataclass
class ImageResult:
    rendered: bool          # True if a real image file was written
    path: Optional[Path]    # output PNG path, if rendered
    provider: str


class ImageAdapter:
    provider = "base"
    renders = False  # whether this backend produces raster images

    def render(self, prompt: str, out_path: Path) -> ImageResult:
        raise NotImplementedError


class PromptOnlyAdapter(ImageAdapter):
    provider = "prompt_only"
    renders = False

    def render(self, prompt, out_path):
        return ImageResult(rendered=False, path=None, provider=self.provider)


class PptxPlaceholderAdapter(ImageAdapter):
    """No raster output; the empty 2x2 deck is produced by assemble.build_pptx()."""

    provider = "pptx_placeholder"
    renders = False

    def render(self, prompt, out_path):
        return ImageResult(rendered=False, path=None, provider=self.provider)


class GeminiImagenAdapter(ImageAdapter):
    provider = "gemini_imagen"
    renders = True

    def __init__(self):
        self.api_key = paths.env("GEMINI_API_KEY")
        self.model = paths.env("IMAGEN_MODEL") or "imagen-4.0-generate-001"
        if not self.api_key:
            raise ImageError("GEMINI_API_KEY is not set in pipeline/.env.local")

    def render(self, prompt, out_path):
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.model}:predict?key={self.api_key}"
        )
        body = {
            "instances": [{"prompt": prompt}],
            "parameters": {"sampleCount": 1, "aspectRatio": "1:1"},
        }
        resp = requests.post(url, json=body, timeout=300)
        if not resp.ok:
            raise ImageError(f"Imagen {resp.status_code}: {resp.text[:300]}")
        data = resp.json()
        preds = data.get("predictions") or []
        if not preds:
            raise ImageError(f"Imagen returned no predictions: {str(data)[:200]}")
        b64 = preds[0].get("bytesBase64Encoded") or preds[0].get("image")
        if not b64:
            raise ImageError("Imagen prediction missing image bytes")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(base64.b64decode(b64))
        return ImageResult(rendered=True, path=out_path, provider=self.provider)


class GeminiImageAdapter(ImageAdapter):
    """Image generation via a gemini-*-image :generateContent model (returns inline PNG)."""

    provider = "gemini_image"
    renders = True

    def __init__(self):
        self.api_key = paths.env("GEMINI_API_KEY")
        self.model = paths.env("IMAGE_MODEL") or "gemini-2.5-flash-image"
        if not self.api_key:
            raise ImageError("GEMINI_API_KEY is not set in pipeline/.env.local")

    def render(self, prompt, out_path):
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.model}:generateContent?key={self.api_key}"
        )
        body = {"contents": [{"parts": [{"text": prompt}]}]}
        resp = requests.post(url, json=body, timeout=300)
        if not resp.ok:
            raise ImageError(f"gemini_image {resp.status_code}: {resp.text[:300]}")
        parts = (
            resp.json().get("candidates", [{}])[0].get("content", {}).get("parts", [])
        )
        for p in parts:
            inline = p.get("inlineData") or p.get("inline_data")
            if inline and inline.get("data"):
                out_path.parent.mkdir(parents=True, exist_ok=True)
                out_path.write_bytes(base64.b64decode(inline["data"]))
                return ImageResult(rendered=True, path=out_path, provider=self.provider)
        raise ImageError("gemini_image returned no inline image data")


_REGISTRY = {
    "prompt_only": PromptOnlyAdapter,
    "pptx_placeholder": PptxPlaceholderAdapter,
    "gemini_imagen": GeminiImagenAdapter,
    "gemini_image": GeminiImageAdapter,
}


def get_image_backend(provider: Optional[str] = None) -> ImageAdapter:
    cfg = paths.load_backends().get("image", {})
    name = provider or cfg.get("provider", "pptx_placeholder")
    if name not in _REGISTRY:
        raise ImageError(f"Unknown image provider '{name}'. Options: {sorted(_REGISTRY)}")
    return _REGISTRY[name]()
