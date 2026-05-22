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


if __name__ == '__main__':
    print('=== R291 — Gates story cards + corridor backdrop ===')
    process_card('card_gates_escapes_raw.png', 'card_gates_escapes.png', OUT_SCENES)
    process_card('card_gates_arena_raw.png',   'card_gates_arena.png',   OUT_SCENES)
    process_card('bg_keynote_corridor_raw.png', 'bg_keynote_corridor.png', OUT_SPRITES)
    print('Done.')
