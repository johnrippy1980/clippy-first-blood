#!/usr/bin/env python3
"""R568l: Bonzi animation parity with Clippy — slice 12 additional pose
sprites (idle_alt, aim_up, aim_diag, crouch, crouch_shoot, run_shoot x3,
spin_1, spin_2, death_hit, death_explode, death_burning, backdash,
ledge_hang, ledge_climb_1, ledge_climb_2). Same BFS flood-fill knockout
as prior FX pipeline.
"""
from PIL import Image
from pathlib import Path
import sys
from collections import deque

STAGING = Path("/tmp/bonzi_anim")
OUT_DIR = Path("/Users/jrippy/clippy-first-blood/assets/sprites")


def knockout_checker(img):
    """BFS flood-fill from all 4 corners. Any low-chroma pixel reachable
    from a corner gets knocked transparent. Purple body / orange explosion
    / blue motion streaks all have enough chroma to survive."""
    img = img.copy()
    px = img.load()
    W, H = img.size

    def is_bg(x, y):
        r, g, b, a = px[x, y]
        if a == 0:
            return True
        chroma = max(r, g, b) - min(r, g, b)
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
    if h == 0: return img
    return img.resize((max(1, int(w * (target_h / h))), target_h), Image.LANCZOS)


def slice_row(img, n):
    img = tight_crop(img)
    W, H = img.size
    sw = W // n
    out = []
    for i in range(n):
        x0 = i * sw
        x1 = W if i == n - 1 else (i + 1) * sw
        cell = img.crop((x0, 0, x1, H))
        out.append(tight_crop(cell))
    return out


def write(img, name, target_h):
    img = scale_to_h(img, target_h)
    dest = OUT_DIR / f"{name}.png"
    img.save(dest)
    print(f"  wrote {dest.name} ({img.size[0]}x{img.size[1]})")


if __name__ == "__main__":
    # idle_alt — single sprite
    src = STAGING / "idle_alt.jpeg"
    if src.exists():
        print("idle_alt:")
        img = knockout_checker(Image.open(src).convert("RGBA"))
        write(tight_crop(img), "bonzi_idle_alt", 96)

    # aim — 2-frame row
    src = STAGING / "aim.jpeg"
    if src.exists():
        print("aim:")
        img = knockout_checker(Image.open(src).convert("RGBA"))
        frames = slice_row(img, 2)
        for f, n in zip(frames, ["bonzi_aim_up", "bonzi_aim_diag"]):
            write(f, n, 96)

    # crouch — 2-frame row, target shorter height
    src = STAGING / "crouch.jpeg"
    if src.exists():
        print("crouch:")
        img = knockout_checker(Image.open(src).convert("RGBA"))
        frames = slice_row(img, 2)
        for f, n in zip(frames, ["bonzi_crouch", "bonzi_crouch_shoot"]):
            write(f, n, 64)

    # run_shoot — 3-frame row
    src = STAGING / "run_shoot.jpeg"
    if src.exists():
        print("run_shoot:")
        img = knockout_checker(Image.open(src).convert("RGBA"))
        frames = slice_row(img, 3)
        for f, n in zip(frames, ["bonzi_run_shoot_1", "bonzi_run_shoot_2", "bonzi_run_shoot_3"]):
            write(f, n, 96)

    # spin — 2-frame row (FRAME 1/FRAME 2 labels visible — tight crop handles them)
    src = STAGING / "spin.jpeg"
    if src.exists():
        print("spin:")
        img = knockout_checker(Image.open(src).convert("RGBA"))
        frames = slice_row(img, 2)
        for f, n in zip(frames, ["bonzi_spin_1", "bonzi_spin_2"]):
            write(f, n, 64)

    # death — 3-frame row
    src = STAGING / "death.jpeg"
    if src.exists():
        print("death:")
        img = knockout_checker(Image.open(src).convert("RGBA"))
        frames = slice_row(img, 3)
        for f, n in zip(frames, ["bonzi_death_hit", "bonzi_death_explode", "bonzi_death_burning"]):
            write(f, n, 80)

    # backdash — single sprite
    src = STAGING / "backdash.jpeg"
    if src.exists():
        print("backdash:")
        img = knockout_checker(Image.open(src).convert("RGBA"))
        write(tight_crop(img), "bonzi_backdash", 80)

    # ledge — 3-frame row
    src = STAGING / "ledge.jpeg"
    if src.exists():
        print("ledge:")
        img = knockout_checker(Image.open(src).convert("RGBA"))
        frames = slice_row(img, 3)
        for f, n in zip(frames, ["bonzi_ledge_hang", "bonzi_ledge_climb_1", "bonzi_ledge_climb_2"]):
            write(f, n, 96)

    print("done.")
