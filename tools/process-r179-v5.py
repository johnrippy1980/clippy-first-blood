#!/usr/bin/env python3
"""R179: process v5 Clippy sprites — full character with face + curl + boots.

Mirrors process-r155-sprites.py / process-r175-sprites.py pipeline:
- BFS-flood near-black corners to alpha
- Crop to content bbox
- LANCZOS downscale to target height (56px to match the live anchor math)

Sources in _staging/r178; output to assets/sprites/v5_*.png.
"""
import os
from PIL import Image

SRC = '/Users/jrippy/clippy-first-blood/_staging/r178'
DST = '/Users/jrippy/clippy-first-blood/assets/sprites'

JOBS = [
    ('v5_idle_raw.png', 'v5_idle.png', 56),
    ('v5_run_raw.png',  'v5_run.png',  56),
    ('v5_jump_raw.png', 'v5_jump.png', 56),
]


def knockout_black_bg(im, thresh=28):
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    corner_alphas = [px[0, 0][3], px[w-1, 0][3], px[0, h-1][3], px[w-1, h-1][3]]
    if min(corner_alphas) < 16:
        return im

    def is_bg(r, g, b):
        return r < thresh and g < thresh and b < thresh

    visited = bytearray(w * h)
    stack = []
    for cx, cy in [(0, 0), (w-1, 0), (0, h-1), (w-1, h-1)]:
        r, g, b, _ = px[cx, cy]
        if is_bg(r, g, b):
            stack.append((cx, cy))
    while stack:
        x, y = stack.pop()
        idx = y * w + x
        if visited[idx]:
            continue
        visited[idx] = 1
        r, g, b, _ = px[x, y]
        if not is_bg(r, g, b):
            continue
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x+1, y), (x-1, y), (x, y+1), (x, y-1)):
            if 0 <= nx < w and 0 <= ny < h and not visited[ny*w + nx]:
                stack.append((nx, ny))
    return im


def crop_to_content(im):
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def downscale(im, target_h):
    w, h = im.size
    if h == target_h:
        return im
    ratio = target_h / h
    tw = max(1, int(round(w * ratio)))
    return im.resize((tw, target_h), Image.LANCZOS)


def main():
    for src, dst, h in JOBS:
        p = os.path.join(SRC, src)
        if not os.path.exists(p):
            print(f'  MISSING {src}')
            continue
        im = Image.open(p)
        im = knockout_black_bg(im)
        im = crop_to_content(im)
        im = downscale(im, h)
        out = os.path.join(DST, dst)
        im.save(out, 'PNG', optimize=True)
        print(f'  {src}  ->  {dst}  ({im.size[0]}x{im.size[1]})')


if __name__ == '__main__':
    main()
