#!/usr/bin/env python3
"""R366 — slice gpt-image-2 enemy sprite sheets into individual frames.

Each sheet has 2-3 frames laid out left-to-right with solid black
gaps between. Algorithm:
  1. Knockout the black bg (BFS from corners, alpha→0)
  2. Find vertical columns where the entire column is transparent
     (these are the inter-frame gaps)
  3. Split at those columns, crop each frame to content
  4. Downscale each frame to target H preserving aspect, save as
     <basename>_<n>.png in assets/sprites/
"""
import sys, os
from PIL import Image

SHEETS = [
    # (src_path, out_base, target_h, expected_frames)
    ('/tmp/r366/scavenger.png',   'scavenger',         48, 3),
    ('/tmp/r366/drone.png',       'drone',             36, 2),
    ('/tmp/r366/brawler.png',     'brawler',           56, 3),
    ('/tmp/r366/mecha_gates.png', 'boss_mecha_gates',  88, 3),
]
OUT_DIR = 'assets/sprites'
BG_THRESH = 35   # max RGB for a pixel to be considered "background"


def is_bg(r, g, b, t=BG_THRESH):
    return max(r, g, b) < t


def knockout(im):
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    visited = bytearray(w * h)
    stack = []
    for c in [(0,0), (w-1,0), (0,h-1), (w-1,h-1)]:
        r, g, b, _ = px[c]
        if is_bg(r, g, b):
            stack.append(c)
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
        for nx, ny in [(x-1,y), (x+1,y), (x,y-1), (x,y+1)]:
            if 0 <= nx < w and 0 <= ny < h and not visited[ny * w + nx]:
                stack.append((nx, ny))
    return im


def find_frame_ranges(im, min_gap=8):
    """Find columns of all-transparent pixels (inter-frame gaps).
    Returns list of (x_start, x_end) for each frame."""
    w, h = im.size
    px = im.load()
    col_empty = []
    for x in range(w):
        empty = True
        for y in range(h):
            if px[x, y][3] > 0:
                empty = False
                break
        col_empty.append(empty)
    # Find ranges where col_empty is False, separated by min_gap empty cols
    ranges = []
    in_frame = False
    start = 0
    empty_run = 0
    for x in range(w):
        if col_empty[x]:
            if in_frame:
                empty_run += 1
                if empty_run >= min_gap:
                    ranges.append((start, x - empty_run))
                    in_frame = False
                    empty_run = 0
        else:
            if not in_frame:
                start = x
                in_frame = True
            empty_run = 0
    if in_frame:
        ranges.append((start, w - 1))
    return ranges


def snap_alpha(im, t=64):
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0 or a == 255:
                continue
            if a < t:
                px[x, y] = (0, 0, 0, 0)
            else:
                px[x, y] = (r, g, b, 255)
    return im


def equal_split(im, n):
    """Fallback: divide the cropped content area into N equal-width
    strips. Used when gap-detection finds the wrong number of frames."""
    w, h = im.size
    px = im.load()
    # Find the leftmost + rightmost non-transparent column
    left, right = w, -1
    for x in range(w):
        for y in range(h):
            if px[x, y][3] > 0:
                left = min(left, x)
                right = max(right, x)
                break
    if right < left:
        return []
    span = right - left + 1
    strip = span / n
    return [(int(left + i * strip), int(left + (i + 1) * strip - 1)) for i in range(n)]


def slice_sheet(src, out_base, target_h, expected_frames):
    im = Image.open(src).convert('RGBA')
    print(f'== {src}  ({im.size[0]}x{im.size[1]})')
    im = knockout(im)
    ranges = find_frame_ranges(im)
    print(f'  found {len(ranges)} frames (expected {expected_frames})')
    if len(ranges) != expected_frames:
        print(f'  fallback: equal-split into {expected_frames} strips')
        ranges = equal_split(im, expected_frames)
    for i, (x0, x1) in enumerate(ranges, start=1):
        frame = im.crop((x0, 0, x1 + 1, im.height))
        bbox = frame.getbbox()
        if bbox:
            frame = frame.crop(bbox)
        # Scale to target_h preserving aspect
        scale = target_h / frame.height
        new_w = max(1, int(round(frame.width * scale)))
        frame = frame.resize((new_w, target_h), Image.LANCZOS)
        frame = snap_alpha(frame)
        out_path = os.path.join(OUT_DIR, f'{out_base}_{i}.png')
        frame.save(out_path)
        print(f'  {out_path}  {frame.size}')
    # Also save frame 1 as the "main" sprite (overwrite the existing
    # single-frame asset) so legacy code that loads `<name>.png` still
    # works — picks up the painted frame 1 as the new baseline.
    main_path = os.path.join(OUT_DIR, f'{out_base}.png')
    if ranges:
        x0, x1 = ranges[0]
        frame = im.crop((x0, 0, x1 + 1, im.height))
        bbox = frame.getbbox()
        if bbox:
            frame = frame.crop(bbox)
        scale = target_h / frame.height
        new_w = max(1, int(round(frame.width * scale)))
        frame = frame.resize((new_w, target_h), Image.LANCZOS)
        frame = snap_alpha(frame)
        frame.save(main_path)
        print(f'  {main_path}  {frame.size}  (baseline copy of frame 1)')


for s, n, h, c in SHEETS:
    slice_sheet(s, n, h, c)
print('Done.')
