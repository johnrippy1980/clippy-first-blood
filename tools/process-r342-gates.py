#!/usr/bin/env python3
"""R342: process painted boss-lair gate sprites.

  gate_vine_raw   → lair_gate_vine.png    (jungle outdoor)
  gate_lava_raw   → lair_gate_lava.png    (founder outdoor)
  gate_server_raw → lair_gate_server.png  (server room indoor)
  gate_data_raw   → lair_gate_data.png    (cloud outdoor sky)

All have a checkerboard transparency background that needs knockout.
Target size: 32 wide × ~120 tall (game arena height ~108 px).
"""
import os
from PIL import Image

STAGING = '/tmp/r342-staging'
OUT = '/Users/jrippy/clippy-first-blood/assets/sprites'

TARGET_W = 32


def is_bg_light(r, g, b, thresh_lo=160):
    if r < thresh_lo or g < thresh_lo or b < thresh_lo:
        return False
    if max(r, g, b) - min(r, g, b) > 20:
        return False
    return True


def is_bg_dark(r, g, b, thresh=50):
    if r >= thresh or g >= thresh or b >= thresh:
        return False
    if max(r, g, b) - min(r, g, b) > 10:
        return False
    return True


def knockout(im, mode='light'):
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    visited = bytearray(w * h)
    stack = []
    test = (lambda r, g, b: is_bg_light(r, g, b)) if mode == 'light' \
           else (lambda r, g, b: is_bg_dark(r, g, b))
    for cx, cy in [(0, 0), (w-1, 0), (0, h-1), (w-1, h-1)]:
        r, g, b, _ = px[cx, cy]
        if test(r, g, b):
            stack.append((cx, cy))
    while stack:
        x, y = stack.pop()
        idx = y * w + x
        if visited[idx]:
            continue
        visited[idx] = 1
        r, g, b, _ = px[x, y]
        if not test(r, g, b):
            continue
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in [(x-1, y), (x+1, y), (x, y-1), (x, y+1)]:
            if 0 <= nx < w and 0 <= ny < h and not visited[ny * w + nx]:
                stack.append((nx, ny))
    return im


def crop_to_content(im):
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def downscale_to_w(im, target_w):
    w, h = im.size
    scale = target_w / w
    return im.resize((target_w, max(1, int(round(h * scale)))), Image.LANCZOS)


def post_alpha_threshold(im, alpha_thresh=128):
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < alpha_thresh:
                px[x, y] = (0, 0, 0, 0)
    return im


def process(raw, out_name, mode='light', target_w=TARGET_W):
    src = os.path.join(STAGING, raw)
    if not os.path.exists(src):
        print(f'  SKIP {raw}: not downloaded')
        return
    im = Image.open(src).convert('RGBA')
    im = knockout(im, mode=mode)
    im = crop_to_content(im)
    im = downscale_to_w(im, target_w)
    im = post_alpha_threshold(im, alpha_thresh=128)
    im = crop_to_content(im)
    out = os.path.join(OUT, out_name)
    im.save(out)
    print(f'  {out}: {im.size}')


if __name__ == '__main__':
    print('=== R342 — painted boss-lair gates ===')
    # Vine gate has DARK checker BG, the rest also dark (the visible
    # gate art fills the whole vertical strip).
    process('gate_vine_raw.jpg',   'lair_gate_vine.png',   mode='dark')
    process('gate_lava_raw.jpg',   'lair_gate_lava.png',   mode='dark')
    process('gate_server_raw.jpg', 'lair_gate_server.png', mode='dark')
    process('gate_data_raw.jpg',   'lair_gate_data.png',   mode='dark')
    print('Done.')
