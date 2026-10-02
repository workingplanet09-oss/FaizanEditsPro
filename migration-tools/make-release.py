#!/usr/bin/env python3
"""Builds dist/faizan-ali-website.zip: the contents of public_html, ready to upload to cPanel (File Manager -> Upload -> Extract).
Leaves out runtime files (uploads, logs, temp files, the generated secret key), the generated __pycache__ and editor leftovers, keeps the
empty storage folders and .htaccess, then re-reads the archive: every PHP file is syntax-checked and the must-have files are confirmed.
Developer tool only:  python3 migration-tools/make-release.py"""
import hashlib, os, subprocess, sys, tempfile, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public_html"
OUT = ROOT / "dist"
OUT.mkdir(exist_ok=True)
target = OUT / "faizan-ali-website.zip"

SKIP_PREFIX = ("storage/uploads/", "storage/logs/", "storage/tmp/")
KEEP = {"storage/uploads/.gitkeep", "storage/logs/.gitkeep", "storage/tmp/.gitkeep"}
SKIP_NAMES = {"secret.key", ".DS_Store", "Thumbs.db"}

files = []
for p in sorted(SRC.rglob("*")):
    rel = p.relative_to(SRC).as_posix()
    if p.is_dir() or p.name in SKIP_NAMES or "__pycache__" in rel or rel.endswith((".swp", "~", ".bak")):
        continue
    if rel.startswith(SKIP_PREFIX) and rel not in KEEP:
        continue
    files.append((p, rel))

if target.exists():
    target.unlink()
with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for p, rel in files:
        info = zipfile.ZipInfo.from_file(p, rel)
        info.external_attr = (0o755 if rel.endswith((".sh",)) else 0o644) << 16
        info.date_time = (2026, 1, 1, 0, 0, 0)  # same bytes on every build
        info.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(info, p.read_bytes())

# verify: re-read the archive
problems = []
with zipfile.ZipFile(target) as z:
    bad = z.testzip()
    if bad:
        problems.append("corrupt entry " + bad)
    names = set(z.namelist())
    for need in ("index.php", "config.php", ".htaccess", "database.sql", "database-demo.sql", "favicon.svg", "assets/css/app.css", "assets/js/app.js", "assets/img/faizan-ali.jpg",
                 "app/bootstrap.php", "storage/uploads/.gitkeep"):
        if need not in names:
            problems.append("missing " + need)
    for n in names:
        if n.startswith(("php-tests/", "migration-tools/", "node_modules/")) or n.endswith((".mjs", ".py")):
            problems.append("developer file in the archive: " + n)
    cfg = z.read("config.php").decode()
    if "CHANGE-ME" not in cfg:
        problems.append("config.php no longer holds the CHANGE-ME placeholders")
    with tempfile.TemporaryDirectory() as td:
        z.extractall(td)
        php = [n for n in names if n.endswith(".php")]
        for n in php:
            r = subprocess.run(["php", "-l", os.path.join(td, n)], capture_output=True, text=True)
            if r.returncode != 0:
                problems.append("syntax error in " + n + ": " + r.stdout.strip()[:120])
digest = hashlib.sha256(target.read_bytes()).hexdigest()
print(f"{target.relative_to(ROOT)}: {len(files)} files, {target.stat().st_size / 1e6:.1f} MB, sha256 {digest[:16]}…, {len(php)} PHP files checked with {subprocess.run(['php','-r','echo PHP_VERSION;'],capture_output=True,text=True).stdout}")
if problems:
    print("PROBLEMS:\n  " + "\n  ".join(problems))
    sys.exit(1)
print("ok")
