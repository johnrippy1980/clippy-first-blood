#!/usr/bin/env python3
"""R269: slice the electric-barrier sprite sheet.

The gpt-image-2 output arranged 4 barrier states across a 1536×1024
canvas. Slice into 4 horizontal frames:
  barrier_1 = FULLY ON (brightest, full arc)
  barrier_2 = CRACKLING (~60% intensity)
  barrier_3 = OFF / IDLE (pylons only, faint sparks)
  barrier_4 = POWERING UP (~40% intensity)

Frame size: ~64×24px target so the barrier reads as a horizontal hazard
band spanning roughly the corridor width at mid-depth.
"""
import os
from PIL import Image

STAGING = '/tmp/r269-staging'
OUT     = '/Users/jrippy/clippy-first-blood/assets/sprites'


def knockout_black_bg(im, thresh=20):
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


def downscale(im, target_h):
    w, h = im.size
    scale = target_h / h
    return im.resize((max(1, int(round(w * scale))), target_h), Image.LANCZOS)


def slice_horizontal(sheet, n_frames):
    w, h = sheet.size
    fw = w // n_frames
    return [sheet.crop((i * fw, 0, (i + 1) * fw, h)) for i in range(n_frames)]


def process():
    src = os.path.join(STAGING, 'barrier_sheet_raw.png')
    sheet = Image.open(src).convert('RGBA')
    sheet = knockout_black_bg(sheet, thresh=22)
    frames = slice_horizontal(sheet, 4)
    # Keep the full slice width (pylons on each end + arc between) and only
    # crop vertically so each barrier frame stays wide enough to span the
    # corridor when drawn 2-3× scaled.
    target_h = 32
    for i, frame in enumerate(frames):
        # Trim vertical empty bands but KEEP full horizontal width
        w, h = frame.size
        bbox = frame.getbbox()
        if bbox:
            frame = frame.crop((0, bbox[1], w, bbox[3]))
        frame = downscale(frame, target_h)
        out_path = os.path.join(OUT, f'barrier_{i+1}.png')
        frame.save(out_path)
        print(f'  {out_path}: {frame.size}')


if __name__ == '__main__':
    print('=== R269 — electric barrier ===')
    process()
    print('\nDone.')
