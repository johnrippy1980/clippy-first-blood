#!/usr/bin/env python3
"""R663: scale Bonzi gameplay frames to Clippy parity.

The R568c pipeline sized every Bonzi frame to TARGET_H=96 believing that
matched "Clippy's 56-96 range" — but Clippy's STANDING frames are ~40px
(56 is only the death-explosion set, 24 the crawl set). Result: playable
Bonzi rendered ~2.4x taller than Clippy over the identical 12px hitbox.

Fix: resize each bonzi_* gameplay frame to its Clippy counterpart's height
x 1.10 (Bonzi is a gorilla — a touch of extra bulk reads right), keeping
aspect. Portrait/boss-plate/boss_bonzi_* art is NOT touched (different
render contexts with their own sizing).

Idempotent: skips any file already at/below its target height.
"""
import os
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
SPRITES = os.path.join(ROOT, 'assets', 'sprites')

BULK = 1.10  # Bonzi bulk factor vs Clippy counterpart

# bonzi file -> clippy counterpart (both relative to assets/sprites)
PAIRS = {
    'bonzi_idle.png':          'friend/idle_up.png',
    'bonzi_idle_alt.png':      'friend/idle_down.png',
    'bonzi_run_1.png':         'friend/walk_1.png',
    'bonzi_run_2.png':         'friend/walk_2.png',
    'bonzi_run_3.png':         'friend/walk_3.png',
    'bonzi_run_4.png':         'friend/walk_2.png',
    'bonzi_run_shoot_1.png':   'friend/walk_shoot_1.png',
    'bonzi_run_shoot_2.png':   'friend/walk_shoot_2.png',
    'bonzi_run_shoot_3.png':   'friend/walk_shoot_3.png',
    'bonzi_aim_up.png':        'friend/aim_up.png',
    'bonzi_aim_diag.png':      'friend/aim_diag.png',
    'bonzi_jump.png':          'friend/jump_rise.png',
    'bonzi_fall.png':          'friend/jump_fall.png',
    'bonzi_spin_1.png':        'friend/spin_1.png',
    'bonzi_spin_2.png':        'friend/spin_2.png',
    'bonzi_crouch.png':        'friend/crouch_up.png',
    'bonzi_crouch_shoot.png':  'friend/crouch_down.png',
    'bonzi_charge.png':        'friend/crawl_1.png',
    'bonzi_backdash.png':      'friend/slide_brace.png',
    'bonzi_hurt.png':          'friend/lowhp_up.png',
    'bonzi_death_hit.png':     'friend/death_hit.png',
    'bonzi_death_explode.png': 'friend/death_explode.png',
    'bonzi_death_burning.png': 'friend/death_burning.png',
    'bonzi_ledge_hang.png':    'friend/climb_1.png',
    'bonzi_ledge_climb_1.png': 'friend/climb_2.png',
    'bonzi_ledge_climb_2.png': 'friend/crouch_up.png',
    'bonzi_back_idle.png':     'clippy_back_idle.png',
    'bonzi_back_run_1.png':    'clippy_back_run_1.png',
    'bonzi_back_run_2.png':    'clippy_back_run_2.png',
}


def main():
    done = skipped = missing = 0
    for bonzi, clippy in PAIRS.items():
        bpath = os.path.join(SPRITES, bonzi)
        cpath = os.path.join(SPRITES, clippy)
        if not os.path.exists(bpath):
            print(f'  MISSING bonzi asset: {bonzi}')
            missing += 1
            continue
        if not os.path.exists(cpath):
            print(f'  MISSING clippy ref:  {clippy} (for {bonzi})')
            missing += 1
            continue
        with Image.open(cpath) as ref:
            target_h = max(8, round(ref.height * BULK))
        with Image.open(bpath) as img:
            if img.height <= target_h:
                skipped += 1
                continue
            ratio = target_h / img.height
            new_w = max(1, round(img.width * ratio))
            out = img.convert('RGBA').resize((new_w, target_h), Image.LANCZOS)
            out.save(bpath)
            print(f'  {bonzi}: {img.width}x{img.height} -> {new_w}x{target_h} '
                  f'(ref {clippy} h={round(target_h / BULK)})')
            done += 1
    print(f'resized {done}, skipped {skipped}, missing {missing}')


if __name__ == '__main__':
    main()
