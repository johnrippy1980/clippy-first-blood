#!/usr/bin/env python3
"""Auto-slice a transparent sprite sheet into individual frame PNGs.

The user's sheets have transparent background between sprites. We find each
connected non-transparent component (8-connectivity), filter out tiny
specks, sort them top-to-bottom + left-to-right, and emit one PNG per
component with a small transparent margin.

Usage:
  python3 tools/slice-sheet.py <sheet.png> <outdir> <prefix> [--row-tolerance 30] [--min-area 200]
"""
import sys, os
from PIL import Image
from collections import deque

def alpha_mask(img, thresh=8):
    """Return a bool[H][W] mask of opaque pixels."""
    w, h = img.size
    px = img.load()
    mask = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > thresh:
                mask[y][x] = True
    return mask, w, h

def find_components(mask, w, h, min_area=200):
    """8-connected flood-fill. Returns list of (minx, miny, maxx, maxy)."""
    visited = [[False] * w for _ in range(h)]
    comps = []
    for y in range(h):
        for x in range(w):
            if not mask[y][x] or visited[y][x]:
                continue
            # BFS
            q = deque([(x, y)])
            visited[y][x] = True
            minx, miny, maxx, maxy = x, y, x, y
            area = 0
            while q:
                cx, cy = q.popleft()
                area += 1
                if cx < minx: minx = cx
                if cy < miny: miny = cy
                if cx > maxx: maxx = cx
                if cy > maxy: maxy = cy
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        if dx == 0 and dy == 0:
                            continue
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx] and mask[ny][nx]:
                            visited[ny][nx] = True
                            q.append((nx, ny))
            if area >= min_area:
                comps.append((minx, miny, maxx, maxy, area))
    return comps

def merge_close_components(comps, gap=4):
    """Some sprites have body + detached weapon flash. Merge boxes that
    overlap or are within `gap` pixels of each other into one frame."""
    boxes = [[c[0], c[1], c[2], c[3]] for c in comps]
    changed = True
    while changed:
        changed = False
        i = 0
        while i < len(boxes):
            j = i + 1
            merged = False
            while j < len(boxes):
                a = boxes[i]; b = boxes[j]
                # boxes overlap if expanded by gap
                if (a[0] - gap <= b[2] and b[0] - gap <= a[2] and
                    a[1] - gap <= b[3] and b[1] - gap <= a[3]):
                    boxes[i] = [min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])]
                    boxes.pop(j)
                    changed = True
                    merged = True
                else:
                    j += 1
            i += 1
    return boxes

def sort_reading_order(boxes, row_tolerance=30):
    """Sort top-to-bottom by row, then left-to-right within row.
    Two boxes belong to the same row if their vertical centers are within tolerance."""
    # Sort by y first
    sorted_by_y = sorted(boxes, key=lambda b: (b[1] + b[3]) / 2)
    # Group into rows
    rows = []
    current_row = []
    last_cy = None
    for box in sorted_by_y:
        cy = (box[1] + box[3]) / 2
        if last_cy is None or abs(cy - last_cy) <= row_tolerance:
            current_row.append(box)
            last_cy = cy if last_cy is None else (last_cy + cy) / 2
        else:
            rows.append(current_row)
            current_row = [box]
            last_cy = cy
    if current_row:
        rows.append(current_row)
    # Sort each row left-to-right
    out = []
    for row in rows:
        row.sort(key=lambda b: b[0])
        out.extend(row)
    return out

def main():
    src = sys.argv[1]
    outdir = sys.argv[2]
    prefix = sys.argv[3]
    row_tol = int(next((a.split('=')[1] for a in sys.argv if a.startswith('--row-tolerance=')), 30))
    min_area = int(next((a.split('=')[1] for a in sys.argv if a.startswith('--min-area=')), 200))
    margin = int(next((a.split('=')[1] for a in sys.argv if a.startswith('--margin=')), 2))

    os.makedirs(outdir, exist_ok=True)
    img = Image.open(src).convert('RGBA')
    mask, w, h = alpha_mask(img)
    comps = find_components(mask, w, h, min_area=min_area)
    merge_gap = int(next((a.split('=')[1] for a in sys.argv if a.startswith('--merge-gap=')), 4))
    boxes = merge_close_components(comps, gap=merge_gap)
    boxes = sort_reading_order(boxes, row_tolerance=row_tol)

    print(f'{src}: {len(boxes)} frames')
    for i, (x0, y0, x1, y1) in enumerate(boxes, start=1):
        cropped = img.crop((x0, y0, x1 + 1, y1 + 1))
        bw = x1 - x0 + 1 + margin * 2
        bh = y1 - y0 + 1 + margin * 2
        out = Image.new('RGBA', (bw, bh), (0, 0, 0, 0))
        out.paste(cropped, (margin, margin), cropped)
        name = f'{prefix}_{i:02d}.png'
        out.save(os.path.join(outdir, name))
        print(f'  {name}  ({bw}x{bh})')

if __name__ == '__main__':
    main()
