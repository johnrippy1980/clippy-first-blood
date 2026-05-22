#!/usr/bin/env python3
"""R281: slice Ballmer cinematic + boss-sprite assets for the
office→arena confrontation arc.

  1. ballmer_v2_raw.png        → boss_ballmer_fps.png (32×56, overwrites)
  2. card_ballmer_office_raw   → card_ballmer_office.png (512w backdrop)
  3. card_ballmer_escapes_raw  → card_ballmer_escapes.png (512w backdrop)
  4. card_ballmer_arena_raw    → card_ballmer_arena.png (512w backdrop)

Cards: full backdrops — downscale only, no BFS knockout. Boss sprite:
BFS-flood near-black corners → alpha, crop to content bbox, LANCZOS
downscale to 56px tall.
"""
import os
from PIL import Image

STAGING = '/tmp/r281-staging'
OUT     = '/Users/jrippy/clippy-first-blood/assets/sprites'
OUT_SCENES = '/Users/jrippy/clippy-first-blood/assets/scenes'


def knockout_black_bg(im, thresh=24):
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()

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


def downscale_to_w(im, target_w):
    w, h = im.size
    scale = target_w / w
    return im.resize((target_w, max(1, int(round(h * scale)))), Image.LANCZOS)


def process_ballmer_sprite():
    src = os.path.join(STAGING, 'ballmer_v2_raw.png')
    im = Image.open(src).convert('RGBA')
    im = knockout_black_bg(im, thresh=24)
    im = crop_to_content(im)
    im = downscale_to_h(im, 56)
    out = os.path.join(OUT, 'boss_ballmer_fps.png')
    im.save(out)
    print(f'  {out}: {im.size}')


def process_card(raw_name, out_name):
    """Story cards live in assets/scenes/ (loaded via SCENE_MANIFEST)."""
    src = os.path.join(STAGING, raw_name)
    im = Image.open(src).convert('RGBA')
    im = downscale_to_w(im, 512)
    out = os.path.join(OUT_SCENES, out_name)
    im.save(out)
    print(f'  {out}: {im.size}')


if __name__ == '__main__':
    print('=== R281 — Ballmer cinematic assets ===')
    process_ballmer_sprite()
    process_card('card_ballmer_office_raw.png',  'card_ballmer_office.png')
    process_card('card_ballmer_escapes_raw.png', 'card_ballmer_escapes.png')
    process_card('card_ballmer_arena_raw.png',   'card_ballmer_arena.png')
    print('Done.')
