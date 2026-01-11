#!/usr/bin/env python3
"""
Extract all sprites from Clippy's Revenge sprite sheet
Based on visual analysis of row images
"""

from PIL import Image
import os

SOURCE = "ChatGPT Image Jan 10, 2026, 01_41_43 PM.png"
OUT_DIR = "images/sprites/clippy"
ENEMIES_DIR = "images/sprites/enemies"

# Ensure output directories exist
os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(ENEMIES_DIR, exist_ok=True)

# Sprite definitions based on visual row analysis
# Format: (name, x, y, width, height)
SPRITES = [
    # Row 2 (y=150-300): Crouch shooting - 4 sprites
    # From row2.png visual analysis
    ("crouch_shoot_01", 10, 158, 95, 95),
    ("crouch_shoot_02", 115, 158, 100, 95),
    ("crouch_shoot_03", 230, 158, 110, 95),
    ("crouch_shoot_04", 355, 158, 125, 95),

    # Large hero sprite (right side of row 2)
    ("hero_large", 720, 105, 195, 160),

    # Row 3 (y=300-450): Jump frames at top, prone/crawl at bottom
    # Top sub-row: flip/jump sprites
    ("jump_01", 10, 305, 85, 75),
    ("jump_02", 105, 305, 85, 75),
    ("jump_03", 195, 305, 95, 75),
    ("jump_04", 300, 305, 95, 75),
    ("jump_05", 405, 305, 95, 75),

    # Bottom sub-row of row 3: crouch/prone
    ("prone_01", 10, 390, 100, 65),
    ("prone_02", 115, 390, 105, 65),
    ("prone_03", 230, 390, 115, 65),

    # Row 4 (y=450-600): More prone + enemies visible
    ("prone_shoot_01", 10, 455, 140, 60),
    ("prone_shoot_02", 160, 455, 145, 60),
    ("prone_shoot_03", 315, 455, 150, 60),

    # Row 5 (y=600-750): Cover + prone + debris
    ("cover_01", 10, 545, 100, 95),
    ("cover_02", 120, 545, 115, 95),
    ("roll_01", 250, 545, 100, 70),

    # Row 6 (y=750-900): Wall actions + climb
    ("wall_01", 10, 700, 90, 100),
    ("wall_02", 110, 700, 90, 100),
    ("climb_01", 220, 740, 80, 60),
    ("climb_02", 310, 740, 80, 60),

    # More wall/climb from row 6
    ("wall_slide_01", 160, 815, 85, 95),
    ("wall_slide_02", 260, 815, 85, 95),

    # Row 7 (y=900-1100): Tree hide + wall climb
    ("tree_hide", 85, 960, 210, 195),
    ("ladder_climb_01", 350, 970, 75, 160),
    ("ladder_climb_02", 450, 985, 75, 130),

    # Row 7 bottom: wall climb with ladder
    ("wall_climb_01", 610, 970, 100, 180),
    ("wall_climb_02", 720, 970, 100, 180),

    # Row 8+ (y=1150+): Death/damage animations
    ("hurt_01", 75, 1165, 80, 195),
    ("death_01", 265, 1180, 95, 175),
    ("wall_peek", 470, 1195, 70, 165),

    # Bottom rows: more wall/damage
    ("damaged_01", 635, 1195, 235, 140),
]

# Enemy sprites (right side of various rows)
ENEMIES = [
    ("stapler", 855, 430, 115, 90),
    ("folder", 770, 545, 165, 130),
    ("file_cabinet", 780, 735, 160, 165),
]

def extract_sprites():
    print("=" * 50)
    print("Clippy's Revenge - Sprite Extraction")
    print("=" * 50)

    img = Image.open(SOURCE)
    print(f"Source: {SOURCE} ({img.size[0]}x{img.size[1]})")

    # Clear old sprites
    for f in os.listdir(OUT_DIR):
        if f.endswith('.png'):
            os.remove(os.path.join(OUT_DIR, f))
    for f in os.listdir(ENEMIES_DIR):
        if f.endswith('.png'):
            os.remove(os.path.join(ENEMIES_DIR, f))

    # Extract player sprites
    print(f"\nExtracting {len(SPRITES)} player sprites...")
    for name, x, y, w, h in SPRITES:
        # Add small padding
        pad = 2
        x1 = max(0, x - pad)
        y1 = max(0, y - pad)
        x2 = min(img.size[0], x + w + pad)
        y2 = min(img.size[1], y + h + pad)

        sprite = img.crop((x1, y1, x2, y2))
        path = os.path.join(OUT_DIR, f"{name}.png")
        sprite.save(path)
        print(f"  {name}: {x2-x1}x{y2-y1}")

    # Extract enemy sprites
    print(f"\nExtracting {len(ENEMIES)} enemy sprites...")
    for name, x, y, w, h in ENEMIES:
        pad = 2
        x1 = max(0, x - pad)
        y1 = max(0, y - pad)
        x2 = min(img.size[0], x + w + pad)
        y2 = min(img.size[1], y + h + pad)

        sprite = img.crop((x1, y1, x2, y2))
        path = os.path.join(ENEMIES_DIR, f"{name}.png")
        sprite.save(path)
        print(f"  {name}: {x2-x1}x{y2-y1}")

    print("\n" + "=" * 50)
    print(f"Extraction complete!")
    print(f"Player sprites: {len(SPRITES)}")
    print(f"Enemy sprites: {len(ENEMIES)}")
    print("=" * 50)

if __name__ == "__main__":
    extract_sprites()
