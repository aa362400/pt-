import hashlib
import random
from pathlib import Path

import pytest
from PIL import Image, PngImagePlugin

from web.services.supplier_image_evidence import (
    PROVIDER_MAX_DECODED_BYTES,
    canonicalize_supplier_search_image,
    prepare_supplier_image_search_payload,
)


def test_canonical_image_hash_ignores_png_metadata(tmp_path):
    plain = tmp_path / "plain.png"
    tagged = tmp_path / "tagged.png"
    image = Image.new("RGB", (40, 20), (120, 80, 40))
    image.save(plain)
    metadata = PngImagePlugin.PngInfo()
    metadata.add_text("private-note", "must-not-affect-canonical-image")
    image.save(tagged, pnginfo=metadata)

    plain_result = canonicalize_supplier_search_image(plain, tmp_path / "out")
    tagged_result = canonicalize_supplier_search_image(tagged, tmp_path / "out")

    assert plain_result["sourceOriginalSha256"] != tagged_result["sourceOriginalSha256"]
    assert plain_result["sourceCanonicalSha256"] == tagged_result["sourceCanonicalSha256"]
    assert plain_result["canonicalizationVersion"] == "supplier-image-canonical/v1"
    assert plain_result["retrievalHashAlgorithm"] == "DHASH64"
    assert len(plain_result["retrievalHash"]) == 16


def test_canonical_image_has_deterministic_rgb_png_bytes(tmp_path):
    source = tmp_path / "transparent.png"
    image = Image.new("RGBA", (1600, 800), (255, 0, 0, 128))
    image.save(source)

    first = canonicalize_supplier_search_image(source, tmp_path / "first")
    second = canonicalize_supplier_search_image(source, tmp_path / "second")

    assert first["sourceCanonicalSha256"] == second["sourceCanonicalSha256"]
    output = Path(first["canonicalPath"])
    assert hashlib.sha256(output.read_bytes()).hexdigest() == first["sourceCanonicalSha256"]
    with Image.open(output) as canonical:
        assert canonical.mode == "RGB"
        assert max(canonical.size) == 1024
        assert canonical.format == "PNG"


@pytest.mark.parametrize("name", ["missing.png", "not-an-image.txt"])
def test_canonical_image_rejects_missing_or_invalid_files(tmp_path, name):
    source = tmp_path / name
    if name.endswith(".txt"):
        source.write_text("not an image", encoding="utf-8")

    with pytest.raises(ValueError):
        canonicalize_supplier_search_image(source, tmp_path / "out")


def test_provider_payload_v2_is_deterministic_and_never_exceeds_3mb(tmp_path):
    source = tmp_path / "high-entropy.png"
    pixels = random.Random(1688).randbytes(1024 * 1024 * 3)
    Image.frombytes("RGB", (1024, 1024), pixels).save(source, compress_level=0)

    first = prepare_supplier_image_search_payload(source, tmp_path / "first")
    second = prepare_supplier_image_search_payload(source, tmp_path / "second")

    assert first["canonicalizationVersion"] == "supplier-image-search-payload/v2"
    assert first["sourceCanonicalSha256"] == second["sourceCanonicalSha256"]
    assert first["decodedSizeBytes"] <= PROVIDER_MAX_DECODED_BYTES
    assert Path(first["canonicalPath"]).stat().st_size == first["decodedSizeBytes"]


def test_provider_payload_v2_does_not_change_legacy_v1_hash_semantics(tmp_path):
    source = tmp_path / "simple.png"
    Image.new("RGB", (80, 40), (10, 20, 30)).save(source)

    legacy_before = canonicalize_supplier_search_image(source, tmp_path / "legacy-a")
    prepared = prepare_supplier_image_search_payload(source, tmp_path / "provider")
    legacy_after = canonicalize_supplier_search_image(source, tmp_path / "legacy-b")

    assert legacy_before["canonicalizationVersion"] == "supplier-image-canonical/v1"
    assert legacy_before["sourceCanonicalSha256"] == legacy_after["sourceCanonicalSha256"]
    assert prepared["canonicalizationVersion"] != legacy_before["canonicalizationVersion"]
