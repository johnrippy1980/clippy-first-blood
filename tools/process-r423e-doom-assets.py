#!/usr/bin/env python3
"""R423e: slice + knockout all 5 Doom asset sheets.
   - walls_raw.png  → 5 wall tiles → assets/sprites/doom_wall_{1..5}.png (64x64 each)
   - clone_raw.png  → 1 enemy billboard → doom_clone.png (cropped, knockout)
   - uzis_raw.png   → 1 boss billboard → doom_boss_spindler_uzis.png
   - wheelchair_raw.png → 1 boss billboard → doom_boss_spindler_wheelchair.png
   - weapons_raw.png → 4 weapon HUD frames → doom_weapon_{mg,shotgun,chainsaw,bfg}.png
"""
from PIL import Image
from pathlib import Path

STAGING = Path("/tmp/r423e_staging")
OUT_DIR = Path("/Users/jrippy/clippy-first-blood/assets/sprites")
OUT_DIR.mkdir(parents=True, exist_ok=True)

def knockout_checker(img):
    """Knock out magenta + cyan checkerboard pixels."""
    px = img.load()
    W, H = img.size
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            is_strongly_blue = (b > r + 30 and b > g + 10)
            is_strongly_magenta = (r > 150 and b > 150 and g < r - 40 and g < b - 40)
            is_strongly_cyan = (g > 150 and b > 150 and r < g - 40 and r < b - 40)
            if is_strongly_blue or is_strongly_magenta or is_strongly_cyan:
                px[x, y] = (0, 0, 0, 0)
    return img

