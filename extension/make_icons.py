#!/usr/bin/env python3
"""Generate toolbar/store icons for the Pickax Post to Image extension.

Design matches the website's light-blue icon (public/favicon.svg):
a blue gradient rounded square (#00c4f5 -> #0083f5) with a white
"image" glyph (frame + sun + mountains).
"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "icons")
os.makedirs(OUT, exist_ok=True)

TOP = (0, 196, 245)    # #00c4f5
BOTTOM = (0, 131, 245)  # #0083f5
WHITE = (255, 255, 255, 255)


def draw_icon(size: int) -> Image.Image:
    # Diagonal gradient, top-left -> bottom-right.
    grad = Image.new("RGBA", (size, size))
    px = grad.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1)) if size > 1 else 0
            r = int(TOP[0] + (BOTTOM[0] - TOP[0]) * t)
            g = int(TOP[1] + (BOTTOM[1] - TOP[1]) * t)
            b = int(TOP[2] + (BOTTOM[2] - TOP[2]) * t)
            px[x, y] = (r, g, b, 255)

    # Rounded-square mask (rx ~ 22%, matching favicon's rx=14/64).
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=int(size * 0.22), fill=255
    )
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    img.paste(grad, (0, 0), mask)

    d = ImageDraw.Draw(img)
    m = size / 64.0  # master coordinates are 64-based (favicon viewBox)
    w = max(1, int(round(4.5 * m)))  # stroke width

    # Picture frame.
    d.rounded_rectangle(
        [14 * m, 14 * m, 50 * m, 50 * m],
        radius=6 * m,
        outline=WHITE,
        width=w,
    )
    # Sun.
    cx, cy, r = 24 * m, 24 * m, 3.2 * m
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=WHITE)
    # Mountains: M16.5 43 L27 32.5 l7 7 l6-6 l7.5 7.5
    pts = [
        (16.5 * m, 43 * m),
        (27 * m, 32.5 * m),
        (34 * m, 39.5 * m),
        (40 * m, 33.5 * m),
        (47.5 * m, 41 * m),
    ]
    d.line(pts, fill=WHITE, width=w, joint="curve")
    return img


for size in (16, 32, 48, 128):
    draw_icon(size).save(os.path.join(OUT, f"icon-{size}.png"))
    print("wrote", os.path.join(OUT, f"icon-{size}.png"))
