#!/usr/bin/env python3
"""R652: process the painted auto-lower lift sprites (Local Howl / Lift-STL,
gpt-image-2) into game assets. Knocks out the pure-white studio background
(BFS-flood from the corners through near-white, matching process-v2-sprites),
crops to content, and downscales:
  - tile_lift      (the moving deck car)  -> 16px TALL (collision band height)
  - tile_lift_rail (the shaft guide rail) -> 16px TALL (one tile unit, tiled)
Writes to assets/bg/ where the other tile_* sprites live."""

import os
from PIL import Image

SRC = '/Users/jrippy/clippy-first-blood/_reference/genai'
DST = '/Users/jrippy/clippy-first-blood/assets/bg'

# (src_basename, dst_filename, mode, white_floor)
# white_floor: the BFS flood treats a pixel as background only if every channel
# is >= this. The rail's chrome + teal-groove highlights run as high as ~235, so
# a 230 floor (fine for the darker-slate car) tunnels through the rail body and
# erases it. A 248 floor keeps the flood to the true #fefefe studio margin.
# mode:
#   ('car', target_h)      -> scale whole sprite to target_h px tall (deck car)
#   ('railtile',)          -> the rail is a tall vertical strip; slice ONE
#                             vertical repeat unit and square it to 16x16 so
#                             level.js can tile it seamlessly down the shaft.
JOBS = [
    ('lift_car_1.png',  'tile_lift.png',      ('car', 16), 230),
    ('lift_rail_2.png', 'tile_lift_rail.png', ('railtile',), 248),
]


def knockout_bg(im, white_floor=230):
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    corner_alphas = [px[0, 0][3], px[w-1, 0][3], px[0, h-1][3], px[w-1, h-1][3]]
    if min(corner_alphas) < 16:
        return im
    TOL = 22

    def is_white(r, g, b):
        return r >= white_floor and g >= white_floor and b >= white_floor and \
            abs(r - g) < TOL and abs(g - b) < TOL and abs(r - b) < TOL

    visited = bytearray(w * h)
    stack = []
    for cx, cy in [(0, 0), (w-1, 0), (0, h-1), (w-1, h-1)]:
        r, g, b, _ = px[cx, cy]
        if is_white(r, g, b):
            stack.append((cx, cy))
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
        for nx, ny in ((x+1, y), (x-1, y), (x, y+1), (x, y-1)):
            if 0 <= nx < w and 0 <= ny < h and not visited[ny*w + nx]:
                stack.append((nx, ny))
    return im


def crop_to_content(im):
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def downscale_h(im, target_h):
    w, h = im.size
    if h == target_h:
        return im
    ratio = target_h / h
    tw = max(1, int(round(w * ratio)))
    return im.resize((tw, target_h), Image.LANCZOS)


def railtile(im):
    """The rail is one tall vertical strip with a repeating rung pattern. Take a
    single repeat unit from the middle (avoid the rounded end-caps) and square it
    to 16x16 so level.js can tile it down the shaft seamlessly. The repeat period
    is the cropped height divided by the rung count (the art has ~6 teal segments
    over its length)."""
    w, h = im.size
    SEGMENTS = 6
    period = h // SEGMENTS
    # Pull a unit starting one period in, so we skip the top cap. Use a window of
    # exactly `period` tall, full width.
    y0 = period
    unit = im.crop((0, y0, w, y0 + period))
    return unit.resize((16, 16), Image.LANCZOS)


def main():
    os.makedirs(DST, exist_ok=True)
    for src, dst, mode, white_floor in JOBS:
        p = os.path.join(SRC, src)
        if not os.path.exists(p):
            print(f'  MISSING {src}')
            continue
        im = Image.open(p)
        im = knockout_bg(im, white_floor)
        im = crop_to_content(im)
        if mode[0] == 'car':
            im = downscale_h(im, mode[1])
        elif mode[0] == 'railtile':
            im = railtile(im)
        out = os.path.join(DST, dst)
        im.save(out, 'PNG', optimize=True)
        print(f'  {src}  ->  {dst}  ({im.size[0]}x{im.size[1]})')


if __name__ == '__main__':
    main()
