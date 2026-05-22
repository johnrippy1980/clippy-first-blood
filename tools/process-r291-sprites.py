#!/usr/bin/env python3
"""R291: slice Gates FPS arc assets.

  - card_gates_escapes_raw.png  → card_gates_escapes.png (512w, scenes/)
  - card_gates_arena_raw.png    → card_gates_arena.png   (512w, scenes/)
  - bg_keynote_corridor_raw.png → bg_keynote_corridor.png (512w, sprites/)
  - (enemies + boss sprites sliced in a follow-up after the retry lands)
"""
import os
from PIL import Image

STAGING    = '/tmp/r291-staging'
OUT_SCENES = '/Users/jrippy/clippy-first-blood/assets/scenes'
OUT_SPRITES = '/Users/jrippy/clippy-first-blood/assets/sprites'


def downscale_to_w(im, target_w):
    w, h = im.size
    scale = target_w / w
    return im.resize((target_w, max(1, int(round(h * scale)))), Image.LANCZOS)


def process_card(raw_name, out_name, out_dir):
    src = os.path.join(STAGING, raw_name)
    im = Image.open(src).convert('RGBA')
    im = downscale_to_w(im, 512)
    out = os.path.join(out_dir, out_name)
    im.save(out)
    print(f'  {out}: {im.size}')


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


def slice_horizontal(sheet, n_frames):
    w, h = sheet.size
    fw = w // n_frames
    return [sheet.crop((i * fw, 0, (i + 1) * fw, h)) for i in range(n_frames)]


def process_gates_enemies():
    src = os.path.join(STAGING, 'gates_enemies_raw.png')
    sheet = Image.open(src).convert('RGBA')
    sheet = knockout_black_bg(sheet, thresh=28)
    frames = slice_horizontal(sheet, 4)
    targets = [
        ('keynote_turret.png',  22),
        ('keynote_grunt.png',   40),
        ('keynote_drone.png',   32),
        ('boss_gates_fps.png',  56),
    ]
    for (name, target_h), frame in zip(targets, frames):
        frame = crop_to_content(frame)
        frame = downscale_to_h(frame, target_h)
        out_path = os.path.join(OUT_SPRITES, name)
        frame.save(out_path)
        print(f'  {out_path}: {frame.size}')


if __name__ == '__main__':
    print('=== R291 — Gates story cards + corridor backdrop ===')
    process_card('card_gates_escapes_raw.png', 'card_gates_escapes.png', OUT_SCENES)
    process_card('card_gates_arena_raw.png',   'card_gates_arena.png',   OUT_SCENES)
    process_card('bg_keynote_corridor_raw.png', 'bg_keynote_corridor.png', OUT_SPRITES)
    print('\n=== R291 — Gates enemy sprites ===')
    process_gates_enemies()
    print('\nDone.')
