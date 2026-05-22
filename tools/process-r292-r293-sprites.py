#!/usr/bin/env python3
"""R292/R293: slice the new story-tower slide + Spindler lab card."""
import os
from PIL import Image

STAGING    = '/tmp/r292-r293-staging'
OUT_SCENES = '/Users/jrippy/clippy-first-blood/assets/scenes'


def downscale_to_w(im, target_w):
    w, h = im.size
    scale = target_w / w
    return im.resize((target_w, max(1, int(round(h * scale)))), Image.LANCZOS)


def process_card(raw_name, out_name):
    src = os.path.join(STAGING, raw_name)
    im = Image.open(src).convert('RGBA')
    im = downscale_to_w(im, 512)
    out = os.path.join(OUT_SCENES, out_name)
    im.save(out)
    print(f'  {out}: {im.size}')


if __name__ == '__main__':
    print('=== R292 — story tower slide ===')
    process_card('story_tower_raw.png', 'scene_story_tower.png')
    print('\n=== R293 — Spindler FPS lab card ===')
    process_card('card_spindler_lab_raw.png', 'card_spindler_lab.png')
    print('Done.')
