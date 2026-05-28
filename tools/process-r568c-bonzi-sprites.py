#!/usr/bin/env python3
"""R568c (slice 3): slice the Bonzi action plate + run cycle into individual
sprite PNGs sized to ~96px tall (Clippy parity). Saves into assets/sprites.

Action plate: 2x2 grid -> bonzi_jump (TL), bonzi_fall (TR), bonzi_hurt (BL),
bonzi_charge (BR).
Run cycle: 4 frames in a single row -> bonzi_run_1..4.
Idle: single sprite -> bonzi_idle.

Knockout target: gray-and-white checkerboard background that Gemini renders
when asked for transparent. We detect alternating gray pairs (light + dark
checker squares) and the chroma/luma signature of those gray cells.
"""
from PIL import Image
from pathlib import Path
import sys

STAGING = Path("/tmp/bonzi_gen")
OUT_DIR = Path("/Users/jrippy/clippy-first-blood/assets/sprites")
TARGET_H = 96   # final sprite height — matches Clippy's 56-96 range


def knockout_checker(img):
    """Drop the gray/white checker. Any near-gray pixel with low chroma and
    luma in [140, 235] is checker. Bonzi's outline is black (luma<40) and
    body is purple (high blue-red chroma), so we keep those."""
    px = img.load()
    W, H = img.size
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            chroma = max(r, g, b) - min(r, g, b)
            luma = (r + g + b) // 3
            # Checker = near-gray, mid-to-bright. Aggressive window catches
            # both the pale-gray cells (~225) and dark-gray cells (~165),
            # plus the partial-alpha specks that survive in between.
            if chroma < 25 and 120 < luma < 245:
                px[x, y] = (0, 0, 0, 0)
            # Near-white edges too (over-bright checker corners)
            elif chroma < 20 and luma >= 245:
                px[x, y] = (0, 0, 0, 0)
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


def process_action_plate(src_path, names):
    """2x2 grid -> 4 sprites in row-major order."""
    img = Image.open(src_path).convert("RGBA")
    img = knockout_dark_checker(img)   # flood-fill is universally cleaner
    W, H = img.size
    half_w, half_h = W // 2, H // 2
    cells = [
        (0, 0, half_w, half_h),
        (half_w, 0, W, half_h),
        (0, half_h, half_w, H),
        (half_w, half_h, W, H),
    ]
    for (x0, y0, x1, y1), name in zip(cells, names):
        cell = img.crop((x0, y0, x1, y1))
        cell = tight_crop(cell)
        cell = scale_to_h(cell, TARGET_H)
        dest = OUT_DIR / f"{name}.png"
        cell.save(dest)
        print(f"  wrote {dest.name} ({cell.size[0]}x{cell.size[1]})")


def process_run_row(src_path, names):
    """Single horizontal row of N frames -> N sprites."""
    img = Image.open(src_path).convert("RGBA")
    img = knockout_dark_checker(img)
    img = tight_crop(img)   # trim outer empty
    W, H = img.size
    n = len(names)
    # naive equal-slice; tight-crop each cell after so per-frame whitespace
    # gets removed (frames aren't all the same width in Bonzi's pose set).
    slice_w = W // n
    for i, name in enumerate(names):
        x0 = i * slice_w
        x1 = W if i == n - 1 else (i + 1) * slice_w
        cell = img.crop((x0, 0, x1, H))
        cell = tight_crop(cell)
        cell = scale_to_h(cell, TARGET_H)
        dest = OUT_DIR / f"{name}.png"
        cell.save(dest)
        print(f"  wrote {dest.name} ({cell.size[0]}x{cell.size[1]})")


