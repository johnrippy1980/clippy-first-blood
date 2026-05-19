#!/usr/bin/env python3
"""Process newly-downloaded painted sprites from Local Howl. Same pipeline
as process-v2-sprites.py but keyed to BLACK background (the gpt-image-2
alpha-key convention) instead of white. BFS-flood from corners through
near-black pixels, leaving interior dark areas alone (e.g. boss machinery
shadows).

Reads from the existing painted files on disk, writes back in place. Each
job specifies target height — Clippy poses match the 56px existing v2_*.png
height, bosses go 96px, grunts skip for now (the gallery alts didn't read
well even at the right size; r97 reverted that round).
"""

import os
import sys
from PIL import Image

SPRITES = '/Users/jrippy/clippy-first-blood/assets/sprites'

# (filename, target_height)
JOBS = [
    # Painted Clippy poses (1024x1024 sources, downscale to match existing v2_*.png at 56h)
    ('v2_backdash.png',       56),
    ('v2_hurt2.png',          56),
    ('v2_spin_1.png',         56),
    ('v2_spin_2.png',         56),
    ('v2_aim_diag_up.png',    56),
    ('v2_aim_diag_down.png',  56),
    ('v2_jump_aim.png',       56),
    ('v2_run_5.png',          56),
    ('v2_run_shoot.png',      56),
    ('v2_prone_crawl.png',    24),  # prone is shorter; matches v2_prone.png height
    # Painted bosses — 96 to roughly match the 60-65 original hitbox size with
    # a bit of head/limb overhead. Hitbox stays the same; this just makes the
    # painted detail readable. The current _painted.png files have lost alpha
    # via sips, so we re-process from the original (which is the file we wrote
    # last round — it's a 96x96 RGB-only sips downscale of the 1024 source).
    # We'll regenerate from disk by treating black as the chroma-key. If the
    # black bg was lost in sips downscale, this is a no-op pass; we'd need to
    # re-download the 1024 source. So this script handles BOTH: it'll work on
    # the disk file if its corners are near-black, and skip otherwise.
    ('boss_copier_painted.png',    96),
    ('boss_shredder_painted.png',  96),
    ('boss_bsod_painted.png',      96),
    ('boss_ballmer_painted.png',   96),
    ('boss_founder_painted.png',   96),
    ('boss_clippy2_painted.png',   96),
    ('boss_algorithm_painted.png', 96),
]


def knockout_black_bg(im):
    """BFS-flood near-black from the four corners. Skip if corners are
    already alpha (some inputs may be pre-keyed)."""
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    corner_alphas = [px[0,0][3], px[w-1,0][3], px[0,h-1][3], px[w-1,h-1][3]]
    if min(corner_alphas) < 16:
        return im
    # Threshold: pixels with R,G,B all <= 32 count as background.
    THRESH = 32
    def is_black(r, g, b):
        return r <= THRESH and g <= THRESH and b <= THRESH
    visited = bytearray(w * h)
    stack = []
    for cx, cy in [(0,0),(w-1,0),(0,h-1),(w-1,h-1)]:
        r, g, b, _ = px[cx, cy]
        if is_black(r, g, b):
            stack.append((cx, cy))
    if not stack:
        # No corner is black — give up, leave the image alone
        return im
    while stack:
        x, y = stack.pop()
        idx = y * w + x
        if visited[idx]:
            continue
        visited[idx] = 1
        r, g, b, _ = px[x, y]
        if not is_black(r, g, b):
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
    return im.resize((tw, target_h), Image.LANCZOS)


def main():
    n_written = 0
    n_missing = 0
    n_skipped = 0
    for fname, target_h in JOBS:
        path = os.path.join(SPRITES, fname)
        if not os.path.exists(path):
            n_missing += 1
            print(f'  MISSING {fname}')
            continue
        im = Image.open(path)
        before = im.size
        im = knockout_black_bg(im)
        im = crop_to_content(im)
        if im.size[1] == before[1]:
            # No content beyond a 1-pixel border? skip
            n_skipped += 1
            print(f'  SKIP {fname}  (no black bg found, leaving as-is)')
            continue
        im = downscale(im, target_h)
        im.save(path, 'PNG', optimize=True)
        n_written += 1
        print(f'  {fname}  ({before[0]}x{before[1]})  ->  ({im.size[0]}x{im.size[1]})')
    print(f'\nWrote {n_written}, skipped {n_skipped}, missing {n_missing}.')


if __name__ == '__main__':
    main()
