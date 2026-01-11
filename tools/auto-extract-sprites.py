#!/usr/bin/env python3
"""
Auto-extract sprites from Clippy's Revenge sprite sheet using bounding box detection
"""

from PIL import Image
import os
import sys

SOURCE = "ChatGPT Image Jan 10, 2026, 01_41_43 PM.png"
OUTPUT_DIR = "images/sprites/clippy"
ENEMIES_DIR = "images/sprites/enemies"

# Ensure output directories exist
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(ENEMIES_DIR, exist_ok=True)

def find_bounding_boxes(img, min_size=50, threshold=25):
    """Find bounding boxes of non-black regions"""
    width, height = img.size
    pixels = img.load()

    # Create a binary mask of non-black pixels
    mask = [[False] * height for _ in range(width)]
    for y in range(height):
        for x in range(width):
            r, g, b = pixels[x, y][:3]
            if r > threshold or g > threshold or b > threshold:
                mask[x][y] = True

    # Find connected components using flood fill
    visited = [[False] * height for _ in range(width)]
    boxes = []

    def flood_fill(start_x, start_y):
        """Find bounding box of connected region"""
        stack = [(start_x, start_y)]
        min_x, max_x = start_x, start_x
        min_y, max_y = start_y, start_y

        while stack:
            x, y = stack.pop()
            if x < 0 or x >= width or y < 0 or y >= height:
                continue
            if visited[x][y] or not mask[x][y]:
                continue

            visited[x][y] = True
            min_x = min(min_x, x)
            max_x = max(max_x, x)
            min_y = min(min_y, y)
            max_y = max(max_y, y)

            # Check neighbors (8-connected)
            for dx in [-1, 0, 1]:
                for dy in [-1, 0, 1]:
                    if dx == 0 and dy == 0:
                        continue
                    stack.append((x + dx, y + dy))

        return (min_x, min_y, max_x, max_y)

    # Scan for unvisited non-black regions
    for y in range(height):
        for x in range(width):
            if mask[x][y] and not visited[x][y]:
                box = flood_fill(x, y)
                box_width = box[2] - box[0]
                box_height = box[3] - box[1]
                if box_width >= min_size and box_height >= min_size:
                    boxes.append(box)

    return boxes

def main():
    print("=" * 50)
    print("Clippy's Revenge - Auto Sprite Extractor")
    print("=" * 50)

    # Load image
    img = Image.open(SOURCE)
    print(f"Loaded: {SOURCE} ({img.size[0]}x{img.size[1]})")

    # Find sprite bounding boxes
    print("\nFinding sprite regions (this may take a moment)...")
    boxes = find_bounding_boxes(img, min_size=40)

    # Sort by position (top to bottom, left to right)
    boxes.sort(key=lambda b: (b[1] // 100, b[0]))  # Group by row (100px tolerance)

    print(f"\nFound {len(boxes)} sprite regions:")
    for i, box in enumerate(boxes):
        x1, y1, x2, y2 = box
        w, h = x2 - x1, y2 - y1
        print(f"  {i+1:2d}. ({x1:4d}, {y1:4d}) - ({x2:4d}, {y2:4d})  {w:3d}x{h:3d}")

    # Extract each sprite
    print("\nExtracting sprites...")
    for i, box in enumerate(boxes):
        x1, y1, x2, y2 = box
        w, h = x2 - x1, y2 - y1

        # Add small padding
        pad = 2
        x1 = max(0, x1 - pad)
        y1 = max(0, y1 - pad)
        x2 = min(img.size[0], x2 + pad)
        y2 = min(img.size[1], y2 + pad)

        # Determine sprite name based on position/size
        # Large hero sprite (top right)
        if w > 200 and h > 200 and x1 > 400 and y1 < 200:
            name = "hero_large"
            output_dir = OUTPUT_DIR
        # Enemies (right side, mid-height)
        elif x1 > 650 and 150 < y1 < 900:
            if y1 < 350:
                name = "stapler"
            elif y1 < 550:
                name = "folder"
            else:
                name = "file_cabinet"
            output_dir = ENEMIES_DIR
        # Regular clippy sprites
        else:
            # Name based on row position
            row = y1 // 150
            col = x1 // 120

            # Determine action type by row
            if row == 0 or row == 1:  # Top rows - title, run
                name = f"run_{col+1:02d}"
            elif row == 2:  # Crouch
                name = f"crouch_{col+1:02d}"
            elif row == 3:  # Prone/shoot
                if w > h * 1.2:  # Wide = prone
                    name = f"prone_{col+1:02d}"
                else:
                    name = f"shoot_{col+1:02d}"
            elif row == 4:  # Cover/jump
                name = f"action_{col+1:02d}"
            elif row == 5:  # Climb
                name = f"climb_{col+1:02d}"
            elif row == 6:  # Rope/wall
                name = f"wall_{col+1:02d}"
            elif row == 7 or row == 8:  # Death
                name = f"death_{col+1:02d}"
            else:
                name = f"sprite_{i+1:02d}"
            output_dir = OUTPUT_DIR

        # Crop and save
        sprite = img.crop((x1, y1, x2, y2))
        output_path = os.path.join(output_dir, f"{name}.png")

        # Handle duplicates
        counter = 1
        while os.path.exists(output_path):
            output_path = os.path.join(output_dir, f"{name}_{counter}.png")
            counter += 1

        sprite.save(output_path)
        print(f"  Saved: {output_path} ({x2-x1}x{y2-y1})")

    print("\n" + "=" * 50)
    print("Extraction complete!")
    print("=" * 50)

if __name__ == "__main__":
    main()
