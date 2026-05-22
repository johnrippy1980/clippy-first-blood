#!/usr/bin/env python3
"""R270/R271/R272: slice floppy disks, office chairs, and Microsoft HQ
backdrop into game-ready PNGs.

Sheet 1 — floppy_raw.png (1536×1024): 4 spinning floppy frames
Sheet 2 — chair_raw.png  (1536×1024): 4 spinning chair frames
Sheet 3 — microsoft_hq_raw.png (1536×1024): single full backdrop, no slicing
"""
import os
from PIL import Image

STAGING = '/tmp/r270-272-staging'
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
    return im.crop(bbox) if bbox else im


def downscale(im, target_h):
    w, h = im.size
    scale = target_h / h
    return im.resize((max(1, int(round(w * scale))), target_h), Image.LANCZOS)


def slice_horizontal(sheet, n_frames):
    w, h = sheet.size
    fw = w // n_frames
    return [sheet.crop((i * fw, 0, (i + 1) * fw, h)) for i in range(n_frames)]


def process_floppy():
    src = os.path.join(STAGING, 'floppy_raw.png')
    sheet = Image.open(src).convert('RGBA')
    sheet = knockout_black_bg(sheet, thresh=22)
    frames = slice_horizontal(sheet, 4)
    target_h = 14
    for i, frame in enumerate(frames):
        frame = crop_to_content(frame)
        frame = downscale(frame, target_h)
        out_path = os.path.join(OUT, f'floppy_{i+1}.png')
        frame.save(out_path)
        print(f'  {out_path}: {frame.size}')


def process_chair():
    src = os.path.join(STAGING, 'chair_raw.png')
    sheet = Image.open(src).convert('RGBA')
    sheet = knockout_black_bg(sheet, thresh=22)
    frames = slice_horizontal(sheet, 4)
    target_h = 24
    for i, frame in enumerate(frames):
        frame = crop_to_content(frame)
        frame = downscale(frame, target_h)
        out_path = os.path.join(OUT, f'chair_{i+1}.png')
        frame.save(out_path)
        print(f'  {out_path}: {frame.size}')


def process_microsoft_hq():
    src = os.path.join(STAGING, 'microsoft_hq_raw.png')
    im = Image.open(src).convert('RGBA')
    target_w = 512
    scale = target_w / im.width
    new_h = int(round(im.height * scale))
    im = im.resize((target_w, new_h), Image.LANCZOS)
    out_path = os.path.join(OUT, 'bg_microsoft_hq.png')
    im.save(out_path)
    print(f'  {out_path}: {im.size}')


if __name__ == '__main__':
    print('=== R270 — floppy disks ===')
    process_floppy()
    print('\n=== R271 — chairs ===')
    process_chair()
    print('\n=== R272 — Microsoft HQ backdrop ===')
    process_microsoft_hq()
    print('\nDone.')
