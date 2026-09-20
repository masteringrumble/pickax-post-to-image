#!/usr/bin/env python3
"""Generate the 1200x630 social sharing image for Pickax Post to Image."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1200, 630
BG = (12, 16, 29)
BLUE = (62, 177, 249)
MUTED = (184, 197, 224)
WHITE = (255, 255, 255)
CARD = (28, 36, 52)
CARD_BORDER = (51, 61, 82)
BAR = (70, 82, 108)

F = "/tmp/fonts/"
poppins_b = ImageFont.truetype(F + "Poppins-Bold.ttf", 64)
poppins_sb = ImageFont.truetype(F + "Poppins-Bold.ttf", 22)
mulish = ImageFont.truetype(F + "Mulish-Regular.ttf", 28)
mulish_b = ImageFont.truetype(F + "Mulish-Bold.ttf", 24)

im = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(im)

# --- soft blue glow, top-left ---
glow = Image.new("RGB", (W, H), (0, 0, 0))
gd = ImageDraw.Draw(glow)
gd.ellipse([-350, -350, 650, 450], fill=(20, 90, 160))
glow = glow.filter(ImageFilter.GaussianBlur(120))
im = Image.blend(im, Image.new("RGB", (W, H), BG), 0.0)
im = Image.fromarray(
    __import__("numpy").clip(
        __import__("numpy").array(im).astype(int)
        + __import__("numpy").array(glow).astype(int) * 0.55,
        0, 255,
    ).astype("uint8")
)
d = ImageDraw.Draw(im)

# --- brand row ---
mx, my, ms = 80, 84, 46
d.rounded_rectangle([mx, my, mx + ms, my + ms], radius=12, fill=(0, 131, 245))
# tiny image glyph
d.rounded_rectangle([mx + 11, my + 11, mx + 35, my + 35], radius=5, outline=WHITE, width=3)
d.ellipse([mx + 17, my + 17, mx + 23, my + 23], fill=WHITE)
d.line([(mx + 13, my + 31), (mx + 21, my + 23), (mx + 26, my + 28), (mx + 33, my + 25)],
       fill=WHITE, width=3, joint="curve")
d.text((mx + ms + 18, my + 8), "PICKAX POST TO IMAGE", font=poppins_sb, fill=BLUE)

# --- headline ---
d.text((80, 180), "Any Pickax post.", font=poppins_b, fill=WHITE)
d.text((80, 258), "One clean image.", font=poppins_b, fill=BLUE)

# --- sub ---
d.text((80, 372), "Paste a link. Get a PNG.", font=mulish, fill=MUTED)
d.text((80, 410), "Free, fast, no sign-up.", font=mulish, fill=MUTED)

# --- CTA pill ---
pill = [80, 478, 80 + 280, 478 + 62]
d.rounded_rectangle(pill, radius=31, fill=(0, 131, 245))
t = "Try it now"
bb = d.textbbox((0, 0), t, font=mulish_b)
tw = bb[2] - bb[0]
d.text((pill[0] + (pill[2] - pill[0] - tw) / 2, pill[1] + 14), t, font=mulish_b, fill=WHITE)

# --- post card mock (right side) ---
cx, cy, cw, ch = 730, 115, 390, 400
d.rounded_rectangle([cx, cy, cx + cw, cy + ch], radius=24, fill=CARD, outline=CARD_BORDER, width=2)
# avatar
ax, ay, ar = cx + 44, cy + 52, 26
d.ellipse([ax - ar, ay - ar, ax + ar, ay + ar], fill=(0, 131, 245))
d.ellipse([ax - ar, ay - ar, ax + ar, ay - ar + 20], fill=(0, 196, 245))
# name + handle bars
d.rounded_rectangle([ax + ar + 16, ay - 16, ax + ar + 16 + 170, ay - 2], radius=7, fill=(230, 236, 248))
d.rounded_rectangle([ax + ar + 16, ay + 6, ax + ar + 16 + 120, ay + 16], radius=5, fill=BAR)
# text lines
lx = cx + 44
for i, wdt in enumerate([300, 270, 300, 180]):
    y = cy + 118 + i * 32
    d.rounded_rectangle([lx, y, lx + wdt, y + 14], radius=7, fill=BAR)
# engagement pills
for i in range(3):
    px = cx + 44 + i * 108
    d.rounded_rectangle([px, cy + 292, px + 92, cy + 330], radius=12, fill=(43, 51, 69))
    d.ellipse([px + 14, cy + 302, px + 30, cy + 318], fill=BLUE if i == 0 else BAR)
    d.rounded_rectangle([px + 38, cy + 306, px + 74, cy + 314], radius=4, fill=BAR)

# --- download badge overlapping card corner ---
bx, by, br = cx + cw - 40, cy + ch - 30, 44
d.ellipse([bx - br, by - br, bx + br, by + br], fill=(0, 131, 245), outline=BG, width=6)
# arrow: shaft + head
d.line([(bx, by - 20), (bx, by + 14)], fill=WHITE, width=8, joint="curve")
d.line([(bx - 16, by + 0), (bx, by + 16)], fill=WHITE, width=8, joint="curve")
d.line([(bx + 16, by + 0), (bx, by + 16)], fill=WHITE, width=8, joint="curve")
d.line([(bx - 22, by + 26), (bx + 22, by + 26)], fill=WHITE, width=8)

im.save("/home/hatch/workspace/pickax-post-to-image/public/og-image.png")
print("wrote og-image.png", im.size)
