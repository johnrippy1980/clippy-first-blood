#!/usr/bin/env python3
"""R424: scale Doom stage cards + boss intro plates to game res.
   Stage cards land at assets/scenes/card_doom_*.png (512x341).
   Boss intros land at assets/scenes/boss_intro_*.png (~256x224 fitted)."""
from PIL import Image
from pathlib import Path

STAGING = Path("/tmp/r424_staging")
OUT_DIR = Path("/Users/jrippy/clippy-first-blood/assets/scenes")
OUT_DIR.mkdir(parents=True, exist_ok=True)

def fit_card(src, dest, target=(512, 341)):
    img = Image.open(src).convert("RGB")
    img = img.resize(target, Image.LANCZOS)
    img.save(dest)
    print(f"  wrote {dest.name} ({target[0]}x{target[1]})")

def fit_boss_plate(src, dest, target=(256, 170)):
    img = Image.open(src).convert("RGB")
    img = img.resize(target, Image.LANCZOS)
    img.save(dest)
    print(f"  wrote {dest.name} ({target[0]}x{target[1]})")

print("STAGE CARDS:")
fit_card(STAGING / "card_doom_block11_raw.png", OUT_DIR / "card_doom_block11.png")
fit_card(STAGING / "card_doom_floor11_raw.png", OUT_DIR / "card_doom_floor11.png")

# Boss intros may not exist yet — guard
for src_name, dest_name in [
    ("boss_intro_spindler_uzis_raw.png", "boss_intro_SPINDLER_UZIS.png"),
    ("boss_intro_spindler_wheelchair_raw.png", "boss_intro_SPINDLER_WHEELCHAIR.png"),
]:
    src = STAGING / src_name
    if src.exists():
        print("BOSS INTRO:")
        fit_boss_plate(src, OUT_DIR / dest_name)
    else:
        print(f"  SKIP {src_name} (not downloaded yet)")

print("DONE")
