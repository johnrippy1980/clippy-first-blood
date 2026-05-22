#!/usr/bin/env python3
"""R225 — process Dr. Spindler boss assets.

Inputs (in _reference/r225/):
  spindler_portrait_raw.png   — 1024x1024 cinematic portrait (purple-tinted bg already)
  spindler_sheet_raw.png      — sprite sheet with 4 poses on transparent bg
  sewer_raw.png               — 1536x1024 stage background
  lab_raw.png                 — 1536x1024 stage background

Outputs:
  assets/sprites/boss_spindler_portrait.png    (untouched, used by cinematic card)
  assets/sprites/boss_spindler.png             (idle pose, 96h, sliced from sheet[0])
  assets/sprites/boss_spindler_fire.png        (firing syringe, 96h, sheet[1])
  assets/sprites/boss_spindler_hurt.png        (hurt recoil, 96h, sheet[2])
  assets/sprites/boss_spindler_death.png       (death pose, 96h, sheet[3])
  assets/backgrounds/stage_sewer.png           (downscaled to 384x224 -- 1.5x cam width)
  assets/backgrounds/stage_lab.png             (downscaled to 384x224)
"""

import os
from PIL import Image

ROOT = '/Users/jrippy/clippy-first-blood'
REF  = os.path.join(ROOT, '_reference/r225')
SPRITES = os.path.join(ROOT, 'assets/sprites')
BGS = os.path.join(ROOT, 'assets/backgrounds')

os.makedirs(BGS, exist_ok=True)

BOSS_H = 96  # height for in-game boss sprite
PORTRAIT_H = 256  # height for portrait used in cinematic card (matches existing _portrait files)
BG_W = 384  # 1.5x camera width — leaves some pan room
BG_H = 224  # matches camera height exactly


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


def downscale_to_fit(im, target_w, target_h):
    """Downscale so the longer dim fits, preserving aspect. Crop to exact target."""
    w, h = im.size
    rw = target_w / w
    rh = target_h / h
    r = max(rw, rh)
    tw = max(1, int(round(w * r)))
    th = max(1, int(round(h * r)))
    im = im.resize((tw, th), Image.LANCZOS)
    # center crop
    left = (tw - target_w) // 2
    top  = (th - target_h) // 2
    return im.crop((left, top, left + target_w, top + target_h))


def knockout_white_bg(im):
    """The 'transparent' Howl PNG actually has a near-white solid bg. Convert
    near-white to alpha via BFS-flood from all 4 corners. Threshold at RGB > 220
    (everything brighter than this becomes background)."""
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    THRESH = 220
    def is_white(r, g, b):
        return r >= THRESH and g >= THRESH and b >= THRESH
    visited = bytearray(w * h)
    stack = []
    for cx, cy in [(0,0),(w-1,0),(0,h-1),(w-1,h-1)]:
        r, g, b, _ = px[cx, cy]
        if is_white(r, g, b):
            stack.append((cx, cy))
    if not stack:
        return im
    while stack:
        x, y = stack.pop()
        idx = y * w + x
        if visited[idx]:
            continue
        visited[idx] = 1
        r, g, b, _ = px[x, y]
        if not is_white(r, g, b):
            continue
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
            if 0 <= nx < w and 0 <= ny < h and not visited[ny*w + nx]:
                stack.append((nx, ny))
    return im


