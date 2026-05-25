#!/usr/bin/env python3
"""R400: process generated stage-card raw images down to 512w PNG cards
matching the existing card_stage*.png set.

Source: /tmp/r400_staging/<key>.png (1536x1024 from gpt-image-2)
Target: assets/scenes/<out>.png at 512w with LANCZOS downscale.

No transparency knockout — these are full-frame cards.
"""
import os
import sys
from PIL import Image

PAIRS = [
    # (staging filename, output filename)
    ('s10_gates_arena.png',     'card_stage10_gates_arena.png'),
    ('s11_founder.png',         'card_stage11_founder.png'),
    ('s12_bossrush.png',        'card_stage12_bossrush.png'),
    ('s13_cloud.png',           'card_stage13_cloud.png'),
    ('s14_recyclebin.png',      'card_stage14_recyclebin.png'),
    ('s18_reality.png',         'card_stage18_reality.png'),
    ('boss_intro_HELICOPTER.png',   'boss_intros/boss_intro_helicopter.png'),
    ('boss_intro_MECHA_GATES.png',  'boss_intros/boss_intro_mecha_gates.png'),
]

STAGING = '/tmp/r400_staging'
OUT_DIR = 'assets/scenes'
TARGET_W = 512

for staging, out in PAIRS:
    src_path = os.path.join(STAGING, staging)
    if not os.path.isfile(src_path):
        print(f'SKIP {staging} (not downloaded yet)')
        continue
    im = Image.open(src_path).convert('RGB')
    w, h = im.size
    scale = TARGET_W / w
    new_h = int(round(h * scale))
    out_im = im.resize((TARGET_W, new_h), Image.LANCZOS)
    out_path = os.path.join(OUT_DIR, out)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    out_im.save(out_path, 'PNG', optimize=True)
    print(f'wrote {out_path}  ({TARGET_W}x{new_h})')
