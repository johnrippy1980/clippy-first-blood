#!/usr/bin/env python3
"""R153 asset compression — downscale + optimize the large painted bg / boss
intro plates that are >1MB. Targets:
  assets/bg/bg_*.png   — stage backgrounds drawn at game width 256px
  assets/bg/ground_*.png — same width
  assets/scenes/boss_intros/*.png — drawn full-frame in the cinematic intro

The game renders these scaled down to ~256px wide. A 1024x686 source is
already 4x overkill; the human eye can't tell the difference once it's
downscaled and the canvas has imageSmoothingEnabled=false (or true for the
cinematic with subtle Ken-Burns push-in).

Strategy:
  1. Resize anything wider than 768px down to 768 (keeps detail headroom
     for the Ken-Burns zoom + retina display blits).
  2. Re-save with optimize=True (PIL's PNG optimizer).
  3. Keep PNG (alpha not needed for bg, but lossless preserves the painted
     color depth better than a JPEG conversion would).

Run: python3 tools/compress-bg-plates.py
"""
import os
from PIL import Image

TARGETS = []
for d in ('assets/bg', 'assets/scenes/boss_intros'):
    for f in sorted(os.listdir(d)):
        if f.endswith('.png'):
            TARGETS.append(os.path.join(d, f))

MAX_W = 768

def optimize(path):
    before = os.path.getsize(path)
    im = Image.open(path)
    w, h = im.size
    changed = False
    if w > MAX_W:
        ratio = MAX_W / w
        new_h = int(round(h * ratio))
        im = im.resize((MAX_W, new_h), Image.LANCZOS)
        changed = True
    im.save(path, 'PNG', optimize=True)
    after = os.path.getsize(path)
    pct = (1 - after / before) * 100 if before else 0
    return before, after, pct, changed

if __name__ == '__main__':
    total_b = total_a = 0
    for p in TARGETS:
        b, a, pct, resized = optimize(p)
        total_b += b
        total_a += a
        tag = 'RESIZED' if resized else 'optimize'
        print(f'  {tag:9}  {os.path.basename(p):40}  {b//1024}KB → {a//1024}KB  (-{pct:.0f}%)')
    print(f'\nTotal: {total_b//1024//1024}MB → {total_a//1024//1024}MB  '
          f'(-{(1 - total_a / total_b) * 100:.0f}%)')
