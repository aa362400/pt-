#!/usr/bin/env python3
"""
Wiki english_text

text:
  python wiki/scripts/wiki_update.py --status     # text inbox pendingtext
  python wiki/scripts/wiki_update.py --prepare    # generation Cursor english_text
  python wiki/scripts/wiki_update.py --index      # english_textyes wiki text
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
    print("Wiki english_text — status")
    print("=" * 60)
    print(f"Wiki english_text: {WIKI_ROOT}")
    print(f"Inbox pending: {len(inbox_files)} textfile")
    for f in inbox_files:
        print(f"  [inbox] {f.relative_to(WIKI_ROOT)}")
    print(f"english_text: {len(processed_files)} textfile")
    for f in processed_files[-5:]:
        print(f"  [done] {f.relative_to(WIKI_ROOT)}")
    if len(processed_files) > 5:
        print(f"  ... english_text {len(processed_files) - 5} text")
    print()
    if inbox_files:
        print("english_text: text Cursor english_text")
        print("  english_text: wiki/scripts/wiki_update_prompt.md")
    else:
        print("Inbox text。textsourcetext wiki/sources/inbox/")


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
            "english_text wiki/scripts/wiki_update_prompt.md textflow，"
            "text wiki/sources/inbox/ english_textsource，english_text wiki english_text。"
        ),
    }

    output = WIKI_ROOT / "scripts" / "last_prepare.json"
    output.write_text(json.dumps(context, ensure_ascii=False, indent=2), encoding="utf-8")

    print("=" * 60)
    print("Wiki english_textgeneration")
    print("=" * 60)
    print(json.dumps(context, ensure_ascii=False, indent=2))
    print()
    print(f"textwrite: {output.relative_to(WIKI_ROOT)}")
    print()
    print("text Cursor english_text:")
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
    print(f"Wiki english_text ({len(pages)} text)")
    print("=" * 60)
    for dir_name in sorted(by_dir.keys()):
        print(f"\n[{dir_name}/]")
        for name in sorted(by_dir[dir_name]):
            print(f"   - {name}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Wiki english_text")
    parser.add_argument("--status", action="store_true", help="text inbox status")
    parser.add_argument("--prepare", action="store_true", help="generation Cursor english_text")
    parser.add_argument("--index", action="store_true", help="english_textyes wiki text")
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
