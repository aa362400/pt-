"""Generated image and ZIP download routes."""

from __future__ import annotations

import io
import os
import zipfile

from flask import jsonify, request, send_file

from web.services import image_store

# 画廊缩略图（WebP）允许的最长边档位；原图始终通过无 thumb 参数的 URL 获取。
# 高分屏（DPR 2x/3x）前端会请求 960/1440，避免 480px 被拉伸显示发糊。
THUMB_MAX_EDGE = 480
THUMB_ALLOWED_EDGES = (480, 960, 1440)


def _thumb_edge(raw_value: str) -> int:
    """?thumb= 参数 → 缩略边长；`1`/非法值回落默认档。"""
    try:
        edge = int(raw_value)
    except (TypeError, ValueError):
        return THUMB_MAX_EDGE
    return edge if edge in THUMB_ALLOWED_EDGES else THUMB_MAX_EDGE


def _thumb_for(output_dir: str, image_path: str, edge: int = THUMB_MAX_EDGE) -> str | None:
    """生成/复用 WebP 缩略图；任何失败都回退原图（返回 None）。"""
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
    except Exception:  # noqa: BLE001 — 缩略图失败回退原图
        return None


def register_media_routes(app, sessions: dict, session_output_dir, guess_mime):
    @app.route("/api/image/<session_id>/<path:subpath>")
    def api_image(session_id, subpath):
        """返回生成的图片（支持 layout/raw/ab_test 等子路径；?thumb=1 走 WebP 缩略图）"""
        output_dir = session_output_dir(session_id)
        if not output_dir or not os.path.isdir(output_dir):
            return jsonify({"error": "会话不存在"}), 404

        safe = image_store.safe_image_subpath(subpath)
        if safe is None:
            return jsonify({"error": "非法路径"}), 400

        image_path = image_store.find_image_path(output_dir, safe)
        if image_path:
            if request.args.get("thumb"):
                edge = _thumb_edge(request.args.get("thumb"))
                thumb = _thumb_for(output_dir, image_path, edge)
                if thumb:
                    return send_file(thumb, mimetype="image/webp")
            return send_file(image_path, mimetype=guess_mime(image_path))

        return jsonify({"error": "图片不存在"}), 404

    @app.route("/api/originals/<session_id>")
    def api_originals(session_id):
        """列出会话的原始上传图（Before/After 对比用）。"""
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
        """打包下载所有生成图片"""
        engine = sessions.get(session_id)
        if not engine:
            return jsonify({"error": "会话不存在"}), 404

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
