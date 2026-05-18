#!/usr/bin/env python3
"""Process newly-generated v2 sprites: knock out white background, crop to
bbox, downscale to game resolution. Writes to assets/sprites/."""

import os
import sys
from PIL import Image

SRC = '/Users/jrippy/clippy-first-blood/_reference/genai'
DST = '/Users/jrippy/clippy-first-blood/assets/sprites'

# (src_basename, dst_filename, target_height)
# Clippy is 56 px tall — taller than hitbox (22) so he reads as a real character
# against the high-detail painted bg. Anchor remains bottom-center, so the
# extra height just adds head/bandana overhead, no collision impact.
JOBS = [
    ('clippy_idle_v2.png',     'v2_idle.png',         56),
    ('clippy_run_v2.png',      'v2_run.png',          56),
    ('clippy_run2_v2.png',     'v2_run2.png',         56),
    ('clippy_jump_v2.png',     'v2_jump.png',         56),
    ('clippy_shoot_v2.png',    'v2_shoot.png',        56),
    ('clippy_shoot_up_v2.png', 'v2_shoot_up.png',     56),
    ('clippy_prone_v2.png',    'v2_prone.png',        20),
    ('clippy_hurt_v2.png',     'v2_hurt.png',         56),
    ('clippy_death_v2.png',    'v2_death.png',        30),
    # Enemies scaled up too so they don't look like specks next to bigger Clippy
    ('enemy_stapler_v2.png',   'v2_stapler.png',      18),
    ('enemy_folder_v2.png',    'v2_folder.png',       24),
    ('enemy_cabinet_v2.png',   'v2_cabinet.png',      36),
    ('enemy_holepunch_v2.png', 'v2_holepunch.png',    20),
]


def knockout_bg(im):
    """Knock out the studio-white background. If the source already has alpha
    (transparent corners), pass it through unmodified. Otherwise, BFS-flood
    from the four corners through near-white pixels — this leaves interior
    light grey pixels alone (e.g. Clippy's steel-grey body)."""
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    # If corners are already transparent, source is already alpha-keyed.
    corner_alphas = [px[0,0][3], px[w-1,0][3], px[0,h-1][3], px[w-1,h-1][3]]
    if min(corner_alphas) < 16:
        return im
    # Otherwise BFS-flood from each corner. Treat a pixel as "background" iff
    # near-white AND reachable through other near-white pixels from a corner.
    TOL = 22
    def is_white(r, g, b):
        return r >= 230 and g >= 230 and b >= 230 and \
               abs(r - g) < TOL and abs(g - b) < TOL and abs(r - b) < TOL
    visited = bytearray(w * h)
    stack = []
    for cx, cy in [(0,0),(w-1,0),(0,h-1),(w-1,h-1)]:
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
        for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
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
    # LANCZOS preserves painted detail when going from 1024 → ~50px (NEAREST
    # destroys it). Game canvas is rendered with imageSmoothingEnabled=false
    # so the final 3x browser upscale stays crisp.
    return im.resize((tw, target_h), Image.LANCZOS)


def main():
    n_written = 0
    n_missing = 0
    for src, dst, h in JOBS:
        p = os.path.join(SRC, src)
        if not os.path.exists(p):
            n_missing += 1
            print(f'  MISSING {src}')
            continue
        im = Image.open(p)
        im = knockout_bg(im)
        im = crop_to_content(im)
        im = downscale(im, h)
        out = os.path.join(DST, dst)
        im.save(out, 'PNG', optimize=True)
        n_written += 1
        print(f'  {src}  ->  {dst}  ({im.size[0]}x{im.size[1]})')
    print(f'\nWrote {n_written}, missing {n_missing}.')


if __name__ == '__main__':
    main()
