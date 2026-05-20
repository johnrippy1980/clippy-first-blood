#!/usr/bin/env python3
"""R155: process clean Clippy poses + separate weapon sprites.

Sources have BLACK bg (per the prompts). BFS-flood from corners. Downscale
to game resolution. Output to assets/sprites/.

Clippy poses target 56px tall (matches existing v2_* set). Weapons target
small painted-pixel heights — each is anchored to fit on Clippy's hand and
overlay correctly. Weapon sprite center sits at Clippy's chest level when
composited.
"""
import os
from PIL import Image

SRC = '/Users/jrippy/clippy-first-blood/_staging/r155'
DST = '/Users/jrippy/clippy-first-blood/assets/sprites'

# (src_basename, dst_filename, target_height)
JOBS = [
    # Clean Clippy poses — replace v2_idle / v2_run / v2_jump with weaponless
    # variants. Same 56px height as the rest of the set so the live anchor
    # logic keeps working unchanged.
    ('v3_idle_raw.png',           'v3_idle.png',           56),
    ('v3_run_raw.png',            'v3_run.png',            56),
    ('v3_jump_raw.png',           'v3_jump.png',           56),
    # Weapon overlay sprites. Heights here are SPRITE-IMAGE heights (the
    # actual painted pixels); the game blits them at the hand anchor and
    # rotates around their grip point per aim direction.
    ('weapon_shotgun_raw.png',    'weapon_shotgun.png',    10),
    ('weapon_spread_raw.png',     'weapon_spread.png',     9),
    ('weapon_laser_raw.png',      'weapon_laser.png',      7),
    ('weapon_flame_raw.png',      'weapon_flame.png',      10),
    ('weapon_homing_raw.png',     'weapon_homing.png',     11),
    ('weapon_thunder_raw.png',    'weapon_thunder.png',    11),
    ('weapon_chainsaw_raw.png',   'weapon_chainsaw.png',   10),
    # MG queued separately — appended when ready
]


def knockout_black_bg(im, thresh=28):
    """BFS-flood near-black from all four corners. Tolerates faint painted
    dust/grain near the sprite edges."""
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
