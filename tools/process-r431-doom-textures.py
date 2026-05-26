#!/usr/bin/env python3
"""R431+R435: scale floor/ceiling textures + slice HUD portrait sheet.
Outputs to assets/sprites/doom_*.png ready for the raycaster."""
from PIL import Image
from pathlib import Path

STAGING = Path("/tmp/r431_staging")
OUT_DIR = Path("/Users/jrippy/clippy-first-blood/assets/sprites")
OUT_DIR.mkdir(parents=True, exist_ok=True)

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

# ---------------- FLOOR + CEILING TEXTURES ----------------
print("FLOOR/CEILING TEXTURES:")
for src_name, dest_name in [
    ("floor_carpet_raw.png", "doom_floor_carpet.png"),
    ("floor_concrete_raw.png", "doom_floor_concrete.png"),
    ("ceiling_office_raw.png", "doom_ceiling_office.png"),
    ("ceiling_sewer_raw.png", "doom_ceiling_sewer.png"),
]:
    src = STAGING / src_name
    if not src.exists():
        print(f"  SKIP {src_name} (not downloaded yet)")
        continue
    img = Image.open(src).convert("RGB")
    # Resize to 64x64 to match wall texture size — raycaster samples per-pixel
    img = img.resize((64, 64), Image.LANCZOS)
    dest = OUT_DIR / dest_name
    img.save(dest)
    print(f"  wrote {dest.name} (64x64)")

# ---------------- HUD PORTRAITS ----------------
print("HUD PORTRAITS:")
src = STAGING / "portraits_raw.png"
if src.exists():
    img = Image.open(src).convert("RGBA")
    img = knockout_checker(img)
    WW, WH = img.size
    print(f"  raw {WW}x{WH}")
    # 5 frames in equal-width slices, ~307px each in 1536-wide canvas
    panel_w = WW / 5
    runs = [(int(i * panel_w + 8), int((i + 1) * panel_w - 8)) for i in range(5)]
    labels = ['full', 'hurt1', 'hurt2', 'hurt3', 'rage']
    for i, ((x0, x1), label) in enumerate(zip(runs, labels)):
        panel = img.crop((x0, 0, x1 + 1, WH))
        panel = tight_crop(panel)
        bw, bh = panel.size
        side = max(bw, bh)
        sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        sq.paste(panel, ((side - bw) // 2, (side - bh) // 2))
        # 28x28 for HUD center face — small but readable
        out = sq.resize((28, 28), Image.LANCZOS)
        dest = OUT_DIR / f"doom_face_{label}.png"
        out.save(dest)
        print(f"  wrote {dest.name} ({bw}x{bh} -> 28x28)")
else:
    print("  SKIP portraits (not downloaded yet)")

print("DONE")
