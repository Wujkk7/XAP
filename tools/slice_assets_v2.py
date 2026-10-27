#!/usr/bin/env python3
"""Slice sprites from gami's own v2 art boards (assets/reference/v2/).

v2 boards are clean uniform grids on a taupe background:
- tileset.jpg 750x563: 10 tiles, pitch ~74.5, row1 y 36..105 (measured)
- ore-nodes.jpg 750x563: 4x3 nodes
- characters.jpg 750x375: 8 cols x 3 rows (front/back/side)
- trees-houses.jpg 750x563: 6 trees over 4 houses

Output PNGs go to cocos/assets/resources/art/ (shared by Cocos and Web).
Re-run: python3 tools/slice_assets_v2.py
"""
from PIL import Image, ImageDraw
import os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(ROOT, "assets", "reference", "v2")
OUT = os.path.join(ROOT, "cocos", "assets", "resources", "art")
os.makedirs(OUT, exist_ok=True)


def key_background(img, tol_hard=14, tol_soft=38):
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    # Background = per-channel median of the border pixels. Corner sampling
    # breaks when a wide figure (e.g. the miner's helmet) touches a corner
    # of its cell and poisons the average.
    border = []
    for x in range(w):
        border.append(px[x, 0][:3]); border.append(px[x, h - 1][:3])
    for y in range(h):
        border.append(px[0, y][:3]); border.append(px[w - 1, y][:3])
    bg = tuple(sorted(c[i] for c in border)[len(border) // 2] for i in range(3))

    def dist(c):
        return max(abs(c[0] - bg[0]), abs(c[1] - bg[1]), abs(c[2] - bg[2]))

    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            d = dist((r, g, b))
            if d < tol_hard:
                px[x, y] = (r, g, b, 0)
            elif d < tol_soft:
                px[x, y] = (r, g, b, int(a * (d - tol_hard) / (tol_soft - tol_hard)))
    return img


def keep_largest_component(img):
    """Drop stray keyed fragments (feet of the row above, JPEG ghosts):
    keep only the largest connected opaque component."""
    from collections import deque
    a = img.getchannel("A")
    w, h = a.size
    px = a.load()
    seen = bytearray(w * h)
    best = []
    for y in range(h):
        for x in range(w):
            i = y * w + x
            if seen[i] or px[x, y] < 40:
                continue
            comp = []
            dq = deque([(x, y)])
            seen[i] = 1
            while dq:
                cx, cy = dq.popleft()
                comp.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < w and 0 <= ny < h:
                        j = ny * w + nx
                        if not seen[j] and px[nx, ny] >= 40:
                            seen[j] = 1
                            dq.append((nx, ny))
            if len(comp) > len(best):
                best = comp
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    src = img.load()
    dst = out.load()
    for (x, y) in best:
        dst[x, y] = src[x, y]
    return out


def trim(img, pad=2):
    bbox = img.getchannel("A").getbbox()
    if not bbox:
        return img
    return img.crop((max(0, bbox[0] - pad), max(0, bbox[1] - pad),
                     min(img.width, bbox[2] + pad), min(img.height, bbox[3] + pad)))


def save_sprite(img, name, width, key=True, clean=False, tol=None):
    if key:
        img = key_background(img, *(tol or (14, 38)))
        if clean:
            img = keep_largest_component(img)
        img = trim(img)
    if width:
        ratio = width / img.width
        img = img.resize((width, max(1, int(img.height * ratio))), Image.LANCZOS)
    img.save(os.path.join(OUT, name + ".png"), optimize=True)
    print("wrote", name, img.size)
    return img


def main():
    made = {}

    # ---- ground tiles: measured spans on tileset.jpg ----
    tiles = Image.open(os.path.join(REF, "tileset.jpg"))
    spans_x = [(5, 73), (80, 147), (154, 221), (228, 296), (303, 371),
               (378, 446), (453, 521), (528, 595), (602, 669), (676, 748)]
    names = ["tile_dirt", "tile_plowed", None, None, "tile_grass", "tile_grass_tall",
             "tile_grass_flower", "tile_path_edge", "tile_sand", "tile_rock"]
    for (x0, x1), name in zip(spans_x, names):
        if not name:
            continue
        c = tiles.crop((x0 + 1, 37, x1 - 1, 104)).resize((96, 96), Image.LANCZOS)
        c.convert("RGB").save(os.path.join(OUT, name + ".png"), optimize=True)
        print("wrote", name, c.size)
        made[name] = c

    # ---- ore nodes: 4x3 around measured centers ----
    ores = Image.open(os.path.join(REF, "ore-nodes.jpg"))
    ore_names = [
        ["node_rock", "node_coal", "node_copper", "node_silver"],
        ["node_iron", "node_gold", "node_crystal", "node_amethyst"],
        ["node_emerald", "node_ruby", "node_sapphire", "node_starcore"],
    ]
    centers_x = [124, 300, 469, 641]
    centers_y = [107, 293, 479]
    for r in range(3):
        for cidx in range(4):
            cx, cy = centers_x[cidx], centers_y[r]
            box = (cx - 78, cy - 78, cx + 78, cy + 78)
            made[ore_names[r][cidx]] = save_sprite(ores.crop(box), ore_names[r][cidx], 150)

    # ---- characters: 8 cols x 3 rows on characters.jpg (750x375) ----
    chars = Image.open(os.path.join(REF, "characters.jpg"))
    def char_box(col, row):
        # Full cell: side-view figures lean to one side and get cut by an
        # inset box. Neighbour bleed is handled by border-median keying +
        # largest-component cleanup instead.
        x0 = int(col * 93.75) + 1
        y0 = row * 125 + 4
        return (x0, y0, x0 + 92, y0 + 114)
    for row, suffix in [(0, "front"), (1, "back"), (2, "side")]:
        made["miner_" + suffix] = save_sprite(chars.crop(char_box(1, row)), "miner_" + suffix, 100, clean=True)
    # The elder's grey hair sits within ~15-25 of the background colour, so
    # she needs a much tighter key or her hair gets eaten away.
    made["tom_front"] = save_sprite(chars.crop(char_box(7, 0)), "tom_front", 100, clean=True, tol=(8, 20))

    # ---- trees & houses on trees-houses.jpg ----
    th = Image.open(os.path.join(REF, "trees-houses.jpg"))
    trees = {
        "tree_oak": (15, 25, 150, 255),
        "tree_pine": (150, 25, 260, 255),
        "tree_birch": (265, 25, 370, 255),
        "tree_apple": (380, 25, 495, 255),
        "stump": (635, 130, 740, 255),
    }
    for name, box in trees.items():
        made[name] = save_sprite(th.crop(box), name, 200)
    houses = {
        "house_red": (8, 260, 190, 548),   # brown-roof cottage in v2
        "house_blue": (192, 260, 372, 548),  # blue-roof house
    }
    for name, box in houses.items():
        made[name] = save_sprite(th.crop(box), name, 300)

    # ---- contact sheet ----
    cols = 6
    cell = 170
    rows = (len(made) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell, rows * (cell + 16)), (40, 36, 30))
    d = ImageDraw.Draw(sheet)
    for i, (name, im) in enumerate(sorted(made.items())):
        cx = (i % cols) * cell; cy = (i // cols) * (cell + 16)
        thumb = im.copy().convert("RGBA")
        thumb.thumbnail((cell - 10, cell - 10))
        sheet.paste(thumb, (cx + 5, cy + 5), thumb)
        d.text((cx + 6, cy + cell + 2), name, fill=(255, 230, 180))
    sheet_path = os.path.join(ROOT, "tools", "contact-sheet-v2.jpg")
    sheet.save(sheet_path, quality=88)
    print("contact sheet:", sheet_path)


if __name__ == "__main__":
    main()
