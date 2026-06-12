#!/usr/bin/env python3
"""Downscale the friend's high-res Clippy poses to in-game pixel-art frames.

Source: /Users/jrippy/Downloads/Clippy/Clippy-Poses:Moves/<Pose>/<frame>.png
Output: assets/sprites/friend/<frameName>.png  (staging dir, not wired yet)

Each source frame is trimmed to its opaque content bounds, then scaled so its
HEIGHT equals --height (default 40px, matching the game's standing run cycle).
Width follows aspect ratio. Painted art downsamples best with LANCZOS; we then
harden the alpha edge so the shrunk sprite keys cleanly against the game's
silhouette/halo pass instead of carrying a muddy semi-transparent fringe.
"""
import argparse
from pathlib import Path
from PIL import Image

DEST = Path(__file__).resolve().parent.parent / "assets" / "sprites" / "friend"


def convert(src: Path, out_name: str, target_h: int, alpha_cut: int,
            flip: bool) -> tuple[int, int]:
    im = Image.open(src).convert("RGBA")
    # The game's canonical facing is RIGHT (facing=1 draws the stored frame
    # un-flipped; facing<0 flips it). The friend's art is ALREADY drawn facing
    # right, so by default we do NOT flip. Pass --flip only for a source that
    # happens to face left.
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    w, h = im.size
    target_w = max(1, round(w * target_h / h))
    im = im.resize((target_w, target_h), Image.LANCZOS)
    # Harden the antialiased edge: anything below alpha_cut -> fully transparent,
    # which prevents a grey halo when the engine bakes silhouettes from alpha.
    r, g, b, a = im.split()
    a = a.point(lambda v: 0 if v < alpha_cut else v)
    im = Image.merge("RGBA", (r, g, b, a))
    DEST.mkdir(parents=True, exist_ok=True)
    im.save(DEST / f"{out_name}.png")
    return im.size


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--height", type=int, default=40, help="target sprite height px")
    ap.add_argument("--alpha-cut", type=int, default=24, help="alpha below this -> 0")
    ap.add_argument("--flip", action="store_true",
                    help="flip left->right (only for a source that faces left; "
                         "the friend's art already faces right)")
    ap.add_argument("pairs", nargs="+",
                    help="src.png=outName ...  (absolute or repo-relative src)")
    args = ap.parse_args()
    for pair in args.pairs:
        src_str, out_name = pair.rsplit("=", 1)
        src = Path(src_str)
        size = convert(src, out_name, args.height, args.alpha_cut, args.flip)
        print(f"{size[0]}x{size[1]}  {out_name}.png  <- {src.name}")


if __name__ == "__main__":
    main()
