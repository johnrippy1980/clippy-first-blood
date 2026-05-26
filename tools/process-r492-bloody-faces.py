#!/usr/bin/env python3
"""R492: slice the bloody-face HUD sheet into 3 painted 32x32 frames."""
from PIL import Image
from pathlib import Path

STAGING = Path("/tmp/r492_staging")
OUT_DIR = Path("/Users/jrippy/clippy-first-blood/assets/sprites")

def knockout_checker(img):
    px = img.load()
    W, H = img.size
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            is_strongly_blue = (b > r + 30 and b > g + 10)
            is_strongly_magenta = (r > 150 and b > 150 and g < r - 40 and g < b - 40)
            is_strongly_cyan = (g > 150 and b > 150 and r < g - 40 and r < b - 40)
            is_dim = (r + g + b < 50)
            if is_strongly_blue or is_strongly_magenta or is_strongly_cyan or is_dim:
                px[x, y] = (0, 0, 0, 0)
    return img

def tight_crop(img):
    px = img.load()
    W, H = img.size
    col_has = [sum(1 for y in range(H) if px[x, y][3] > 0) for x in range(W)]
    row_has = [sum(1 for x in range(W) if px[x, y][3] > 0) for y in range(H)]
    col_thresh = max(5, H // 20)
    row_thresh = max(5, W // 20)
    x0 = next((x for x in range(W) if col_has[x] > col_thresh), 0)
    x1 = next((x for x in range(W - 1, -1, -1) if col_has[x] > col_thresh), W - 1)
    y0 = next((y for y in range(H) if row_has[y] > row_thresh), 0)
    y1 = next((y for y in range(H - 1, -1, -1) if row_has[y] > row_thresh), H - 1)
    return img.crop((x0, y0, x1 + 1, y1 + 1))

img = Image.open(STAGING / "bloody_faces_raw.png").convert("RGBA")
img = knockout_checker(img)
W, H = img.size
print(f"raw {W}x{H}")
# 3 equal slices
panel_w = W / 3
runs = [(int(i * panel_w + 12), int((i + 1) * panel_w - 12)) for i in range(3)]
names = ['bloody_med', 'bloody_heavy', 'berserk']
for i, ((x0, x1), label) in enumerate(zip(runs, names)):
    panel = img.crop((x0, 0, x1 + 1, H))
    panel = tight_crop(panel)
    bw, bh = panel.size
    side = max(bw, bh)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(panel, ((side - bw) // 2, (side - bh) // 2))
    out = sq.resize((32, 32), Image.LANCZOS)
    dest = OUT_DIR / f"doom_face_{label}.png"
    out.save(dest)
    print(f"  wrote {dest.name} ({bw}x{bh} -> 32x32)")
