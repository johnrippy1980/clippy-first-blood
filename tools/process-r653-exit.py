#!/usr/bin/env python3
"""R653: process the painted EXIT doorway sprite (Local Howl / Lift-STL,
gpt-image-2) into a game asset. Knocks out the pure-white studio background
(BFS-flood from the corners through near-white, same as process-r652-lift),
crops to content, and downscales to a fixed pixel HEIGHT so the door rises a
consistent amount above its 16px tile. Writes to assets/bg/ next to the other
tile_* sprites.

The EXIT door is authored ~1 tile wide x ~2.5 tiles tall; we target 30px tall
(~1.9 tiles) so it base-anchors on the EXIT tile and clearly reads as a doorway
poking up above the floor without overwhelming the scene."""

import os
from PIL import Image

SRC = '/Users/jrippy/clippy-first-blood/_reference/genai'
DST = '/Users/jrippy/clippy-first-blood/assets/bg'

# (src_basename, dst_filename, target_h, white_floor)
JOBS = [
    ('exit_door_1.png', 'tile_exit.png', 30, 236),
]


def knockout_bg(im, white_floor=230):
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    corner_alphas = [px[0, 0][3], px[w-1, 0][3], px[0, h-1][3], px[w-1, h-1][3]]
    if min(corner_alphas) < 16:
        return im
    TOL = 22

    def is_white(r, g, b):
        return r >= white_floor and g >= white_floor and b >= white_floor and \
            abs(r - g) < TOL and abs(g - b) < TOL and abs(r - b) < TOL

    visited = bytearray(w * h)
    stack = []
    for cx, cy in [(0, 0), (w-1, 0), (0, h-1), (w-1, h-1)]:
        r, g, b, _ = px[cx, cy]
        if is_white(r, g, b):
            stack.append((cx, cy))
    while stack:
        x, y = stack.pop()
        idx = y * w + x
        if visited[idx]:
            continue
        visited[idx] = 1
        r, g, b, _ = px[x, y]
        if not is_white(r, g, b):
            continue
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x+1, y), (x-1, y), (x, y+1), (x, y-1)):
            if 0 <= nx < w and 0 <= ny < h and not visited[ny*w + nx]:
                stack.append((nx, ny))
    return im


def crop_to_content(im):
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def downscale_h(im, target_h):
    w, h = im.size
    if h == target_h:
        return im
    ratio = target_h / h
    tw = max(1, int(round(w * ratio)))
    return im.resize((tw, target_h), Image.LANCZOS)


def main():
    os.makedirs(DST, exist_ok=True)
    for src, dst, target_h, white_floor in JOBS:
        p = os.path.join(SRC, src)
        if not os.path.exists(p):
            print(f'  MISSING {src}')
            continue
        im = Image.open(p)
        im = knockout_bg(im, white_floor)
        im = crop_to_content(im)
        im = downscale_h(im, target_h)
        out = os.path.join(DST, dst)
        im.save(out, 'PNG', optimize=True)
        print(f'  {src}  ->  {dst}  ({im.size[0]}x{im.size[1]})')


if __name__ == '__main__':
    main()
