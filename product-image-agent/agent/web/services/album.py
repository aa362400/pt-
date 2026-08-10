"""品牌画册 — 把整套成图拼成一页杂志级 HTML 相册，可直接转发给客户/合伙人预览。

纯静态单文件：图片走会话图片 API（同源），无外部依赖、无脚本。
"""

from __future__ import annotations

import html
import json
import os
import time

IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".webp")

_PAGE = """<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title} · 品牌画册</title>
<style>
  :root {{ --ink:#1F1F2A; --sub:#8B8B9A; --accent:#7A67FF; }}
  * {{ margin:0; box-sizing:border-box; }}
  body {{ font-family:-apple-system,'Segoe UI','Noto Sans SC',sans-serif; background:#FAF9F7; color:var(--ink); }}
  .hero {{ position:relative; min-height:62vh; display:flex; align-items:flex-end;
          background:#111 url('{hero}') center/cover no-repeat; }}
  .hero::after {{ content:''; position:absolute; inset:0;
                 background:linear-gradient(180deg,rgba(0,0,0,.05) 30%,rgba(0,0,0,.72)); }}
  .hero-inner {{ position:relative; z-index:1; padding:48px 7vw; color:#fff; }}
  .kicker {{ font-size:13px; letter-spacing:.35em; text-transform:uppercase; opacity:.85; }}
  h1 {{ font-size:clamp(28px,5vw,54px); margin:10px 0 8px; font-weight:800; }}
  .tagline {{ font-size:15.5px; opacity:.92; max-width:560px; line-height:1.7; }}
  .meta {{ margin-top:18px; font-size:12.5px; opacity:.75; }}
  .section {{ padding:56px 7vw; }}
  .section h2 {{ font-size:14px; letter-spacing:.3em; text-transform:uppercase;
                color:var(--sub); margin-bottom:28px; }}
  .grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:26px; }}
  .card {{ background:#fff; border-radius:18px; overflow:hidden;
          box-shadow:0 10px 34px rgba(31,31,42,.09); }}
  .card img {{ width:100%; aspect-ratio:1; object-fit:cover; display:block; }}
  .card .cap {{ padding:14px 18px 16px; }}
  .card .cap b {{ font-size:14.5px; }}
  .card .cap span {{ display:block; margin-top:3px; font-size:12.5px; color:var(--sub); }}
  .points {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:14px; }}
  .points li {{ list-style:none; padding:7px 16px; border-radius:99px;
               background:rgba(255,255,255,.16); backdrop-filter:blur(4px);
               font-size:13px; }}
  footer {{ padding:36px 7vw 48px; color:var(--sub); font-size:12.5px;
           border-top:1px solid #EFEDE8; }}
  footer b {{ color:var(--accent); }}
</style></head><body>
<div class="hero"><div class="hero-inner">
  <div class="kicker">Product Lookbook</div>
  <h1>{title}</h1>
  <div class="tagline">{tagline}</div>
  <ul class="points">{points}</ul>
  <div class="meta">{count} 张商业级产品图 · {date} · AI 出品全程保持产品一致性</div>
</div></div>
<div class="section"><h2>The Collection</h2><div class="grid">{cards}</div></div>
<footer>本画册由 <b>跨境电商 AI 出图 Agent</b> 生成 — 同一产品 · 多场景 · 广告级画质</footer>
</body></html>"""

_CARD = """<div class="card"><img src="{url}" loading="lazy" alt="{name}">
<div class="cap"><b>{name}</b><span>{use}</span></div></div>"""


def _load_json(path: str) -> dict:
    try:
        with open(path, encoding="utf-8-sig") as f:
            return json.load(f)
    except Exception:  # noqa: BLE001 — 档案缺失用兜底文案
        return {}


def build_album(sid: str, out_dir: str, profile: dict | None = None) -> str:
    """生成 album.html 到会话目录，返回文件路径；没有成图时抛 ValueError。"""
    raw_dir = os.path.join(out_dir, "raw")
    files = sorted(
        f for f in (os.listdir(raw_dir) if os.path.isdir(raw_dir) else [])
        if f.lower().endswith(IMAGE_EXTS))
    if not files:
        raise ValueError("本会话还没有生成图，请先出图")

    profile = profile or _load_json(os.path.join(out_dir, "product_profile.json"))
    plan = _load_json(os.path.join(out_dir, "scene_plan.json"))
    scene_names = {}
    for s in plan.get("scenes", []):
        scene_names[s.get("scene_id", "")] = (
            s.get("scene_name") or s.get("scene_name_cn") or "",
            s.get("ecommerce_use", ""),
        )

    title = (profile.get("product_name_cn") or profile.get("product_name")
             or "产品画册")
    points = profile.get("selling_points") or profile.get("key_features") or []
    if isinstance(points, str):
        points = [points]
    tagline = (profile.get("description") or profile.get("style")
               or "一套图，讲完一个产品的故事。")

    cards = []
    for fname in files:
        stem = os.path.splitext(fname)[0]
        name, use = "", ""
        for scene_id, (sname, suse) in scene_names.items():
            if stem.startswith(scene_id):
                name, use = sname, suse
                break
        cards.append(_CARD.format(
            url=f"/api/image/{sid}/raw/{fname}?thumb=960",
            name=html.escape(name or stem),
            use=html.escape(use or "商业级产品图"),
        ))

    page = _PAGE.format(
        title=html.escape(str(title)),
        tagline=html.escape(str(tagline)[:160]),
        points="".join(f"<li>{html.escape(str(p)[:24])}</li>" for p in points[:5]),
        hero=f"/api/image/{sid}/raw/{files[0]}",
        count=len(files),
        date=time.strftime("%Y.%m.%d"),
        cards="".join(cards),
    )
    dst = os.path.join(out_dir, "album.html")
    with open(dst, "w", encoding="utf-8") as f:
        f.write(page)
    return dst
