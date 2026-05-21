#!/usr/bin/env python3
"""R199: process new painted Clippy run-cycle sheet + Jobs enemy sprite.

User feedback was blunt: "stop with anything procedural. we need sprites."
"this is to be like a snes game". So we generated three painted assets via
Local Howl gpt-image-2:

  1. clippy_run_sheet_raw.png — 1536×1024 sheet with 4 horizontally-tiled
     run-cycle frames. Each frame ~384px wide. Slice into 4 PNGs and
     downscale to the engine's run-frame height (~40px) so they drop in
     as v6_run_1..v6_run_4 and the engine's existing 5-key cycle picks
     them up immediately.

  2. jobs_enemy_raw.png — 1024×1536 full-body Steve Jobs in iPod-era
     turtleneck + jeans + glasses + iPod-in-hand. Downscale to 44px tall
     to match the existing JOBS hitbox (32×44).

  3. (jobs_portrait_raw.png) — square boss-intro portrait, processed
     separately when its gen completes.

Pipeline mirrors process-r175-sprites.py:
  - BFS-flood near-black corners → alpha (so background drops to
    transparent without bleeding into Jobs' black turtleneck)
  - Crop to content bbox
  - LANCZOS downscale to the target height
"""
import os
from PIL import Image

STAGING = '/Users/jrippy/clippy-first-blood/_staging/r199'
OUT     = '/Users/jrippy/clippy-first-blood/assets/sprites'


def knockout_black_bg(im, thresh=24):
    """BFS-flood from the four corners. Anything contiguous + dark enough
    becomes transparent. Stops at the first non-dark pixel so interior
    black (Clippy's wire, Jobs' turtleneck) is preserved."""
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


def process_run_sheet():
    """Slice 4 frames out of the horizontal run sheet, knockout each,
    crop, downscale to 40px tall. Saves as v6_run_1..v6_run_4."""
    src = os.path.join(STAGING, 'clippy_run_sheet_raw.png')
    if not os.path.exists(src):
        print(f'  MISSING {src}')
        return
    sheet = Image.open(src).convert('RGBA')
    sw, sh = sheet.size
    # Sheet is 4 frames arranged horizontally. Slice evenly.
    frame_w = sw // 4
    for i in range(4):
        crop = sheet.crop((i * frame_w, 0, (i + 1) * frame_w, sh))
        crop = knockout_black_bg(crop)
        crop = crop_to_content(crop)
        crop = downscale(crop, 40)
        dst = os.path.join(OUT, f'v6_run_{i + 1}.png')
        crop.save(dst, 'PNG', optimize=True)
        print(f'  run frame {i+1} -> v6_run_{i+1}.png ({crop.size[0]}x{crop.size[1]})')


def process_jobs():
    """Knockout, crop, downscale Jobs to 44px tall to match enemy hitbox."""
    src = os.path.join(STAGING, 'jobs_enemy_raw.png')
    if not os.path.exists(src):
        print(f'  MISSING {src}')
        return
    im = Image.open(src)
    im = knockout_black_bg(im)
    im = crop_to_content(im)
    im = downscale(im, 44)
    dst = os.path.join(OUT, 'enemy_jobs.png')
    im.save(dst, 'PNG', optimize=True)
    print(f'  jobs -> enemy_jobs.png ({im.size[0]}x{im.size[1]})')


def process_jobs_portrait():
    """Process the square boss-intro portrait. Keep the background (the
    moody keynote lighting is part of the composition) — just downscale
    to 88×88 so it slots into the boss-intro draw cleanly. No knockout
    here since the painted backdrop is on purpose."""
    src = os.path.join(STAGING, 'jobs_portrait_raw.png')
    if not os.path.exists(src):
        print(f'  MISSING {src}')
        return
    im = Image.open(src).convert('RGBA')
    # Don't knockout — the dark purple keynote backdrop is intentional.
    # Just scale to 88×88 so the intro renderer can drop it in.
    im = im.resize((88, 88), Image.LANCZOS)
    dst = os.path.join(OUT, 'boss_jobs_portrait.png')
    im.save(dst, 'PNG', optimize=True)
    print(f'  jobs portrait -> boss_jobs_portrait.png ({im.size[0]}x{im.size[1]})')


def process_weapon_pose(name):
    """Knockout + crop + downscale a single Clippy-with-weapon pose.
    Saves as v6_<name>.png at 40px tall (matches the run-cycle frames
    so the engine can swap them transparently)."""
    src = os.path.join(STAGING, f'clippy_{name}_raw.png')
    if not os.path.exists(src):
        print(f'  MISSING {src}')
        return
    im = Image.open(src)
    im = knockout_black_bg(im)
    im = crop_to_content(im)
    im = downscale(im, 40)
    dst = os.path.join(OUT, f'v6_{name}.png')
    im.save(dst, 'PNG', optimize=True)
    print(f'  {name} -> v6_{name}.png ({im.size[0]}x{im.size[1]})')


def main():
    process_run_sheet()
    process_jobs()
    process_jobs_portrait()
    # R202: per-weapon Clippy poses — each shows Clippy holding the
    # specific firearm so the player can see the gun they picked up.
    for weapon in ['shotgun', 'spread', 'laser', 'flame', 'homing', 'thunder', 'chainsaw']:
        process_weapon_pose(weapon)
    # R204: jump pose with rifle. Uses the same downscale path but
    # saved as v6_jump.png (replaces v5_jump.png in the manifest).
    src = os.path.join(STAGING, 'clippy_jump_raw.png')
    if os.path.exists(src):
        im = Image.open(src)
        im = knockout_black_bg(im)
        im = crop_to_content(im)
        im = downscale(im, 40)
        dst = os.path.join(OUT, 'v6_jump.png')
        im.save(dst, 'PNG', optimize=True)
        print(f'  jump -> v6_jump.png ({im.size[0]}x{im.size[1]})')


if __name__ == '__main__':
    main()
