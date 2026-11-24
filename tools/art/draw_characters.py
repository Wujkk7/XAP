"""Draw the field crew on a common foot line; emit a native Creator sprite atlas."""

from pathlib import Path

from PIL import Image, ImageDraw
from sprite_atlas import write_atlas


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "cocos/assets/resources/art-v101/characters"
SIZE = (32, 46)
INK = "#342f31"
HAIR = "#523e39"
HAIR_LIGHT = "#795442"
SKIN_DARK = "#ae7160"
SKIN = "#db9c79"
SKIN_LIGHT = "#f3c79a"
TEAL_DARK = "#304b4f"
TEAL = "#436c6d"
TEAL_LIGHT = "#65908a"
PANTS = "#45505a"
PANTS_LIGHT = "#617176"
LEATHER_DARK = "#59443b"
LEATHER = "#866448"
LEATHER_LIGHT = "#b48d62"
AMBER_DARK = "#86583f"
AMBER = "#b67d49"
AMBER_LIGHT = "#ddaa66"
CREAM = "#f2d595"
GLINT = "#fff0bb"


class Pixels:
    def __init__(self, image, offset=(0, 0)):
        self.draw = ImageDraw.Draw(image)
        self.x, self.y = offset

    def points(self, coords):
        return [(x + self.x, y + self.y) for x, y in coords]

    def shape(self, color, coords, edge=None):
        self.draw.polygon(self.points(coords), fill=color, outline=edge)

    def line(self, color, *coords):
        self.draw.line(self.points(coords), fill=color)

    def box(self, color, x, y, w, h):
        self.draw.rectangle((x+self.x, y+self.y, x+w-1+self.x, y+h-1+self.y), fill=color)


def lamp(p, x, y):
    p.shape(LEATHER_DARK, [(x,y+1),(x+1,y),(x+4,y),(x+5,y+1),(x+5,y+4),(x+4,y+5),(x+1,y+5),(x,y+4)], INK)
    p.box(AMBER_LIGHT, x+1,y+1,4,4)
    p.box(CREAM, x+2,y+1,2,3)
    p.box(GLINT, x+1,y+1,2,2)
    p.box(AMBER, x+2,y+4,2,1)


def helmet(p, view):
    side = view == "side"
    crown = [(6,14),(6,10),(8,6),(11,4),(14,3),(19,3),(23,5),(25,8),(26,12),(26,15),(23,17),(9,17)]
    p.shape(AMBER, crown, INK)
    p.shape(AMBER_LIGHT, [(8,11),(9,8),(12,6),(15,5),(19,5),(20,6),(14,7),(12,9),(12,11)])
    p.shape(AMBER_DARK, [(19,4),(23,6),(25,9),(25,13),(21,13),(22,9)])
    p.line(CREAM,(10,8),(13,6),(15,6))
    p.line("#a77045",(15,5),(14,8),(14,10))
    p.shape(LEATHER_DARK, [(7,11),(13,12),(21,11),(25,10),(26,13),(21,15),(7,15)])
    p.line("#8f7660",(8,12),(12,13),(18,13))
    if side:
        p.shape(AMBER_LIGHT, [(7,13),(15,14),(21,13),(29,13),(29,14),(25,16),(19,17),(8,16),(6,15)], INK)
        p.line(AMBER_LIGHT,(11,15),(17,15),(23,14))
        lamp(p,22,9)
    else:
        p.shape(AMBER, [(5,14),(10,14),(15,15),(21,14),(25,13),(27,14),(26,16),(20,17),(10,17),(5,16)], INK)
        p.line(AMBER_LIGHT,(6,15),(12,16),(16,16))
        if view == "back":
            p.box(LEATHER,15,12,4,3)
            p.line(LEATHER_LIGHT,(15,12),(18,12))
        else:
            lamp(p,13,10)


