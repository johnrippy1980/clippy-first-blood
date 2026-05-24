#!/usr/bin/env python3
"""R371 — process gpt-image-2 boss sprite candidates.

Each source is ~1536x1024 with solid black bg. BFS-knockout, crop,
LANCZOS to target_h preserving aspect, alpha-snap, save to
assets/sprites/boss_<KIND>.png.
"""
import sys, os
from PIL import Image

JOBS = [
    # (src, kind, target_h)
    ('/tmp/r371/copier.png', 'COPIER_3000',  88),
    ('/tmp/r371/cad.png',    'CTRL_ALT_DEL', 88),
    ('/tmp/r371/gates.png',  'GATES',        88),
    ('/tmp/r371/clippy2.png', 'CLIPPY_2',    88),
]


def is_dark(r, g, b, t=30):
    return max(r, g, b) < t


def knockout(im, thresh=30):
    im = im.convert('RGBA'); w, h = im.size; px = im.load()
    vis = bytearray(w * h); stk = []
    for c in [(0, 0), (w-1, 0), (0, h-1), (w-1, h-1)]:
        r, g, b, _ = px[c]
        if is_dark(r, g, b, thresh): stk.append(c)
    while stk:
        x, y = stk.pop(); i = y * w + x
        if vis[i]: continue
        vis[i] = 1
        r, g, b, _ = px[x, y]
        if not is_dark(r, g, b, thresh): continue
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in [(x-1, y), (x+1, y), (x, y-1), (x, y+1)]:
            if 0 <= nx < w and 0 <= ny < h and not vis[ny * w + nx]:
                stk.append((nx, ny))
    return im


def crop(im):
    b = im.getbbox(); return im.crop(b) if b else im


def snap(im, t=64):
    px = im.load(); w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0 or a == 255: continue
            if a < t: px[x, y] = (0, 0, 0, 0)
            else: px[x, y] = (r, g, b, 255)
    return im


for src, kind, target_h in JOBS:
    if not os.path.exists(src):
        print(f'SKIP {src} (not downloaded)')
        continue
    im = Image.open(src).convert('RGBA')
    print(f'== {src}  src={im.size}')
    im = knockout(im); im = crop(im)
    scale = target_h / im.height
    new_w = max(1, int(round(im.width * scale)))
    im = im.resize((new_w, target_h), Image.LANCZOS)
    im = snap(im)
    out = f'assets/sprites/boss_{kind}.png'
    im.save(out)
    print(f'  wrote {out}  {im.size}')
