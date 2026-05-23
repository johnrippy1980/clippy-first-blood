#!/usr/bin/env python3
"""R317: process gemini-pro painted pickup icons.

For each pickup:
1. JPEG → RGBA
2. BFS-flood near-black corners → alpha 0 (knock out background)
3. Crop to content
4. Downscale to 12x12 (Pickup.w=Pickup.h=12 in pickups.js)

Output: assets/sprites/pickup_<name>.png
"""
import os
from PIL import Image

STAGING = '/tmp/r317-staging'
OUT_DIR = '/Users/jrippy/clippy-first-blood/assets/sprites'

TARGET = 12  # matches Pickup w/h


def is_bg(r, g, b, thresh=42):
    return r < thresh and g < thresh and b < thresh


def knockout(im, thresh=42):
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    visited = bytearray(w * h)
    stack = []
    for cx, cy in [(0, 0), (w-1, 0), (0, h-1), (w-1, h-1)]:
        r, g, b, _ = px[cx, cy]
        if is_bg(r, g, b, thresh):
            stack.append((cx, cy))
    while stack:
        x, y = stack.pop()
        idx = y * w + x
        if visited[idx]:
            continue
        visited[idx] = 1
        r, g, b, _ = px[x, y]
        if not is_bg(r, g, b, thresh):
            continue
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in [(x-1, y), (x+1, y), (x, y-1), (x, y+1)]:
            if 0 <= nx < w and 0 <= ny < h and not visited[ny * w + nx]:
                stack.append((nx, ny))
    return im


def crop_to_content(im):
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def fit_square(im, size):
    """Letterbox the cropped content into a transparent square then resize."""
    w, h = im.size
    side = max(w, h)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.paste(im, ((side - w) // 2, (side - h) // 2))
    return sq.resize((size, size), Image.LANCZOS)


def process(raw, out_name, thresh=42):
    src = os.path.join(STAGING, raw)
    if not os.path.exists(src):
        print(f'  SKIP {raw}: not downloaded')
        return
    im = Image.open(src).convert('RGBA')
    im = knockout(im, thresh=thresh)
    im = crop_to_content(im)
    im = fit_square(im, TARGET)
    out = os.path.join(OUT_DIR, out_name)
    im.save(out)
    print(f'  {out}: {im.size}')


if __name__ == '__main__':
    print('=== R317 — painted pickup icons ===')
    process('medkit_raw.jpg',    'pickup_life.png',     thresh=42)
    process('bomb_raw.jpg',      'pickup_grenade.png',  thresh=48)
    process('paperclip_raw.jpg', 'pickup_1up.png',      thresh=48)
    process('chainsaw_raw.jpg',  'pickup_chainsaw.png', thresh=42)
    print('=== R319 — painted weapon pickup icons ===')
    process('mg_raw.jpg',        'pickup_mg.png',       thresh=42)
    process('spread_raw.jpg',    'pickup_spread.png',   thresh=42)
    process('laser_raw.jpg',     'pickup_laser.png',    thresh=42)
    process('flame_raw.jpg',     'pickup_flame.png',    thresh=42)
    process('homing_raw.jpg',    'pickup_homing.png',   thresh=42)
    process('thunder_raw.jpg',   'pickup_thunder.png',  thresh=42)
    process('shotgun_raw.jpg',   'pickup_shotgun.png',  thresh=42)
    print('Done.')
