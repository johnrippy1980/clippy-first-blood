#!/usr/bin/env python3
"""R710: process Milos' delivered player poses (P1 angled-firing + P2 weapon bodies).

Milos delivered 10 white-background PNGs (no generation needed):
  ~/Downloads/No Muzzle/  -> the 3 angled-aim FIRING poses, muzzle flash removed
                             so the engine draws the fire effect. Replace the
                             R645 friend/aim_*.png set.
  ~/Downloads/7 weapons/  -> the 7 native per-weapon full-body standing poses.
                             Replace the interim R689 composite v6_* set
                             (friend/weapon_*.png).

Same WHITE-background knockout recipe as the rest of the Clippy pipeline
(4-corner BFS flood of near-white, crop, downscale to 40px game height,
alpha-threshold, re-crop). The metal guns read light-grey and the laser/
thunder carry bright glow, so a too-low white_floor would tunnel into the
weapon; each sprite gets its own threshold and is spot-checked after.
"""
import os
from PIL import Image

DL = '/Users/jrippy/Downloads'
OUT = '/Users/jrippy/clippy-first-blood/assets/sprites/friend'
TARGET_H = 40


def is_bg_light(r, g, b, floor):
    # Background only if every channel is bright AND the pixel is near-grey
    # (white bg, not a light-but-saturated highlight like laser blue).
    if r < floor or g < floor or b < floor:
        return False
    if max(r, g, b) - min(r, g, b) > 14:
        return False
    return True


def knockout_light(im, floor):
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    visited = bytearray(w * h)
    stack = []
    for cx, cy in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        r, g, b, _ = px[cx, cy]
        if is_bg_light(r, g, b, floor):
            stack.append((cx, cy))
    while stack:
        x, y = stack.pop()
        idx = y * w + x
        if visited[idx]:
            continue
        visited[idx] = 1
        r, g, b, _ = px[x, y]
        if not is_bg_light(r, g, b, floor):
            continue
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in [(x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)]:
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


def process(src_path, out_name, floor):
    if not os.path.exists(src_path):
        print(f'  SKIP {out_name}: source missing ({src_path})')
        return
    im = Image.open(src_path).convert('RGBA')
    im = knockout_light(im, floor)
    im = crop_to_content(im)
    im = downscale_to_h(im, TARGET_H)
    im = post_alpha_threshold(im, alpha_thresh=128)
    im = crop_to_content(im)
    out = os.path.join(OUT, out_name)
    im.save(out)
    print(f'  {out_name}: {im.size}')


if __name__ == '__main__':
    print('=== R710 — Milos P1 angled-firing + P2 weapon bodies ===')
    # P1: angled-aim firing poses (no muzzle flash). Grey rifle only, so a
    # standard high floor is safe.
    print('P1 angled-firing (No Muzzle):')
    process(f'{DL}/No Muzzle/Clippy_angled firing_up-no muzzle.png',      'aim_up.png',        floor=236)
    process(f'{DL}/No Muzzle/Clippy_angled firing_up 45-no muzzle.png',   'aim_diag.png',      floor=236)
    process(f'{DL}/No Muzzle/Clippy_angled firing_down 45-no muzzle.png', 'aim_diag_down.png', floor=236)

    # P2: seven per-weapon full-body poses. Laser (blue glow) + thunder
    # (purple glow) are saturated so they survive the grey-guard, but keep
    # the floor high so light chrome barrels are not tunneled.
    print('P2 weapon bodies (7 weapons):')
    process(f'{DL}/7 weapons/Clippy_shotgun.png',  'weapon_shotgun.png',  floor=236)
    process(f'{DL}/7 weapons/Clippy_spread.png',   'weapon_spread.png',   floor=236)
    process(f'{DL}/7 weapons/Clippy_laser.png',    'weapon_laser.png',    floor=236)
    process(f'{DL}/7 weapons/Clippy_flame.png',    'weapon_flame.png',    floor=236)
    process(f'{DL}/7 weapons/Clippy_homing.png',   'weapon_homing.png',   floor=236)
    process(f'{DL}/7 weapons/Clippy_thunder.png',  'weapon_thunder.png',  floor=236)
    process(f'{DL}/7 weapons/Clippy_chainsaw.png', 'weapon_chainsaw.png', floor=236)
    print('Done.')
