#!/usr/bin/env python3
"""R343 + R344: ladder + outdoor cave-cover sprites.

  ladder_raw → tile_ladder.png  (overwrites existing — same name)
  cover_cave_<theme>_raw → cover_<theme>.png  (overwrites existing
    cover_jungle.png, cover_founder.png; adds cover_cloud.png +
    cover_apocalypse.png).
"""
import os
from PIL import Image

LADDER_STAGING = '/tmp/r343-staging'
CAVE_STAGING   = '/tmp/r344-staging'
OUT_SPRITES = '/Users/jrippy/clippy-first-blood/assets/sprites'
OUT_BG      = '/Users/jrippy/clippy-first-blood/assets/bg'


def is_bg_light(r, g, b, thresh_lo=160):
    if r < thresh_lo or g < thresh_lo or b < thresh_lo:
        return False
    if max(r, g, b) - min(r, g, b) > 20:
        return False
    return True


def knockout_light(im, thresh_lo=160):
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    visited = bytearray(w * h)
    stack = []
    for cx, cy in [(0, 0), (w-1, 0), (0, h-1), (w-1, h-1)]:
        r, g, b, _ = px[cx, cy]
        if is_bg_light(r, g, b, thresh_lo):
            stack.append((cx, cy))
    while stack:
        x, y = stack.pop()
        idx = y * w + x
        if visited[idx]:
            continue
        visited[idx] = 1
        r, g, b, _ = px[x, y]
        if not is_bg_light(r, g, b, thresh_lo):
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


def process_ladder():
    src = os.path.join(LADDER_STAGING, 'ladder_raw.jpg')
    if not os.path.exists(src):
        print('  SKIP ladder: missing')
        return
    im = Image.open(src).convert('RGBA')
    im = knockout_light(im)
    im = crop_to_content(im)
    # Target 16 wide (tile width), tall enough to repeat vertically.
    im = downscale_to_w(im, 16)
    im = post_alpha_threshold(im)
    im = crop_to_content(im)
    # tile_ladder.png lives in assets/bg/ (per the existing BG_MANIFEST entry)
    out = os.path.join(OUT_BG, 'tile_ladder.png')
    im.save(out)
    print(f'  {out}: {im.size}')


def process_cave(raw, out_name, target_h=40):
    src = os.path.join(CAVE_STAGING, raw)
    if not os.path.exists(src):
        print(f'  SKIP {raw}: missing')
        return
    im = Image.open(src).convert('RGBA')
    im = knockout_light(im)
    im = crop_to_content(im)
    im = downscale_to_h(im, target_h)
    im = post_alpha_threshold(im)
    im = crop_to_content(im)
    out = os.path.join(OUT_SPRITES, out_name)
    im.save(out)
    print(f'  {out}: {im.size}')


if __name__ == '__main__':
    print('=== R343 — painted ladder ===')
    process_ladder()
    print('\n=== R344 — outdoor-stage cave covers ===')
    # Existing covers (jungle / founder) OVERWRITTEN with cave versions.
    # cloud + apocalypse are new — neither existed before since stages 13
    # + 20/21 didn't have COVER tiles placed.
    process_cave('cover_cave_jungle_raw.jpg',     'cover_jungle.png')
    process_cave('cover_cave_founder_raw.jpg',    'cover_founder.png')
    process_cave('cover_cave_cloud_raw.jpg',      'cover_cloud.png')
    process_cave('cover_cave_apocalypse_raw.jpg', 'cover_apocalypse.png')
    print('Done.')
