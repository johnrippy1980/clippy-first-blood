#!/usr/bin/env python3
"""R410: slice the gpt-image-2 fire sprite sheet into 4 individual
PNG frames + downscale the new crater bg.

Input: /tmp/r408_staging/fire_sheet.png  (1536x1024, checker transparent)
       /tmp/r408_staging/bg_apocalypse_crater.png  (1536x1024)

Output: assets/sprites/ambient_fire_{1..4}.png  (24px tall each, alpha)
        assets/bg/bg_apocalypse_crater.png  (768x512)

Algorithm for fire frames:
1. Split source into 4 horizontal columns (1536/4 = 384 px each)
2. For each column: knock out the checker bg (alpha=0 for grays around
   the flame), find tight bbox around remaining flame pixels, crop +
   LANCZOS to 24px tall
3. Save each as a separate file
"""
import os
from PIL import Image

SRC_FIRE = '/tmp/r408_staging/fire_sheet.png'
SRC_BG = '/tmp/r408_staging/bg_apocalypse_crater.png'
OUT_FIRE_DIR = 'assets/sprites'
OUT_BG = 'assets/bg/bg_apocalypse_crater.png'

# === FIRE ===
im = Image.open(SRC_FIRE).convert('RGBA')
W, H = im.size
print(f'fire source: {W}x{H}')

# Knock out the checker. The checker is grey tiles ~ (170-220, 170-220, 170-220)
# with alpha 255. Real flame pixels are warm reds/oranges/yellows.
px = im.load()
for y in range(H):
    for x in range(W):
        r, g, b, a = px[x, y]
        # Warm pixel? Keep. Otherwise knock to transparent.
        # Flame: R dominant, R > 100, R > B + 30
        is_warm = r > 100 and r >= g and r > b + 30
        if not is_warm:
            px[x, y] = (0, 0, 0, 0)

# Split into 4 horizontal columns
col_w = W // 4
TARGET_H = 24
for i in range(4):
    box = (i * col_w, 0, (i + 1) * col_w, H)
    col = im.crop(box)
    # Find tight bbox of opaque pixels
    bbox = col.getbbox()
    if not bbox:
        print(f'frame {i+1}: no opaque pixels, skip')
        continue
    cropped = col.crop(bbox)
    cw, ch = cropped.size
    # Downscale to TARGET_H tall preserving aspect
    scale = TARGET_H / ch
    new_w = max(8, int(round(cw * scale)))
    out = cropped.resize((new_w, TARGET_H), Image.LANCZOS)
    out_path = os.path.join(OUT_FIRE_DIR, f'ambient_fire_{i+1}.png')
    out.save(out_path, 'PNG', optimize=True)
    print(f'wrote {out_path}  ({new_w}x{TARGET_H})')

# === BG ===
bg = Image.open(SRC_BG).convert('RGB')
bgW, bgH = bg.size
print(f'bg source: {bgW}x{bgH}')
TARGET_W = 768
scale = TARGET_W / bgW
new_h = int(round(bgH * scale))
out = bg.resize((TARGET_W, new_h), Image.LANCZOS)
out.save(OUT_BG, 'PNG', optimize=True)
print(f'wrote {OUT_BG}  ({TARGET_W}x{new_h})')