def head(p, view):
    if view == "side":
        p.shape(HAIR, [(8,12),(19,11),(25,14),(25,18),(27,19),(27,21),(25,21),(24,25),(21,27),(14,26),(9,23),(8,20)], INK)
        p.shape(SKIN,[(15,17),(22,16),(24,17),(24,19),(26,20),(25,21),(24,21),(23,24),(21,25),(17,24),(15,22)])
        p.line(SKIN_LIGHT,(20,18),(22,17),(23,17))
        p.box(INK,22,19,2,2)
        p.box(SKIN_DARK,20,22,3,1)
        p.shape(SKIN_LIGHT,[(14,19),(16,18),(17,19),(16,22),(14,22)])
        p.box(SKIN_DARK,15,20,1,2)
        p.line(HAIR_LIGHT,(9,18),(10,21),(11,22))
        p.line(HAIR_LIGHT,(10,16),(13,17))
    elif view == "back":
        p.shape(HAIR,[(7,14),(23,13),(25,16),(24,22),(22,23),(21,26),(18,25),(16,27),(13,25),(11,26),(10,23),(8,22)], INK)
        p.line(HAIR_LIGHT,(9,17),(9,19),(11,21))
        p.line(HAIR_LIGHT,(11,18),(12,21),(15,23))
        p.line("#6d4b40",(17,18),(17,21),(19,22))
        p.box(SKIN,7,19,2,3)
        p.box(SKIN_DARK,23,19,2,3)
    else:
        p.shape(HAIR,[(7,14),(22,13),(25,15),(25,21),(23,23),(22,25),(18,26),(16,28),(11,26),(9,23),(7,22)],INK)
        p.shape(SKIN, [(10,16),(20,15),(23,16),(23,21),(21,24),(18,26),(14,25),(11,23),(10,21)])
        p.shape(SKIN_LIGHT, [(11,17),(17,16),(17,18),(14,18),(13,20),(11,21)])
        p.line(SKIN_DARK,(21,22),(20,23),(17,24))
        p.box(HAIR,10,16,4,2)
        p.box(HAIR_LIGHT,20,16,2,1)
        p.box(INK,13,19,2,2)
        p.box(INK,20,18,2,2)
        p.box(SKIN_DARK,17,21,1,1)
        p.line("#985e55",(16,23),(18,23))
        p.box(SKIN_DARK,9,20,2,2)
    helmet(p, view)


def leg(p, x, bottom, kick=0):
    end = x + kick
    p.shape(PANTS, [(x-2,34),(x+3,34),(end+2,bottom-3),(end-2,bottom-3)],INK)
    p.line(PANTS_LIGHT,(x-1,36),(end-1,bottom-4))
    p.shape(LEATHER_DARK,[(end-2,bottom-5),(end+2,bottom-5),(end+3,bottom-3),(end+4,bottom-2),(end+4,bottom),(end-3,bottom)],INK)
    p.line(LEATHER_LIGHT,(end-1,bottom-4),(end+1,bottom-4))
    p.line(LEATHER,(end,bottom-2),(end+2,bottom-2))


def hand(p, x, y):
    p.shape(SKIN_DARK,[(x,y+1),(x+1,y),(x+3,y),(x+4,y+1),(x+4,y+3),(x+2,y+4),(x,y+3)],INK)
    p.box(SKIN, x+1,y+1,3,2)
    p.box(SKIN_LIGHT,x+1,y+1,1,1)


def sleeve(p, x, y):
    p.shape(TEAL,[(x+1,y),(x+4,y),(x+5,y+2),(x+4,y+6),(x+3,y+8),(x,y+8),(x-1,y+6),(x-1,y+2)],INK)
    p.line(TEAL_LIGHT,(x,y+2),(x,y+4))
    p.line(LEATHER_LIGHT,(x,y+6),(x+3,y+7))
    hand(p,x,y+7)


