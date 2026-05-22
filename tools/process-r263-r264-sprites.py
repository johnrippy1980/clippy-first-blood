#!/usr/bin/env python3
"""R263 + R264: slice the two gpt-image-2 sheets into game-ready PNGs.

Sheet 1 — clippy_back_sheet_raw.png (1536×1024): 4 back-facing run frames,
horizontally tiled. Slice → clippy_back_run_1.png..clippy_back_run_4.png at
~25×40 each. Also use frame 1 as the idle pose (clippy_back_idle.png).

Sheet 2 — lab_enemies_sheet_raw.png (1536×1024): 4 enemies horizontally
tiled — turret, grunt, shield node, core boss. Slice → lab_turret.png,
lab_grunt.png, lab_shield.png, lab_core.png at sizes that match the FPS
arena's procedural-rect hitboxes:
  - turret  ~28×22  (procedural was TURRET_W=28, TURRET_H=22)
  - grunt   ~32×40  (depth-scaled in arena; oversize source preserves detail)
  - shield  ~16×16  (procedural was 10×10; bigger source = clean downscale)
  - core    ~48×40  (procedural was 32×24)

Pipeline mirrors process-r199-sprites.py:
  - BFS-flood near-black corners → alpha
  - Crop to content bbox
  - LANCZOS downscale to target height
"""
import os
from PIL import Image

STAGING = '/tmp/r263-r264-staging'
OUT     = '/Users/jrippy/clippy-first-blood/assets/sprites'


def knockout_black_bg(im, thresh=24):
    """BFS-flood from four corners. Anything contiguous + dark enough
    becomes transparent. Stops at the first non-dark pixel so interior
    blacks (Clippy's wire, dark armor on enemies) are preserved."""
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
    """Split a sheet into n_frames equal-width columns."""
    w, h = sheet.size
    frame_w = w // n_frames
    return [sheet.crop((i * frame_w, 0, (i + 1) * frame_w, h)) for i in range(n_frames)]


def process_clippy_back_sheet():
    src = os.path.join(STAGING, 'clippy_back_sheet_raw.png')
    sheet = Image.open(src).convert('RGBA')
    sheet = knockout_black_bg(sheet, thresh=28)
    frames = slice_horizontal(sheet, 4)
    target_h = 40   # matches v6_run_* height
    for i, frame in enumerate(frames):
        frame = crop_to_content(frame)
        frame = downscale(frame, target_h)
        out_path = os.path.join(OUT, f'clippy_back_run_{i+1}.png')
        frame.save(out_path)
        print(f'  {out_path}: {frame.size}')
    # Idle = frame 1 (right leg forward — a static-looking pose)
    idle = crop_to_content(frames[0]) if False else None
    # Re-extract idle since we mutated frames above (after downscale they're small)
    sheet2 = Image.open(src).convert('RGBA')
    sheet2 = knockout_black_bg(sheet2, thresh=28)
    idle = slice_horizontal(sheet2, 4)[0]
    idle = crop_to_content(idle)
    idle = downscale(idle, target_h)
    out_path = os.path.join(OUT, 'clippy_back_idle.png')
    idle.save(out_path)
    print(f'  {out_path}: {idle.size}')


def process_lab_enemies_sheet():
    src = os.path.join(STAGING, 'lab_enemies_sheet_raw.png')
    sheet = Image.open(src).convert('RGBA')
    sheet = knockout_black_bg(sheet, thresh=28)
    frames = slice_horizontal(sheet, 4)
    targets = [
        ('lab_turret.png', 22),    # turret height ~22px
        ('lab_grunt.png',  40),    # grunt — generous so depth-scaling looks sharp
        ('lab_shield.png', 16),    # shield node — needs to read at 10px draw size
        ('lab_core.png',   40),    # exposed core — boss-sized
    ]
    for (name, target_h), frame in zip(targets, frames):
        frame = crop_to_content(frame)
        frame = downscale(frame, target_h)
        out_path = os.path.join(OUT, name)
        frame.save(out_path)
        print(f'  {out_path}: {frame.size}')


if __name__ == '__main__':
    print('=== R263 — back-facing Clippy ===')
    process_clippy_back_sheet()
    print('\n=== R264 — lab enemies ===')
    process_lab_enemies_sheet()
    print('\nDone.')
