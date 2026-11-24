import {
  _decorator, Component, Node, Canvas, Camera, UITransform, Graphics, Sprite, SpriteFrame,
  Texture2D, SpriteAtlas, Color, Label, Layers, UIOpacity, resources, view,
  ResolutionPolicy, input, Input, EventKeyboard, EventTouch, KeyCode, sys, game, Game, profiler,
} from "cc";
import { isoProject, isoUnproject } from "../core/Isometric";
import { LayeredLab } from "../core/LayeredLab";
import type { LabEffect } from "../core/LayeredLab";
import { LAB_THEMES } from "../data/external-files/IsometricLayers";
import { ISOMETRIC_MAP as MAP } from "../data/external-files/IsometricMap";
import { ISO_TILE_WIDTH as W, ISO_TILE_HEIGHT as H, ISO_OVERVIEW_ZOOM, ISO_FOLLOW_ZOOM, LAB_LAYER_GAP, LAB_TRAVEL_SECONDS, LAB_PARTICLE_CAP } from "../data/constants/IsometricRules";
import { walkFrame } from "../data/resource-config/XPAAArt";
import { UI_COLORS as C } from "../data/resource-config/TileStyles";
import { occlusionAlpha } from "./ObliqueProjection";
import { WordPassages } from "../core/WordPassages";
import { WordPassageUI } from "./WordPassageUI";
import { LabUISkin } from './LabUISkin';
import { LAB_STORAGE_KEY } from "../data/player-data/LabSave";
import { LAB_WORD_RULES } from "../data/constants/WordPassageRules";
import { labBrightness, smoothBrightness } from "../core/LabLighting";
import { LAB_LAMP, LAB_WORLD_SEED } from "../data/constants/IsometricRules";
import { LAB_BLOCK_HEIGHT, LAB_WALL_HEIGHT, LAB_SOIL_HEIGHT } from '../data/constants/IsometricRules';
import { LAB_VILLAGE } from '../data/external-files/LabVillage';
import { STRATUM_TINT } from '../data/resource-config/ArtCatalog';
import { hashCoords } from "../core/rng";
import { stratumAt } from '../core/strata';

const { ccclass } = _decorator;
interface Actor { x: number; y: number; width: number; node: Node; sprite: Sprite; opacity: UIOpacity; brightness?: number }
interface LayerView { node: Node; actorsNode: Node; actors: Actor[]; grid: Graphics; fog: Graphics; brightness: Float32Array; fogAlpha: Uint16Array; revision: number; floors: Map<string, Node> }
interface Fragment { x: number; y: number; depth: number; vx: number; vy: number; age: number; life: number; size: number; color: string }

@ccclass("IsometricDemo")
export class IsometricDemo extends Component {
  private lab = new LayeredLab();
  private words = new WordPassages(this.lab);
  private skin = new LabUISkin();
  private wordUI!: WordPassageUI;
  private interactButton!: Label;
  private wordMarks!: Graphics;
  private weapon!: Label;
  private swingAge = 1;
  private wordDamage = 0;
  private finishSwing: (() => void) | null = null;
  private saveClock = 0;
  private saveError = "";
  private preserveBadSave = false;
  private loot: { label: Label; age: number; letter: string }[] = [];
  private walk = this.lab.walk;
  private frames = new Map<string, SpriteFrame>();
  private world!: Node;
  private actors: Actor[] = [];
  private player!: Actor;
  private marker!: Graphics;
  private paintStick!: (x: number, y: number, active: boolean) => void;
  private readout!: Label;
  private gridButton!: Label;
  private cameraButton!: Label;
  private keys = new Set<KeyCode>();
  private joystick = { x: 0, y: 0, id: -1 };
  private cameraX = MAP.size / 2;
  private cameraY = MAP.size / 2;
  private follow = true;
  private grid = true;
  private ready = false;
  private safeAreaObserver: ResizeObserver | null = null;
  private layerViews = new Map<number, LayerView>();
  private striking = false;
  private titleText!: Label;
  private subtitleText!: Label;
  private notice!: Label;
  private impactButton!: Label;
  private fragments: Fragment[] = [];
  private sinks: { x: number; y: number; depth: number; age: number; color: string; height:number }[] = [];
  private shake = 0;
  private elapsed = 0;
  private lastMessage = "";
  private noticeTime = 0;
  private audio: AudioContext | null = null;
  private sound = true;
  private pickup!: Label;
  private pickupAge = 2;
  private pickupPoint = { x: 0, y: 0, depth: 0 };
  private camera!: Camera;
  private buttonResets: (() => void)[] = [];
  private lastDepth = 0;
  private cardViews=new Map<object,Label>();

  onLoad(): void {
    try { const raw = sys.localStorage.getItem(LAB_STORAGE_KEY); if (raw) this.words.restore(raw); }
    catch (error) { this.preserveBadSave = true; this.saveError = "实验存档读取失败，原档已保留；当前游玩不会覆盖。"; console.warn(error); }
    this.node.layer = Layers.Enum.UI_2D;
    profiler.hideStats(); view.setDesignResolutionSize(1280, 720, ResolutionPolicy.SHOW_ALL);
    if (sys.isBrowser && typeof ResizeObserver !== "undefined") {
      document.title = "地心寻词 · 破土向下";
      const host = document.getElementById("SafeArea");
      if (host) {
        const fit = () => { if (host.clientWidth && host.clientHeight) view.setFrameSize(host.clientWidth, host.clientHeight); };
        fit(); this.safeAreaObserver = new ResizeObserver(fit); this.safeAreaObserver.observe(host);
      }
    }
    const canvas = this.node.addComponent(Canvas), cameraNode = this.make("相机", this.node);
    this.node.getComponent(UITransform)!.setContentSize(1280, 720);
    cameraNode.setPosition(0, 0, 1000);
    const camera = cameraNode.addComponent(Camera); this.camera = camera;
    camera.projection = Camera.ProjectionType.ORTHO; camera.orthoHeight = 360;
    camera.visibility = Layers.Enum.UI_2D; camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = this.color(C.background); canvas.cameraComponent = camera;
    this.world = this.make("多层试验场", this.node);
    this.buildUI(); void this.load();
    input.on(Input.EventType.KEY_DOWN, this.keyDown, this); input.on(Input.EventType.KEY_UP, this.keyUp, this);
    game.on(Game.EVENT_HIDE, this.resetInput, this); view.on("canvas-resize", this.resetInput, this);
  }

