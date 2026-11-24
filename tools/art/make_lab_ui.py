"""Draw the original v1.0.1 expedition UI at native pixel resolution (Pillow)."""
import json
import uuid
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "cocos/assets"
OUT = ASSETS / "resources/art-v101/ui"
INK, DARK, PINE, SAGE = "#202a26", "#303e38", "#4b6356", "#8eab91"
BRASS, LIGHT, GOLD = "#ac8753", "#f2d99e", "#d8b56e"
LEATHER, OAK, CREAM = "#654338", "#98694b", "#f1e4bf"
BLUE, WATER = "#557a82", "#9cc1bd"


def plate(style):
    colors = {
        "panel": ("#121d1b", "#534b3b", "#aa8d62", "#343f35", "#24332d"),
        "hud": ("#17211e", "#5c6049", "#a99c75", "#495541", "#283a31"),
        "button": ("#16231e", "#475446", "#a19e7b", "#667763", "#3e5346"),
        "down": ("#1b2924", "#424e42", "#7a896e", "#687462", "#34473b"),
        "primary": ("#302d25", "#795e41", "#edcf8c", "#ded08c", "#c6a364"),
        "primary-down": ("#352f28", "#715941", "#bc9b65", "#c2ae79", "#b3925c"),
        "key": ("#18251f", "#465344", "#a59973", "#73856b", "#41594a"),
        "key-down": ("#202922", "#66553e", "#d2ad72", "#9b835b", "#635b45"),
        "key-empty": ("#202b26", "#38463e", "#586758", "#526255", "#34463c"),
        "key-selected": ("#253027", "#756740", "#ead298", "#a89c69", "#57694d"),
    }
    edge, shadow, rim, bevel, face = colors[style]
    s = 64
    im = Image.new("RGBA", (s, s))
    d = ImageDraw.Draw(im)

    def clipped(k, cut, fill):
        b = s - k - 1
        d.polygon([(k+cut,k),(b-cut,k),(b,k+cut),(b,b-cut),
                   (b-cut,b),(k+cut,b),(k,b-cut),(k,k+cut)], fill)
    clipped(0, 7, edge)
    clipped(2, 5, shadow)
    clipped(3, 5, rim)
    clipped(5, 4, bevel)
    clipped(7, 3, face)
    d.line([(9, 57),(54, 57)], fill=shadow)
    if style in ("panel", "hud", "primary", "primary-down"):
        for x,y,dx,dy in ((6,6,1,1),(57,6,-1,1),(6,57,1,-1),(57,57,-1,-1)):
            d.polygon([(x+dx*2,y),(x+dx*8,y),(x,y+dy*8),(x,y+dy*2)], shadow)
            d.line([(x+dx*2,y+dy),(x+dx*5,y+dy)], rim)
            d.point((x+dx*2,y+dy*3), LIGHT if style != "primary-down" else rim)
    return im


def joystick(base):
    s = 88 if base else 32
    im = Image.new("RGBA", (s, s))
    d = ImageDraw.Draw(im)
    if base:
        for pad,fill in [(1,"#1c2b26bf"),(3,"#87957dbf"),(4,"#364639c9"),
                         (7,"#72806cb9"),(8,"#25392fb0")]:
            d.ellipse((pad,pad,s-1-pad,s-1-pad),fill)
        d.ellipse((17,17,70,70),outline="#9ca4878f")
        for pts in [[(41,13),(44,10),(47,13)],[(41,74),(44,77),(47,74)],
                    [(13,41),(10,44),(13,47)],[(74,41),(77,44),(74,47)]]:
            d.line(pts, fill="#b2b18fce",width=2)
    else:
        for pad,fill in [(0,INK),(2,"#736749"),(3,"#dccea2"),(5,"#a7b196")]:
            d.ellipse((pad,pad,s-1-pad,s-1-pad),fill)
        d.arc((5,5,26,25),190,298,fill="#e6ddae",width=2)
        d.arc((5,5,26,26),30,135,fill="#75826b",width=2)
        for x in [12,15,18]:
            d.line((x,14,x,17),"#839077")
    return im


