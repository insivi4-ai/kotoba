"""Собирает data/dict.json из JMdict (jmdict-simplified).

Источники: https://github.com/scriptin/jmdict-simplified/releases
  - jmdict-rus-*.json         — японско-русские статьи
  - jmdict-eng-*.json         — полный английский: флаги «common» и «uk» (обычно пишется каной)

Запуск:
  python tools/build_dict.py path/to/jmdict-rus.json path/to/jmdict-eng.json

Формат результата — массив записей [кандзи, кана, перевод, флаги]:
  кандзи/кана — варианты через «|», перевод — значения через «; »,
  флаги: 1 — частое слово, 2 — обычно пишется каной, 4 — перевод английский (русского нет).
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "dict.json"

BAD_KANJI_TAGS = {"iK", "io", "oK", "rK", "sK"}
BAD_KANA_TAGS = {"ik", "ok", "rk", "sk"}
JP_OR_LATIN = re.compile(r"[A-Za-z぀-ヿ㐀-鿿～〜【】]")
NUMBERING = re.compile(r"^\s*(\d+[\).]|[а-я]\))\s*:?\s*")


def strip_nested(text, open_ch, close_ch):
    pattern = re.compile(re.escape(open_ch) + r"[^" + re.escape(open_ch + close_ch) + r"]*" + re.escape(close_ch))
    prev = None
    while prev != text:
        prev, text = text, pattern.sub("", text)
    return text


def clean_ru(gloss):
    """Возвращает список коротких значений из одной русской глоссы (или пустой)."""
    text = gloss.strip()
    if text.startswith(("(ср.)", "(см.)", "{", "см.", "ср.")):
        return []
    text = NUMBERING.sub("", text)
    text = strip_nested(text, "(", ")")
    text = strip_nested(text, "{", "}")
    text = strip_nested(text, "[", "]")
    text = re.sub(r"[(\[{][^)\]}]*$", "", text)  # незакрытая скобка — до конца строки
    parts = []
    for chunk in re.split(r"[;,]", text):
        chunk = re.sub(r"\s+", " ", chunk).strip(" .:;,-–—")
        if not chunk or JP_OR_LATIN.search(chunk) or len(chunk) > 40:
            continue
        parts.append(chunk)
    return parts


def clean_en(sense):
    return [g["text"] for g in sense["gloss"] if len(g["text"]) <= 40][:3]


def build_full(groups, limit=110):
    seen, out, total = set(), [], 0
    for parts in groups:
        uniq = [p for p in parts if p.lower() not in seen]
        if not uniq:
            continue
        seen.update(p.lower() for p in uniq)
        piece = ", ".join(uniq[:4])
        if out and total + len(piece) > limit:
            break
        out.append(piece)
        total += len(piece) + 2
    return "; ".join(out)


def forms(items, bad_tags, limit=3):
    good = [k["text"] for k in items if not (set(k.get("tags", [])) & bad_tags)]
    if not good and items:
        good = [items[0]["text"]]
    return good[:limit]


def is_common(word):
    return any(k.get("common") for k in word["kanji"]) or any(k.get("common") for k in word["kana"])


def main(rus_path, eng_path):
    rus = json.loads(Path(rus_path).read_text(encoding="utf-8"))["words"]
    eng = json.loads(Path(eng_path).read_text(encoding="utf-8"))["words"]
    eng_by_id = {w["id"]: w for w in eng}

    entries = []
    rus_ids = set()
    for w in rus:
        groups = [clean_ru(g["text"]) for s in w["sense"] for g in s["gloss"]]
        full = build_full(groups)
        if not full:
            continue
        rus_ids.add(w["id"])
        ew = eng_by_id.get(w["id"])
        flags = 0
        if is_common(ew or w):
            flags |= 1
        if ew and ew["sense"] and "uk" in ew["sense"][0].get("misc", []):
            flags |= 2
        entries.append((w["id"], forms(w["kanji"], BAD_KANJI_TAGS), forms(w["kana"], BAD_KANA_TAGS), full, flags))

    # Частые слова без русского перевода — с английской подсказкой.
    for w in eng:
        if w["id"] in rus_ids or not is_common(w):
            continue
        full = build_full([clean_en(s) for s in w["sense"]], limit=80)
        if not full:
            continue
        flags = 1 | 4
        if w["sense"] and "uk" in w["sense"][0].get("misc", []):
            flags |= 2
        entries.append((w["id"], forms(w["kanji"], BAD_KANJI_TAGS), forms(w["kana"], BAD_KANA_TAGS), full, flags))

    entries.sort(key=lambda e: (-(e[4] & 1), int(e[0])))
    data = [["|".join(k), "|".join(r), full, flags] for _, k, r, full, flags in entries]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    ru = sum(1 for e in data if not e[3] & 4)
    print(f"{len(data)} записей ({ru} с русским переводом) → {OUT} ({OUT.stat().st_size // 1024} КБ)")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
