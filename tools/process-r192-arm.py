#!/usr/bin/env python3
"""R192: process the v6 chrome-wire-arm-with-rifle sprite for in-game use.

Variant A (arm_v6a_raw) won the visual test — bold paperclip-style wire
arm gripping a chunky AK-style rifle with wooden stock and curved
magazine. The silhouette stays readable at small scale because of:
  - high contrast between black rifle and white wire
  - chunky proportions throughout
  - prominent receiver + magazine

Pipeline mirrors process-r175-sprites.py:
  - BFS-flood near-black corners to alpha
  - Crop to content bbox
  - LANCZOS downscale to 12px height (a hair taller than R175's 8px so
    the rifle's receiver/magazine survive)
"""
import os
from PIL import Image

SRC = '/Users/jrippy/clippy-first-blood/_staging/r192/arm_v6a_raw.png'
DST = '/Users/jrippy/clippy-first-blood/assets/sprites/arm_mg.png'
TARGET_H = 12


def knockout_black_bg(im, thresh=28):
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    corner_alphas = [px[0, 0][3], px[w-1, 0][3], px[0, h-1][3], px[w-1, h-1][3]]
    if min(corner_alphas) < 16:
        return im

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
        for nx, ny in ((x+1, y), (x-1, y), (x, y+1), (x, y-1)):
            if 0 <= nx < w and 0 <= ny < h and not visited[ny*w + nx]:
                stack.append((nx, ny))
    return im


def crop_to_content(im):
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def downscale(im, target_h):
    w, h = im.size
    if h == target_h:
        return im
    ratio = target_h / h
    tw = max(1, int(round(w * ratio)))
    return im.resize((tw, target_h), Image.LANCZOS)


def main():
    if not os.path.exists(SRC):
        print(f'  MISSING {SRC}')
        return
    im = Image.open(SRC)
    im = knockout_black_bg(im)
    im = crop_to_content(im)
    im = downscale(im, TARGET_H)
    im.save(DST, 'PNG', optimize=True)
    print(f'  arm_v6a -> arm_mg.png ({im.size[0]}x{im.size[1]})')


if __name__ == '__main__':
    main()