def bag(p,x,y,width,height):
    p.shape(LEATHER, [(x+1,y),(x+width-2,y),(x+width,y+2),(x+width,y+height-2),
                      (x+width-2,y+height),(x+2,y+height),(x,y+height-2),(x,y+2)], INK)
    p.shape(LEATHER_LIGHT,[(x+1,y+2),(x+width-1,y+1),(x+width-2,y+4),(x+2,y+4)])
    p.line(LEATHER_DARK,(x+2,y+5),(x+width-2,y+5))
    p.box(CREAM,x+width//2,y+4,2,2)


def miner(direction, phase):
    view = {"left":"side","right":"side","up":"back","down":"front"}[direction]
    image = Image.new("RGBA", SIZE)
    floor = Pixels(image)
    body = Pixels(image,(0, [0,-1,0,-1][phase]))
    if view == "side":
        # The straight leg plants on the same baseline on every step.
        back, front = [(0,0),(-4,4),(-1,1),(4,-4)][phase]
        leg(floor,13, [44,43,41,45][phase],back)
        leg(floor,18, [45,45,45,42][phase],front)
        sleeve(body,19+[0,-2,0,2][phase],27)
        body.shape(TEAL,[(13,24),(19,24),(22,27),(22,32),(20,36),(12,36),(10,34),(11,27)],INK)
        body.line(TEAL_LIGHT,(20,27),(20,31))
        body.box(LEATHER_DARK,13,34,8,2)
        bag(body,6,25,7,10)
        body.shape("#b8634e",[(13,24),(20,24),(19,27),(14,27),(12,29),(11,25)],INK)
        sleeve(body,13+[0,-3,1,3][phase],26+[0,0,1,-1][phase])
    else:
        left_heels = [45,45,42,42]
        right_heels = [45,42,45,45]
        leg(floor,12,left_heels[phase], [0,-1,0,1][phase])
        leg(floor,19,right_heels[phase], [0,1,0,-1][phase])
        sleeve(body,7,26+[0,-2,1,2][phase])
        sleeve(body,20,26+[0,2,0,-2][phase])
        body.shape(TEAL,[(11,24),(19,23),(22,25),(22,31),(21,35),(18,37),(11,36),(9,34),(10,28)],INK)
        body.line(TEAL_LIGHT,(11,27),(11,31),(12,33))
        body.line(TEAL_DARK,(19,29),(20,31),(19,33))
        body.box(LEATHER_DARK,11,34,10,2)
        if view == "front":
            body.line(LEATHER_DARK,(20,25),(13,34))
            body.line(LEATHER_LIGHT,(19,25),(12,33))
            body.box(CREAM,15,34,2,2)
            body.shape("#b7614e",[(10,24),(15,25),(21,23),(21,26),(18,28),(15,30),(15,27),(12,27)], INK)
            body.line("#d89a71",(12,25),(15,26),(19,25))
            body.box(TEAL_LIGHT,17,30,2,2)
        else:
            bag(body,10,26,11,10)
            body.box(TEAL_DARK,10,26,2,7)
            body.line("#76918a",(10,25),(18,25))
            body.line(LEATHER_LIGHT,(11,32),(11,34))
    head(body,view)
    return image.transpose(Image.Transpose.FLIP_LEFT_RIGHT) if direction == "left" else image


def may():
    image = Image.new("RGBA", SIZE)
    p = Pixels(image)
    leg(p,12,45); leg(p,19,45)
    p.shape("#756879",[(11,22),(19,21),(23,25),(23,31),(26,39),(22,41),(15,42),(8,40),(7,38),(10,31)],INK)
    p.line("#a99599",(10,33),(9,38),(13,39))
    p.shape("#78918a",[(12,24),(14,25),(19,24),(21,23),(21,31),(23,38),(20,40),(13,40),(10,38),(13,31)],INK)
    p.shape("#a5b09b",[(14,27),(19,26),(20,30),(13,31)])
    p.line("#ced0af",(12,37),(16,38),(20,37))
    p.box(TEAL_DARK,15,33,4,3)
    p.line(LEATHER_LIGHT,(15,33),(18,33))
    p.shape("#948292",[(9,24),(13,25),(12,29),(11,31),(8,31),(6,29),(7,26)],INK)
    p.shape("#948292",[(20,24),(23,24),(26,27),(25,30),(21,31),(19,28)],INK)
    hand(p,7,30); hand(p,22,29)
    p.line(LEATHER_DARK,(25,32),(28,32),(29,34),(28,42),(28,45),(27,45),(27,34),(25,33))
    p.line(LEATHER_LIGHT,(28,34),(28,39))
    # Greying bun, two locks framing the face and connected reading glasses.
    p.shape("#a09c99",[(6,12),(4,10),(4,7),(6,5),(10,4),(12,6),(12,10),(9,13)],INK)
    p.line("#dad0b5",(5,8),(6,6),(9,6))
    p.shape("#b6b4a5",[(7,16),(7,12),(9,9),(12,8),(18,7),(22,9),(24,12),(25,17),(23,21),(20,24),(14,25),(10,23),(8,20)],INK)
    p.shape(SKIN,[(9,16),(12,13),(15,13),(17,11),(21,12),(23,15),(23,19),(21,22),(18,23),(14,23),(11,21)])
    p.line("#d7cec0",(9,14),(12,11),(16,10))
    p.line("#8e8d8b",(8,14),(9,17),(9,19))
    p.line("#777176",(20,10),(22,12),(23,15))
    p.line(SKIN_LIGHT,(12,15),(14,14),(16,14))
    p.line(INK,(10,17),(12,16),(15,16),(16,17),(16,19),(13,20),(11,19),(10,17))
    p.line(INK,(16,17),(17,17),(18,16),(22,16),(23,17),(22,19),(19,19),(18,17))
    p.box("#e9d9b5",12,17,2,1)
    p.box("#e9d9b5",19,17,2,1)
    p.line("#9d665b",(16,21),(18,21),(19,20))
    p.box(CREAM,9,20,1,2)
    p.shape("#827389",[(10,23),(15,24),(20,23),(21,24),(16,27),(14,27)], INK)
    return image


def trader():
    image = Image.new("RGBA", SIZE)
    p = Pixels(image)
    leg(p,12,45); leg(p,19,45)
    bag(p,3,22,10,14)
    p.shape("#7f9991",[(3,21),(9,19),(13,20),(14,23),(11,25),(5,25),(3,24)],INK)
    p.line("#b9bba1",(4,22),(9,21))
    p.line(LEATHER_DARK,(8,21),(9,24))
    p.shape("#a26b52",[(11,23),(18,22),(24,24),(24,30),(23,36),(19,38),(11,37),(8,35),(9,27)],INK)
    p.shape("#d6bc8a",[(14,25),(17,26),(19,24),(20,29),(19,34),(15,34)])
    p.line(AMBER_LIGHT,(11,26),(10,30),(10,33))
    p.box(LEATHER_DARK,11,34,11,2)
    p.box(AMBER_LIGHT,16,34,2,1)
    p.shape("#719189",[(9,25),(12,26),(12,29),(10,31),(7,30),(7,27)],INK)
    p.shape("#719189",[(22,25),(25,26),(26,29),(23,31),(20,29)],INK)
    hand(p,7,30); hand(p,23,29)
    p.line(LEATHER_DARK,(11,25),(21,34))
    bag(p,19,31,9,7)
    p.box(CREAM,25,31,2,3)
    p.shape("#665043",[(8,12),(11,9),(20,8),(24,12),(25,17),(24,21),(21,24),(16,26),(11,23),(9,20)],INK)
    p.shape("#c28d71",[(11,15),(19,13),(23,14),(24,17),(23,20),(20,23),(14,23),(11,20)])
    p.line("#edba90",(13,16),(16,15),(19,15))
    p.box(INK,14,17,2,2); p.box(INK,21,16,2,2)
    p.box(SKIN_DARK,18,19,2,1)
    p.shape("#665043",[(13,21),(16,20),(18,21),(20,20),(22,20),(20,22),(17,22),(15,22)])
    p.line(HAIR_LIGHT,(14,21),(16,21))
    p.shape("#517276",[(5,13),(6,10),(8,7),(11,5),(12,2),(13,2),(15,4),(21,5),(24,8),(25,12),(27,14),(25,15),(19,15),(12,16),(6,16)],INK)
    p.shape("#81998d",[(8,10),(10,7),(15,5),(20,6),(16,6),(12,8),(11,10)])
    p.shape("#b89c68",[(7,12),(14,11),(21,10),(24,10),(26,13),(22,13),(14,14),(7,15)],INK)
    p.line("#e0c286",(9,13),(15,12),(20,11))
    p.box(CREAM,22,11,2,2)
    return image


def main():
    frames = {f"walk_{direction}_{step}": miner(direction, step)
              for direction in ("down","left","right","up") for step in range(4)}
    frames.update(npc_may=may(), npc_trader=trader())
    for name, image in frames.items():
        assert image.getbbox()[3] == SIZE[1], name
    for direction in ("down","left","right","up"):
        assert len({frames[f"walk_{direction}_{i}"].tobytes() for i in range(4)}) == 4
    write_atlas(OUT / "field_crew.plist", frames, columns=4)


if __name__ == "__main__":
    main()
