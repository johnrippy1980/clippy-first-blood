#!/usr/bin/env python3
"""R311: process painted ground tilesets + platform strips.

Ground tiles: downscale 1024→768 square (match existing ground_jungle.png),
no knockout — they're solid tiles that fill the body of a brick.

Platform tiles: crop the top ~15% strip (the painted platform layer in the
source image), then downscale to 256w. Result is a horizontal tileable
strip ~30px tall that level.js samples top-6 from.
"""
import os
from PIL import Image

STAGING = '/tmp/r311-staging'
OUT_BG  = '/Users/jrippy/clippy-first-blood/assets/bg'


def downscale_square(im, target):
    return im.resize((target, target), Image.LANCZOS)


def downscale_to_w(im, target_w):
    w, h = im.size
    scale = target_w / w
    return im.resize((target_w, max(1, int(round(h * scale)))), Image.LANCZOS)


def process_ground(raw, out_name):
    src = os.path.join(STAGING, raw)
    if not os.path.exists(src):
        print(f'  SKIP {raw}: not downloaded')
        return
    im = Image.open(src).convert('RGB')
    im = downscale_square(im, 768)
    out = os.path.join(OUT_BG, out_name)
    im.save(out)
    print(f'  {out}: {im.size}')


def process_platform(raw, out_name, top_frac=0.18):
    """Crop the top portion of the source image (where the painted platform
    strip lives) and downscale to 256w. Final tile is ~30-50px tall."""
    src = os.path.join(STAGING, raw)
    if not os.path.exists(src):
        print(f'  SKIP {raw}: not downloaded')
        return
    im = Image.open(src).convert('RGBA')
    w, h = im.size
    crop_h = int(h * top_frac)
    strip = im.crop((0, 0, w, crop_h))
    strip = downscale_to_w(strip, 256)
    out = os.path.join(OUT_BG, out_name)
    strip.save(out)
    print(f'  {out}: {strip.size}')


if __name__ == '__main__':
    print('=== R311 — ground tilesets ===')
    process_ground('ground_sewer_raw.png',      'ground_sewer.png')
    process_ground('ground_reality_raw.png',    'ground_reality.png')
    process_ground('ground_apocalypse_raw.png', 'ground_apocalypse.png')

    print('\n=== R311 — platform strips ===')
    process_platform('plat_jungle_raw.png',  'plat_jungle.png')
    process_platform('plat_sewer_raw.png',   'plat_sewer.png')
    process_platform('plat_founder_raw.png', 'plat_founder.png')
    process_platform('plat_keynote_raw.png', 'plat_keynote.png')

    print('\n=== R320 — remaining platform strips ===')
    process_platform('plat_breakroom_raw.png',  'plat_breakroom.png')
    process_platform('plat_serverroom_raw.png', 'plat_serverroom.png')
    process_platform('plat_boardroom_raw.png',  'plat_boardroom.png')
    process_platform('plat_cloud_raw.png',      'plat_cloud.png')
    process_platform('plat_reality_raw.png',    'plat_reality.png')

    print('Done.')
