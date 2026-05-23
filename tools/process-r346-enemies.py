#!/usr/bin/env python3
"""R346: process 3 new painted enemy sprites for R325 behaviors.

  dive_bomber_raw → dive_bomber.png   (target ~14x10)
  summoner_raw    → summoner.png      (target ~16x22)
  shielder_raw    → shielder.png      (target ~20x26 — includes the shield)

Backgrounds vary (dive bomber: dark checker; summoner + shielder: light/
white). Use both knockout modes.
"""
import os
from PIL import Image

STAGING = '/tmp/r346-staging'
OUT = '/Users/jrippy/clippy-first-blood/assets/sprites'


def is_bg_dark(r, g, b, thresh=50):
    if r >= thresh or g >= thresh or b >= thresh:
        return False
    if max(r, g, b) - min(r, g, b) > 10:
        return False
    return True


def is_bg_light(r, g, b, thresh_lo=200):
    if r < thresh_lo or g < thresh_lo or b < thresh_lo:
        return False
    if max(r, g, b) - min(r, g, b) > 18:
        return False
    return True


def knockout(im, mode='dark'):
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    visited = bytearray(w * h)
    stack = []
    test = is_bg_dark if mode == 'dark' else is_bg_light
    for cx, cy in [(0, 0), (w-1, 0), (0, h-1), (w-1, h-1)]:
        r, g, b, _ = px[cx, cy]
        if test(r, g, b):
            stack.append((cx, cy))
    while stack:
        x, y = stack.pop()
        idx = y * w + x
        if visited[idx]:
            continue
        visited[idx] = 1
        r, g, b, _ = px[x, y]
        if not test(r, g, b):
            continue
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in [(x-1, y), (x+1, y), (x, y-1), (x, y+1)]:
            if 0 <= nx < w and 0 <= ny < h and not visited[ny * w + nx]:
                stack.append((nx, ny))
    return im


def crop_to_content(im):
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def downscale_to_h(im, target_h):
    w, h = im.size
    scale = target_h / h
    return im.resize((max(1, int(round(w * scale))), target_h), Image.LANCZOS)


def post_alpha_threshold(im, alpha_thresh=128):
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < alpha_thresh:
                px[x, y] = (0, 0, 0, 0)
    return im


def process(raw, out_name, mode, target_h):
    src = os.path.join(STAGING, raw)
    if not os.path.exists(src):
        print(f'  SKIP {raw}')
        return
    im = Image.open(src).convert('RGBA')
    im = knockout(im, mode=mode)
    im = crop_to_content(im)
    im = downscale_to_h(im, target_h)
    im = post_alpha_threshold(im)
    im = crop_to_content(im)
    out = os.path.join(OUT, out_name)
    im.save(out)
    print(f'  {out}: {im.size}')


if __name__ == '__main__':
    print('=== R346 — painted dive_bomber / summoner / shielder ===')
    process('dive_bomber_raw.jpg', 'dive_bomber.png', mode='dark',  target_h=10)
    process('summoner_raw.jpg',    'summoner.png',    mode='light', target_h=22)
    process('shielder_raw.jpg',    'shielder.png',    mode='light', target_h=26)
    print('Done.')
