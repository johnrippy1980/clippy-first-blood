#!/usr/bin/env python3
"""R370 — process new enemy sprite candidates from Local Howl.

Three grunt-class enemies got high-res repaints because their old
assets were tiny (dive_bomber 11x7, summoner 15x22, shielder 20x26).
New gemini sources are ~1360x768 — needs knockout + crop + downscale.

Shielder source has TWO cabinets — pass slice_right=True to take only
the right half (the better-detailed one).
"""
import sys
from PIL import Image

JOBS = [
    # (src, out, target_h, bg_color, slice_right)
    ('/tmp/r370/dive-a.jpg',     'assets/sprites/dive_bomber.png', 36, 'dark',  False),
    ('/tmp/r370/summoner-a.jpg', 'assets/sprites/summoner.png',    48, 'light', False),
    ('/tmp/r370/shielder-a.jpg', 'assets/sprites/shielder.png',    52, 'light', True),
]


def is_dark(r, g, b, t=35):
    return max(r, g, b) < t

def is_light(r, g, b, t=235):
    return min(r, g, b) > t


def knockout(im, bg='dark'):
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    visited = bytearray(w * h)
    stack = []
    pred = is_dark if bg == 'dark' else is_light
    for c in [(0, 0), (w-1, 0), (0, h-1), (w-1, h-1)]:
        r, g, b, _ = px[c]
        if pred(r, g, b):
            stack.append(c)
    while stack:
        x, y = stack.pop()
        idx = y * w + x
        if visited[idx]:
            continue
        visited[idx] = 1
        r, g, b, _ = px[x, y]
        if not pred(r, g, b):
            continue
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in [(x-1, y), (x+1, y), (x, y-1), (x, y+1)]:
            if 0 <= nx < w and 0 <= ny < h and not visited[ny * w + nx]:
                stack.append((nx, ny))
    return im


def crop_to_content(im):
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


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


for src, out, target_h, bg, slice_right in JOBS:
    im = Image.open(src).convert('RGBA')
    print(f'== {src}  ({im.size[0]}x{im.size[1]})  bg={bg}')
    if slice_right:
        # Crop to the right half before knockout
        w, h = im.size
        im = im.crop((w // 2, 0, w, h))
        print(f'  right-half slice: {im.size}')
    im = knockout(im, bg=bg)
    im = crop_to_content(im)
    print(f'  cropped: {im.size}')
    scale = target_h / im.height
    new_w = max(1, int(round(im.width * scale)))
    im = im.resize((new_w, target_h), Image.LANCZOS)
    im = snap_alpha(im)
    im.save(out)
    print(f'  wrote {out}  {im.size}')
