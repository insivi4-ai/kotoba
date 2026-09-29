"""Обновляет в sw.js список файлов для офлайн-кэша и версию (хэш содержимого).

Запускайте перед каждой публикацией, иначе телефон продолжит показывать старую версию:
  python tools/build_sw.py
"""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SW = ROOT / "sw.js"

INCLUDE = ["index.html", "manifest.webmanifest", "css", "js", "vendor", "icons", "starter"]


def collect():
    files = []
    for item in INCLUDE:
        path = ROOT / item
        if path.is_file():
            files.append(path)
        elif path.is_dir():
            files.extend(p for p in sorted(path.rglob("*")) if p.is_file())
    return files


def main():
    files = collect()
    digest = hashlib.sha256()
    for f in files:
        digest.update(f.relative_to(ROOT).as_posix().encode())
        digest.update(f.read_bytes())
    version = digest.hexdigest()[:10]
    assets = ["./"] + [f.relative_to(ROOT).as_posix() for f in files]

    text = SW.read_text(encoding="utf-8")
    text = re.sub(r"const VERSION = '[^']*';", f"const VERSION = '{version}';", text)
    text = re.sub(
        r"const ASSETS = \[.*?\];\n// __ASSETS_END__",
        "const ASSETS = " + json.dumps(assets, ensure_ascii=False, indent=2).replace('"', "'") + ";\n// __ASSETS_END__",
        text,
        flags=re.S,
    )
    SW.write_text(text, encoding="utf-8")
    print(f"sw.js: версия {version}, файлов в кэше: {len(assets)}")


if __name__ == "__main__":
    main()
