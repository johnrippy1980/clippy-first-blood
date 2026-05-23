#!/usr/bin/env python3
"""R347: process dying-Clippy NPC sprites (stagger + dead).

Replaces the 4-pixel procedural blob in ambient_props.js with painted
art at game-readable scale.
"""
import os
from PIL import Image

STAGING = '/tmp/r347-staging'
OUT = '/Users/jrippy/clippy-first-blood/assets/sprites'


def is_bg_dark(r, g, b, thresh=30):
    if r >= thresh or g >= thresh or b >= thresh:
        return False
    if max(r, g, b) - min(r, g, b) > 8:
        return False
    return True


def knockout(im, thresh=50):
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


def downscale_to_h(im, target_h):
    w, h = im.size
    scale = target_h / h
    return im.resize((max(1, int(round(w * scale))), target_h), Image.LANCZOS)


def post_alpha_threshold(im, alpha_thresh=128):
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < alpha_thresh:
                px[x, y] = (0, 0, 0, 0)
    return im


def process(raw, out_name, target_h):
    src = os.path.join(STAGING, raw)
    if not os.path.exists(src):
        print(f'  SKIP {raw}')
        return
    im = Image.open(src).convert('RGBA')
    im = knockout(im)
    im = crop_to_content(im)
    im = downscale_to_h(im, target_h)
    im = post_alpha_threshold(im)
    im = crop_to_content(im)
    out = os.path.join(OUT, out_name)
    im.save(out)
    print(f'  {out}: {im.size}')


if __name__ == '__main__':
    print('=== R347 — dying-Clippy NPC ===')
    # Stagger: 20 px tall to capture full body
    process('clippy_stagger_raw.jpg', 'clippy_dying_stagger.png', target_h=20)
    # Dead: horizontal — 8 px tall (lying-on-ground silhouette)
    process('clippy_dead_raw.jpg',    'clippy_dying_dead.png',    target_h=8)
    print('Done.')
