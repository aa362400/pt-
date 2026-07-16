"""Deterministic image evidence for supplier search requests.

The perceptual hash is recall-only. It must never be used as proof that a
supplier offer is the same product or as authorization to consume a quote.
"""

from __future__ import annotations

import hashlib
import math
import warnings
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError


CANONICALIZATION_VERSION = "supplier-image-canonical/v1"
PROVIDER_PAYLOAD_CANONICALIZATION_VERSION = "supplier-image-search-payload/v2"
PROVIDER_MAX_DECODED_BYTES = 3 * 1024 * 1024
MAX_SOURCE_BYTES = 15 * 1024 * 1024
MAX_PIXELS = 40_000_000
MAX_CANONICAL_EDGE = 1024
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "GIF"}


def _sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _retrieval_dhash64(image: Image.Image) -> str:
    grayscale = image.convert("L").resize((9, 8), Image.Resampling.LANCZOS)
    flattened = getattr(grayscale, "get_flattened_data", None)
    pixels = list(flattened() if flattened is not None else grayscale.getdata())
    bits = 0
    for row in range(8):
        for column in range(8):
            bits = (bits << 1) | int(
                pixels[row * 9 + column] > pixels[row * 9 + column + 1]
            )
    return f"{bits:016x}"


def _rgb_on_white(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    background = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
    return Image.alpha_composite(background, rgba).convert("RGB")


def canonicalize_supplier_search_image(
    source_path: str | Path, output_dir: str | Path
) -> dict[str, object]:
    source = Path(source_path)
    if not source.is_file():
        raise ValueError("supplier image does not exist")
    if source.stat().st_size <= 0 or source.stat().st_size > MAX_SOURCE_BYTES:
        raise ValueError("supplier image size is outside the allowed range")
    original = source.read_bytes()

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(original)) as opened:
                image_format = (opened.format or "").upper()
                if image_format not in ALLOWED_FORMATS:
                    raise ValueError("supplier image format is not allowed")
                width, height = opened.size
                if width <= 0 or height <= 0 or width * height > MAX_PIXELS:
                    raise ValueError("supplier image dimensions are unsafe")
                opened.load()
                normalized = _rgb_on_white(ImageOps.exif_transpose(opened))
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise ValueError("supplier image is invalid") from exc

    if max(normalized.size) > MAX_CANONICAL_EDGE:
        normalized.thumbnail(
            (MAX_CANONICAL_EDGE, MAX_CANONICAL_EDGE),
            Image.Resampling.LANCZOS,
        )

    buffer = BytesIO()
    normalized.save(buffer, format="PNG", optimize=False, compress_level=9)
    canonical = buffer.getvalue()
    canonical_sha256 = _sha256(canonical)
    destination_dir = Path(output_dir)
    destination_dir.mkdir(parents=True, exist_ok=True)
    destination = destination_dir / f"{canonical_sha256}.png"
    if not destination.exists():
        destination.write_bytes(canonical)

    return {
        "canonicalizationVersion": CANONICALIZATION_VERSION,
        "sourceOriginalSha256": _sha256(original),
        "sourceCanonicalSha256": canonical_sha256,
        "canonicalPath": str(destination),
        "width": normalized.width,
        "height": normalized.height,
        "retrievalHashAlgorithm": "DHASH64",
        "retrievalHash": _retrieval_dhash64(normalized),
        "retrievalOnly": True,
    }


def prepare_supplier_image_search_payload(
    source_path: str | Path, output_dir: str | Path
) -> dict[str, object]:
    """Create a deterministic provider payload bounded by the documented 3MB cap.

    The legacy v1 canonicalizer remains unchanged because its content hash is an
    evidence contract. This explicit v2 representation may reduce dimensions
    only when the v1 PNG is too large for the provider request.
    """

    legacy = canonicalize_supplier_search_image(source_path, output_dir)
    canonical = Path(str(legacy["canonicalPath"])).read_bytes()

    while len(canonical) > PROVIDER_MAX_DECODED_BYTES:
        with Image.open(BytesIO(canonical)) as opened:
            opened.load()
            current = opened.convert("RGB")
        width, height = current.size
        if width <= 1 and height <= 1:
            raise ValueError("supplier image cannot fit the provider payload limit")
        scale = min(
            0.95,
            math.sqrt(PROVIDER_MAX_DECODED_BYTES / len(canonical)) * 0.98,
        )
        next_width = max(1, min(width - 1 if width > 1 else 1, int(width * scale)))
        next_height = max(
            1, min(height - 1 if height > 1 else 1, int(height * scale))
        )
        resized = current.resize(
            (next_width, next_height),
            Image.Resampling.LANCZOS,
        )
        buffer = BytesIO()
        resized.save(buffer, format="PNG", optimize=False, compress_level=9)
        canonical = buffer.getvalue()

    canonical_sha256 = _sha256(canonical)
    destination_dir = Path(output_dir)
    destination_dir.mkdir(parents=True, exist_ok=True)
    destination = destination_dir / f"{canonical_sha256}.png"
    if not destination.exists():
        destination.write_bytes(canonical)

    with Image.open(BytesIO(canonical)) as final_image:
        final_image.load()
        final_rgb = final_image.convert("RGB")
        width, height = final_rgb.size
        retrieval_hash = _retrieval_dhash64(final_rgb)

    return {
        "canonicalizationVersion": PROVIDER_PAYLOAD_CANONICALIZATION_VERSION,
        "sourceOriginalSha256": legacy["sourceOriginalSha256"],
        "sourceCanonicalSha256": canonical_sha256,
        "canonicalPath": str(destination),
        "decodedSizeBytes": len(canonical),
        "payloadMimeType": "image/png",
        "width": width,
        "height": height,
        "retrievalHashAlgorithm": "DHASH64",
        "retrievalHash": retrieval_hash,
        "retrievalOnly": True,
    }
