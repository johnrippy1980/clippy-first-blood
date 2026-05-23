#!/usr/bin/env python3
"""R355 — process gpt-image-2 server-room platform candidate to 256x25.

The original plat_serverroom.png was 100% pure white pixels — loaded
fine but rendered as bright featureless bars across stages 3/12/14.
This script slices the new gpt-image-2 candidate to the 256x25 strip
format the level renderer expects.
"""
import sys
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else '/tmp/r355-plat/plat-a.png'
OUT = 'assets/bg/plat_serverroom.png'

im = Image.open(SRC).convert('RGBA')
w, h = im.size
print(f'source: {w}x{h}')

# Find the dense band by scanning rows for non-black pixels.
# The platform strip occupies a horizontal band somewhere in the
# middle of the image; everything above and below is dark bg.
px = im.load()

def row_density(y):
    n = 0
    for x in range(w):
        r, g, b, a = px[x, y]
        if max(r, g, b) > 25:
            n += 1
    return n

# Walk inward from top and bottom to find the band edges.
top = 0
while top < h and row_density(top) < w * 0.05:
    top += 1
bot = h - 1
while bot > top and row_density(bot) < w * 0.05:
    bot -= 1
print(f'detected band: y={top}..{bot}  height={bot - top + 1}')

# Crop to that band, then resize to 256x25.
band = im.crop((0, top, w, bot + 1))
out = band.resize((256, 25), Image.LANCZOS)
out.save(OUT)
print(f'wrote: {OUT}  (256x25)')
