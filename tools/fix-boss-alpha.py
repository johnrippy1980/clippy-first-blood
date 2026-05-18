#!/usr/bin/env python3
"""Knock out the white checkerboard 'fake transparency' baked into the boss
PNGs. Any near-white opaque pixel becomes transparent. Also chroma-key any
left-over pinks/magentas. Operates in-place on every boss_*.png."""

import os
from PIL import Image

DST = '/Users/jrippy/clippy-first-blood/assets/sprites'

def is_white(r, g, b, thr=222):
    return r >= thr and g >= thr and b >= thr

def is_pink(r, g, b):
    return r > 200 and b > 180 and g < 140

def clean(im):
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    changed = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if is_white(r, g, b) or is_pink(r, g, b):
                px[x, y] = (0, 0, 0, 0)
                changed += 1
    return im, changed

def main():
    bosses = [f for f in os.listdir(DST) if f.startswith('boss_') and f.endswith('.png')]
    for b in sorted(bosses):
        p = os.path.join(DST, b)
        im = Image.open(p)
        cleaned, n = clean(im)
        cleaned.save(p, 'PNG', optimize=True)
        print(f'  {b}: cleared {n} pixels')

if __name__ == '__main__':
    main()