def icon(name):
    im = Image.new("RGBA", (24,24))
    d = ImageDraw.Draw(im)
    def poly(points,fill,outline=INK):
        d.polygon(points,fill,outline)
    def rect(box,fill,outline=INK):
        d.rectangle(box,fill,outline)
    def line(points,fill=INK,width=1):
        d.line(points,fill,width)
    if name == "pack":
        rect((8,2,15,6),LEATHER); rect((10,3,13,5),INK)
        poly([(4,8),(7,5),(17,5),(20,8),(21,18),(18,21),(5,21),(3,18)],OAK)
        rect((6,6,17,16),LEATHER)
        poly([(5,6),(17,6),(18,10),(15,13),(7,12)],"#aa8058")
        rect((10,11,13,15),GOLD); line([(11,12),(12,12)],LIGHT)
        rect((6,16,15,19),"#936d50"); line([(4,10),(4,16)],BRASS)
    elif name == "letters":
        poly([(6,6),(5,2),(9,3),(12,2),(16,3),(18,2),(17,6),(15,9),(20,14),(20,19),(17,21),(7,21),(3,18),(4,14),(9,8)],PINE)
        line([(7,6),(16,6)],GOLD,2); line([(8,11),(6,14),(6,17)],SAGE)
        poly([(10,10),(17,11),(16,19),(9,18)],CREAM)
        line([(11,16),(13,13),(14,16)],LEATHER);line([(12,15),(14,15)],LEATHER)
    elif name == "book":
        poly([(2,5),(8,4),(12,6),(16,4),(21,4),(21,19),(16,19),(12,21),(8,19),(2,20)],LEATHER)
        poly([(3,5),(8,5),(11,7),(11,17),(7,16),(3,17)],CREAM)
        poly([(12,7),(16,5),(20,5),(20,16),(16,16),(12,18)],"#ceb788")
        line([(5,9),(8,9)],BRASS);line([(5,12),(9,13)],BRASS)
        line([(14,9),(18,8)],OAK);rect((16,5,17,10),"#a96c52",None)
    elif name == "grid":
        poly([(1,9),(11,3),(22,9),(22,13),(12,20),(1,14)],PINE)
        poly([(1,9),(11,3),(22,9),(12,16)],SAGE)
        for a,b in [((5,7),(16,13)),((8,5),(20,11)),((5,12),(15,5)),((9,14),(19,7))]:
            line([a,b],DARK)
        line([(3,13),(12,18),(20,13)],GOLD)
    elif name == "camera":
        rect((3,6,20,18),PINE);rect((7,4,13,6),BRASS)
        rect((4,8,19,16),SAGE);d.ellipse((8,7,17,16),BRASS,INK)
        d.ellipse((10,9,15,14),BLUE,INK);d.point((11,10),LIGHT);d.point((6,9),LIGHT)
    elif name == "sound":
        poly([(2,9),(6,9),(12,4),(12,19),(6,15),(2,15)],GOLD)
        rect((3,10,5,14),BRASS,None);line([(10,8),(10,15)],LIGHT)
        line([(15,8),(17,10),(17,13),(15,15)],SAGE,2)
        line([(18,5),(21,9),(21,14),(18,18)],CREAM,2)
    elif name == "entry":
        poly([(3,14),(3,6),(10,2),(20,7),(20,17),(16,19),(16,10),(10,7),(7,9),(7,13)],OAK)
        line([(5,7),(10,4),(18,8)],GOLD)
        poly([(1,17),(7,12),(7,15),(12,15),(15,12),(15,16),(12,19),(7,19),(7,22)],SAGE)
    elif name == "ladder":
        for x in (5,15):
            poly([(x,4),(x+3,3),(x+2,20),(x-1,21)],OAK)
            line([(x+1,5),(x,19)],GOLD)
        for y in (7,11,15):
            line([(7,y+1),(15,y)],INK,3);line([(7,y),(15,y-1)],GOLD)
    elif name == "dig":
        poly([(2,19),(5,21),(16,8),(14,6)],OAK)
        line([(4,19),(13,9)],BRASS)
        poly([(4,5),(7,3),(12,3),(16,5),(19,8),(21,13),(21,16),(18,11),(14,8),(11,7),(7,6)],"#8caaa6")
        line([(6,4),(11,4),(16,6),(19,9)],CREAM)
        poly([(12,6),(14,4),(17,6),(15,9)],BRASS);d.point((14,6),LIGHT)
    elif name == "interact":
        poly([(2,5),(5,3),(17,3),(20,6),(20,12),(17,15),(11,15),(6,19),(7,15),(4,14),(2,12)],CREAM)
        for x in [6,10,14]:
            rect((x,8,x+1,9),LEATHER,None)
    elif name == "seal":
        poly([(3,20),(3,8),(7,3),(16,2),(20,7),(20,20)],PINE)
        poly([(6,18),(6,9),(9,5),(15,5),(17,8),(17,18)],DARK)
        line([(10,16),(13,8),(8,11),(15,12)],GOLD,2)
        line([(5,19),(18,19)],SAGE)
    elif name == "plan":
        poly([(4,3),(14,3),(18,7),(18,20),(4,20)],CREAM)
        line([(7,8),(13,8)],BRASS);line([(7,11),(13,11)],BRASS)
        poly([(9,18),(10,14),(18,5),(21,7),(13,16)],OAK)
        line([(12,14),(18,7)],LIGHT)
    elif name == "trade":
        rect((10,3,12,18),BRASS);rect((6,18,16,20),GOLD)
        line([(3,7),(19,5)],GOLD,2)
        for x,y in [(5,7),(17,6)]:
            line([(x,y),(x-3,y+6),(x+3,y+6),(x,y)],CREAM)
            poly([(x-4,y+6),(x+4,y+6),(x+2,y+9),(x-2,y+9)],BRASS)
    elif name == "clue":
        poly([(3,20),(4,6),(8,3),(17,3),(20,7),(19,20)],BLUE)
        line([(5,17),(6,7),(9,5),(16,5)],WATER)
        line([(8,12),(11,8),(15,10),(12,14),(15,16)],LIGHT,2)
    elif name == "chest":
        poly([(2,12),(3,7),(6,4),(17,4),(21,8),(21,19),(19,21),(3,19)],OAK)
        poly([(3,8),(6,5),(16,5),(19,8),(20,12),(3,12)],BRASS)
        line([(4,12),(19,12)],INK,2)
        for x in (5,16):
            rect((x,6,x+1,18),GOLD,None)
        rect((9,11,13,15),GOLD);d.point((11,13),INK)
    else:
        raise ValueError(name)
    return im


