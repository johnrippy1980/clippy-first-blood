#!/usr/bin/env python3
"""R301: slice Mecha-Gates super-secret stage assets.

  1. mecha_gates_raw.png       → boss_mecha_gates.png (~48×64, sprites/)
  2. bg_apocalypse_raw.png     → bg_apocalypse.png (512w backdrop, sprites/)
  3. card_mecha_reveal_raw.png → card_mecha_reveal.png (512w card, scenes/)
"""
import os
from PIL import Image

STAGING     = '/tmp/r301-staging'
OUT_SPRITES = '/Users/jrippy/clippy-first-blood/assets/sprites'
OUT_SCENES  = '/Users/jrippy/clippy-first-blood/assets/scenes'


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


def process_mecha_boss():
    src = os.path.join(STAGING, 'mecha_gates_raw.png')
    im = Image.open(src).convert('RGBA')
    im = knockout_black_bg(im, thresh=24)
    im = crop_to_content(im)
    im = downscale_to_h(im, 64)
    out = os.path.join(OUT_SPRITES, 'boss_mecha_gates.png')
    im.save(out)
    print(f'  {out}: {im.size}')


def process_apocalypse_bg():
    src = os.path.join(STAGING, 'bg_apocalypse_raw.png')
    im = Image.open(src).convert('RGBA')
    im = downscale_to_w(im, 512)
    out = os.path.join(OUT_SPRITES, 'bg_apocalypse.png')
    im.save(out)
    print(f'  {out}: {im.size}')


def process_mecha_card():
    src = os.path.join(STAGING, 'card_mecha_reveal_raw.png')
    im = Image.open(src).convert('RGBA')
    im = downscale_to_w(im, 512)
    out = os.path.join(OUT_SCENES, 'card_mecha_reveal.png')
    im.save(out)
    print(f'  {out}: {im.size}')


if __name__ == '__main__':
    print('=== R301 — Mecha-Gates super-secret stage assets ===')
    process_mecha_boss()
    process_apocalypse_bg()
    process_mecha_card()
    print('Done.')
