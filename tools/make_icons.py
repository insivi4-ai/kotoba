"""Рисует иконки приложения: кремовая «бумага», красный круг, иероглиф 言.

  python tools/make_icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "icons"
FONT = "C:/Windows/Fonts/YuGothB.ttc"

PAPER = (243, 234, 215)
RED = (196, 80, 58)
INK = (74, 64, 54)
WHITE = (255, 250, 240)


def draw_icon(size, safe=1.0, rounded=True):
    scale = 4  # рисуем крупнее и уменьшаем — ровные края
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    radius = int(s * 0.22) if rounded else 0
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=radius, fill=PAPER)
    r = int(s * 0.34 * safe)
    c = s // 2
    d.ellipse([c - r, c - r, c + r, c + r], fill=RED, outline=INK, width=max(2, int(s * 0.012 * safe)))
    font = ImageFont.truetype(FONT, int(s * 0.40 * safe))
    d.text((c, c + int(s * 0.01)), "言", font=font, fill=WHITE, anchor="mm")
    return img.resize((size, size), Image.LANCZOS)


def main():
    OUT.mkdir(exist_ok=True)
    draw_icon(192).save(OUT / "icon-192.png")
    draw_icon(512).save(OUT / "icon-512.png")
    draw_icon(512, safe=0.8, rounded=False).save(OUT / "icon-maskable-512.png")
    # iOS сам скругляет углы — фон на всю площадь.
    draw_icon(180, rounded=False).convert("RGB").save(OUT / "apple-touch-icon.png")
    print("Иконки готовы:", ", ".join(p.name for p in sorted(OUT.glob("*.png"))))


if __name__ == "__main__":
    main()
