"""Bake the two pixel-art atlases for the v1.0.1 isometric world (Pillow)."""
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw
from sprite_atlas import write_atlas


DEST = Path(__file__).resolve().parents[2] / "cocos/assets/resources/art-v101/world"
THEMES = {
    "forest": ("#889865", "#7d905e", "#9ca66c", "#657f51", "#b4b781", "#826341", "#524334"),
    "roots": ("#816b50", "#766047", "#987b56", "#66513e", "#ae9267", "#77563a", "#4e4035"),
    "rock": ("#657278", "#606a71", "#798588", "#505d66", "#9aaba6", "#5b6062", "#384451"),
}
DIAMOND = [(23, 0), (24, 0), (47, 11), (47, 12), (24, 23), (23, 23), (0, 12), (0, 11)]
INK = "#313a38"


def canvas(w, h):
    img = Image.new("RGBA", (w, h))
    return img, ImageDraw.Draw(img)


def diamond_texture(theme, style, variant):
    rng = random.Random(f"{theme}/{style}/{variant}")
    base, shade, light, dark, glint, *_ = THEMES[theme]
    if style == "trail":
        base, shade, light, dark, glint = {
            "forest": ("#b8a47a", "#b19b74", "#c4b389", "#9d8a69", "#d1c197"),
            "roots": ("#998362", "#937b60", "#a78a67", "#7b6a55", "#b39a76"),
            "rock": ("#819090", "#768383", "#939e9b", "#626f74", "#a5ada7"),
        }[theme]
    if style == "water":
        base, shade, light, dark, glint = (
            ("#668f87", "#60877f", "#82a59a", "#50766f", "#a5bdab") if theme == "forest"
            else ("#4a7069", "#456a63", "#668980", "#3f615e", "#89a497"))
    if style == "field":
        base, shade, light, dark, glint = "#956e4e", "#866146", "#a5815c", "#71513d", "#baa079"
    img, d = canvas(48, 24)
    d.rectangle((0, 0, 47, 23), fill=base)
    for _ in range(26):
        x, y = rng.randrange(-5, 48), rng.randrange(24)
        w = rng.randrange(2, 7)
        d.line((x, y, x + w, y), rng.choice([shade, light, shade]))
    if style == "field":
        for x in range(-48, 49, 7):
            d.line((x, 23, x + 46, 0), dark, 2)
            d.line((x + 2, 23, x + 48, 0), light)
    elif style == "water":
        for _ in range(5):
            x, y = rng.randrange(6, 38), rng.randrange(5, 20)
            d.line([(x, y), (x+3, y-1), (x+8, y-1)], rng.choice([glint, light]))
    elif theme == "forest" and style == "floor":
        for _ in range(5):
            x, y = rng.randrange(5, 40), rng.randrange(4, 20)
            d.line([(x, y), (x+1, y+2), (x+3, y)], dark)
            d.point((x, y-1), glint)
        if variant == 2:
            for x,y in [(17,12),(21,10),(25,13)]:
                d.point((x, y), "#dec799")
                d.point((x-1, y+1), "#b59268")
    elif theme == "rock" and style == "floor":
        x, y = rng.randrange(5, 25), rng.randrange(8, 18)
        d.line([(x-6,y+3),(x,y),(x+6,y),(x+11,y-3)], dark)
        d.line([(x,y+1),(x+5,y+1)], light)
    else:
        for _ in range(4):
            x, y = rng.randrange(5, 40), rng.randrange(4, 21)
            d.line((x, y, x+2, y), dark)
            d.point((x, y-1), glint)
    mask = Image.new("L", img.size)
    ImageDraw.Draw(mask).polygon(DIAMOND, fill=255)
    img.putalpha(mask)
    return img


