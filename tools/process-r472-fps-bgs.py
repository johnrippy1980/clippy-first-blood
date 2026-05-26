#!/usr/bin/env python3
"""R472: scale 3 FPS-stage backgrounds to 768x512 game res."""
from PIL import Image
from pathlib import Path

STAGING = Path("/tmp/r472_staging")
OUT_DIR = Path("/Users/jrippy/clippy-first-blood/assets/bg")
OUT_DIR.mkdir(parents=True, exist_ok=True)

for src_name, dest_name in [
    ("office_exec_raw.png", "bg_office_exec_floor.png"),
    ("keynote_backstage_raw.png", "bg_keynote_backstage.png"),
    ("spindler_lab_raw.png", "bg_spindler_core_lab.png"),
]:
    img = Image.open(STAGING / src_name).convert("RGB")
    img = img.resize((768, 512), Image.LANCZOS)
    img.save(OUT_DIR / dest_name)
    print(f"wrote {dest_name}")