def knockout_dark_checker(img):
    """Idle gen has dark + light checker that bleed through chroma thresholds.
    Use BFS flood-fill from all 4 corners: any pixel reachable from a corner
    that is low-chroma (gray-ish) gets knocked out. Bonzi's purple body stops
    the flood at its outline because purple has high chroma (>40)."""
    img = img.copy()
    px = img.load()
    W, H = img.size

    def is_gray(x, y):
        r, g, b, a = px[x, y]
        if a == 0:
            return True
        chroma = max(r, g, b) - min(r, g, b)
        # Any "near-gray" pixel — broad threshold since we only flood from
        # known-background regions. JPEG mottle has chroma up to ~35.
        return chroma < 40

    from collections import deque
    visited = [[False] * W for _ in range(H)]
    queue = deque()
    # Seed from all 4 corners
    for sx, sy in [(0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1)]:
        if is_gray(sx, sy):
            queue.append((sx, sy))
            visited[sy][sx] = True

    while queue:
        x, y = queue.popleft()
        px[x, y] = (0, 0, 0, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H and not visited[ny][nx] and is_gray(nx, ny):
                visited[ny][nx] = True
                queue.append((nx, ny))
    return img


def process_single(src_path, name, dark_bg=False):
    img = Image.open(src_path).convert("RGBA")
    if dark_bg:
        img = knockout_dark_checker(img)
    else:
        img = knockout_checker(img)
    img = tight_crop(img)
    img = scale_to_h(img, TARGET_H)
    dest = OUT_DIR / f"{name}.png"
    img.save(dest)
    print(f"  wrote {dest.name} ({img.size[0]}x{img.size[1]})")


if __name__ == "__main__":
    task = sys.argv[1] if len(sys.argv) > 1 else "all"
    if task in ("all", "action"):
        action_src = STAGING / "action_v1.jpeg"
        if action_src.exists():
            print(f"action plate: {action_src.name}")
            process_action_plate(action_src, [
                "bonzi_jump", "bonzi_fall", "bonzi_hurt", "bonzi_charge"
            ])
    if task in ("all", "run"):
        # Picks whichever run gen the operator promoted to bonzi_run_src.jpeg
        run_src = STAGING / "bonzi_run_src.jpeg"
        if run_src.exists():
            print(f"run cycle: {run_src.name}")
            process_run_row(run_src, [
                "bonzi_run_1", "bonzi_run_2", "bonzi_run_3", "bonzi_run_4"
            ])
    if task in ("all", "idle"):
        idle_src = STAGING / "bonzi_idle_src.jpeg"
        if idle_src.exists():
            print(f"idle: {idle_src.name}")
            process_single(idle_src, "bonzi_idle", dark_bg=True)
    if task in ("all", "back"):
        back_src = STAGING / "bonzi_back_src.jpeg"
        if back_src.exists():
            print(f"behind-view: {back_src.name}")
            # 3-frame row -> idle, run_1, run_2
            process_run_row(back_src, ["bonzi_back_idle", "bonzi_back_run_1", "bonzi_back_run_2"])
    if task in ("all", "portrait"):
        port_src = STAGING / "bonzi_portrait_src.jpeg"
        if port_src.exists():
            print(f"portrait: {port_src.name}")
            # Portrait keeps native canvas — no run-row slice. Knockout + crop.
            process_single(port_src, "bonzi_portrait", dark_bg=True)
    if task in ("all", "boss"):
        boss_src = STAGING / "bonzi_boss_src.jpeg"
        if boss_src.exists():
            print(f"boss plate: {boss_src.name}")
            # Boss plate is a painted scene — DO NOT knockout (BG is part of art).
            # Just resize to a sane width for the engine.
            img = Image.open(boss_src).convert("RGBA")
            # Boss plates target ~256 wide x 144 tall (SNES letterbox)
            target_w = 256
            w, h = img.size
            scale = target_w / w
            img = img.resize((target_w, int(h * scale)), Image.LANCZOS)
            dest = OUT_DIR / "bonzi_boss_plate.png"
            img.save(dest)
            print(f"  wrote {dest.name} ({img.size[0]}x{img.size[1]})")
    print("done.")
