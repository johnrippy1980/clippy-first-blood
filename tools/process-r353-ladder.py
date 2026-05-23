#!/usr/bin/env python3
"""R353 — process gpt-image-2 ladder candidate down to a 16x16 tile.

Pipeline:
  1. Open 1024x1024 source
  2. BFS-flood near-black corners to alpha 0
  3. Crop to content
  4. LANCZOS downscale to 16x16
  5. Post-alpha threshold to snap edges to pixel-perfect
  6. Save to assets/bg/tile_ladder.png
"""
import sys
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else '/tmp/r353-ladder/ladder-a.png'
OUT = 'assets/bg/tile_ladder.png'


def is_bg_dark(r, g, b, thresh=30):
    return max(r, g, b) < thresh


def knockout(im, thresh=40):
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    visited = bytearray(w * h)
    stack = []
    for cx, cy in [(0, 0), (w-1, 0), (0, h-1), (w-1, h-1)]:
        r, g, b, _ = px[cx, cy]
        if is_bg_dark(r, g, b, thresh):
            stack.append((cx, cy))
    while stack:
        x, y = stack.pop()
        idx = y * w + x
        if visited[idx]:
            continue
        visited[idx] = 1
        r, g, b, _ = px[x, y]
        if not is_bg_dark(r, g, b, thresh):
            continue
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in [(x-1, y), (x+1, y), (x, y-1), (x, y+1)]:
            if 0 <= nx < w and 0 <= ny < h and not visited[ny * w + nx]:
                stack.append((nx, ny))
    return im


def crop_to_content(im):
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def post_alpha_threshold(im, alpha_thresh=128):
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < alpha_thresh:
                px[x, y] = (0, 0, 0, 0)
    return im


im = Image.open(SRC).convert('RGBA')
print(f'source: {im.size}')
im = knockout(im)
im = crop_to_content(im)
print(f'cropped: {im.size}')
# Downscale to 16x16 (final tile size). Use LANCZOS for smooth then snap.
im = im.resize((16, 16), Image.LANCZOS)
im = post_alpha_threshold(im)
im.save(OUT)
print(f'wrote: {OUT}  ({im.size})')
