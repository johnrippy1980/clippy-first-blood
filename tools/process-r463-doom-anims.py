#!/usr/bin/env python3
"""R463+R464: slice gun + enemy animation sheets into per-frame PNGs."""
from PIL import Image
from pathlib import Path

STAGING = Path("/tmp/r463_staging")
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

def slice_grid(img_path, cols, rows, out_names, target_h):
    """Knock out + slice into cols×rows grid, output each to target_h tall."""
    img = Image.open(img_path).convert("RGBA")
    img = knockout_checker(img)
    W, H = img.size
    cw = W / cols
    ch = H / rows
    pad_x = 16
    pad_y = 16
    for r in range(rows):
        for c in range(cols):
            i = r * cols + c
            if i >= len(out_names): break
            x0 = int(c * cw + pad_x)
            y0 = int(r * ch + pad_y)
            x1 = int((c + 1) * cw - pad_x)
            y1 = int((r + 1) * ch - pad_y)
            cell = img.crop((x0, y0, x1, y1))
            cell = tight_crop(cell)
            bw, bh = cell.size
            side = max(bw, bh)
            sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
            sq.paste(cell, ((side - bw) // 2, (side - bh) // 2))
            # For weapons keep aspect ratio (taller than wide)
            target_w = int(bw / bh * target_h)
            out = cell.resize((target_w, target_h), Image.LANCZOS)
            dest = OUT_DIR / out_names[i]
            out.save(dest)
            print(f"  wrote {dest.name} ({bw}x{bh} -> {target_w}x{target_h})")

print("GUN ANIMATIONS:")
slice_grid(
    STAGING / "gun_anim_raw.png",
    cols=4, rows=2,
    out_names=[
        'doom_weapon_mg_fire.png',
        'doom_weapon_shotgun_fire.png',
        'doom_weapon_chainsaw_fire.png',
        'doom_weapon_bfg_fire.png',
        'doom_weapon_mg_recover.png',
        'doom_weapon_shotgun_recover.png',
        'doom_weapon_chainsaw_recover.png',
        'doom_weapon_bfg_recover.png',
    ],
    target_h=128,
)

print("ENEMY ANIMATIONS:")
# Enemy frames are square billboards at 64×64
def slice_enemy_grid(img_path, cols, rows, out_names, target_size):
    img = Image.open(img_path).convert("RGBA")
    img = knockout_checker(img)
    W, H = img.size
    cw = W / cols
    ch = H / rows
    pad = 16
    for r in range(rows):
        for c in range(cols):
            i = r * cols + c
            if i >= len(out_names): break
            x0 = int(c * cw + pad)
            y0 = int(r * ch + pad)
            x1 = int((c + 1) * cw - pad)
            y1 = int((r + 1) * ch - pad)
            cell = img.crop((x0, y0, x1, y1))
            cell = tight_crop(cell)
            bw, bh = cell.size
            side = max(bw, bh)
            sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
            sq.paste(cell, ((side - bw) // 2, (side - bh) // 2))
            out = sq.resize((target_size, target_size), Image.LANCZOS)
            dest = OUT_DIR / out_names[i]
            out.save(dest)
            print(f"  wrote {dest.name} ({bw}x{bh} -> {target_size}x{target_size})")

slice_enemy_grid(
    STAGING / "enemy_anim_raw.png",
    cols=4, rows=2,
    out_names=[
        'doom_clone_walk_1.png',
        'doom_clone_walk_2.png',
        'doom_clone_walk_3.png',
        'doom_clone_walk_4.png',
        'doom_clone_attack.png',
        'doom_clone_hurt.png',
        'doom_boss_spindler_uzis_fire.png',
        'doom_boss_spindler_wheelchair_fire.png',
    ],
    target_size=64,
)
print("DONE")
