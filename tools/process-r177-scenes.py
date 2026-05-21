#!/usr/bin/env python3
"""R177: process painted epilogue + Jobs stage scenes into game assets.

Source raw PNGs sit in _staging/r176 and _staging/r177. Output target is
1536x1024 stays at native (scene scaler upscales to fit the 256x224
viewport). Just copies with PNG re-save so the file is in version
control + the load path treats it like any other scene.
"""
import os, shutil
from PIL import Image

JOBS = [
    # Steve Jobs boss portrait (1024x1024) — used for boss-intro cinematic
    # and post-game epilogue beat 0 ("one more titan").
    ('/Users/jrippy/clippy-first-blood/_staging/r175/jobs_boss_raw.png',
     '/Users/jrippy/clippy-first-blood/assets/scenes/boss_intros/boss_intro_jobs.png'),
    # Stage backdrop for the future Stage 13 (Reality Distortion Field).
    ('/Users/jrippy/clippy-first-blood/_staging/r176/stage_keynote_raw.png',
     '/Users/jrippy/clippy-first-blood/assets/bg/bg_reality_distortion.png'),
    # Epilogue cinematic scenes.
    ('/Users/jrippy/clippy-first-blood/_staging/r177/scene_laughingstock_raw.png',
     '/Users/jrippy/clippy-first-blood/assets/scenes/scene_epi_1_laughingstock.png'),
    ('/Users/jrippy/clippy-first-blood/_staging/r177/scene_memes_raw.png',
     '/Users/jrippy/clippy-first-blood/assets/scenes/scene_epi_2_memes.png'),
    ('/Users/jrippy/clippy-first-blood/_staging/r177/scene_comeback_raw.png',
     '/Users/jrippy/clippy-first-blood/assets/scenes/scene_epi_3_comeback.png'),
    ('/Users/jrippy/clippy-first-blood/_staging/r177/scene_mac_siri_raw.png',
     '/Users/jrippy/clippy-first-blood/assets/scenes/scene_epi_4_mac_siri.png'),
]


def main():
    for src, dst in JOBS:
        if not os.path.exists(src):
            print(f'  MISSING {src}')
            continue
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        # Re-encode as optimized PNG (smaller than the raw 1024x* output).
        im = Image.open(src).convert('RGBA')
        im.save(dst, 'PNG', optimize=True)
        print(f'  {os.path.basename(src)} -> {os.path.relpath(dst, "/Users/jrippy/clippy-first-blood/")} ({im.size[0]}x{im.size[1]})')


if __name__ == '__main__':
    main()
