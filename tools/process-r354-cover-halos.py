#!/usr/bin/env python3
"""R354 — snap cover-sprite alpha to pure 0/255 to kill rim halos.

LANCZOS downscale leaves a soft anti-aliased rim (alpha 1-200) on the
sprite bounding box. Against the darker painted backgrounds in stages
like the jungle, those low-alpha edge pixels read as a faint vertical
rectangle around the cover prop — exactly the "box halo" the user kept
flagging.

Fix: snap any pixel with alpha < 128 to fully transparent. Anything
>= 128 stays as-is.
"""
import os
from PIL import Image

SPRITES = 'assets/sprites'

# Two-zone snap to kill anti-aliased rim halos:
#   alpha < LOW  → 0   (drop faint dust pixels entirely)
#   alpha >= LOW → 255 (promote any partly-visible sprite pixel to opaque)
# 64 catches the lightest stray pixels but keeps anything that was clearly
# part of the sprite body.
LOW = 64

count = 0
for f in sorted(os.listdir(SPRITES)):
    if not f.startswith('cover_') or not f.endswith('.png'):
        continue
    p = os.path.join(SPRITES, f)
    im = Image.open(p).convert('RGBA')
    px = im.load()
    w, h = im.size
    dropped = 0
    promoted = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0 or a == 255:
                continue
            if a < LOW:
                px[x, y] = (0, 0, 0, 0)
                dropped += 1
            else:
                px[x, y] = (r, g, b, 255)
                promoted += 1
    im.save(p)
    print(f'{f:28s} {w}x{h}  dropped={dropped} promoted={promoted}')
    count += 1
print(f'Done. Processed {count} cover sprites.')
