"""Pixel-aligned mining overlays and cast-metal alphabet, on a single effects sheet."""
from pathlib import Path
from PIL import Image, ImageDraw
from sprite_atlas import write_atlas

DEST = Path(__file__).resolve().parents[2] / "cocos/assets/resources/art-v101/effects"

# Five-bit rows leave counters and diagonals clear on small landscape screens.
ALPHABET = (
    "0E11111F111111", "1E11111E11111E", "0F10101010100F", "1E11111111111E",
    "1F10101E10101F", "1F10101E101010", "0F10101711110E", "1111111F111111",
    "0E04040404040E", "0702020212120C", "11121418141211", "1010101010101F",
    "111B1515111111", "11191915131311", "0E11111111110E", "1E11111E101010",
    "0E11111115120D", "1E11111E141211", "0F10100E01011E", "1F040404040404",
    "1111111111110E", "11111111110A04", "1111111515150A", "11110A040A1111",
    "11110A04040404", "1F01020408101F")


def metal_letter(rows):
    mask = set()
    for row, bits in enumerate(bytes.fromhex(rows)):
        for col in range(5):
            if bits & (16 >> col):
                mask.update((8+4*col+x, 4+4*row+y) for x in range(4) for y in range(4))
    im = Image.new("RGBA", (38, 38))
    d = ImageDraw.Draw(im)
    for x, y in mask:
        d.rectangle((x-1, y-1, x+3, y+4), "#342d2b")
    for x, y in mask:
        d.point((x+2, y+3), "#906940")
    for x, y in mask:
        c = "#f9e2a5" if (x, y-1) not in mask or (x-1, y) not in mask else (
            "#a77744" if (x+1, y) not in mask or (x, y+1) not in mask else "#dbad68")
        d.point((x, y), c)
    return im


def cracks(stage):
    im = Image.new("RGBA", (96, 48))
    d = ImageDraw.Draw(im)
    paths = [[(34,14),(39,18),(44,18),(48,23),(52,24),(57,32)]]
    if stage >= 2:
        paths.extend([[(48,23),(55,21),(60,17),(68,16)],[(54,28),(61,27),(65,30)]])
    if stage >= 3:
        paths.extend([[(35,15),(29,17),(25,15),(18,17)],[(58,32),(66,34),(73,33)],
                      [(58,19),(54,16),(53,12)],[(39,18),(37,23),(31,26)]])
    for path in paths:
        d.line([(x,y+1) for x,y in path], fill="#d9bd81", width=2)
        d.line(path, fill="#34302b", width=2)
    return im


def pick():
    im = Image.new("RGBA", (36, 42))
    d = ImageDraw.Draw(im)
    d.polygon([(4,37),(8,39),(25,13),(21,11)], fill="#3c3530")
    d.line([(7,36),(22,14)], fill="#a26c45", width=4)
    d.line([(9,30),(20,14)], fill="#ddad72", width=2)
    for y in (32,35):
        x = 8 + (35-y)//2
        d.line([(x-2,y),(x+1,y+2)], fill="#786148", width=2)
    d.polygon([(4,11),(10,6),(18,4),(26,6),(31,11),(33,18),(32,21),
               (28,14),(23,11),(18,10),(11,10)], fill="#393d40")
    d.polygon([(6,10),(12,7),(19,5),(26,7),(30,12),(32,17),(26,11),
               (19,8),(12,9)], fill="#9aa9a5")
    d.line([(9,9),(14,7),(19,6),(25,8)], fill="#e8e3c4")
    d.polygon([(18,8),(21,7),(26,10),(23,14),(19,12)], fill="#92734d")
    d.point((22,10), fill="#edcd89")
    return im


def particle(kind):
    im = Image.new("RGBA", (12, 12))
    d = ImageDraw.Draw(im)
    if kind == "chip":
        d.polygon([(1,5),(5,2),(10,4),(9,8),(5,10),(1,8)], fill="#b0aaa0")
        d.polygon([(1,5),(5,2),(10,4),(6,6)], fill="#fff9e6")
    elif kind == "dust":
        d.rectangle((2,5,6,8), fill="#e3dbcd")
        d.rectangle((5,3,9,6), fill="#faf3df")
        d.point((1,3), fill="#c9bdae")
    else:
        d.polygon([(5,0),(7,4),(11,5),(7,7),(6,11),(4,7),(0,6),(4,4)], fill="#fff5c5")
        d.rectangle((5,5,6,6), fill="#ffffff")
    return im


def wordcard():
    im = Image.new("RGBA", (84, 22))
    d = ImageDraw.Draw(im)
    d.polygon([(1,4),(6,1),(77,1),(82,5),(82,17),(77,20),(6,20),(1,16)], fill="#423b32")
    d.polygon([(3,5),(7,3),(76,3),(80,6),(80,15),(76,18),(7,18),(3,15)], fill="#d8c79c")
    d.line([(7,4),(75,4),(78,6)], fill="#f3e6bf")
    for x in (6,77):
        d.line([(x,8),(x,13)], fill="#92825e")
    return im


if __name__ == "__main__":
    frames = {"letter-"+chr(65+i):metal_letter(rows) for i,rows in enumerate(ALPHABET)}
    frames.update({"fx-crack-"+str(n):cracks(n) for n in range(1,4)})
    frames.update({"fx-"+k:particle(k) for k in ("chip","dust","spark")})
    frames.update({"fx-pick":pick(), "fx-wordcard":wordcard()})
    write_atlas(DEST / "digging.plist", frames, columns=6)
