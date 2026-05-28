#!/usr/bin/env python3
"""R568k: slice the painted FX assets that replace procedural canvas-drawn
effects (banana goo, GAZE reticule, POPUP STORM windows, DIAL-UP SCREAM
ring animation, CRYING TANTRUM tears, BONZI boss pose).

Uses the same BFS flood-fill knockout pipeline as the Bonzi character set
since Gemini produces the same gray-and-white checker background.
"""
from PIL import Image
from pathlib import Path
import sys
from collections import deque

STAGING = Path("/tmp/fx_gen")
OUT_DIR = Path("/Users/jrippy/clippy-first-blood/assets/sprites")


def knockout_checker(img):
    """BFS flood-fill from all 4 corners. Any pixel reachable that is
    low-chroma (gray-ish) gets knocked out. High-chroma pixels (purple,
    magenta, blue tear, red boss-eye) stop the flood at their outline."""
    img = img.copy()
    px = img.load()
    W, H = img.size

    def is_bg(x, y):
        r, g, b, a = px[x, y]
        if a == 0:
            return True
        chroma = max(r, g, b) - min(r, g, b)
        # Gemini's checker has chroma 0-3; JPEG mottle bleeds to ~35.
        # 45 threshold catches all checker variants without eating purple/pink/blue.
        return chroma < 45

    visited = [[False] * W for _ in range(H)]
    queue = deque()
    for sx, sy in [(0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1)]:
        if is_bg(sx, sy):
            queue.append((sx, sy))
            visited[sy][sx] = True

    while queue:
        x, y = queue.popleft()
        px[x, y] = (0, 0, 0, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H and not visited[ny][nx] and is_bg(nx, ny):
                visited[ny][nx] = True
                queue.append((nx, ny))
    return img


def tight_crop(img):
    px = img.load()
    W, H = img.size
    col_has = [sum(1 for y in range(H) if px[x, y][3] > 30) for x in range(W)]
    row_has = [sum(1 for x in range(W) if px[x, y][3] > 30) for y in range(H)]
    col_t = max(2, H // 30)
    row_t = max(2, W // 30)
    x0 = next((x for x in range(W) if col_has[x] > col_t), 0)
    x1 = next((x for x in range(W - 1, -1, -1) if col_has[x] > col_t), W - 1)
    y0 = next((y for y in range(H) if row_has[y] > row_t), 0)
    y1 = next((y for y in range(H - 1, -1, -1) if row_has[y] > row_t), H - 1)
    return img.crop((x0, y0, x1 + 1, y1 + 1))


def scale_to_h(img, target_h):
    w, h = img.size
    if h == 0:
        return img
    ratio = target_h / h
    return img.resize((max(1, int(w * ratio)), target_h), Image.LANCZOS)


def slice_row(img, n):
    """Tight-crop the whole image first, then slice into N equal columns."""
    img = tight_crop(img)
    W, H = img.size
    slice_w = W // n
    out = []
    for i in range(n):
        x0 = i * slice_w
        x1 = W if i == n - 1 else (i + 1) * slice_w
        cell = img.crop((x0, 0, x1, H))
        cell = tight_crop(cell)
        out.append(cell)
    return out


def slice_grid_2x2(img):
    """2x2 grid -> 4 cells in row-major order."""
    img = tight_crop(img)
    W, H = img.size
    hw, hh = W // 2, H // 2
    cells = [
        img.crop((0, 0, hw, hh)),
        img.crop((hw, 0, W, hh)),
        img.crop((0, hh, hw, H)),
        img.crop((hw, hh, W, H)),
    ]
    return [tight_crop(c) for c in cells]


# ============================================================
# BANANA GOO — 4-frame row (flight / stuck / pulse / detonate)
# ============================================================
def process_banana():
    src = STAGING / "banana_v1.jpeg"
    img = knockout_checker(Image.open(src).convert("RGBA"))
    frames = slice_row(img, 4)
    names = ['banana_flight', 'banana_stuck', 'banana_pulse', 'banana_detonate']
    for f, n in zip(frames, names):
        f = scale_to_h(f, 16)
        dest = OUT_DIR / f"{n}.png"
        f.save(dest)
        print(f"  wrote {dest.name} ({f.size[0]}x{f.size[1]})")


# ============================================================
# GAZE RETICULE — single sprite, scale to 32x32
# ============================================================
def process_gaze():
    src = STAGING / "gaze_v1.jpeg"
    img = knockout_checker(Image.open(src).convert("RGBA"))
    img = tight_crop(img)
    img = scale_to_h(img, 32)
    dest = OUT_DIR / "gaze_reticule.png"
    img.save(dest)
    print(f"  wrote {dest.name} ({img.size[0]}x{img.size[1]})")


# ============================================================
# POPUP STORM — 2x2 grid of 4 popup variants, scale each to ~18px tall
# ============================================================
def process_popups():
    src = STAGING / "popup_v1.jpeg"
    img = knockout_checker(Image.open(src).convert("RGBA"))
    cells = slice_grid_2x2(img)
    names = ['popup_warning', 'popup_visitor', 'popup_virus', 'popup_singles']
    for c, n in zip(cells, names):
        c = scale_to_h(c, 18)
        dest = OUT_DIR / f"{n}.png"
        c.save(dest)
        print(f"  wrote {dest.name} ({c.size[0]}x{c.size[1]})")


# ============================================================
# DIAL-UP SCREAM RING — 4-frame row, scale outer rings progressively
# ============================================================
def process_scream():
    src = STAGING / "scream_v1.jpeg"
    img = knockout_checker(Image.open(src).convert("RGBA"))
    frames = slice_row(img, 4)
    # Target sizes that match the in-engine animation phases.
    sizes = [16, 32, 48, 64]
    names = ['scream_ring_1', 'scream_ring_2', 'scream_ring_3', 'scream_ring_4']
    for f, sz, n in zip(frames, sizes, names):
        f = scale_to_h(f, sz)
        dest = OUT_DIR / f"{n}.png"
        f.save(dest)
        print(f"  wrote {dest.name} ({f.size[0]}x{f.size[1]})")


# ============================================================
# CRYING TANTRUM TEARS — 4-frame row, scale to 12px tall
# ============================================================
def process_tears():
    src = STAGING / "tear_v1.jpeg"
    img = knockout_checker(Image.open(src).convert("RGBA"))
    frames = slice_row(img, 4)
    names = ['tear_1', 'tear_2', 'tear_3', 'tear_4']
    for f, n in zip(frames, names):
        f = scale_to_h(f, 12)
        dest = OUT_DIR / f"{n}.png"
        f.save(dest)
        print(f"  wrote {dest.name} ({f.size[0]}x{f.size[1]})")


# ============================================================
# BOSS BONZI — 2 frames (idle + windup), scale to 64px tall
# ============================================================
def process_boss():
    src = STAGING / "bossbonzi_v1.jpeg"
    img = knockout_checker(Image.open(src).convert("RGBA"))
    # 2 frames in a row with "FRAME 1"/"FRAME 2" labels under each — first
    # tight-crop crops out the labels via row threshold so we just split the
    # remaining art in half horizontally.
    img = tight_crop(img)
    W, H = img.size
    hw = W // 2
    f1 = tight_crop(img.crop((0, 0, hw, H)))
    f2 = tight_crop(img.crop((hw, 0, W, H)))
    for f, n in zip([f1, f2], ['boss_bonzi_idle', 'boss_bonzi_windup']):
        f = scale_to_h(f, 64)
        dest = OUT_DIR / f"{n}.png"
        f.save(dest)
        print(f"  wrote {dest.name} ({f.size[0]}x{f.size[1]})")


if __name__ == "__main__":
    task = sys.argv[1] if len(sys.argv) > 1 else "all"
    if task in ("all", "banana"):
        print("banana goo:")
        process_banana()
    if task in ("all", "gaze"):
        print("gaze reticule:")
        process_gaze()
    if task in ("all", "popup"):
        print("popups:")
        process_popups()
    if task in ("all", "scream"):
        print("scream rings:")
        process_scream()
    if task in ("all", "tear"):
        print("tears:")
        process_tears()
    if task in ("all", "boss"):
        print("boss bonzi:")
        process_boss()
    print("done.")
