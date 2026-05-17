#!/usr/bin/env python3
"""Auto-crop transparent margins and downscale gpt-image-2 sprite outputs
to the game's expected resolution. Outputs to assets/sprites/.

The model gives us 1024x1024 with the sprite occupying ~70% of frame.
We:
  1. Find the bounding box of non-transparent pixels.
  2. Crop tightly to that bbox + small margin.
  3. Downscale to fit within (target_w, target_h) using NEAREST so we
     preserve the pixel-art aesthetic (no anti-aliasing).
  4. Save with full alpha.
"""
import sys, os
from PIL import Image

def chroma_key(img, tol=30):
    """gpt-image-2 returns RGB with the 'transparent' background painted
    a near-uniform light color. Sample the 4 corners, average them, and
    knock out any pixel within `tol` Euclidean distance. Yields a clean
    RGBA image with real alpha."""
    img = img.convert('RGBA')
    w, h = img.size
    px = img.load()
    # Sample corners to find background color
    corners = [px[0,0], px[w-1,0], px[0,h-1], px[w-1,h-1]]
    # Use the most common one (some renders put sprite shadow in a corner)
    from collections import Counter
    bg_rgb = Counter([(c[0], c[1], c[2]) for c in corners]).most_common(1)[0][0]
    br, bg_, bb = bg_rgb
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            d = ((r-br)**2 + (g-bg_)**2 + (b-bb)**2) ** 0.5
            if d <= tol:
                px[x, y] = (0, 0, 0, 0)
    return img


def process(src_path, dst_path, target_h=48, margin=2):
    raw = Image.open(src_path)
    img = chroma_key(raw)
    w, h = img.size

    # Find bbox of opaque pixels
    bbox = img.getbbox()
    if not bbox:
        print(f"  WARN: {src_path} has no opaque pixels")
        return False

    cropped = img.crop(bbox)
    cw, ch = cropped.size

    # Downscale to target_h while preserving aspect ratio
    scale = target_h / ch
    new_w = max(1, round(cw * scale))
    new_h = max(1, round(ch * scale))

    # First nearest-neighbour pass to chunky pixels
    small = cropped.resize((new_w, new_h), Image.NEAREST)
    # Add small transparent margin
    out = Image.new('RGBA', (new_w + margin * 2, new_h + margin * 2), (0,0,0,0))
    out.paste(small, (margin, margin), small)

    out.save(dst_path)
    print(f"  {src_path} -> {dst_path} ({new_w + margin*2}x{new_h + margin*2})")
    return True


if __name__ == '__main__':
    # Usage: process-sprites.py <src1> <dst1> <h1> [<src2> <dst2> <h2> ...]
    args = sys.argv[1:]
    while args:
        src, dst, h = args[:3]
        args = args[3:]
        process(src, dst, int(h))
