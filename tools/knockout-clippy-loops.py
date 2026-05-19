#!/usr/bin/env python3
"""Knock out interior white loops in painted Clippy sprites.

The existing pipeline (process-v2-sprites.py) does an edge-connected flood
fill from the 4 corners, which clears the background outside the character.
But the paperclip loops inside the silhouette are also white/near-white
and stay opaque — so the bg shows through the OUTSIDE of Clippy but the
INSIDE of his loops paints solid.

This pass walks all remaining opaque near-white pixels and clears those
that form contiguous regions smaller than `MAX_LOOP_AREA`. Real interior
white highlights (e.g. on the rifle, on the bandolier) tend to be small
isolated pixels and would also get cleared — but we use the heuristic
"region must be bordered ONLY by non-white pixels of the sprite, never
by the alpha=0 outside" to distinguish interior loops (good targets)
from cosmetic highlights (good targets too, they're rare).

Idempotent: skips any sprite where corners aren't already transparent
(those haven't been through the first pass yet).
"""

import os
import sys
from PIL import Image

SPRITES = '/Users/jrippy/clippy-first-blood/assets/sprites'

# Files to process. Only the painted Clippy poses + bosses where the
# silhouette has visible loops/holes. Skip enemies (no loops in folder /
# stapler / cabinet / hole-punch silhouettes).
JOBS = [
    'v2_idle.png',
    'v2_run.png',
    'v2_run2.png',
    'v2_run_5.png',
    'v2_run_shoot.png',
    'v2_shoot.png',
    'v2_shoot_up.png',
    'v2_jump.png',
    'v2_jump_aim.png',
    'v2_spin_1.png',
    'v2_spin_2.png',
    'v2_aim_diag_up.png',
    'v2_aim_diag_down.png',
    'v2_backdash.png',
    'v2_hurt.png',
    'v2_hurt2.png',
    'v2_prone.png',
    'v2_prone_crawl.png',
    'v2_death.png',
    # Clippy 2.0 boss has paperclip loops too.
    'boss_clippy2_painted.png',
]

# A "near-white" pixel: brightness > 230, all channels within tolerance of each other.
WHITE_BRIGHTNESS = 230
WHITE_TOL = 22
# Max area for a connected interior white region to qualify as a "loop".
# Tuned to be larger than a single highlight pixel but smaller than a
# huge accidental flood — for a 56-tall Clippy sprite, loop holes are
# typically 15-40 pixels.
MAX_LOOP_AREA = 80


def is_near_white(r, g, b):
    return (r >= WHITE_BRIGHTNESS and g >= WHITE_BRIGHTNESS and b >= WHITE_BRIGHTNESS
            and abs(r - g) < WHITE_TOL and abs(g - b) < WHITE_TOL and abs(r - b) < WHITE_TOL)


def knockout_interior(im):
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()

    # Confirm first-pass already ran: corners should be transparent.
    corner_alphas = [px[0, 0][3], px[w - 1, 0][3], px[0, h - 1][3], px[w - 1, h - 1][3]]
    if max(corner_alphas) >= 16:
        return im, 'skipped (corners not transparent — needs first-pass white knockout first)'

    visited = bytearray(w * h)
    cleared = 0

    # BFS over each near-white interior pixel. Collect the connected region.
    # If the region is small enough AND fully bordered by non-transparent
    # non-white pixels (i.e. it's enclosed by the silhouette, not the
    # outside alpha), clear it.
    for sy in range(h):
        for sx in range(w):
            if visited[sy * w + sx]:
                continue
            r, g, b, a = px[sx, sy]
            if a == 0 or not is_near_white(r, g, b):
                visited[sy * w + sx] = 1
                continue

            # Flood-collect this region.
            region = []
            stack = [(sx, sy)]
            touches_alpha = False
            while stack:
                x, y = stack.pop()
                idx = y * w + x
                if visited[idx]:
                    continue
                visited[idx] = 1
                pr, pg, pb, pa = px[x, y]
                if pa == 0:
                    touches_alpha = True
                    continue
                if not is_near_white(pr, pg, pb):
                    continue
                region.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h:
                        stack.append((nx, ny))

            # Knock the region out if it's enclosed (doesn't touch outside
            # alpha) AND small enough to be a loop hole, not a giant
            # missed-bg patch.
            if not touches_alpha and len(region) <= MAX_LOOP_AREA and region:
                for x, y in region:
                    px[x, y] = (0, 0, 0, 0)
                cleared += len(region)

    return im, f'cleared {cleared} interior near-white px'


def main():
    n_done = 0
    n_skip = 0
    for fname in JOBS:
        path = os.path.join(SPRITES, fname)
        if not os.path.exists(path):
            print(f'  MISSING {fname}')
            continue
        im = Image.open(path)
        before = im.size
        im, msg = knockout_interior(im)
        if msg.startswith('skipped'):
            n_skip += 1
            print(f'  {fname:35s} {msg}')
            continue
        im.save(path, 'PNG', optimize=True)
        n_done += 1
        print(f'  {fname:35s} {before} -> {im.size}  {msg}')
    print(f'\nProcessed {n_done}, skipped {n_skip}.')


if __name__ == '__main__':
    main()