def cliff(theme, height):
    # In source pixels the tile is 48×24 and the world draws it at 2×.
    _, _, _, _, glint, side, edge = THEMES[theme]
    img, d = canvas(48, 24+height)
    d.polygon([(0,11),(24,23),(24,23+height),(0,11+height)], side)
    d.polygon([(24,23),(47,11),(47,11+height),(24,23+height)], edge)
    rng = random.Random(f"{theme}/{height}")
    for side_index in range(2):
        for x in range(0, 24):
            px = x if not side_index else 47-x
            top = 12+x//2
            for level in range(2, height, 7):
                level += (x//8)%2
                d.point((px,top+level), "#55493a" if theme != "rock" else "#414f57")
                if x%12 in [1,2,3,4]: d.point((px,top+level-1), glint)
            if rng.randrange(5)==0:
                d.point((px,top+rng.randrange(1,height)), "#a39072" if theme != "rock" else "#7e8b8c")
    img.alpha_composite(diamond_texture(theme, "floor", 1))
    return img


def ladder():
    img, d = canvas(18, 24)
    for x in [3, 13]:
        d.polygon([(x,0),(x+2,0),(x+2,22),(x,23),(x-1,22)], "#554333")
        d.line((x,1,x,21), "#ceae72")
    for y in range(3,23,5):
        d.line((4,y+1,13,y+1), "#6b5339")
        d.line((4,y,13,y), "#d1b783")
    return img


def portal(theme):
    img,d = canvas(48,72)
    colors = THEMES[theme]
    for band in range(3):
        y = 16*band
        d.polygon([(0,12+y),(24,y),(24,y+16),(0,y+28)], [colors[5],colors[6],"#393a38"][band])
        d.polygon([(24,y),(47,y+12),(47,y+28),(24,y+16)], [colors[6],"#434342","#303736"][band])
        d.line([(2,13+y),(11,8+y),(16,6+y)], "#8c8470" if band==0 else "#686a5e")
    img.alpha_composite(diamond_texture(theme, "floor",0),(0,48))
    d.line([(0,12),(23,0),(47,12)], colors[4],1)
    for x in [17,24]:
        d.line((x,11,x,60), "#44382f", 2)
        d.line((x,11,x,59), "#bd9b69")
    for y in range(14,59,6):
        d.line((17,y,24,y), "#d3b984")
    return img


def rock(vein=None):
    img,d = canvas(38,28)
    d.polygon([(1,22),(4,13),(11,5),(24,3),(32,9),(36,17),(35,24),(25,27),(12,26)], INK)
    d.polygon([(3,20),(6,13),(13,7),(24,5),(25,10),(18,17),(8,20)], "#939a8c")
    d.polygon([(7,21),(18,16),(25,10),(30,12),(33,20),(28,23),(13,25)], "#6a756d")
    d.polygon([(21,17),(29,12),(33,14),(34,21),(27,25),(19,24)], "#546260")
    d.line([(10,12),(15,8),(22,7)], "#b2b3a0")
    d.line([(4,20),(9,19),(12,21)], "#66716b")
    if vein:
        shadow, mid, hi = vein
        for x,y,h in [(11,20,7),(17,18,12),(24,18,9),(29,17,5)]:
            d.polygon([(x-3,y-1),(x-5,y-h),(x-2,y-h-3),(x+2,y-h+1),(x+3,y-2),(x,y+1)], shadow)
            d.polygon([(x-4,y-h),(x-2,y-h-2),(x+1,y-h+1),(x,y-1)], mid)
            d.line([(x-3,y-h),(x-2,y-h+3),(x-1,y-3)],hi)
    return img


def root():
    img,d = canvas(49,31)
    paths = [
        ([(1,28),(9,19),(15,16),(25,16),(31,12),(35,5),(43,1)],7),
        ([(16,16),(18,10),(24,7),(26,3)],4),
        ([(27,15),(33,17),(40,14),(47,14)],4),
        ([(10,21),(10,25),(5,30)],3),
        ([(36,6),(43,8),(48,5)],3),
    ]
    for pts,w in paths:
        d.line(pts, "#44392e", w, joint="curve")
        d.line([(x,y-1) for x,y in pts], "#906e48", max(1,w-2),joint="curve")
        d.line([(x,y-2) for x,y in pts[1:]], "#bd9867", 1)
    for x,y in [(9,19),(15,15),(26,15),(37,3)]:
        d.line((x,y-2,x+3,y), "#665239")
        d.point((x-2,y-3), "#96a46b")
    return img


def tree(pine=False):
    w,h = (51,77) if pine else (65,73)
    img,d = canvas(w,h)
    cx = w//2
    d.polygon([(cx-5,h-1),(cx-2,h-6),(cx-4,h-29),(cx+1,h-35),(cx+4,h-19),(cx+3,h-6),(cx+7,h-2),(cx+1,h-3)], "#514538")
    d.line([(cx-1,h-8),(cx-1,h-19),(cx-3,h-27)], "#a28258", 2)
    d.line([(cx-2,h-24),(cx-10,h-31),(cx-15,h-44)], "#6d543d", 3)
    rng=random.Random(24 if pine else 37)
    if pine:
        for y,width,height in [(53,24,29),(42,21,27),(30,16,22),(19,11,17)]:
            pts=[(cx,y-height),(cx+width//3,y-height//2),(cx+width,y+5),(cx+width//2,y+4),(cx+width//3,y+8),(cx,y+7),(cx-7,y+9),(cx-width+1,y+5),(cx-width//2,y-2),(cx-width//2-1,y-3)]
            d.polygon(pts, "#354e45")
            d.polygon([(cx,y-height+2),(cx+3,y-5),(cx-1,y-3),(cx-2,y),(cx-7,y-1),(cx-8,y+2),(cx-width+5,y+2)], "#58735a")
            d.line([(cx-2,y-height+7),(cx-6,y-7),(cx-8,y-6)], "#91a576",2)
            for _ in range(12):
                x=rng.randrange(cx-width//2,cx+width//2); yy=rng.randrange(y-4,y+3)
                d.line((x,yy,x-2,yy+1),rng.choice(["#728968","#465f4c"]))
    else:
        clusters=[(14,34,14),(28,37,16),(45,35,17),(49,24,15),(37,18,16),(24,18,16),(14,25,13),(28,27,16),(42,28,13),(27,14,11)]
        for i,(x,y,r) in enumerate(clusters):
            shade=["#4f684a","#576d4b","#47644a","#58764f","#607d50"][i%5]
            # Irregular angular clusters keep the crown readable at mobile scale.
            pts=[]
            for k in range(18):
                a=k*math.tau/18; radius=r*rng.uniform(.85,1.08)
                pts.append((round(x+math.cos(a)*radius),round(y+math.sin(a)*radius*.84)))
            d.polygon(pts,shade)
            for _ in range(7):
                dx,dy=rng.randint(-r//2,r//2),rng.randint(-r//2,2)
                d.line([(x+dx,y+dy),(x+dx+2,y+dy-1),(x+dx+4,y+dy-1)],rng.choice(["#779057","#879860","#6c8653"]))
        for x,y in [(12,18),(18,10),(27,7),(38,11),(45,16),(31,22)]:
            d.line((x,y,x+3,y-1),"#acb374",2)
    return img


def chest(letter=False):
    img,d = canvas(37,29)
    p = "#af915d" if letter else "#cba263"
    d.polygon([(1,11),(19,3),(35,9),(35,22),(17,28),(1,22)], INK)
    d.polygon([(3,12),(19,5),(33,10),(16,17)], "#ba8960" if not letter else "#83928a")
    d.polygon([(3,14),(16,19),(16,25),(3,21)], "#98734d" if not letter else "#647b75")
    d.polygon([(17,19),(33,12),(33,20),(17,25)], "#78573f" if not letter else "#4e6867")
    for dx in [0,10]:
        d.line([(6+dx,10-dx//2),(19+dx,15-dx//2),(19+dx,24-dx//2)],p,2)
    d.line([(2,16),(16,21),(34,14)], "#574c3e")
    d.rectangle((21,16,24,19),fill=p)
    d.point((23,18), "#584d39")
    if letter:
        d.polygon([(12,9),(17,7),(21,9),(16,12)], "#ded3a3")
        d.line((15,9,18,9),"#9c9c7a")
    return img


def stonework(seal=False):
    img,d=canvas(40,45)
    d.polygon([(2,37),(18,29),(37,35),(37,39),(21,44),(2,40)],"#4c524c")
    d.polygon([(2,36),(19,29),(37,34),(20,41)],"#a49f82")
    if seal:
        d.polygon([(6,36),(7,15),(12,9),(15,11),(15,32),(22,35),(22,38)],"#5d6c62")
        d.polygon([(24,34),(24,10),(29,7),(33,10),(33,31)],"#59645a")
        d.polygon([(7,15),(12,10),(12,31),(7,34)],"#8c9781")
        d.polygon([(24,12),(28,9),(28,30),(24,32)],"#a5a084")
        d.polygon([(6,10),(23,3),(35,7),(34,13),(18,20),(6,15)],"#686f61")
        d.polygon([(6,10),(23,2),(35,6),(18,14)],"#c0b58e")
        d.line([(9,14),(17,16),(30,11)],"#c7a869",2)
        d.polygon([(19,17),(23,20),(20,29),(16,26)],"#9bb8a1")
        d.line((19,20,20,24),"#e5c98c",2)
    else:
        d.polygon([(9,33),(8,11),(14,5),(24,2),(30,5),(31,30),(21,36)],"#515e5d")
        d.polygon([(11,12),(15,7),(25,4),(26,28),(12,33)],"#95a399")
        d.line([(12,13),(16,8),(23,6)], "#c2c6aa")
        for x,y,w in [(15,17,6),(15,21,7),(15,26,4)]:
            d.line((x,y,x+w,y-2),"#536a65",2)
            d.point((x+w+2,y-2),"#cab886")
        d.line([(26,8),(29,6),(29,28)],"#77897e")
    return img


def cottage(blue):
    img,d=canvas(82,70)
    # Warm plaster, a sheltered gable door, and a north-lit shingle roof.
    roof, bright, shadow = ("#607d84","#81999a","#465e68") if blue else ("#aa6751","#c28460","#825345")
    d.polygon([(5,43),(41,28),(77,40),(77,57),(44,69),(7,56)],"#56584a")
    d.polygon([(8,36),(42,24),(44,64),(8,52)],"#c4b391")
    d.polygon([(44,35),(73,26),(73,52),(44,64)],"#a19078")
    d.polygon([(44,35),(56,9),(77,25),(74,30),(44,44)],"#d1bb94")
    d.polygon([(3,33),(21,10),(54,0),(77,23),(45,42)],shadow)
    d.polygon([(4,32),(21,9),(55,0),(41,26),(10,38)],roof)
    d.polygon([(39,30),(55,1),(78,23),(75,26),(56,7),(44,37)],bright)
    for r in range(5):
        a=(10+r*2,28-r*4); b=(42+r*2,17-r*4)
        d.line([a,b],bright)
        for j in range(4):
            x=a[0]+j*8+(r%2)*3; y=a[1]-j*3
            d.line((x,y,x-1,y+2),shadow)
    d.line([(4,33),(10,38),(41,27)], "#5c574a",2)
    d.line([(9,39),(9,52),(44,63),(73,52)],"#796b56",2)
    d.line([(44,39),(44,63)],"#6b5c4b",3)
    d.polygon([(17,38),(30,42),(30,51),(17,47)],"#655e4e")
    d.polygon([(19,40),(27,42),(27,48),(19,46)],"#b8c9af")
    d.line((23,41,23,47),"#756b55")
    d.polygon([(12,36),(30,41),(33,45),(13,40)],roof)
    d.polygon([(52,45),(62,41),(62,55),(52,59)],"#675642")
    d.line((55,46,55,56),"#a08a64")
    d.point((60,49),"#e7bd73")
    d.line([(49,60),(62,55),(67,56),(52,62)],"#c2b094",2)
    d.rectangle((66,39,69,43),fill="#7b6149")
    d.rectangle((67,40,68,42),fill="#e5c68a")
    d.polygon([(23,11),(23,4),(28,2),(32,4),(32,10),(27,13)],"#837c6a")
    d.line((23,4,28,2),"#b3a48a",2)
    for x,y in [(9,54),(14,56),(36,62),(68,55)]:
        d.line([(x-2,y),(x,y-4),(x+2,y-2),(x+4,y-4)],"#68845d",2)
    return img


def find_item(part):
    img,d=canvas(27,23)
    d.ellipse((1,15,25,22),fill="#575d4e")
    if part:
        d.polygon([(4,14),(7,5),(19,2),(24,6),(21,16),(10,20)],"#665541")
        d.line([(7,15),(10,7),(18,5),(21,7),(18,14),(10,17)],"#c1a36a",3)
        d.line([(11,15),(12,11),(14,9)],"#ead5a1",2)
        d.line([(17,16),(20,16),(21,20)],"#947759",2)
    else:
        d.polygon([(3,14),(7,6),(16,3),(23,8),(22,15),(13,20),(5,18)],"#8b764d")
        d.polygon([(5,13),(8,7),(15,5),(21,8),(18,10),(10,15)],"#d5b574")
        d.polygon([(10,15),(19,10),(22,9),(20,15),(13,18)],"#a38658")
        d.line([(8,12),(12,8),(16,7)],"#f1dba1")
    return img


def main():
    terrain,props = {},{}
    for theme in THEMES:
        for style in ["floor","trail","water"]:
            for variant in range(3):
                terrain[f"{theme}_{style}_{variant}"]=diamond_texture(theme,style,variant)
        terrain[f"{theme}_shaft"]=portal(theme)
        props[f"{theme}_soil"]=cliff(theme,7)
        props[f"{theme}_wall"]=cliff(theme,36)
        for side in ["west","east"]:
            whole=cliff(theme,48)
            face,_=canvas(24,60)
            for x in range(24):
                sx=x if side=="west" else x+24
                y=12+(x if side=="west" else 23-x)//2
                face.paste(whole.crop((sx,y,sx+1,y+48)),(x,y-12))
            terrain[f"{theme}_edge_{side}"]=face
    terrain["field"]=diamond_texture("forest","field",0)
    terrain["ladder_up"]=ladder()
    props.update(oak=tree(), pine=tree(True), boulder=rock(), giant_root=root(),
                 treasure_chest=chest(), letter_chest=chest(True), seal_arch=stonework(True),
                 inscription=stonework(), house_red=cottage(False), house_blue=cottage(True),
                 unexamined_relic=find_item(False), damaged_pack_part=find_item(True))
    veins = {
        "ore_copper":("#795043","#ba8160","#ddb391"), "ore_iron":("#4c5961","#879397","#b9c0b7"),
        "ore_gold":("#8c6a3e","#bf9c57","#e8cc8c"), "ore_diamond":("#466a78","#83adba","#c3d9c9"),
        "ore_starcore":("#635875","#a692b0","#d5c6c6"), "stubborn_stone":("#754f5b","#b7838b","#e3b7ac"),
        "root_heart":("#5a6a45","#98ac78","#d5d9a1"), "glow_vein":("#46667a","#80adbf","#c3ded9"),
    }
    props.update({key:rock(colors) for key,colors in veins.items()})
    write_atlas(DEST / "terrain/terrain.plist", terrain)
    write_atlas(DEST / "props/props.plist", props, columns=5)


if __name__=="__main__":
    main()
