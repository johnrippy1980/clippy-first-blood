#!/usr/bin/env python3
"""R358 — process gemini-pro helicopter candidate to a clean game sprite.

The original helicopter.png was 20x18 — too small to read at the new
112x48 boss size. This script knocks out the black bg, crops to
content, downscales to 112x48 (the native boss size, so the renderer
draws 1:1), and saves over the source.
"""
import sys
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else '/tmp/r358-chopper/chop-a.jpg'
OUT = 'assets/sprites/helicopter.png'

TARGET_W = 112
TARGET_H = 48


def is_bg_dark(r, g, b, thresh=25):
    return max(r, g, b) < thresh


def knockout(im, thresh=30):
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    visited = bytearray(w * h)
    stack = []
    for cx, cy in [(0, 0), (w-1, 0), (0, h-1), (w-1, h-1)]:
        r, g, b, _ = px[cx, cy]
        if is_bg_dark(r, g, b, thresh):
            stack.append((cx, cy))
    while stack:
        x, y = stack.pop()
        idx = y * w + x
        if visited[idx]:
            continue
        visited[idx] = 1
        r, g, b, _ = px[x, y]
        if not is_bg_dark(r, g, b, thresh):
            continue
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in [(x-1, y), (x+1, y), (x, y-1), (x, y+1)]:
            if 0 <= nx < w and 0 <= ny < h and not visited[ny * w + nx]:
                stack.append((nx, ny))
    return im


def crop_to_content(im):
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def post_alpha_threshold(im, thresh=64):
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0 or a == 255:
                continue
            if a < thresh:
                px[x, y] = (0, 0, 0, 0)
            else:
                px[x, y] = (r, g, b, 255)
    return im


im = Image.open(SRC).convert('RGBA')
print(f'source: {im.size}')
im = knockout(im)
im = crop_to_content(im)
print(f'cropped: {im.size}')
# Fit-by-width since helicopter is horizontal; if height overflows we'll
# scale by height instead.
src_ratio = im.width / im.height
tgt_ratio = TARGET_W / TARGET_H
if src_ratio > tgt_ratio:
    new_w = TARGET_W
    new_h = int(round(im.height * (TARGET_W / im.width)))
else:
    new_h = TARGET_H
    new_w = int(round(im.width * (TARGET_H / im.height)))
im = im.resize((new_w, new_h), Image.LANCZOS)
# Pad to exact target size (centered) so the sprite anchor is consistent.
padded = Image.new('RGBA', (TARGET_W, TARGET_H), (0, 0, 0, 0))
ox = (TARGET_W - new_w) // 2
oy = (TARGET_H - new_h) // 2
padded.paste(im, (ox, oy))
padded = post_alpha_threshold(padded)
padded.save(OUT)
print(f'wrote: {OUT}  ({padded.size})')
