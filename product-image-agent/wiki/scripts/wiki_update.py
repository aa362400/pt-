#!/usr/bin/env python3
"""
Wiki 增量更新辅助脚本

用法:
  python wiki/scripts/wiki_update.py --status     # 查看 inbox 待处理项
  python wiki/scripts/wiki_update.py --prepare    # 生成 Cursor 更新上下文
  python wiki/scripts/wiki_update.py --index      # 列出所有 wiki 页面
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path

WIKI_ROOT = Path(__file__).resolve().parent.parent
INBOX = WIKI_ROOT / "sources" / "inbox"
PROCESSED = WIKI_ROOT / "sources" / "processed"
PROMPT_FILE = WIKI_ROOT / "scripts" / "wiki_update_prompt.md"


def list_md_files(directory: Path) -> list[Path]:
    if not directory.exists():
        return []
    return sorted(directory.rglob("*.md"))


def cmd_status() -> None:
    inbox_files = list_md_files(INBOX)
    processed_files = list_md_files(PROCESSED)

    print("=" * 60)
    print("Wiki 增量更新 — 状态")
    print("=" * 60)
    print(f"Wiki 根目录: {WIKI_ROOT}")
    print(f"Inbox 待处理: {len(inbox_files)} 个文件")
    for f in inbox_files:
        print(f"  [inbox] {f.relative_to(WIKI_ROOT)}")
    print(f"已处理: {len(processed_files)} 个文件")
    for f in processed_files[-5:]:
        print(f"  [done] {f.relative_to(WIKI_ROOT)}")
    if len(processed_files) > 5:
        print(f"  ... 及其他 {len(processed_files) - 5} 个")
    print()
    if inbox_files:
        print("下一步: 在 Cursor 中运行增量更新")
        print("  提示词见: wiki/scripts/wiki_update_prompt.md")
    else:
        print("Inbox 为空。将新来源放入 wiki/sources/inbox/")


def cmd_prepare() -> None:
    inbox_files = list_md_files(INBOX)
    wiki_pages = list_md_files(WIKI_ROOT)
    wiki_pages = [p for p in wiki_pages if "sources" not in p.parts]

    context = {
        "generated_at": datetime.now().isoformat(),
        "wiki_root": str(WIKI_ROOT),
        "inbox_files": [str(f.relative_to(WIKI_ROOT)) for f in inbox_files],
        "wiki_page_count": len(wiki_pages),
        "wiki_pages": [str(p.relative_to(WIKI_ROOT)) for p in wiki_pages],
        "prompt_file": str(PROMPT_FILE.relative_to(WIKI_ROOT)),
        "cursor_instruction": (
            "请按照 wiki/scripts/wiki_update_prompt.md 的流程，"
            "处理 wiki/sources/inbox/ 中的新来源，增量更新 wiki 知识库。"
        ),
    }

    output = WIKI_ROOT / "scripts" / "last_prepare.json"
    output.write_text(json.dumps(context, ensure_ascii=False, indent=2), encoding="utf-8")

    print("=" * 60)
    print("Wiki 更新上下文已生成")
    print("=" * 60)
    print(json.dumps(context, ensure_ascii=False, indent=2))
    print()
    print(f"已写入: {output.relative_to(WIKI_ROOT)}")
    print()
    print("在 Cursor 中粘贴以下指令:")
    print(f"  {context['cursor_instruction']}")


def cmd_index() -> None:
    pages = list_md_files(WIKI_ROOT)
    pages = [p for p in pages if "sources" not in p.parts and p.name != "last_prepare.json"]

    by_dir: dict[str, list[str]] = {}
    for p in pages:
        rel = p.relative_to(WIKI_ROOT)
        dir_name = str(rel.parent) if rel.parent != Path(".") else "(root)"
        by_dir.setdefault(dir_name, []).append(rel.name)

    print("=" * 60)
    print(f"Wiki 页面索引 ({len(pages)} 页)")
    print("=" * 60)
    for dir_name in sorted(by_dir.keys()):
        print(f"\n[{dir_name}/]")
        for name in sorted(by_dir[dir_name]):
            print(f"   - {name}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Wiki 增量更新辅助")
    parser.add_argument("--status", action="store_true", help="查看 inbox 状态")
    parser.add_argument("--prepare", action="store_true", help="生成 Cursor 更新上下文")
    parser.add_argument("--index", action="store_true", help="列出所有 wiki 页面")
    args = parser.parse_args()

    if args.status:
        cmd_status()
    elif args.prepare:
        cmd_prepare()
    elif args.index:
        cmd_index()
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