  private color(hex: string): Color { return new Color().fromHEX(hex); }
  private make(name: string, parent: Node, x = 0, y = 0, w = 1280, h = 720): Node {
    const node = new Node(name); node.layer = Layers.Enum.UI_2D; parent.addChild(node);
    node.setPosition(x, y); node.addComponent(UITransform).setContentSize(w, h); return node;
  }
  private text(parent: Node, name: string, content: string, x: number, y: number, w: number, size: number): Label {
    const label = this.make(name, parent, x, y, w, 70).addComponent(Label);
    label.string = content; label.fontSize = size; label.lineHeight = size * 1.4;
    label.color = this.color(C.ink); label.overflow = Label.Overflow.SHRINK; return label;
  }
  private button(title: string, x: number, y: number, action: () => void, hold?: (down: boolean) => void, height = 86): Label {
    const node = this.make(title, this.node, x, y, 180, height);
    const paint = this.skin.hudButton(node, title, !!hold);
    paint(false);
    let pointer: number | null = null;
    node.on(Node.EventType.TOUCH_START, (e: EventTouch) => { e.propagationStopped = true; if (pointer === null) { pointer = e.getID(); hold?.(true); paint(true); } });
    node.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      if (e.getID() !== pointer) return;
      pointer = null; hold?.(false); paint(false); if (node.getComponent(UITransform)!.hitTest(e.getLocation())) action();
    });
    const release = () => { pointer = null; hold?.(false); paint(false); };
    node.on(Node.EventType.TOUCH_CANCEL, release); this.buttonResets.push(release);
    const label = this.text(node, "文字", title, hold ? 0 : 17, hold ? -25 : 0, hold ? 160 : 128, hold ? 26 : 23);
    if (hold) label.color = this.color(C.darkInk); return label;
  }
  private buildUI(): void {
    const plate = this.make("标题底色", this.node, -405, 286, 374, 94);
    this.skin.frame(plate, 'ui-panel-hud', true);
    this.titleText = this.text(this.node, "标题", "破土向下 · 阳光森林", -405, 306, 350, 30);
    this.subtitleText = this.text(this.node, "说明", "最深 1 层 · 矿晶 0", -405, 271, 350, 21); this.subtitleText.color = this.color(C.muted);
    this.gridButton = this.button("网格 · 开", 295, 286, () => this.toggleGrid());
    this.cameraButton = this.button("镜头 · 跟随", 505, 286, () => this.toggleCamera());
    this.button("回到入口", 295, -281, () => { this.lab.returnToEntry(); this.resetInput(); });
    this.button("返回上层", 295, -177, () => { this.lab.ascend(); this.resetInput(); });
    this.impactButton = this.button("敲击地面", 505, -239, () => { if (!this.wordUI.active) this.lab.tapStrike(); }, down => {
      this.striking = down; if (down) this.playSound("hit");
    }, 170);
    const audio = this.button("声音 · 开", 85, 286, () => { this.sound = !this.sound; audio.string = "声音 · " + (this.sound ? "开" : "关"); });
    const stick = this.make("摇杆", this.node, -495, -235, 192, 192);
    this.paintStick = this.skin.joystick(stick);
    const move = (e: EventTouch) => {
      e.propagationStopped = true;
      if (!this.ready || this.lab.travel || this.wordUI?.active || view.getFrameSize().height > view.getFrameSize().width) return;
      if (this.joystick.id !== -1 && this.joystick.id !== e.getID()) return;
      const p = e.getUILocation(), x = p.x - 640 + 495, y = p.y - 360 + 235, d = Math.max(65, Math.hypot(x, y));
      this.joystick = { x: x / d, y: y / d, id: e.getID()! };
    };
    stick.on(Node.EventType.TOUCH_START, move); stick.on(Node.EventType.TOUCH_MOVE, move);
    const end = (e: EventTouch) => { e.propagationStopped = true; if (this.joystick.id === e.getID()) this.joystick = { x: 0, y: 0, id: -1 }; };
    stick.on(Node.EventType.TOUCH_END, end); stick.on(Node.EventType.TOUCH_CANCEL, end);
    this.text(this.node, "移动说明", sys.isMobile ? "移动" : "WASD / 方向键", -495, -340, 250, 20);
    this.readout = this.text(this.node, "位置", "正在装入试验场…", 0, -315, 520, 23);
    this.notice = this.text(this.node, "发现提示", "", 0, 100, 780, 27);
    this.notice.enableOutline = true; this.notice.outlineWidth = 3; this.notice.outlineColor = this.color(C.background);
    this.button("字母袋", -125, 286, () => this.openWords("bag"));
    this.button('资源背包',-495,180,()=>this.openWords('inventory'),undefined,60);
    this.button('词义图鉴',-285,180,()=>this.openWords('dex'),undefined,60);
    this.interactButton = this.button("探索互动", 505, -105, () => this.interact(), undefined, 64);
    this.wordUI = new WordPassageUI(this.node, this.words, () => { this.saveLab(); }, (letters, finish) => {
      if (letters.startsWith("+")) { this.showLetterLoot(letters.slice(1)); return; }
      this.weapon.string = letters; this.swingAge = 0; this.finishSwing = finish ?? null; this.playSound("hit");
      const p = this.words.services[0]; this.lab.target = { x: p.x, y: p.y };
    }, () => { const p = this.words.services[0]; if (!this.words.room.opened) this.lab.tile(p.x,p.y)!.damage = 0; this.resetInput(); }, this.skin);
  }
  private openWords(mode: string, index = 0): void {
    if (!this.ready || this.lab.travel) return;
    this.resetInput(); this.wordUI.open(mode, index);
  }
  private interact(): void {
    if(this.wordUI.active||this.lab.travel)return;
    const target=this.lab.selected();
    if(this.words.adventure.open(target.x,target.y)){this.openWords('worldchest');return;}
    const p = this.words.nearby(); if (!p || this.wordUI.active) return;
    if (p.id === "seal") this.openWords("seal");
    else if (p.id.startsWith("chest")) this.openWords("chest", Number(p.id.slice(-1)));
    else this.openWords(p.id);
  }
  private saveLab(): void {
    if (this.preserveBadSave || this.lab.travel || !this.ready) return;
    try { sys.localStorage.setItem(LAB_STORAGE_KEY, this.words.snapshot()); this.saveError = ""; }
    catch { this.saveError = "实验进度保存失败，请检查浏览器存储空间；旧存档仍保留。"; }
  }
  private showLetterLoot(letters: string): void {
    for (let i = 0; i < letters.length; i++) {
      const label = this.text(this.node, "字母入袋", letters[i], 0, 80, 70, 42);
      label.color = this.color("JQXZKV".includes(letters[i]) ? "f4c577" : "f1e7c7");
      this.loot.push({ label, age: -i * 0.13, letter: letters[i] });
    }
  }

  private async load(): Promise<void> {
    try {
      const [atlases, uiFrames] = await Promise.all([
        new Promise<SpriteAtlas[]>((resolve, reject) =>
          resources.loadDir("art-v101", SpriteAtlas, (error, assets) => error ? reject(error) : resolve(assets))),
        new Promise<SpriteFrame[]>((resolve, reject) =>
          resources.loadDir("art-v101/ui", SpriteFrame, (error, assets) => error ? reject(error) : resolve(assets))),
      ]);
      if (!this.isValid) return;
      for (const atlas of atlases) for (const [name, frame] of Object.entries(atlas.spriteFrames)) {
        if (!frame) throw new Error(atlas.name + " 缺少图帧 " + name);
        frame.texture.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
        this.frames.set(name, frame);
      }
      for (const frame of uiFrames) {
        frame.texture.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
        this.frames.set(frame.name, frame);
      }
      this.skin.bind(this.frames);
      this.ensureView(this.lab.depth); this.player = this.actor(this.layerViews.get(this.lab.depth)!.actorsNode, "walk_down_0", this.walk.x, this.walk.y, 48);
      this.marker = this.make("裂纹与碎屑", this.world).addComponent(Graphics);
      this.pickup = this.text(this.world, "拾取提示", "矿晶 +1", 0, 0, 220, 25); this.pickup.color = this.color(C.accent);
      this.wordMarks = this.make("探索标识", this.world).addComponent(Graphics);
      this.weapon = this.text(this.world, "字母武器", "", 0, 0, 300, 58); this.weapon.color = this.color("f9d484");
      this.weapon.enableOutline = true; this.weapon.outlineColor = this.color("27392f"); this.weapon.outlineWidth = 3;
      this.node.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
        if (this.lab.travel || this.wordUI.active) return;
        const p = e.getUILocation(), zoom = this.world.scale.x;
        const pointer = { x: (p.x - 640 - this.world.position.x) / zoom, y: (p.y - 360 - this.world.position.y) / zoom + this.lab.depth * LAB_LAYER_GAP };
        // 大精灵透明矩形不能截走近处矿晶的点击；在可敲击范围内按可见物体中心选择。
        const candidates = this.layerViews.get(this.lab.depth)!.actors.filter(actor => {
          const foot = isoProject(actor.x, actor.y), h = actor.node.getComponent(UITransform)!.height;
          return Math.hypot(actor.x - this.walk.x, actor.y - this.walk.y) <= 1.65 && Math.abs(pointer.x - foot.x) < actor.width / 2 && pointer.y >= foot.y && pointer.y <= foot.y + h;
        });
        const score = (actor: Actor) => {
          const foot = isoProject(actor.x, actor.y), h = actor.node.getComponent(UITransform)!.height;
          return Math.hypot(pointer.x - foot.x, pointer.y - foot.y - h * 0.4);
        };
        candidates.sort((a, b) => score(a) - score(b));
        if (candidates.length) { this.lab.select(Math.floor(candidates[0].x), Math.floor(candidates[0].y)); return; }
        const local = isoUnproject(pointer.x, pointer.y);
        if (!this.lab.select(Math.floor(local.x), Math.floor(local.y))) this.lab.message = "点选身边的地块，再长按敲击";
      });
      this.ready = true;
    } catch (error) { this.readout.string = "试验场加载失败：" + (error as Error).message; console.error(error); }
  }
  private polygon(g: Graphics, points: { x: number; y: number }[], fill?: string): void {
    g.moveTo(points[0].x, points[0].y); for (const p of points.slice(1)) g.lineTo(p.x, p.y); g.close();
    if (fill) { g.fillColor = this.color(fill); g.fill(); } else g.stroke();
  }
  private diamond(g: Graphics, x: number, y: number, fill?: string): void {
    this.polygon(g, [isoProject(x, y), isoProject(x + 1, y), isoProject(x + 1, y + 1), isoProject(x, y + 1)], fill);
  }
  private sprite(parent: Node, art: string, width: number): { node: Node; sprite: Sprite } {
    const node = this.make(art, parent, 0, 0, width, width), sprite = node.addComponent(Sprite);
    const frame = this.frames.get(art);
    if (!frame) throw new Error("缺少图帧 " + art);
    sprite.spriteFrame = frame; sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.trim = false;
    node.getComponent(UITransform)!.setContentSize(width, width * frame.originalSize.height / frame.originalSize.width);
    return { node, sprite };
  }
  private actor(parent: Node, art: string, x: number, y: number, width: number): Actor {
    const item = this.sprite(parent, art, width); item.node.getComponent(UITransform)!.setAnchorPoint(0.5, 0);
    const p = isoProject(x, y); item.node.setPosition(p.x, p.y);
    return { ...item, x, y, width, opacity: item.node.addComponent(UIOpacity) };
  }
  private ensureView(depth: number): LayerView {
    const layer = this.lab.layer(depth), existing = this.layerViews.get(depth);
    if (existing?.revision === layer.revision) return existing;
    if (existing) {
      if (this.player?.node.parent === existing.actorsNode) this.player.node.parent = this.world;
      existing.node.destroy(); this.layerViews.delete(depth);
    }
    const node = this.make("地层 " + (depth + 1), this.world); node.setPosition(0, -depth * LAB_LAYER_GAP);
    const theme = LAB_THEMES[layer.theme], n = layer.tiles.length;
    const edges = this.make("地层剖面", node);
    for (let i = 0; i < n; i++) {
      // Each edge frame covers half a tile in X and one full layer face in height.
      const left = isoProject(i + .5, n), right = isoProject(n, i + .5);
      const west = this.sprite(edges, theme.id + "_edge_west", W / 2);
      const east = this.sprite(edges, theme.id + "_edge_east", W / 2);
      west.node.setPosition(left.x, left.y - LAB_BLOCK_HEIGHT / 2);
      east.node.setPosition(right.x, right.y - LAB_BLOCK_HEIGHT / 2);
      if (depth > 0) west.sprite.color = east.sprite.color = this.color("242424");
    }
    const ground = this.make("地面网格", node), floors = new Map<string, Node>();
    const features = this.make("矿脉与通道", node);
    const farm = LAB_VILLAGE.farm;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const tile = layer.tiles[y][x], center = isoProject(x + .5, y + .5);
      if (tile.hole) {
        const lower = this.lab.layer(depth + 1);
        const opening = this.sprite(features, LAB_THEMES[lower.theme].id + "_shaft", W);
        opening.node.setPosition(center.x, center.y - LAB_BLOCK_HEIGHT / 2);
        const contents = lower.tiles[y]?.[x]?.kind;
        if (contents === "root" || contents === "ore") {
          const glimpse = this.sprite(features, contents === "root" ? "giant_root" : "glow_vein", 23);
          glimpse.node.setPosition(center.x + 9, center.y - LAB_BLOCK_HEIGHT + 4);
          glimpse.sprite.color = this.color("969487");
        }
        continue;
      }
      const inField = depth === 0 && n > 13 && x >= farm.minX && x <= farm.maxX && y >= farm.minY && y <= farm.maxY;
      const material = tile.kind === "path" ? "trail" : tile.kind === "water" ? "water" : "floor";
      const variant = hashCoords(LAB_WORLD_SEED, x, y, depth, 918) % 3;
      const name = inField && material === "floor" ? "field" : theme.id + "_" + material + "_" + variant;
      const image = this.sprite(ground, name, W);
      image.node.setPosition(center.x, center.y); floors.set(x + "," + y, image.node);
      if (layer.theme === 2) image.sprite.color = this.color(STRATUM_TINT[stratumAt(depth).id]);
    }
    for (const p of layer.entrances) {
      const at = isoProject(p.x + .5, p.y + .5), ladder = this.sprite(features, "ladder_up", 32);
      ladder.node.getComponent(UITransform)!.setAnchorPoint(.5, 0);
      ladder.node.setPosition(at.x, at.y);
    }
    const grid = this.make("地块网格", node).addComponent(Graphics);
    grid.strokeColor = new Color(229, 231, 197, 90); grid.lineWidth = 1;
    for (let i = 0; i <= n; i++) {
      const a = isoProject(i, 0), b = isoProject(i, n), c = isoProject(0, i), d = isoProject(n, i);
      grid.moveTo(a.x, a.y); grid.lineTo(b.x, b.y); grid.moveTo(c.x, c.y); grid.lineTo(d.x, d.y);
    }
    grid.stroke();
    const fog = this.make("地下矿灯暗幕", node).addComponent(Graphics);
    const brightness = new Float32Array(n*n).fill(-1);
    const actorsNode = this.make("脚底排序", node), actors: Actor[] = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const kind = layer.tiles[y][x].kind;
      let art: string;
      let width = 64;
      if (kind === "tree") {
        const fixed = depth === 0 ? MAP.props.find(p => p.x === x && p.y === y) : undefined;
        const pine = fixed ? fixed.art === "xpaa_pine" : hashCoords(LAB_WORLD_SEED, x, y, depth, 919) % 3 === 0;
        art = pine ? "pine" : "oak"; width = pine ? 104 : 134;
      } else if (kind === "rock") art = "boulder";
      else if (kind === "ore") {
        const inner = x < MAP.size && y < MAP.size;
        art = inner && layer.theme === 1 ? "root_heart" : inner && layer.theme === 2 ? "glow_vein" : stratumAt(Math.max(1, depth)).oreTile;
        width = 72;
      } else if (kind === "stubborn") { art = "stubborn_stone"; width = 72; }
      else if (kind === "root") { art = "giant_root"; width = W; }
      else if (kind === "soil" || kind === "wall") { art = theme.id + "_" + kind; width = W; }
      else if (kind === "chest") art = "treasure_chest";
      else if (kind === "relic" || kind === "pack_part") {
        art = kind === "relic" ? "unexamined_relic" : "damaged_pack_part"; width = 48;
      } else continue;
      const actor = this.actor(actorsNode, art, x + .5, y + .5, width);
      if (kind === "wall" || kind === "soil") {
        const transform = actor.node.getComponent(UITransform)!;
        transform.setAnchorPoint(.5, H / (2 * transform.height));
      }
      actors.push(actor);
    }
    if (depth === 0 && n > 13) for (const house of LAB_VILLAGE.houses)
      actors.push(this.actor(actorsNode, house.sprite, house.x + house.width / 2, house.y + house.depth, 180));
    if (depth === this.lab.depth) for (const p of this.words.services) {
      if (!this.words.serviceAt(p.x, p.y)) continue;
      const art = p.id === "npc" ? "npc_trader" : p.id === "may" ? "npc_may" :
        p.id === "seal" ? "seal_arch" : p.id === "clue" ? "inscription" : "letter_chest";
      const width = p.id === "npc" || p.id === "may" ? 48 : 64;
      actors.push(this.actor(actorsNode, art, p.x + .5, p.y + .5, width));
    }
    const view = { node, actorsNode, actors, grid, fog, brightness, fogAlpha: new Uint16Array(n*n).fill(256), revision: layer.revision, floors }; this.layerViews.set(depth, view); return view;
  }

  private lightLayers(dt: number): void {
    for (const [depth,v] of this.layerViews) {
      if(depth===0)continue;
      const n=this.lab.layer(depth).tiles.length;
      let fogChanged=false;
      for(let y=0;y<n;y++)for(let x=0;x<n;x++){
        const i=y*n+x,target=labBrightness(depth,Math.hypot(x+.5-this.walk.x,y+.5-this.walk.y));
        v.brightness[i]=smoothBrightness(v.brightness[i],target,dt);
        const alpha=Math.round(255*(1-v.brightness[i]));
        if(v.fogAlpha[i]!==alpha){v.fogAlpha[i]=alpha;fogChanged=true;}
      }
      // Keep interpolation at frame rate; rebuild geometry only when its 8-bit colour changes.
      if(fogChanged){
        const g=v.fog;g.clear();
        for(let y=0;y<n;y++)for(let x=0;x<n;x++)
          this.diamond(g,x,y,LAB_LAMP.darkness+v.fogAlpha[y*n+x].toString(16).padStart(2,"0"));
      }
      // Upright props must disappear with their ground; a floor-only mask leaves distant chests exposed.
      for(const actor of v.actors){
        const target=labBrightness(depth,Math.hypot(actor.x-this.walk.x,actor.y-this.walk.y));
        actor.brightness=smoothBrightness(actor.brightness??-1,target,dt);
        const at=isoProject(actor.x,actor.y),p=isoProject(this.walk.x,this.walk.y),h=actor.node.getComponent(UITransform)!.height;
        const fade=occlusionAlpha(at.x-p.x,p.y-at.y,actor.width,h,48,69);
        actor.opacity.opacity=Math.round(255*Math.pow(actor.brightness,1.35)*fade);
        const tint = Math.round(255 * Math.pow(actor.brightness, 1.35));
        if (actor.sprite.color.r !== tint) actor.sprite.color = new Color(tint, tint, tint);
      }
    }
  }

  private toggleGrid(): void { this.grid = !this.grid; this.gridButton.string = "网格 · " + (this.grid ? "开" : "关"); }
  private toggleCamera(): void { this.follow = !this.follow; this.cameraButton.string = "镜头 · " + (this.follow ? "跟随" : "全景"); }
  private keyDown(e: EventKeyboard): void {
    if (this.wordUI?.active) {
      if (this.keys.has(e.keyCode)) return;
      this.keys.add(e.keyCode);
      if (e.keyCode >= KeyCode.KEY_A && e.keyCode <= KeyCode.KEY_Z) this.wordUI.type(String.fromCharCode(e.keyCode));
      if (e.keyCode === KeyCode.BACKSPACE) this.wordUI.backspace();
      if (e.keyCode === KeyCode.ENTER) this.wordUI.submit();
      if (e.keyCode === KeyCode.ESCAPE) this.wordUI.close();
      return;
    }
    if (this.keys.has(e.keyCode) || view.getFrameSize().height > view.getFrameSize().width) return;
    this.keys.add(e.keyCode);
    if (e.keyCode === KeyCode.KEY_G) this.toggleGrid(); if (e.keyCode === KeyCode.KEY_F) this.toggleCamera();
    if (e.keyCode === KeyCode.SPACE) { this.striking = true; this.playSound("hit"); }
    if (e.keyCode === KeyCode.KEY_Q) { this.lab.ascend(); this.resetInput(); }
    if (e.keyCode === KeyCode.KEY_R) { this.lab.returnToEntry(); this.resetInput(); }
    if (e.keyCode === KeyCode.KEY_E) this.interact();
    if (e.keyCode === KeyCode.KEY_B) this.openWords("bag");
    if (e.keyCode === KeyCode.KEY_I) this.openWords('dex');
  }
  private keyUp(e: EventKeyboard): void { this.keys.delete(e.keyCode); if (e.keyCode === KeyCode.SPACE) this.striking = false; }
  private resetInput(): void {
    this.saveLab();
    this.keys.clear(); this.striking = false; this.joystick = { x: 0, y: 0, id: -1 }; this.walk.stop();
    for (const reset of this.buttonResets) reset();
  }

  private playSound(kind: "hit" | "collapse" | "arrive" | "resource"): void {
    if (!this.sound || !sys.isBrowser || typeof AudioContext === "undefined") return;
    try {
      this.audio ??= new AudioContext(); if (this.audio.state === "suspended") void this.audio.resume();
      const osc = this.audio.createOscillator(), gain = this.audio.createGain(), t = this.audio.currentTime;
      const pitch = kind === "hit" ? 150 : kind === "collapse" ? 80 : kind === "resource" ? 420 : 180 + this.lab.depth * 40;
      osc.type = kind === "resource" ? "sine" : "triangle"; osc.frequency.setValueAtTime(pitch, t); osc.frequency.exponentialRampToValueAtTime(pitch * 0.45, t + 0.18);
      gain.gain.setValueAtTime(0.025, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      osc.connect(gain); gain.connect(this.audio.destination); osc.start(t); osc.stop(t + 0.26);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    } catch { this.sound = false; }
  }

  private effect(event: LabEffect): void {
    this.playSound(event.kind==='chest'?'resource':event.kind);
    if (event.kind === "arrive") return;
    const theme = LAB_THEMES[this.lab.layer(event.depth).theme], p = isoProject(event.x + 0.5, event.y + 0.5);
    const count = event.kind === "chest" ? 18 : event.kind === "collapse" ? 14 : 4;
    for (let i = 0; i < count; i++) this.fragments.push({ x: p.x, y: p.y + (event.height??0)+10, depth: event.depth, vx: (Math.random() - 0.5) * 105, vy: 20 + Math.random() * 65, age: 0, life: 0.4 + Math.random() * 0.35, size: 3 + Math.random() * 5, color: event.kind==='chest'?'e4c66c':i % 3 === 0 ? theme.light : theme.side });
    if (this.fragments.length > LAB_PARTICLE_CAP) this.fragments.splice(0, this.fragments.length - LAB_PARTICLE_CAP);
    this.shake = event.kind === "collapse" ? 0.13 : 0.055;
    if (event.kind === "collapse") this.sinks.push({ x: event.x, y: event.y, depth: event.depth, age: 0, color: theme.floor,height:event.height??0 });
    if (this.sinks.length > 6) this.sinks.shift();
    if (event.kind === "resource") { this.pickupPoint = { x: p.x, y: p.y, depth: event.depth }; this.pickupAge = 0; }
  }

  private drawEffects(dt: number): void {
    const g = this.marker; g.clear();
    const target = this.lab.selected(), tile = this.lab.tile(target.x, target.y)!;
    this.wordDamage += (tile.damage-this.wordDamage)*(1-Math.exp(-14*dt));
    const damage = this.wordUI.active ? this.wordDamage : tile.damage;
    const at = isoProject(target.x + 0.5, target.y + 0.5), offset = tile.kind==='wall'?LAB_WALL_HEIGHT:tile.kind==='soil'?LAB_SOIL_HEIGHT:0;
    if (this.lab.depth > 0) {
      const foot = isoProject(this.walk.x, this.walk.y), theme = LAB_THEMES[this.lab.layer().theme];
      for (let ring = 3; ring > 0; ring--) {
        g.fillColor = this.color(theme.light + "08"); g.ellipse(foot.x, foot.y, W * ring * 0.65, H * ring * 0.65); g.fill();
      }
    }
    g.strokeColor = this.color(C.accent); g.lineWidth = 2;
    this.polygon(g, [isoProject(target.x, target.y), isoProject(target.x + 1, target.y), isoProject(target.x + 1, target.y + 1), isoProject(target.x, target.y + 1)].map(p => ({ x: p.x, y: p.y + offset })));
    if (damage > .01 && !this.lab.travel) {
      const phase = Math.ceil(damage * 3), cx = at.x, cy = at.y + offset;
      g.strokeColor = this.color("201d19"); g.lineWidth = 2 + damage;
      g.moveTo(cx - 15, cy + 7); g.lineTo(cx - 3, cy); g.lineTo(cx + 6, cy - 8);
      if (phase >= 2) { g.moveTo(cx - 3, cy); g.lineTo(cx + 15, cy + 5); g.lineTo(cx + 28, cy + 4); }
      if (phase >= 3) { g.moveTo(cx - 15, cy + 7); g.lineTo(cx - 31, cy + 4); g.moveTo(cx + 6, cy - 8); g.lineTo(cx + 22, cy - 12); } g.stroke();
      const floor = this.layerViews.get(this.lab.depth)?.floors.get(target.x + "," + target.y);
      if (floor) floor.setPosition(at.x + Math.sin(this.elapsed * 100) * (this.striking ? 1.2 : 0), at.y);
      // 镐柄与镐头围绕角色手部挥动；角色贴图本身不变形。
      if (!this.wordUI.active) {
      const player = isoProject(this.walk.x, this.walk.y), swing = Math.sin(this.elapsed * 18), dx = at.x - player.x;
      const hx = player.x + (dx >= 0 ? 18 : -18), hy = player.y + 22;
      g.strokeColor = this.color("be9b65"); g.lineWidth = 4; g.moveTo(hx, hy); g.lineTo(hx + swing * 21, hy + 18 - swing * 8); g.stroke();
      g.strokeColor = this.color("d4dbda"); g.moveTo(hx + swing * 21 - 10, hy + 16 - swing * 8); g.lineTo(hx + swing * 21 + 9, hy + 24 - swing * 8); g.stroke();
      }
    }
    this.sinks = this.sinks.filter(s => s.age < 0.4);
    for (const s of this.sinks) {
      s.age += dt; const alpha = Math.max(0, 1 - s.age / 0.4), drop = s.age * 95 + (s.depth - this.lab.depth) * LAB_LAYER_GAP;
      const points = [isoProject(s.x, s.y), isoProject(s.x + 1, s.y), isoProject(s.x + 1, s.y + 1), isoProject(s.x, s.y + 1)];
      this.polygon(g, points.map(p => ({ x: p.x, y: p.y +s.height- drop })), s.color + Math.round(alpha * 200).toString(16).padStart(2, "0"));
    }
    this.fragments = this.fragments.filter(p => p.age < p.life);
    for (const p of this.fragments) {
      p.age += dt; p.vy -= 220 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      g.fillColor = this.color(p.color + Math.round(255 * Math.max(0, 1 - p.age / p.life)).toString(16).padStart(2, "0"));
      g.rect(p.x - p.size / 2, p.y - (p.depth - this.lab.depth) * LAB_LAYER_GAP, p.size, p.size); g.fill();
    }
    this.pickupAge += dt; this.pickup.node.active = this.pickupAge < 1;
    if (this.pickupAge < 1) this.pickup.node.setPosition(this.pickupPoint.x, this.pickupPoint.y - this.pickupPoint.depth * LAB_LAYER_GAP + 55 + this.pickupAge * 35);
  }

  update(seconds: number): void {
    if (!this.ready) return;
    if (view.getFrameSize().height > view.getFrameSize().width) { this.resetInput(); return; }
    const dt = Math.min(seconds, 0.05), pressed = (...keys: KeyCode[]) => keys.some(k => this.keys.has(k)) ? 1 : 0;
    this.elapsed += dt; this.shake = Math.max(0, this.shake - dt);
    const before = this.walk.distance;
    const editing = this.wordUI.active;
    this.lab.tick(dt, editing ? 0 : this.joystick.x + pressed(KeyCode.KEY_D, KeyCode.ARROW_RIGHT) - pressed(KeyCode.KEY_A, KeyCode.ARROW_LEFT), editing ? 0 : this.joystick.y + pressed(KeyCode.KEY_W, KeyCode.ARROW_UP) - pressed(KeyCode.KEY_S, KeyCode.ARROW_DOWN), !editing && this.striking);
    this.words.prepare();
    if(this.words.adventure.pendingLoot&&!this.wordUI.active)this.openWords('overflow');
    else if(this.words.adventure.quiz&&!this.wordUI.active)this.openWords('worldchest');
    for(const notice of this.words.adventure.notices.splice(0)){
      this.lab.message=notice;this.pickup.string=notice;this.pickupAge=0;
      const at=isoProject(this.walk.x,this.walk.y);this.pickupPoint={...at,depth:this.lab.depth};
    }
    this.saveClock += dt; if (this.saveClock >= 1) { this.saveClock = 0; this.saveLab(); }
    this.swingAge += dt;
    if (this.finishSwing && this.swingAge >= LAB_WORD_RULES.finishSeconds) { const finish = this.finishSwing; this.finishSwing = null; finish(); }
    for (const item of this.loot) {
      item.age += dt; item.label.node.active = item.age >= 0 && item.age < .8;
      const t = Math.max(0,Math.min(1,item.age/.8)); item.label.node.setPosition(-125*t,80+206*t*t);
    }
    for (const item of this.loot.filter(l => l.age >= .8)) item.label.node.destroy();
    this.loot = this.loot.filter(l => l.age < .8);
    for (const event of this.lab.effects.splice(0)) this.effect(event);
    if (this.lastDepth !== this.lab.depth) { this.lastDepth = this.lab.depth; this.resetInput(); }
    const theme = LAB_THEMES[this.lab.layer().theme], travel = this.lab.travel;
    const needed = travel ? [travel.from, travel.to] : [this.lab.depth];
    for (const depth of needed) this.ensureView(depth);
    for (const [depth, v] of this.layerViews) if (!needed.includes(depth)) {
      if (this.player.node.parent === v.actorsNode) this.player.node.parent = this.world;
      v.node.destroy(); this.layerViews.delete(depth);
    }
    const t = travel ? Math.min(1, travel.elapsed / LAB_TRAVEL_SECONDS) : 1;
    const q = Math.max(0, (t - 0.22) / 0.78), smooth = q * q * (3 - 2 * q);
    const viewDepth = travel ? travel.from + (travel.to - travel.from) * smooth : this.lab.depth;
    const playerDepth = travel ? travel.from + (travel.to - travel.from) * Math.min(1, Math.pow(q, 1.4) * 1.2) : this.lab.depth;
    const blend = 1 - Math.exp(-8 * dt);
    const size=this.lab.layer().tiles.length;
    this.cameraX += ((this.follow ? this.walk.x : size / 2) - this.cameraX) * blend;
    this.cameraY += ((this.follow ? this.walk.y : size / 2) - this.cameraY) * blend;
    const camera = isoProject(this.cameraX, this.cameraY), overview=Math.min(ISO_OVERVIEW_ZOOM,1100/(size*W),460/(size*H)), zoom = travel ? Math.min(.72,this.follow? .72:overview) : this.follow ? ISO_FOLLOW_ZOOM : overview;
    const shake = this.shake > 0 ? Math.sin(this.elapsed * 92) * 2.2 * this.shake / 0.13 : 0;
    const focus = editing ? isoProject(this.walk.x,this.walk.y) : camera;
    this.world.setScale(zoom, zoom, 1); this.world.setPosition(-focus.x * zoom + shake, (-focus.y + viewDepth * LAB_LAYER_GAP) * zoom + (editing ? 145 : -15));
    const p = isoProject(this.walk.x, this.walk.y), art = walkFrame(this.walk.facing.x, this.walk.facing.y, this.walk.distance, this.walk.distance > before + 0.0001);
    if(Math.floor(this.walk.distance/.14)!==Math.floor(before/.14)&&this.fragments.length<LAB_PARTICLE_CAP)
      this.fragments.push({x:p.x,y:p.y,depth:this.lab.depth,vx:(Math.random()-.5)*15,vy:8,age:0,life:.3,size:3,color:theme.path});
    const active = this.layerViews.get(this.lab.depth)!;
    this.player.node.parent = travel ? this.world : active.actorsNode;
    this.player.x = this.walk.x; this.player.y = this.walk.y; this.player.node.setPosition(p.x, p.y - (travel ? playerDepth * LAB_LAYER_GAP : 0)); this.player.sprite!.spriteFrame = this.frames.get(art)!;
    this.actors = [...active.actors, this.player];
    this.actors.sort((a, b) => (a.x + a.y) - (b.x + b.y));
    const digTarget=this.lab.selected(),digDamage=this.lab.tile(digTarget.x,digTarget.y)?.damage??0;
    this.actors.forEach((actor, i) => {
      if (!travel || actor !== this.player) actor.node.setSiblingIndex(i);
      const foot = isoProject(actor.x, actor.y), h = actor.node.getComponent(UITransform)!.height;
      if (actor === this.player || this.lab.depth === 0) actor.opacity.opacity = actor === this.player ? 255 : Math.round(255 * occlusionAlpha(foot.x - p.x, p.y - foot.y, actor.width, h, 48, 69));
      if(actor!==this.player)actor.node.setPosition(foot.x+(actor.x===digTarget.x+.5&&actor.y===digTarget.y+.5&&digDamage>0&&(this.striking||this.shake>0)?Math.sin(this.elapsed*100)*1.5:0),foot.y);
      if (actor !== this.player && this.wordUI.mode === "seal" && actor.x === this.words.services[0].x+.5 && actor.y === this.words.services[0].y+.5)
        actor.node.setPosition(foot.x+(this.swingAge<.2?Math.sin(this.swingAge*100)*2:0),foot.y);
    });
    this.lightLayers(dt);
    Array.from(this.layerViews.entries()).sort((a, b) => b[0] - a[0]).forEach(([, v], i) => { v.node.setSiblingIndex(i); v.grid.node.active = this.grid; });
    this.marker.node.setSiblingIndex(this.world.children.length - 1); this.pickup.node.setSiblingIndex(this.world.children.length - 1);
    if (travel) this.player.node.setSiblingIndex(this.world.children.length - 1);
    this.marker.node.setPosition(0, -this.lab.depth * LAB_LAYER_GAP);
    this.drawEffects(dt);
    const drops=this.words.adventure.drops;
    for(const [drop,label]of this.cardViews)if(!drops.includes(drop as typeof drops[number])){label.node.destroy();this.cardViews.delete(drop);}
    for(const drop of drops){
      let label=this.cardViews.get(drop);if(!label){label=this.text(this.world,'掉落词卡',drop.word,0,0,150,23);this.cardViews.set(drop,label);}
      const at=isoProject(drop.x+.5,drop.y+.5);label.node.setPosition(at.x,at.y-drop.depth*LAB_LAYER_GAP+24+Math.sin(this.elapsed*3)*3);
      label.node.active=drop.depth===this.lab.depth;label.color=this.color('f1dfa3'+Math.round(255*labBrightness(drop.depth,Math.hypot(drop.x+.5-this.walk.x,drop.y+.5-this.walk.y))).toString(16).padStart(2,'0'));
    }
    this.weapon.node.active = this.swingAge < (this.finishSwing ? LAB_WORD_RULES.finishSeconds : .26);
    if (this.weapon.node.active) {
      const phase = Math.min(1,this.swingAge/(this.finishSwing ? LAB_WORD_RULES.finishSeconds : .26));
      this.weapon.node.setPosition(p.x + 25 + Math.sin(phase*Math.PI)*28,p.y-this.lab.depth*LAB_LAYER_GAP+38+Math.sin(phase*Math.PI)*44);
      this.weapon.node.setRotationFromEuler(0,0,65-phase*125); this.weapon.node.setScale(this.finishSwing ? 1.25 : 1,1,1);
      this.weapon.node.setSiblingIndex(this.world.children.length-1);
    }
    this.wordMarks.node.setPosition(0,-this.lab.depth*LAB_LAYER_GAP);this.wordMarks.clear();
    this.wordMarks.strokeColor=this.color("e2bf72");this.wordMarks.lineWidth=2;
    const nearby=this.words.nearby();
    if(nearby){this.diamond(this.wordMarks,nearby.x,nearby.y);this.wordMarks.node.setSiblingIndex(this.world.children.length-1);}
    this.interactButton.string=nearby?nearby.title+" · 互动":"探索互动 · E";
    this.interactButton.color=this.color(nearby?C.ink:C.muted);
    this.titleText.string = "第 " + (this.lab.depth + 1) + " 层 · " + theme.name;
    this.subtitleText.string = this.lab.depth+'m · 背包 '+this.words.adventure.usedSlots()+'/'+this.words.adventure.capacity+' · 金币 '+this.words.coins+' · 材料 '+this.lab.resources;
    const selected = this.lab.selected(), targetTile = this.lab.tile(selected.x, selected.y)!, damage = targetTile.damage;
    const action = targetTile.kind === "ore" ? "敲开矿晶" : targetTile.kind==='soil'?'挖开土层':targetTile.kind==='wall'?'凿开岩壁':["root", "tree", "rock"].includes(targetTile.kind) ? "敲开障碍" : "砸穿地面";
    this.impactButton.string = travel ? (travel.to > travel.from ? "下潜中…" : "返回中…") : action + "\n点按 / 空格";
    const unlocked=this.lab.canDescend(this.lab.depth);
    this.readout.string = damage > 0 ? "地块裂开 " + Math.round(damage * 100) + "%" : nearby ? nearby.title+" · 点互动 / E" : unlocked?'封印已解除 · 可继续探索或下潜':this.words.room.answer?'寻找本层封印 · 先寻宝、采集和收集字母':'暂无未见新词 · 返回已探索地层，等待词库扩充';
    if (this.lab.message !== this.lastMessage) { this.lastMessage = this.lab.message; this.notice.string = this.lab.message; this.noticeTime = 3.5; }
    this.noticeTime = Math.max(0, this.noticeTime - dt); this.notice.node.active = this.noticeTime > 0;
    if(this.saveError){this.notice.string=this.saveError;this.notice.node.active=true;}
    const sky=(depth:number)=>this.color(depth===0?LAB_THEMES[0].background:LAB_LAMP.darkness);
    this.camera.clearColor = travel ? Color.lerp(new Color(), sky(travel.from), sky(travel.to), smooth) : sky(this.lab.depth);
    this.paintStick(this.joystick.x, this.joystick.y, this.joystick.id !== -1);
  }
  onDestroy(): void {
    this.saveLab();
    if (this.audio) void this.audio.close();
    this.safeAreaObserver?.disconnect(); input.off(Input.EventType.KEY_DOWN, this.keyDown, this); input.off(Input.EventType.KEY_UP, this.keyUp, this);
    game.off(Game.EVENT_HIDE, this.resetInput, this); view.off("canvas-resize", this.resetInput, this);
  }
}