def slice_sheet_into_frames(im, n_frames=4):
    """Slice into 4 frames using column-density valleys.

    Strategy: after white knockout, scan opaque-pixel-counts per column.
    Find the n_frames-1 widest low-density valleys (gaps between poses).
    Each pose becomes a slice between successive valleys, then BBox-cropped.
    """
    im = knockout_white_bg(im)
    w, h = im.size
    px = im.load()

    # Per-column opaque pixel count (alpha > 32)
    dens = [0] * w
    for x in range(w):
        c = 0
        for y in range(h):
            if px[x, y][3] > 32:
                c += 1
        dens[x] = c

    # Smooth the density (5-px box)
    smooth = []
    for x in range(w):
        s = 0; n = 0
        for k in range(-3, 4):
            xx = x + k
            if 0 <= xx < w:
                s += dens[xx]; n += 1
        smooth.append(s / n if n else 0)

    # Find candidate valleys: contiguous runs where smoothed density < threshold.
    # Pick threshold as 15% of the median density.
    median_d = sorted(smooth)[len(smooth)//2]
    thresh = max(8, median_d * 0.15)
    valleys = []
    in_valley = False
    vs = 0
    for x in range(w):
        if smooth[x] < thresh:
            if not in_valley:
                in_valley = True; vs = x
        else:
            if in_valley:
                in_valley = False
                if x - vs >= 8:  # minimum valley width
                    valleys.append((vs, x, (vs + x) // 2))
    if in_valley and w - vs >= 8:
        valleys.append((vs, w, (vs + w) // 2))

    # Drop edge valleys (image padding) — only keep interior gaps
    interior = [v for v in valleys if v[0] > 20 and v[1] < w - 20]
    print(f'  density valleys (interior): {len(interior)}')
    for s, e, c in interior:
        print(f'    valley cols {s}-{e}  center={c}')

    needed = n_frames - 1
    # Use what valleys we have, sort by width, take top `needed`.
    # If we're short, pad with even spacing between the existing valleys.
    interior.sort(key=lambda v: -(v[1] - v[0]))
    splits = [v[2] for v in interior[:needed]]
    splits.sort()

    if len(splits) < needed:
        # Insert evenly-spaced extras to reach n_frames-1 cuts. We use the gap
        # between known splits (and the edges) and bisect the widest gap.
        boundaries = [0] + splits + [w]
        while len(splits) < needed:
            # Find widest gap
            widest_gap_idx = 0
            widest_gap_w = 0
            for i in range(len(boundaries) - 1):
                gw = boundaries[i+1] - boundaries[i]
                if gw > widest_gap_w:
                    widest_gap_w = gw
                    widest_gap_idx = i
            mid = (boundaries[widest_gap_idx] + boundaries[widest_gap_idx + 1]) // 2
            boundaries.insert(widest_gap_idx + 1, mid)
            splits.append(mid)
            splits.sort()
        print(f'  padded splits: {splits}')

    bounds = []
    prev = 0
    for c in splits:
        bounds.append((prev, c))
        prev = c
    bounds.append((prev, w))

    frames = []
    for xs, xe in bounds:
        frame = im.crop((xs, 0, xe, h))
        frame = crop_to_content(frame)
        frames.append(frame)
    return frames


def main():
    print('=== R225: Dr. Spindler asset processing ===\n')

    # 1. Portrait — just copy/downscale to 256h. Keep its painted bg (cinematic).
    print('Portrait:')
    portrait_src = os.path.join(REF, 'spindler_portrait_raw.png')
    portrait = Image.open(portrait_src).convert('RGBA')
    portrait_out = downscale(portrait, PORTRAIT_H)
    portrait_dst = os.path.join(SPRITES, 'boss_spindler_portrait.png')
    portrait_out.save(portrait_dst, 'PNG', optimize=True)
    print(f'  {portrait_src} ({portrait.size[0]}x{portrait.size[1]}) -> {portrait_dst} ({portrait_out.size[0]}x{portrait_out.size[1]})')

    # 2. Sprite sheet — slice into 4 frames, downscale each to 96h.
    print('\nSprite sheet:')
    sheet_src = os.path.join(REF, 'spindler_sheet_raw.png')
    sheet = Image.open(sheet_src).convert('RGBA')
    frames = slice_sheet_into_frames(sheet, n_frames=4)

    frame_names = ['boss_spindler.png', 'boss_spindler_fire.png',
                   'boss_spindler_hurt.png', 'boss_spindler_death.png']
    for i, (frame, name) in enumerate(zip(frames, frame_names)):
        frame = crop_to_content(frame)
        frame = downscale(frame, BOSS_H)
        dst = os.path.join(SPRITES, name)
        frame.save(dst, 'PNG', optimize=True)
        print(f'  frame {i}: {name} ({frame.size[0]}x{frame.size[1]})')

    # 3. Backgrounds — downscale to 384x224. Camera width is 256 (16:14 nominal),
    #    so 384 gives us a 50% pan range. Stage 4 has 2 backdrop phases.
    print('\nBackgrounds:')
    for src_name, dst_name in [('sewer_raw.png', 'stage_sewer.png'),
                                ('lab_raw.png',   'stage_lab.png')]:
        src = os.path.join(REF, src_name)
        im = Image.open(src).convert('RGBA')
        im_out = downscale_to_fit(im, BG_W, BG_H)
        dst = os.path.join(BGS, dst_name)
        im_out.save(dst, 'PNG', optimize=True)
        print(f'  {src_name} ({im.size[0]}x{im.size[1]}) -> {dst_name} ({im_out.size[0]}x{im_out.size[1]})')

    print('\nDone.')


if __name__ == '__main__':
    main()
