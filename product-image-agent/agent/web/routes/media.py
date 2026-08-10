"""Generated image and ZIP download routes."""

from __future__ import annotations

import io
import os
import zipfile

from flask import jsonify, request, send_file

from web.services import image_store

# english_text（WebP）english_text；english_textpassednone thumb english_text URL text。
# english_text（DPR 2x/3x）frontendtextrequest 960/1440，text 480px english_text。
THUMB_MAX_EDGE = 480
THUMB_ALLOWED_EDGES = (480, 960, 1440)


def _thumb_edge(raw_value: str) -> int:
    """?thumb= text → english_text；`1`/english_text。"""
    try:
        edge = int(raw_value)
    except (TypeError, ValueError):
        return THUMB_MAX_EDGE
    return edge if edge in THUMB_ALLOWED_EDGES else THUMB_MAX_EDGE


def _thumb_for(output_dir: str, image_path: str, edge: int = THUMB_MAX_EDGE) -> str | None:
    """generation/text WebP english_text；textfailedenglish_text（text None）。"""
    try:
        from PIL import Image

        rel = os.path.relpath(image_path, output_dir)
        name = rel.replace("\\", "/").replace("/", "__") + f".{edge}.webp"
        tpath = os.path.join(output_dir, ".thumbs", name)
        if (os.path.exists(tpath)
                and os.path.getmtime(tpath) >= os.path.getmtime(image_path)):
            return tpath
        os.makedirs(os.path.dirname(tpath), exist_ok=True)
        with Image.open(image_path) as img:
            img = img.convert("RGB")
            img.thumbnail((edge, edge), Image.LANCZOS)
            img.save(tpath, "WEBP", quality=85)
        return tpath
    except Exception:  # noqa: BLE001 — english_textfailedenglish_text
        return None


def register_media_routes(app, sessions: dict, session_output_dir, guess_mime):
    @app.route("/api/image/<session_id>/<path:subpath>")
    def api_image(session_id, subpath):
        """textgenerationtextimage（text layout/raw/ab_test english_text；?thumb=1 text WebP english_text）"""
        output_dir = session_output_dir(session_id)
        if not output_dir or not os.path.isdir(output_dir):
            return jsonify({"error": "english_text"}), 404

        safe = image_store.safe_image_subpath(subpath)
        if safe is None:
            return jsonify({"error": "english_text"}), 400

        image_path = image_store.find_image_path(output_dir, safe)
        if image_path:
            if request.args.get("thumb"):
                edge = _thumb_edge(request.args.get("thumb"))
                thumb = _thumb_for(output_dir, image_path, edge)
                if thumb:
                    return send_file(thumb, mimetype="image/webp")
            return send_file(image_path, mimetype=guess_mime(image_path))

        return jsonify({"error": "imageenglish_text"}), 404

    @app.route("/api/originals/<session_id>")
    def api_originals(session_id):
        """english_text（Before/After english_text）。"""
        output_dir = session_output_dir(session_id)
        originals_dir = os.path.join(output_dir or "", "originals")
        if not output_dir or not os.path.isdir(originals_dir):
            return jsonify({"originals": []})
        files = sorted(
            f for f in os.listdir(originals_dir)
            if f.lower().endswith(image_store.IMAGE_EXTENSIONS))
        return jsonify({"originals": [
            {"name": f, "url": f"/api/image/{session_id}/originals/{f}"}
            for f in files
        ]})

    @app.route("/api/download/<session_id>")
    def api_download(session_id):
        """english_textyesgenerationimage"""
        engine = sessions.get(session_id)
        if not engine:
            return jsonify({"error": "english_text"}), 404

        output_dir = engine.context.get("output_dir", "")
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            for root, dirs, files in os.walk(output_dir):
                dirs[:] = [d for d in dirs if d != ".thumbs"]
                for filename in files:
                    if filename.lower().endswith(image_store.IMAGE_EXTENSIONS):
                        fpath = os.path.join(root, filename)
                        arcname = os.path.relpath(fpath, output_dir)
                        zf.write(fpath, arcname)

        zip_buffer.seek(0)
        return send_file(
            zip_buffer,
            mimetype="application/zip",
            as_attachment=True,
            download_name=f"product_images_{session_id}.zip",
        )
