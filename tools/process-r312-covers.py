#!/usr/bin/env python3
"""R312: knockout backgrounds + downscale cover-tile sprites.

For each cover prop:
1. Detect background (most images: dark grey checker; serverroom: already alpha)
2. BFS-flood from corners on near-background-color pixels → set alpha to 0
3. Crop to content bounding box
4. Downscale to target height (~40 px tall — fits the 16-tile + ~24 above)

Output: assets/sprites/cover_<theme>.png
"""
import os
from PIL import Image

STAGING = '/tmp/r312-staging'
OUT_DIR = '/Users/jrippy/clippy-first-blood/assets/sprites'

# Target output heights — cover tiles need to extend ~24 px above the
# T=16 tile floor, so total ~40 px tall. Width auto-scales by aspect ratio.
TARGET_H = 40


def is_bg_pixel(r, g, b, thresh=42):
    """Background = dark grey (the checker-pattern void) or near-pure black.
    The checker uses two greys around #1a1a1a / #2a2a2a. Set the threshold
    generous enough to catch both squares of the pattern.

    R326 fix: gpt-image-2's "transparent background" is actually ~RGB(73,73,72)
    near-black, NOT pure black. The original 48 threshold missed it.
    Default raised to 85, plus a chroma check so deep-saturated colors
    (dark green moss, dark red velvet) don't get eaten as background — only
    near-grey pixels qualify."""
    if r >= thresh or g >= thresh or b >= thresh:
        return False
    # Chroma check: BG must be near-grey (R/G/B within 8 of each other).
    # Genuine dark-saturated sprite colors (e.g. RGB(8, 60, 30) dark moss)
    # have larger channel spreads and won't qualify.
    if max(r, g, b) - min(r, g, b) > 8:
        return False
    return True


def is_bg_pixel_light(r, g, b, thresh_lo=200):
    """R328 fix: handle LIGHT checker backgrounds too (the transparency
    pattern shown as white-grey checkers in some PNG exports). Any pixel
    above thresh_lo on all channels + near-grey qualifies as BG."""
    if r < thresh_lo or g < thresh_lo or b < thresh_lo:
        return False
    if max(r, g, b) - min(r, g, b) > 12:
        return False
    return True


def knockout(im, thresh=42, light_mode=False):
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    visited = bytearray(w * h)
    stack = []
    bg_test = (lambda r,g,b: is_bg_pixel_light(r,g,b)) if light_mode else \
              (lambda r,g,b: is_bg_pixel(r,g,b,thresh))
    for cx, cy in [(0, 0), (w-1, 0), (0, h-1), (w-1, h-1)]:
        r, g, b, _ = px[cx, cy]
        if bg_test(r, g, b):
            stack.append((cx, cy))
    while stack:
        x, y = stack.pop()
        idx = y * w + x
        if visited[idx]:
            continue
        visited[idx] = 1
        r, g, b, _ = px[x, y]
        if not bg_test(r, g, b):
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
    """R326: LANCZOS downscale interpolates across the knocked-out edge,
    leaving a halo of low-alpha pixels that read as a hard rectangular
    silhouette in-game. Snap any pixel below `alpha_thresh` to fully
    transparent so the sprite has clean edges at the final 40-px scale."""
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < alpha_thresh:
                px[x, y] = (0, 0, 0, 0)
    return im


def process(raw, out_name, knockout_thresh=85, light_mode=False):
    src = os.path.join(STAGING, raw)
    if not os.path.exists(src):
        print(f'  SKIP {raw}: not downloaded')
        return
    im = Image.open(src).convert('RGBA')
    if knockout_thresh > 0 or light_mode:
        im = knockout(im, thresh=knockout_thresh, light_mode=light_mode)
    im = crop_to_content(im)
    im = downscale_to_h(im, TARGET_H)
    # R326: clean up LANCZOS halo after downscale
    im = post_alpha_threshold(im, alpha_thresh=128)
    # Re-crop after alpha cleanup in case knockout extends the bbox
    im = crop_to_content(im)
    out = os.path.join(OUT_DIR, out_name)
    im.save(out)
    print(f'  {out}: {im.size}')


if __name__ == '__main__':
    print('=== R312 — cover tile sprites ===')
    # R326: thresholds bumped from 30-48 to 85 because gpt-image-2's
    # "transparent" output is near-RGB(73,73,72), not pure black. Chroma
    # check inside is_bg_pixel prevents eating dark-saturated sprite colors.
    process('cover_jungle_raw.png',     'cover_jungle.png',     knockout_thresh=85)
    process('cover_breakroom_raw.png',  'cover_breakroom.png',  knockout_thresh=85)
    # R328: serverroom raw has a LIGHT checker BG (white-grey transparency
    # checker baked into the PNG). Use light_mode knockout.
    process('cover_serverroom_raw.png', 'cover_serverroom.png', knockout_thresh=0, light_mode=True)
    process('cover_keynote_raw.png',    'cover_keynote.png',    knockout_thresh=85)
    process('cover_founder_raw.png',    'cover_founder.png',    knockout_thresh=85)
    process('cover_sewer_raw.png',      'cover_sewer.png',      knockout_thresh=85)
    print('Done.')