def asset_uuid(path):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "Wujkk7/XAP/" + path.relative_to(ASSETS).as_posix()))


def save(name, image, group, inset=0):
    folder = OUT / group
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / ("ui-" + name + ".png")
    image.save(path, optimize=True)
    # Preserve UUIDs if an artist has already imported or replaced this asset.
    sidecar = Path(str(path) + ".meta")
    metadata = json.loads((ASSETS / "resources/art/node_gold.png.meta").read_text("utf-8"))
    uid = json.loads(sidecar.read_text("utf-8"))["uuid"] if sidecar.exists() else asset_uuid(path)
    metadata["uuid"] = uid
    metadata["userData"]["redirect"] = uid + "@6c48a"
    for key,sub in metadata["subMetas"].items():
        sub["displayName"] = path.stem
        sub["uuid"] = uid + "@" + key
    tex, frame = (metadata["subMetas"][key]["userData"] for key in ["6c48a","f9941"])
    tex["imageUuidOrDatabaseUri"] = uid
    frame["imageUuidOrDatabaseUri"] = uid + "@6c48a"
    w,h = image.size
    frame.update(width=w,height=h,rawWidth=w,rawHeight=h,trimType="none")
    for side in ["Top","Right","Bottom","Left"]:
        frame["border"+side] = inset
    v = frame["vertices"]
    v.update(rawPosition=[-w/2,-h/2,0,w/2,-h/2,0,-w/2,h/2,0,w/2,h/2,0],
             uv=[0,h,w,h,0,0,w,0],minPos=[-w/2,-h/2,0],maxPos=[w/2,h/2,0])
    sidecar.write_text(json.dumps(metadata,indent=2)+"\n",encoding="utf-8")


if __name__ == "__main__":
    for name,style in {"panel-window":"panel","panel-hud":"hud","button":"button","button-down":"down",
        "button-primary":"primary","button-primary-down":"primary-down","key":"key",
        "key-down":"key-down","key-empty":"key-empty","key-selected":"key-selected"}.items():
        save(name, plate(style), "surfaces", 14)
    save("stick-base", joystick(True), "controls")
    save("stick-thumb", joystick(False), "controls")
    for name in ("pack","letters","book","grid","camera","sound","entry","ladder","dig","interact",
                 "seal","plan","trade","clue","chest"):
        save(name,icon(name),"icons")
    dir_template = (ASSETS / "resources/art.meta").read_text("utf-8")
    for folder in [OUT,*sorted(p for p in OUT.iterdir() if p.is_dir())]:
        meta_path = Path(str(folder) + ".meta")
        if not meta_path.exists():
            meta = json.loads(dir_template)
            meta["uuid"] = asset_uuid(folder)
            meta_path.write_text(json.dumps(meta,indent=2)+"\n",encoding="utf-8")
