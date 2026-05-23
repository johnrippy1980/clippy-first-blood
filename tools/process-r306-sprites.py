#!/usr/bin/env python3
"""R306: slice beat-em-up Mecha Approach assets.

  1. enemies_raw.png         → scavenger.png, drone.png, helicopter.png, brawler.png
  2. bg_apocalypse_street    → bg_apocalypse_street.png (512w, sprites/)
  3. card_mecha_approach     → card_mecha_approach.png (512w, scenes/)
"""
import os
from PIL import Image

STAGING     = '/tmp/r306-staging'
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


def slice_horizontal(sheet, n_frames):
    w, h = sheet.size
    fw = w // n_frames
    return [sheet.crop((i * fw, 0, (i + 1) * fw, h)) for i in range(n_frames)]


def process_enemies():
    src = os.path.join(STAGING, 'enemies_raw.png')
    sheet = Image.open(src).convert('RGBA')
    sheet = knockout_black_bg(sheet, thresh=28)
    frames = slice_horizontal(sheet, 4)
    targets = [
        ('scavenger.png',  24),  # humanoid runner
        ('drone.png',      16),  # spider drone
        ('helicopter.png', 18),  # attack chopper
        ('brawler.png',    28),  # heavy miniboss
    ]
    for (name, target_h), frame in zip(targets, frames):
        frame = crop_to_content(frame)
        frame = downscale_to_h(frame, target_h)
        out_path = os.path.join(OUT_SPRITES, name)
        frame.save(out_path)
        print(f'  {out_path}: {frame.size}')


def process_card(raw_name, out_name, out_dir):
    src = os.path.join(STAGING, raw_name)
    im = Image.open(src).convert('RGBA')
    im = downscale_to_w(im, 512)
    out = os.path.join(out_dir, out_name)
    im.save(out)
    print(f'  {out}: {im.size}')


if __name__ == '__main__':
    print('=== R306 — beat-em-up enemies ===')
    process_enemies()
    print('\n=== R306 — apocalypse street backdrop ===')
    process_card('bg_apocalypse_street_raw.png', 'bg_apocalypse_street.png', OUT_SPRITES)
    print('\n=== R306 — Mecha approach stage card ===')
    process_card('card_mecha_approach_raw.png', 'card_mecha_approach.png', OUT_SCENES)
    print('Done.')
