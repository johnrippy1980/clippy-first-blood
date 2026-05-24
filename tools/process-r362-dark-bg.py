#!/usr/bin/env python3
"""R362 — derive a 'dark frame' from the painted apocalypse street bg.

Cross-fading the original with this dark version makes the windows
flicker + fires pulse, KEYED TO THE ACTUAL PIXEL POSITIONS in the
painted bg (not random vector rectangles like R361 tried to do).

Algorithm:
  1. Open the painted bg
  2. For each pixel, detect if it's a "lit window" or "active fire":
     - lit window: bright yellow / orange / red on a dark surrounding
       (RGB ratio R > 1.4 * B AND R > 180)
     - active fire: hot orange/red with high saturation
  3. Lit window pixels: darken to a deep-shadow neutral
  4. Fire pixels: keep partially (50%) — fires don't go fully out, just
     dim down between flicker frames
  5. Save as bg_apocalypse_street_dark.png alongside the original

The renderer then cross-fades between bright + dark frames on a
per-pixel basis driven by per-window timer noise. Result: lights
flicker in the actual window slots + fires pulse on the actual cars.
"""
import os
from PIL import Image

import sys
# Allow passing a different bg to process
if len(sys.argv) > 1:
    SRC = sys.argv[1]
    OUT_DARK = SRC.replace('.png', '_dark.png')
else:
    SRC = 'assets/sprites/bg_apocalypse_street.png'
    OUT_DARK = 'assets/sprites/bg_apocalypse_street_dark.png'


def is_lit_window(r, g, b, y, h):
    """Bright yellow / warm pixel in the lower half — likely a glowing
    window. Sky pixels in the upper half are excluded so we don't
    darken the burning sky."""
    if y < h * 0.18:   # top 18% is sky — skip
        return False
    if r < 190:
        return False
    if g < 140:        # require yellow tint (real windows have green channel)
        return False
    if r < g * 1.05:   # not warm enough vs green
        return False
    if b > r * 0.50:   # too blue
        return False
    return True


def is_active_fire(r, g, b):
    """Hot orange/red flame pixel — bright warm tones in the fire body."""
    # Broader threshold: any pixel with strong red dominance
    # and decent brightness counts as fire-glow
    if r < 150:
        return False
    if r < g * 1.05:  # not red-dominant enough
        return False
    if b > r * 0.65:
        return False
    return True


def dim_lit_window(r, g, b):
    """Knock a lit-window pixel down to surrounding shadow tone."""
    # Average with deep purple-grey shadow ~ #1a1018
    return (
        int((r * 0.18) + 0x1a * 0.82),
        int((g * 0.18) + 0x10 * 0.82),
        int((b * 0.18) + 0x18 * 0.82),
        255,
    )


def dim_fire(r, g, b):
    """Knock a fire pixel down ~50% — embers stay glowing dimly."""
    return (int(r * 0.55), int(g * 0.40), int(b * 0.35), 255)


im = Image.open(SRC).convert('RGBA')
w, h = im.size
print(f'source: {w}x{h}')
px = im.load()
n_lit = 0
n_fire = 0
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        if a == 0:
            continue
        if is_lit_window(r, g, b, y, h):
            px[x, y] = dim_lit_window(r, g, b)
            n_lit += 1
        elif is_active_fire(r, g, b):
            px[x, y] = dim_fire(r, g, b)
            n_fire += 1
im.save(OUT_DARK)
print(f'wrote: {OUT_DARK}  ({w}x{h})')
print(f'  lit-window pixels dimmed: {n_lit}')
print(f'  fire pixels dimmed: {n_fire}')
