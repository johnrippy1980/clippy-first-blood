#!/usr/bin/env python3
"""R339+R340: process new Clippy state sprites.

  jump_clean_raw  → jump_neutral.png  (gun lowered, no muzzle flash)
  ledge_hang_raw  → v3_ledge_hang.png (headband visible)

Both have non-black backgrounds (white-ish gemini output) so we use
the light_mode knockout from R328.
"""
import os
from PIL import Image

STAGING = '/tmp/r339-staging'
OUT = '/Users/jrippy/clippy-first-blood/assets/sprites'


def is_bg_light(r, g, b, thresh_lo=200):
    if r < thresh_lo or g < thresh_lo or b < thresh_lo:
        return False
    if max(r, g, b) - min(r, g, b) > 12:
        return False
    return True


def knockout_light(im, thresh_lo=200):
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    visited = bytearray(w * h)
    stack = []
    for cx, cy in [(0, 0), (w-1, 0), (0, h-1), (w-1, h-1)]:
        r, g, b, _ = px[cx, cy]
        if is_bg_light(r, g, b, thresh_lo):
            stack.append((cx, cy))
    while stack:
        x, y = stack.pop()
        idx = y * w + x
        if visited[idx]:
            continue
        visited[idx] = 1
        r, g, b, _ = px[x, y]
        if not is_bg_light(r, g, b, thresh_lo):
            continue
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in [(x-1, y), (x+1, y), (x, y-1), (x, y+1)]:
            if 0 <= nx < w and 0 <= ny < h and not visited[ny * w + nx]:
                stack.append((nx, ny))
    return im


def crop_to_content(im):
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def crop_top(im, frac):
    """Remove the bottom `frac` of the image — for the jump sprite which
    has a weird 'PARWO' watermark at the bottom."""
    w, h = im.size
    return im.crop((0, 0, w, int(h * (1 - frac))))


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


def process(raw, out_name, target_h, drop_bottom=0.0):
    src = os.path.join(STAGING, raw)
    if not os.path.exists(src):
        print(f'  SKIP {raw}: not downloaded')
        return
    im = Image.open(src).convert('RGBA')
    im = knockout_light(im, thresh_lo=200)
    if drop_bottom > 0:
        im = crop_top(im, drop_bottom)
    im = crop_to_content(im)
    im = downscale_to_h(im, target_h)
    im = post_alpha_threshold(im, alpha_thresh=128)
    im = crop_to_content(im)
    out = os.path.join(OUT, out_name)
    im.save(out)
    print(f'  {out}: {im.size}')


if __name__ == '__main__':
    print('=== R339/R340 — Clippy state sprites ===')
    # Jump (gun lowered, no muzzle flame). Existing v6_jump is 28x40
    # so match that target. Drop the 12% bottom to skip the watermark.
    process('jump_clean_raw.jpg', 'jump_neutral.png', target_h=40, drop_bottom=0.15)
    # Ledge hang (with headband). Existing v2_ledge_hang is 21x56.
    process('ledge_hang_raw.jpg', 'ledge_hang_v3.png', target_h=56)
    print('Done.')
