#!/usr/bin/env python3
"""Downscale + import game_dev_frame_pack PNGs into assets/sprites/.

Source PNGs are already true-alpha transparent and bottom-center pivoted.
We just downscale to a target HEIGHT (player ~36px, enemies ~28-32px) using
NEAREST so the pixel art stays crisp at SNES upscale.
"""

import os
import sys
from PIL import Image

SRC = '/Users/jrippy/Downloads/game_dev_frame_pack'
DST = '/Users/jrippy/clippy-first-blood/assets/sprites'

# (src_relpath, dst_filename, target_height_px)
JOBS = [
    # Clippy — target height ~28px standing. (Note: v2 sprites are managed by
    # process-v2-sprites.py instead, this script is only for old pack frames.)
    ('clippy/idle/clippy_idle_01.png',           'pack_idle.png',          28),
    ('clippy/idle/clippy_idle_02.png',           'pack_idle_b.png',        28),
    ('clippy/run/clippy_run_01.png',             'pack_run_1.png',         28),
    ('clippy/run/clippy_run_02.png',             'pack_run_2.png',         28),
    ('clippy/run/clippy_run_03.png',             'pack_run_3.png',         28),
    ('clippy/run/clippy_run_04.png',             'pack_run_4.png',         28),
    ('clippy/stand_aim/clippy_stand_aim_01.png', 'pack_stand_aim.png',     28),
    ('clippy/stand_shoot/clippy_stand_shoot_01.png', 'pack_stand_shoot_1.png', 28),
    ('clippy/stand_shoot/clippy_stand_shoot_02.png', 'pack_stand_shoot_2.png', 28),
    ('clippy/stand_shoot/clippy_stand_shoot_03.png', 'pack_stand_shoot_3.png', 28),
    ('clippy/stand_shoot/clippy_stand_shoot_04.png', 'pack_stand_shoot_4.png', 28),
    ('clippy/crouch_aim/clippy_crouch_aim_01.png', 'pack_crouch_aim.png',  20),
    ('clippy/crouch_shoot/clippy_crouch_shoot_01.png', 'pack_crouch_shoot_1.png', 20),
    ('clippy/crouch_shoot/clippy_crouch_shoot_02.png', 'pack_crouch_shoot_2.png', 20),
    ('clippy/crouch_shoot/clippy_crouch_shoot_03.png', 'pack_crouch_shoot_3.png', 20),
    ('clippy/prone_shoot/clippy_prone_shoot_01.png', 'pack_prone_1.png',   12),
    ('clippy/prone_shoot/clippy_prone_shoot_02.png', 'pack_prone_2.png',   12),
    ('clippy/prone_shoot/clippy_prone_shoot_03.png', 'pack_prone_3.png',   12),
    ('clippy/jump/clippy_jump_01.png',           'pack_jump.png',          28),
    ('clippy/fall/clippy_fall_01.png',           'pack_fall.png',          28),
    ('clippy/rope/clippy_rope_01.png',           'pack_rope_1.png',        28),
    ('clippy/rope/clippy_rope_02.png',           'pack_rope_2.png',        28),
    ('clippy/cover_peek/clippy_cover_peek_01.png', 'pack_cover_1.png',     26),
    ('clippy/cover_peek/clippy_cover_peek_02.png', 'pack_cover_2.png',     26),
    ('clippy/hurt/clippy_hurt_01.png',           'pack_hurt.png',          28),
    ('clippy/death/clippy_death_01.png',         'pack_death_1.png',       22),
    ('clippy/death/clippy_death_02.png',         'pack_death_2.png',       14),

    # Stapler — hitbox is 14x8 in enemies.js. Squat. ~12px tall.
    ('stapler/idle/stapler_idle_01.png',         'pack_stapler_idle_1.png',12),
    ('stapler/idle/stapler_idle_02.png',         'pack_stapler_idle_2.png',12),
    ('stapler/open/stapler_open_01.png',         'pack_stapler_open.png',  12),
    ('stapler/chomp_open/stapler_chomp_open_01.png', 'pack_stapler_chomp.png', 12),
    ('stapler/shoot/stapler_shoot_01.png',       'pack_stapler_shoot_1.png',12),
    ('stapler/shoot/stapler_shoot_02.png',       'pack_stapler_shoot_2.png',12),
    ('stapler/hurt/stapler_hurt_01.png',         'pack_stapler_hurt.png',  12),
    ('stapler/death/stapler_death_01.png',       'pack_stapler_death_1.png',12),
    ('stapler/death/stapler_death_02.png',       'pack_stapler_death_2.png',10),

    # Folder — hitbox 14x12. Flying file. ~16px tall.
    ('folder/idle/folder_idle_01.png',           'pack_folder_idle_1.png', 16),
    ('folder/idle/folder_idle_02.png',           'pack_folder_idle_2.png', 16),
    ('folder/move/folder_move_01.png',           'pack_folder_walk_1.png', 16),
    ('folder/move/folder_move_02.png',           'pack_folder_walk_2.png', 16),
    ('folder/spit/folder_spit_01.png',           'pack_folder_attack_1.png',16),
    ('folder/spit/folder_spit_02.png',           'pack_folder_attack_2.png',16),
    ('folder/hurt/folder_hurt_01.png',           'pack_folder_hurt.png',   16),
    ('folder/death/folder_death_01.png',         'pack_folder_death_1.png',16),
    ('folder/death/folder_death_02.png',         'pack_folder_death_2.png',14),

    # Filing cabinet — hitbox 18x22. Tall heavy unit, ~24px tall.
    ('filing_cabinet/idle/filing_cabinet_idle_01.png','pack_cabinet_idle_1.png',24),
    ('filing_cabinet/idle/filing_cabinet_idle_02.png','pack_cabinet_idle_2.png',24),
    ('filing_cabinet/run/filing_cabinet_run_01.png',  'pack_cabinet_walk_1.png',24),
    ('filing_cabinet/run/filing_cabinet_run_02.png',  'pack_cabinet_walk_2.png',24),
    ('filing_cabinet/shoot/filing_cabinet_shoot_01.png','pack_cabinet_attack_1.png',24),
    ('filing_cabinet/shoot/filing_cabinet_shoot_02.png','pack_cabinet_attack_2.png',24),
    ('filing_cabinet/hurt/filing_cabinet_hurt_01.png','pack_cabinet_hurt.png',  24),
    ('filing_cabinet/death/filing_cabinet_death_01.png','pack_cabinet_death_1.png',22),
    ('filing_cabinet/death/filing_cabinet_death_02.png','pack_cabinet_death_2.png',18),
]


def downscale(src_path, target_h):
    im = Image.open(src_path).convert('RGBA')
    w, h = im.size
    if h == target_h:
        return im
    ratio = target_h / h
    target_w = max(1, int(round(w * ratio)))
    return im.resize((target_w, target_h), Image.NEAREST)


def main():
    os.makedirs(DST, exist_ok=True)
    written = 0
    missing = []
    for rel, dst_name, h in JOBS:
        src_path = os.path.join(SRC, rel)
        if not os.path.exists(src_path):
            missing.append(rel)
            continue
        im = downscale(src_path, h)
        out = os.path.join(DST, dst_name)
        im.save(out, 'PNG', optimize=True)
        written += 1
        print(f'  {rel}  ->  {dst_name}  ({im.size[0]}x{im.size[1]})')
    print(f'\nWrote {written} sprites. Missing {len(missing)}:')
    for m in missing:
        print(f'  MISSING {m}')


if __name__ == '__main__':
    main()
