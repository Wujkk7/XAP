"""Write a Cocos-compatible TexturePacker sheet with stable, untrimmed frames."""
import json
import plistlib
import uuid
from pathlib import Path

from PIL import Image


def write_atlas(path: Path, frames: dict[str, Image.Image], *, columns=8):
    path.parent.mkdir(parents=True, exist_ok=True)
    width = max(im.width for im in frames.values()) + 4
    height = max(im.height for im in frames.values()) + 4
    cols = min(columns, len(frames))
    rows = (len(frames) + cols - 1) // cols
    atlas = Image.new("RGBA", (1 << (cols * width - 1).bit_length(),
                               1 << (rows * height - 1).bit_length()))
    records = {}
    for i, (name, im) in enumerate(frames.items()):
        w, h = im.size
        x, y = i % cols * width + 2, i // cols * height + 2
        atlas.paste(im, (x, y))
        # Extrude border pixels so scaled tile edges sample their own face.
        atlas.paste(im.crop((0, 0, w, 1)), (x, y - 1))
        atlas.paste(im.crop((0, h - 1, w, h)), (x, y + h))
        atlas.paste(im.crop((0, 0, 1, h)), (x - 1, y))
        atlas.paste(im.crop((w - 1, 0, w, h)), (x + w, y))
        records[name] = {"frame": "{{%d,%d},{%d,%d}}" % (x, y, w, h),
                         "offset": "{0,0}", "rotated": False,
                         "sourceSize": "{%d,%d}" % (w, h),
                         "sourceColorRect": "{{0,0},{%d,%d}}" % (w, h)}
    png = path.with_suffix(".png")
    atlas.save(png, optimize=True)
    meta = {"format": 2, "size": "{%d,%d}" % atlas.size,
            "textureFileName": png.name, "realTextureFileName": png.name}
    path.write_bytes(plistlib.dumps({"frames": records, "metadata": meta}))
    # Keep importer identity across regeneration, including existing Creator-generated UUIDs.
    meta_file = Path(str(png) + ".meta")
    if not meta_file.exists():
        tex_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"Wujkk7/XAP/art-v101/{path.parent.name}/{png.name}"))
        template = Path(__file__).resolve().parents[2] / "cocos/assets/resources/xpaa/validation-board.png.meta"
        data = json.loads(template.read_text(encoding="utf-8"))
        data = json.loads(json.dumps(data).replace(data["uuid"], tex_id))
        data["subMetas"].pop("f9941")
        data["userData"]["type"] = "texture"
        tex = data["subMetas"]["6c48a"]
        tex["displayName"] = png.stem
        tex["userData"].update(minfilter="nearest", magfilter="nearest")
        meta_file.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
