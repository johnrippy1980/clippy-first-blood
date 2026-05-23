#!/usr/bin/env python3
"""R312: knockout backgrounds + downscale cover-tile sprites.

For each cover prop:
1. Detect background (most images: dark grey checker; serverroom: already alpha)
2. BFS-flood from corners on near-background-color pixels → set alpha to 0
3. Crop to content bounding box
4. Downscale to target height (~40 px tall — fits the 16-tile + ~24 above)

Output: assets/sprites/cover_<theme>.png
"""
import os
from PIL import Image

STAGING = '/tmp/r312-staging'
OUT_DIR = '/Users/jrippy/clippy-first-blood/assets/sprites'

# Target output heights — cover tiles need to extend ~24 px above the
# T=16 tile floor, so total ~40 px tall. Width auto-scales by aspect ratio.
TARGET_H = 40


def is_bg_pixel(r, g, b, thresh=42):
    """Background = dark grey (the checker-pattern void) or near-pure black.
    The checker uses two greys around #1a1a1a / #2a2a2a. Set the threshold
    generous enough to catch both squares of the pattern."""
    return r < thresh and g < thresh and b < thresh


def knockout(im, thresh=42):
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    visited = bytearray(w * h)
    stack = []
    for cx, cy in [(0, 0), (w-1, 0), (0, h-1), (w-1, h-1)]:
        r, g, b, _ = px[cx, cy]
        if is_bg_pixel(r, g, b, thresh):
            stack.append((cx, cy))
    while stack:
        x, y = stack.pop()
        idx = y * w + x
        if visited[idx]:
            continue
        visited[idx] = 1
        r, g, b, _ = px[x, y]
        if not is_bg_pixel(r, g, b, thresh):
            continue
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in [(x-1, y), (x+1, y), (x, y-1), (x, y+1)]:
            if 0 <= nx < w and 0 <= ny < h and not visited[ny * w + nx]:
                stack.append((nx, ny))
    return im


def crop_to_content(im):
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def downscale_to_h(im, target_h):
    w, h = im.size
    scale = target_h / h
    return im.resize((max(1, int(round(w * scale))), target_h), Image.LANCZOS)


def process(raw, out_name, knockout_thresh=42):
    src = os.path.join(STAGING, raw)
    if not os.path.exists(src):
        print(f'  SKIP {raw}: not downloaded')
        return
    im = Image.open(src).convert('RGBA')
    if knockout_thresh > 0:
        im = knockout(im, thresh=knockout_thresh)
    im = crop_to_content(im)
    im = downscale_to_h(im, TARGET_H)
    out = os.path.join(OUT_DIR, out_name)
    im.save(out)
    print(f'  {out}: {im.size}')


if __name__ == '__main__':
    print('=== R312 — cover tile sprites ===')
    # Higher threshold for the dark-checker images so we catch the lighter
    # checker square too. Server-room already has alpha so no knockout.
    process('cover_jungle_raw.png',     'cover_jungle.png',     knockout_thresh=48)
    process('cover_breakroom_raw.png',  'cover_breakroom.png',  knockout_thresh=48)
    process('cover_serverroom_raw.png', 'cover_serverroom.png', knockout_thresh=0)
    process('cover_keynote_raw.png',    'cover_keynote.png',    knockout_thresh=30)
    process('cover_founder_raw.png',    'cover_founder.png',    knockout_thresh=48)
    process('cover_sewer_raw.png',      'cover_sewer.png',      knockout_thresh=48)
    print('Done.')