def tight_crop(img, threshold=5):
    """Crop to tight bbox of non-transparent pixels (with row threshold)."""
    px = img.load()
    W, H = img.size
    # Column counts
    col_has = [sum(1 for y in range(H) if px[x, y][3] > 0) for x in range(W)]
    row_has = [sum(1 for x in range(W) if px[x, y][3] > 0) for y in range(H)]
    col_thresh = max(5, H // 20)
    row_thresh = max(5, W // 20)
    x0 = next((x for x in range(W) if col_has[x] > col_thresh), 0)
    x1 = next((x for x in range(W - 1, -1, -1) if col_has[x] > col_thresh), W - 1)
    y0 = next((y for y in range(H) if row_has[y] > row_thresh), 0)
    y1 = next((y for y in range(H - 1, -1, -1) if row_has[y] > row_thresh), H - 1)
    return img.crop((x0, y0, x1 + 1, y1 + 1))

# ---------------- WALLS ----------------
# walls_raw is 1024x1024 with 5 panels. The model didn't honor 5-wide
# layout exactly — detect panels by sustained dark columns (brightness
# dip > 60% relative to neighbors). Hardcoded fallback to 5 equal slices.
print("WALLS:")
walls = Image.open(STAGING / "walls_raw.png").convert("RGBA")
WW, WH = walls.size
print(f"  raw {WW}x{WH}")
# Hardcoded — slice into 5 equal panels (200px each with 4 inter-gutters).
# Visual inspection of /tmp/r423e_staging/walls_raw.png confirms 5 panels
# in roughly equal horizontal bands.
panel_w = WW / 5
runs = [(int(i * panel_w + 8), int((i + 1) * panel_w - 8)) for i in range(5)]
print(f"  using equal panels: {runs}")
for i, (x0, x1) in enumerate(runs, 1):
    panel = walls.crop((x0, 0, x1 + 1, WH))
    # Use the central square of the panel — gpt-image-2 sometimes adds
    # vertical margins above/below the actual wall content.
    pw, ph = panel.size
    side = min(pw, ph)
    sx = (pw - side) // 2
    sy = (ph - side) // 2
    panel = panel.crop((sx, sy, sx + side, sy + side))
    out = panel.resize((64, 64), Image.LANCZOS).convert("RGBA")
    # Force alpha = 255 for walls (opaque textures)
    out = out.convert("RGB").convert("RGBA")
    dest = OUT_DIR / f"doom_wall_{i}.png"
    out.save(dest)
    print(f"  wrote {dest.name}")

# ---------------- CLONE ----------------
print("CLONE:")
clone = Image.open(STAGING / "clone_raw.png").convert("RGBA")
clone = knockout_checker(clone)
clone = tight_crop(clone)
# Pad to square and downscale to 64x64 (raycaster billboard size)
bw, bh = clone.size
side = max(bw, bh)
sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
sq.paste(clone, ((side - bw) // 2, (side - bh) // 2))
clone = sq.resize((64, 64), Image.LANCZOS)
dest = OUT_DIR / "doom_clone.png"
clone.save(dest)
print(f"  wrote {dest.name} ({bw}x{bh} -> 64x64)")

# ---------------- SPINDLER UZIS ----------------
print("UZIS:")
img = Image.open(STAGING / "uzis_raw.png").convert("RGBA")
img = knockout_checker(img)
img = tight_crop(img)
bw, bh = img.size
side = max(bw, bh)
sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
sq.paste(img, ((side - bw) // 2, (side - bh) // 2))
img = sq.resize((96, 96), Image.LANCZOS)
dest = OUT_DIR / "doom_boss_spindler_uzis.png"
img.save(dest)
print(f"  wrote {dest.name} ({bw}x{bh} -> 96x96)")

# ---------------- SPINDLER WHEELCHAIR ----------------
print("WHEELCHAIR:")
img = Image.open(STAGING / "wheelchair_raw.png").convert("RGBA")
img = knockout_checker(img)
img = tight_crop(img)
bw, bh = img.size
side = max(bw, bh)
sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
sq.paste(img, ((side - bw) // 2, (side - bh) // 2))
img = sq.resize((112, 112), Image.LANCZOS)
dest = OUT_DIR / "doom_boss_spindler_wheelchair.png"
img.save(dest)
print(f"  wrote {dest.name} ({bw}x{bh} -> 112x112)")

# ---------------- WEAPONS ----------------
print("WEAPONS:")
weapons = Image.open(STAGING / "weapons_raw.png").convert("RGBA")
weapons = knockout_checker(weapons)
WW, WH = weapons.size
print(f"  raw {WW}x{WH}")
# Hardcoded 4 equal slices — visual check confirms 4 weapons in
# roughly equal horizontal bands across the 1536x1024 sheet.
panel_w = WW / 4
runs = [(int(i * panel_w + 12), int((i + 1) * panel_w - 12)) for i in range(4)]
print(f"  using equal panels: {runs}")
names = ['mg', 'shotgun', 'chainsaw', 'bfg']
for i, (x0, x1) in enumerate(runs):
    panel = weapons.crop((x0, 0, x1 + 1, WH))
    # Row-tighten using width-scaled threshold
    bpx = panel.load()
    bw_pre, bh_pre = panel.size
    row_has = []
    for y in range(bh_pre):
        cnt = sum(1 for x in range(bw_pre) if bpx[x, y][3] > 0)
        row_has.append(cnt)
    row_thresh = max(8, bw_pre // 6)
    y0 = next((y for y in range(bh_pre) if row_has[y] > row_thresh), 0)
    y1 = next((y for y in range(bh_pre - 1, -1, -1) if row_has[y] > row_thresh), bh_pre - 1)
    panel = panel.crop((0, y0, bw_pre, y1 + 1))
    bw, bh = panel.size
    # Pad to square w/ aspect preservation, downscale to 128 tall (HUD frame)
    target_h = 128
    target_w = int(bw / bh * target_h)
    panel = panel.resize((target_w, target_h), Image.LANCZOS)
    dest = OUT_DIR / f"doom_weapon_{names[i]}.png"
    panel.save(dest)
    print(f"  wrote {dest.name} ({bw}x{bh} -> {target_w}x{target_h})")

# ---------------- KEY ICONS (procedural — small colored cards) ----------------
print("KEYS (procedural):")
for color, rgb in [('red', (192, 32, 32)), ('yellow', (192, 192, 32)), ('blue', (32, 128, 192))]:
    img = Image.new("RGBA", (24, 24), (0, 0, 0, 0))
    px = img.load()
    # Card body — slight rim
    for y in range(4, 20):
        for x in range(5, 19):
            edge = (x == 5 or x == 18 or y == 4 or y == 19)
            px[x, y] = (rgb[0] // 2, rgb[1] // 2, rgb[2] // 2, 255) if edge else (*rgb, 255)
    # Hole for keyring
    for y in range(6, 10):
        for x in range(10, 14):
            d = abs(x - 11.5) + abs(y - 7.5)
            if d < 2.5:
                px[x, y] = (0, 0, 0, 0)
    # Notches at bottom (key-like)
    for x in range(7, 17, 2):
        px[x, 19] = (0, 0, 0, 0)
    dest = OUT_DIR / f"doom_key_{color}.png"
    img.save(dest)
    print(f"  wrote {dest.name}")

# ---------------- PICKUP ICONS (procedural) ----------------
print("PICKUPS (procedural):")
# Health = green cross
img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
px = img.load()
for y in range(2, 14):
    for x in range(6, 10): px[x, y] = (64, 192, 80, 255)
for x in range(2, 14):
    for y in range(6, 10): px[x, y] = (64, 192, 80, 255)
# White core
for y in range(7, 9):
    for x in range(7, 9): px[x, y] = (255, 255, 255, 255)
img.save(OUT_DIR / "doom_health.png")
print("  wrote doom_health.png")

# Ammo = brass box
img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
px = img.load()
for y in range(4, 13):
    for x in range(3, 13):
        px[x, y] = (192, 160, 64, 255)
        if y == 4 or y == 12 or x == 3 or x == 12:
            px[x, y] = (96, 80, 32, 255)
img.save(OUT_DIR / "doom_ammo.png")
print("  wrote doom_ammo.png")

# Weapon pickup icons — just colored squares per weapon (HUD already has the
# main art). doom_pickup_shotgun is a small floor representation.
for name, color in [('shotgun', (220, 220, 220)), ('chainsaw', (192, 64, 48)), ('bfg', (80, 220, 80))]:
    img = Image.new("RGBA", (20, 20), (0, 0, 0, 0))
    px = img.load()
    for y in range(3, 17):
        for x in range(3, 17):
            edge = (x == 3 or x == 16 or y == 3 or y == 16)
            px[x, y] = (color[0] // 2, color[1] // 2, color[2] // 2, 255) if edge else (*color, 255)
    img.save(OUT_DIR / f"doom_pickup_{name}.png")
    print(f"  wrote doom_pickup_{name}.png")

print("DONE")
