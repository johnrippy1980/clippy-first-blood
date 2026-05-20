#!/usr/bin/env python3
"""R152: process the 3 Local Howl ledge-grab Clippy sprites.

Sources have BLACK bg (not white) — adapted knockout walks four corners
treating near-black as transparent. Output goes to assets/sprites/ at the
same ~56px height as the rest of the painted Clippy pose set."""

import os
from PIL import Image

SRC = '/Users/jrippy/clippy-first-blood/_staging/r152'
DST = '/Users/jrippy/clippy-first-blood/assets/sprites'

JOBS = [
    ('ledge_hang_raw.png',    'v2_ledge_hang.png',    56),
    ('ledge_climb_1_raw.png', 'v2_ledge_climb_1.png', 56),
    ('ledge_climb_2_raw.png', 'v2_ledge_climb_2.png', 56),
]


def knockout_black_bg(im):
    """Black-bg variant of the standard knockout. BFS-floods near-black from
    the corners. Tolerant of the painted style's faint dust-particle noise
    near the sprite edges."""
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    corner_alphas = [px[0, 0][3], px[w-1, 0][3], px[0, h-1][3], px[w-1, h-1][3]]
    if min(corner_alphas) < 16:
        return im
    THRESH = 28  # any channel above this isn't "black bg"

    def is_bg(r, g, b):
        return r < THRESH and g < THRESH and b < THRESH

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
