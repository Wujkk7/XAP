"""Cut the original illustrations into individually draggable inventory frames."""
from pathlib import Path
from PIL import Image
from sprite_atlas import write_atlas

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "art-source/v1.0.1"
DEST = ROOT / "cocos/assets/resources/art-v101/items"
MATERIALS = "coin wood stone dirt ore_copper ore_iron ore_gold ore_diamond ore_starcore".split()
RELICS = "amber_leaf clay_seal copper_bell root_compass prism_shard rune_tablet star_astrolabe heart_crystal crown_fragment".split()


def icon(cell):
    bounds = cell.getchannel("A").point(lambda x: 255 if x >= 128 else 0).getbbox()
    if not bounds:
        raise ValueError("Empty inventory icon")
    art = cell.crop(bounds)
    art.thumbnail((58, 58), Image.Resampling.BOX)
    out = Image.new("RGBA", (64, 64))
    out.paste(art, ((64-art.width)//2, (64-art.height)//2))
    return out


def cut(sheet, names, prefix):
    image = Image.open(SOURCE / sheet).convert("RGBA")
    frames = {}
    for i, name in enumerate(names):
        x, y = i % 3, i // 3
        cell = image.crop((x*image.width//3, y*image.height//3,
                           (x+1)*image.width//3, (y+1)*image.height//3))
        frames[prefix + name] = icon(cell)
    return frames


if __name__ == "__main__":
    frames = cut("materials.png", MATERIALS, "item-")
    frames.update(cut("relics.png", RELICS, "relic-"))
    frames["item-pack_part"] = icon(Image.open(SOURCE / "damaged-frame.png").convert("RGBA"))
    write_atlas(DEST / "findings.plist", frames, columns=6)
