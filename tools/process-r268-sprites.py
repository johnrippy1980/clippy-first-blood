#!/usr/bin/env python3
"""R268: slice Ballmer office FPS stage assets.

Sheet 1 — office_enemies_raw.png (1536×1024): 4 enemies horizontally tiled.
Slice → office_grunt.png, office_turret.png, office_drone.png,
boss_ballmer_fps.png at game-ready sizes.

Sheet 2 — office_backdrop_raw.png (1536×1024): full corridor backdrop.
Knockout near-black corners, downscale to ~512×384 so it covers the
256×224 canvas at 2:1 with detail to spare. Save as bg_office.png.

Pipeline mirrors process-r263-r264-sprites.py:
  - BFS-flood near-black corners → alpha
  - Crop to content bbox (sprites only — keep backdrop full-bleed)
  - LANCZOS downscale to target height
"""
import os
from PIL import Image

STAGING = '/tmp/r268-staging'
OUT     = '/Users/jrippy/clippy-first-blood/assets/sprites'


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
    if bbox is None:
        return im
    return im.crop(bbox)


def downscale(im, target_h):
    w, h = im.size
    scale = target_h / h
    new_w = max(1, int(round(w * scale)))
    return im.resize((new_w, target_h), Image.LANCZOS)


def slice_horizontal(sheet, n_frames):
    w, h = sheet.size
    frame_w = w // n_frames
    return [sheet.crop((i * frame_w, 0, (i + 1) * frame_w, h)) for i in range(n_frames)]


def process_office_enemies():
    src = os.path.join(STAGING, 'office_enemies_raw.png')
    sheet = Image.open(src).convert('RGBA')
    sheet = knockout_black_bg(sheet, thresh=28)
    frames = slice_horizontal(sheet, 4)
    targets = [
        ('office_grunt.png',     40),  # suit grunt charging
        ('office_turret.png',    22),  # fax machine — small
        ('office_drone.png',     32),  # desk-lamp drone
        ('boss_ballmer_fps.png', 56),  # Ballmer boss — large
    ]
    for (name, target_h), frame in zip(targets, frames):
        frame = crop_to_content(frame)
        frame = downscale(frame, target_h)
        out_path = os.path.join(OUT, name)
        frame.save(out_path)
        print(f'  {out_path}: {frame.size}')


def process_office_backdrop():
    src = os.path.join(STAGING, 'office_backdrop_raw.png')
    im = Image.open(src).convert('RGBA')
    # Don't knockout — corridor has dark areas we want to preserve.
    # Downscale to 512px wide so it covers the 256×224 canvas at 2:1.
    target_w = 512
    scale = target_w / im.width
    new_h = int(round(im.height * scale))
    im = im.resize((target_w, new_h), Image.LANCZOS)
    out_path = os.path.join(OUT, 'bg_office.png')
    im.save(out_path)
    print(f'  {out_path}: {im.size}')


if __name__ == '__main__':
    print('=== R268 — office enemies ===')
    process_office_enemies()
    print('\n=== R268 — office corridor backdrop ===')
    process_office_backdrop()
    print('\nDone.')
