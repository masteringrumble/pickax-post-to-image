#!/usr/bin/env python3
"""Generate toolbar/store icons for the Pickax Post to Image extension.

Design: dark-navy rounded square (matches the tool's card color) with a
white "image" glyph (sun + mountains) and a small orange download arrow.
"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "icons")
os.makedirs(OUT, exist_ok=True)

BG = (37, 45, 66, 255)      # #252d42 — the tool's card background
GLYPH = (255, 255, 255, 255)
ACCENT = (255, 171, 64, 255)  # warm orange arrow


def draw_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(size * 0.22)
    # rounded-square background
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=BG)

    m = size / 128.0  # master coordinates are 128-based
    # picture frame: sun + mountains, in white
    # sun
    d.ellipse([34 * m, 30 * m, 50 * m, 46 * m], fill=GLYPH)
    # mountains (two triangles)
    d.polygon(
        [(24 * m, 88 * m), (52 * m, 52 * m), (80 * m, 88 * m)], fill=GLYPH
    )
    d.polygon(
        [(58 * m, 88 * m), (84 * m, 56 * m), (106 * m, 88 * m)],
        fill=(200, 208, 226, 255),
    )
    # frame border
    d.rounded_rectangle(
        [20 * m, 22 * m, 108 * m, 92 * m], radius=10 * m, outline=GLYPH, width=max(2, int(5 * m))
    )
    # orange down-arrow badge, bottom-right
    cx, cy, rad = 96 * m, 92 * m, 22 * m
    d.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], fill=ACCENT)
    d.ellipse(
        [cx - rad, cy - rad, cx + rad, cy + rad],
        outline=(255, 255, 255, 255),
        width=max(2, int(4 * m)),
    )
    aw = 5 * m
    # shaft
    d.rectangle([cx - aw / 2, cy - 11 * m, cx + aw / 2, cy + 3 * m], fill=(37, 45, 66, 255))
    # head
    d.polygon(
        [(cx - 9 * m, cy + 1 * m), (cx + 9 * m, cy + 1 * m), (cx, cy + 11 * m)],
        fill=(37, 45, 66, 255),
    )
    return img


for size in (16, 32, 48, 128):
    draw_icon(size).save(os.path.join(OUT, f"icon-{size}.png"))
    print("wrote", os.path.join(OUT, f"icon-{size}.png"))
