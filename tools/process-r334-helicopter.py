#!/usr/bin/env python3
"""R334: process the painted helicopter sprite.

Source: 1456x808 JPEG from gemini-pro with a black-ish background.
1. RGB → RGBA
2. BFS-flood knockout of dark corners
3. Crop to content
4. Downscale to 56 px wide (matches BOSS_TEMPLATES.HELICOPTER.w)
5. Post-alpha threshold cleanup
"""
import os
from PIL import Image

STAGING = '/tmp/r334-staging'
OUT_SPRITES = '/Users/jrippy/clippy-first-blood/assets/sprites'

TARGET_W = 56  # matches BOSS_TEMPLATES.HELICOPTER.w


def is_bg(r, g, b, thresh=42):
    if r >= thresh or g >= thresh or b >= thresh:
        return False
    if max(r, g, b) - min(r, g, b) > 8:
        return False
    return True


def knockout(im, thresh=42):
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    visited = bytearray(w * h)
    stack = []
    for cx, cy in [(0, 0), (w-1, 0), (0, h-1), (w-1, h-1)]:
        r, g, b, _ = px[cx, cy]
        if is_bg(r, g, b, thresh):
            stack.append((cx, cy))
    while stack:
        x, y = stack.pop()
        idx = y * w + x
        if visited[idx]:
            continue
        visited[idx] = 1
        r, g, b, _ = px[x, y]
        if not is_bg(r, g, b, thresh):
            continue
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in [(x-1, y), (x+1, y), (x, y-1), (x, y+1)]:
            if 0 <= nx < w and 0 <= ny < h and not visited[ny * w + nx]:
                stack.append((nx, ny))
    return im


def crop_to_content(im):
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def downscale_to_w(im, target_w):
    w, h = im.size
    scale = target_w / w
    return im.resize((target_w, max(1, int(round(h * scale)))), Image.LANCZOS)


def post_alpha_threshold(im, alpha_thresh=128):
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < alpha_thresh:
                px[x, y] = (0, 0, 0, 0)
    return im


def process(raw, out_name, target_w=TARGET_W, knockout_thresh=42):
    src = os.path.join(STAGING, raw)
    if not os.path.exists(src):
        print(f'  SKIP {raw}: not downloaded')
        return
    im = Image.open(src).convert('RGBA')
    im = knockout(im, thresh=knockout_thresh)
    im = crop_to_content(im)
    im = downscale_to_w(im, target_w)
    im = post_alpha_threshold(im, alpha_thresh=128)
    im = crop_to_content(im)
    out = os.path.join(OUT_SPRITES, out_name)
    im.save(out)
    print(f'  {out}: {im.size}')


if __name__ == '__main__':
    print('=== R334 — helicopter boss sprite ===')
    process('helicopter_raw.jpg', 'enemy_HELICOPTER.png', target_w=56, knockout_thresh=42)
    print('Done.')
