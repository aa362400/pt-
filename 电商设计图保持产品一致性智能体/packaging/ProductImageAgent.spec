# -*- mode: python ; coding: utf-8 -*-

from __future__ import annotations

import os

from PyInstaller.utils.hooks import collect_submodules


block_cipher = None
spec_root = os.path.abspath(SPECPATH) if "SPECPATH" in globals() else os.getcwd()
project_root = os.path.abspath(os.path.join(spec_root, ".."))
agent_root = os.path.join(project_root, "agent")


def include_tree(src: str, dest: str):
    rows = []
    ignored_dirs = {
        "__pycache__",
        ".pytest_cache",
        "tests",
        "logs",
        "outputs",
        "uploads",
        "sessions",
    }
    ignored_files = set()
    for root, dirs, files in os.walk(src):
        dirs[:] = [d for d in dirs if d not in ignored_dirs]
        for name in files:
            if name in ignored_files or name.endswith((".pyc", ".pyo")):
                continue
            full = os.path.join(root, name)
            rel_dir = os.path.relpath(root, src)
            target = dest if rel_dir == "." else os.path.join(dest, rel_dir)
            rows.append((full, target))
    return rows


datas = include_tree(agent_root, "agent")

hiddenimports = []
for package in (
    "flask",
    "werkzeug",
    "jinja2",
    "click",
    "waitress",
    "PIL",
    "yaml",
    "requests",
    "bs4",
    "soupsieve",
):
    hiddenimports += collect_submodules(package)


a = Analysis(
    [os.path.join(project_root, "packaging", "desktop_launcher.py")],
    pathex=[
        project_root,
        agent_root,
        os.path.join(agent_root, "web"),
        os.path.join(agent_root, "scripts"),
    ],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["pytest", "unittest"],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="ProductImageAgent",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="ProductImageAgent",
)
