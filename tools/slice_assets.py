#!/usr/bin/env python3
"""Slice game sprites out of the art reference sheets in assets/reference/.

The reference sheets are presentation boards (sprites on a cream background),
not engine-ready atlases, so this script:
  1. crops each sprite by fractional box (tuned against the sheets),
  2. flood-fills the cream background from the borders into transparency
     (ground tiles skip this step — they are used as opaque squares),
  3. trims to the content bounding box and resizes to game resolution,
  4. writes PNGs to web/assets/ plus a contact sheet for visual QA.

Re-run after tweaking boxes: python3 tools/slice_assets.py
"""
from PIL import Image, ImageDraw
from collections import deque
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(ROOT, "assets", "reference")
OUT = os.path.join(ROOT, "web", "assets")
os.makedirs(OUT, exist_ok=True)


def crop_frac(img, box):
    w, h = img.size
    return img.crop((int(box[0] * w), int(box[1] * h), int(box[2] * w), int(box[3] * h)))


def key_background(img, tol_hard=16, tol_soft=40):
    """Make the cream board background transparent: hard-remove pixels close
    to the corner color, feather a soft band above that."""
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    # sample background from the four corners
    samples = [px[2, 2][:3], px[w - 3, 2][:3], px[2, h - 3][:3], px[w - 3, h - 3][:3]]
    bg = tuple(sum(s[i] for s in samples) // 4 for i in range(3))

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


def trim(img, pad=2):
    bbox = img.getchannel("A").getbbox()
    if not bbox:
        return img
    x0 = max(0, bbox[0] - pad); y0 = max(0, bbox[1] - pad)
    x1 = min(img.width, bbox[2] + pad); y1 = min(img.height, bbox[3] + pad)
    return img.crop((x0, y0, x1, y1))


def save_sprite(img, name, width, key=True):
    if key:
        img = trim(key_background(img))
    if width:
        ratio = width / img.width
        img = img.resize((width, max(1, int(img.height * ratio))), Image.LANCZOS)
    path = os.path.join(OUT, name + ".png")
    img.save(path, optimize=True)
    print("wrote", name, img.size)
    return img


def main():
    made = {}

    # ---------- ground tiles (opaque squares from the tileset sheet) ----------
    # Spans measured by gap detection on the sheet (the row is hand-placed,
    # not a uniform grid — do not "fix" these into even fractions).
    tiles = Image.open(os.path.join(REF, "tileset.jpg"))
    spans_x = [(25, 171), (178, 319), (325, 466), (472, 610), (616, 738),
               (744, 878), (885, 1028), (1039, 1184), (1196, 1362), (1375, 1585)]
    span_y = (26, 180)
    names = ["tile_dirt", "tile_plowed", None, None, "tile_grass", "tile_grass_tall",
             "tile_grass_flower", None, "tile_sand", "tile_rock"]
    for (x0, x1), name in zip(spans_x, names):
        if not name:
            continue
        c = tiles.crop((x0 + 2, span_y[0] + 2, x1 - 2, span_y[1] - 2)).resize((128, 128), Image.LANCZOS)
        path = os.path.join(OUT, name + ".png")
        c.convert("RGB").save(path, optimize=True)
        print("wrote", name, c.size)
        made[name] = c

    # ---------- ore / mineral nodes (4x3 board) ----------
    ores = Image.open(os.path.join(REF, "ore-nodes.jpg"))
    ore_names = [
        ["node_rock", "node_coal", "node_copper", "node_silver"],
        ["node_iron", "node_gold", "node_crystal", "node_amethyst"],
        ["node_emerald", "node_ruby", "node_sapphire", "node_starcore"],
    ]
    for r in range(3):
        for cidx in range(4):
            cx = 0.035 + cidx * 0.245
            cy = 0.025 + r * 0.325
            box = (cx, cy, cx + 0.225, cy + 0.305)
            made[ore_names[r][cidx]] = save_sprite(crop_frac(ores, box), ore_names[r][cidx], 200)

    # ---------- characters (8 cols x 3 rows: front / back / side) ----------
    chars = Image.open(os.path.join(REF, "characters.jpg"))
    # miner is column 2 (the player), old man is column 8 (NPC Tom)
    def char_box(col, row):
        x0 = 0.012 + col * 0.1215
        y0 = 0.015 + row * 0.328
        return (x0, y0, x0 + 0.117, y0 + 0.318)
    for row, suffix in [(0, "front"), (1, "back"), (2, "side")]:
        made["miner_" + suffix] = save_sprite(crop_frac(chars, char_box(1, row)), "miner_" + suffix, 120)
    made["tom_front"] = save_sprite(crop_frac(chars, char_box(7, 0)), "tom_front", 120)

    # ---------- trees & houses ----------
    th = Image.open(os.path.join(REF, "trees-houses.jpg"))
    trees = {
        "tree_oak": (0.008, 0.030, 0.245, 0.465),
        "tree_pine": (0.248, 0.030, 0.398, 0.465),
        "tree_apple": (0.538, 0.030, 0.752, 0.465),
        "stump": (0.888, 0.245, 0.995, 0.465),
    }
    for name, box in trees.items():
        made[name] = save_sprite(crop_frac(th, box), name, 260)
    houses = {
        "house_red": (0.225, 0.520, 0.495, 0.975),
        "house_blue": (0.505, 0.520, 0.752, 0.975),
    }
    for name, box in houses.items():
        made[name] = save_sprite(crop_frac(th, box), name, 420)

    # ---------- contact sheet for QA ----------
    cols = 6
    cell = 190
    rows = (len(made) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell, rows * (cell + 16)), (38, 32, 26))
    d = ImageDraw.Draw(sheet)
    for i, (name, im) in enumerate(sorted(made.items())):
        cx = (i % cols) * cell; cy = (i // cols) * (cell + 16)
        thumb = im.copy().convert("RGBA")
        thumb.thumbnail((cell - 10, cell - 10))
        sheet.paste(thumb, (cx + 5, cy + 5), thumb)
        d.text((cx + 6, cy + cell + 2), name, fill=(255, 230, 180))
    sheet_path = os.path.join(ROOT, "tools", "contact-sheet.jpg")
    sheet.save(sheet_path, quality=88)
    print("contact sheet:", sheet_path)


if __name__ == "__main__":
    main()
