#!/usr/bin/env python3
"""R416: slice gpt-image-2 explosion sheet → 4 frames, knock out magenta+cyan
checkerboard, autocrop, downscale to a 32px game-ready frame."""
from PIL import Image
from pathlib import Path

SRC = Path("/tmp/r416_staging/explosion_raw.png")
OUT_DIR = Path("/Users/jrippy/clippy-first-blood/assets/sprites")

img = Image.open(SRC).convert("RGBA")
W, H = img.size
print(f"raw: {W}x{H}")

# Knock out magenta + cyan checker. Tolerant — these colors are saturated.
px = img.load()
for y in range(H):
    for x in range(W):
        r, g, b, a = px[x, y]
        # Drop checker (magenta/cyan) and grid AA. KEEP warm sprite colors
        # AND neutral smoke greys. A pixel is bg-checker if blue dominates
        # OR if red AND blue are both high but green is low (magenta).
        is_strongly_blue = (b > r + 30 and b > g + 10)
        is_strongly_magenta = (r > 150 and b > 150 and g < r - 40 and g < b - 40)
        is_strongly_cyan = (g > 150 and b > 150 and r < g - 40 and r < b - 40)
        is_dim = (r + g + b < 50)
        if is_strongly_blue or is_strongly_magenta or is_strongly_cyan or is_dim:
            px[x, y] = (0, 0, 0, 0)

# Find the 4 frame boxes by horizontal projection of non-transparent pixels
col_has = [0] * W
for x in range(W):
    cnt = 0
    for y in range(H):
        if px[x, y][3] > 0:
            cnt += 1
    col_has[x] = cnt

# Group contiguous columns with content (smoothed)
# Smooth with a 25-col moving average to ignore single-column dips inside sprites
WIN = 25
smooth = []
for x in range(W):
    lo = max(0, x - WIN // 2)
    hi = min(W, x + WIN // 2 + 1)
    s = sum(col_has[lo:hi]) / (hi - lo)
    smooth.append(s)

runs = []
cur = None
THRESH = 50
for x in range(W):
    if smooth[x] > THRESH:
        if cur is None:
            cur = [x, x]
        else:
            cur[1] = x
    else:
        if cur is not None and cur[1] - cur[0] > 60:
            runs.append(tuple(cur))
        cur = None
if cur is not None and cur[1] - cur[0] > 60:
    runs.append(tuple(cur))
# Merge runs whose gap is smaller than the smaller run width (handles ring-shaped sprites)
merged = []
for r in runs:
    if merged and (r[0] - merged[-1][1]) < 20:
        merged[-1] = (merged[-1][0], r[1])
    else:
        merged.append(r)
runs = merged
print(f"detected runs: {runs}")

assert len(runs) == 4, f"expected 4 frames, got {len(runs)}"

for i, (x0, x1) in enumerate(runs, 1):
    # Crop the run column range, then within it compute row mask + tighten.
    # bbox() can be polluted by stray checker remnants, so apply same THRESH
    # filter on rows to find the real vertical extent.
    box = img.crop((x0, 0, x1 + 1, H))
    bw_pre, bh_pre = box.size
    bpx = box.load()
    row_has = [0] * bh_pre
    for y in range(bh_pre):
        cnt = 0
        for x in range(bw_pre):
            if bpx[x, y][3] > 0:
                cnt += 1
        row_has[y] = cnt
    # Find first/last row with substantial content
    # Threshold scales with width — needs ~25% of cols to contain sprite content
    row_thresh = max(8, bw_pre // 6)
    y0 = next((y for y in range(bh_pre) if row_has[y] > row_thresh), 0)
    y1 = next((y for y in range(bh_pre - 1, -1, -1) if row_has[y] > row_thresh), bh_pre - 1)
    box = box.crop((0, y0, bw_pre, y1 + 1))
    bw, bh = box.size
    # Pad to square so downscale preserves aspect
    side = max(bw, bh)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(box, ((side - bw) // 2, (side - bh) // 2))
    # Downscale to 48x48 for explosion (bigger than fire — these are payoff)
    out = sq.resize((48, 48), Image.LANCZOS)
    dest = OUT_DIR / f"ambient_explosion_{i}.png"
    out.save(dest)
    print(f"wrote {dest} from {bw}x{bh} -> 48x48")
