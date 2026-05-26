#!/usr/bin/env python3
"""R462: scale Doom arc story cards to game res."""
from PIL import Image
from pathlib import Path

STAGING = Path("/tmp/r462_staging")
OUT_DIR = Path("/Users/jrippy/clippy-first-blood/assets/scenes")
OUT_DIR.mkdir(parents=True, exist_ok=True)

for src_name, dest_name in [
    ("intro_raw.png", "card_doom_arc_intro.png"),
    ("outro_raw.png", "card_doom_arc_outro.png"),
]:
    img = Image.open(STAGING / src_name).convert("RGB")
    img = img.resize((512, 341), Image.LANCZOS)
    img.save(OUT_DIR / dest_name)
    print(f"wrote {dest_name}")
