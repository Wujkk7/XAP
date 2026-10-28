import {
  _decorator, Component, Node, Canvas, Camera, UITransform, Graphics, Sprite, SpriteFrame,
  Texture2D, Rect, Size, Vec2, Color, Label, Layers, UIOpacity, resources, view,
  ResolutionPolicy, input, Input, EventKeyboard, EventTouch, KeyCode, sys, game, Game, profiler,
} from "cc";
import { isoProject, isoUnproject } from "../core/Isometric";
import { LayeredLab } from "../core/LayeredLab";
import type { LabLayer, LabEffect } from "../core/LayeredLab";
import { LAB_THEMES } from "../data/external-files/IsometricLayers";
import { ISOMETRIC_MAP as MAP } from "../data/external-files/IsometricMap";
import { ISO_TILE_WIDTH as W, ISO_TILE_HEIGHT as H, ISO_OVERVIEW_ZOOM, ISO_FOLLOW_ZOOM, LAB_LAYER_GAP, LAB_TRAVEL_SECONDS, LAB_PARTICLE_CAP } from "../data/constants/IsometricRules";
import { XPAA_REGIONS, WALK_CANVAS, walkFrame } from "../data/resource-config/XPAAArt";
import { UI_COLORS as C } from "../data/resource-config/TileStyles";
import { occlusionAlpha } from "./ObliqueProjection";

const { ccclass } = _decorator;
interface Actor { x: number; y: number; width: number; node: Node; sprite?: Sprite; opacity: UIOpacity }
interface LayerView { node: Node; actorsNode: Node; actors: Actor[]; grid: Graphics; revision: number; floors: Map<string, Node> }
interface Fragment { x: number; y: number; depth: number; vx: number; vy: number; age: number; life: number; size: number; color: string }

@ccclass("IsometricDemo")
export class IsometricDemo extends Component {
  private lab = new LayeredLab();
  private walk = this.lab.walk;
  private frames = new Map<string, SpriteFrame>();
  private world!: Node;
  private actors: Actor[] = [];
  private player!: Actor;
  private marker!: Graphics;
  private stick!: Graphics;
  private readout!: Label;
  private gridButton!: Label;
  private cameraButton!: Label;
  private keys = new Set<KeyCode>();
  private joystick = { x: 0, y: 0, id: -1 };
  private cameraX = MAP.size / 2;
  private cameraY = MAP.size / 2;
  private follow = false;
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
  private sinks: { x: number; y: number; depth: number; age: number; color: string }[] = [];
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

  onLoad(): void {
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
    const node = this.make(title, this.node, x, y, 180, height), g = node.addComponent(Graphics);
    const paint = (pressed: boolean) => {
      g.clear(); g.fillColor = this.color(hold ? (pressed ? C.primaryPressed : C.primary) : (pressed ? C.pressed : C.panel)); g.strokeColor = this.color(C.border); g.lineWidth = 2;
      g.rect(-90, -height / 2, 180, height); g.fill(); g.stroke();
    };
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
    const label = this.text(node, "文字", title, 0, 0, 160, 26);
    if (hold) label.color = this.color(C.darkInk); return label;
  }
  private buildUI(): void {
    const plate = this.make("标题底色", this.node, -355, 286, 460, 94).addComponent(Graphics);
    plate.fillColor = this.color(C.background); plate.rect(-230, -47, 460, 94); plate.fill();
    this.titleText = this.text(this.node, "标题", "破土向下 · 阳光森林", -355, 306, 430, 30);
    this.subtitleText = this.text(this.node, "说明", "最深 1 层 · 矿晶 0", -355, 271, 430, 21); this.subtitleText.color = this.color(C.muted);
    this.gridButton = this.button("网格 · 开", 295, 286, () => this.toggleGrid());
    this.cameraButton = this.button("镜头 · 全景", 505, 286, () => this.toggleCamera());
    this.button("回到入口", 295, -281, () => { this.lab.returnToEntry(); this.resetInput(); });
    this.button("返回上层", 295, -177, () => { this.lab.ascend(); this.resetInput(); });
    this.impactButton = this.button("砸穿地面\n长按", 505, -239, () => {}, down => {
      this.striking = down; if (down) this.playSound("hit");
    }, 170);
    const audio = this.button("声音 · 开", 85, 286, () => { this.sound = !this.sound; audio.string = "声音 · " + (this.sound ? "开" : "关"); });
    this.stick = this.make("摇杆", this.node, -495, -235, 192, 192).addComponent(Graphics);
    const move = (e: EventTouch) => {
      e.propagationStopped = true;
      if (!this.ready || this.lab.travel || view.getFrameSize().height > view.getFrameSize().width) return;
      if (this.joystick.id !== -1 && this.joystick.id !== e.getID()) return;
      const p = e.getUILocation(), x = p.x - 640 + 495, y = p.y - 360 + 235, d = Math.max(65, Math.hypot(x, y));
      this.joystick = { x: x / d, y: y / d, id: e.getID()! };
    };
    this.stick.node.on(Node.EventType.TOUCH_START, move); this.stick.node.on(Node.EventType.TOUCH_MOVE, move);
    const end = (e: EventTouch) => { e.propagationStopped = true; if (this.joystick.id === e.getID()) this.joystick = { x: 0, y: 0, id: -1 }; };
    this.stick.node.on(Node.EventType.TOUCH_END, end); this.stick.node.on(Node.EventType.TOUCH_CANCEL, end);
    this.text(this.node, "移动说明", sys.isMobile ? "移动" : "WASD / 方向键", -495, -340, 250, 20);
    this.readout = this.text(this.node, "位置", "正在装入试验场…", 0, -315, 520, 23);
    this.notice = this.text(this.node, "发现提示", "", 0, 192, 880, 27);
    this.notice.enableOutline = true; this.notice.outlineWidth = 3; this.notice.outlineColor = this.color(C.background);
  }

  private async load(): Promise<void> {
    try {
      const texture = await new Promise<Texture2D>((resolve, reject) => resources.load("xpaa/validation-board/texture", Texture2D, (error, asset) => error ? reject(error) : resolve(asset)));
      if (!this.isValid) return;
      texture.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
      for (const [name, [x, y, w, h]] of Object.entries(XPAA_REGIONS)) {
        const frame = new SpriteFrame(); frame.name = name; frame.texture = texture; frame.rect = new Rect(x, y, w, h);
        frame.originalSize = new Size(w, h); frame.packable = false;
        if (name.startsWith("walk_")) { frame.originalSize = new Size(...WALK_CANVAS); frame.offset = new Vec2(0, (h - WALK_CANVAS[1]) / 2); }
        this.frames.set(name, frame);
      }
      const original = await new Promise<SpriteFrame[]>((resolve, reject) => resources.loadDir("art", SpriteFrame, (error, assets) => error ? reject(error) : resolve(assets)));
      if (!this.isValid) return;
      for (const frame of original) { frame.texture.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST); this.frames.set(frame.name, frame); }
      this.ensureView(0); this.player = this.actor(this.layerViews.get(0)!.actorsNode, "walk_down_0", this.walk.x, this.walk.y, 48);
      this.marker = this.make("裂纹与碎屑", this.world).addComponent(Graphics);
      this.pickup = this.text(this.world, "拾取提示", "矿晶 +1", 0, 0, 220, 25); this.pickup.color = this.color(C.accent);
      this.node.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
        if (this.lab.travel) return;
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
    const frame = this.frames.get(art)!; sprite.spriteFrame = frame; sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.trim = false;
    node.getComponent(UITransform)!.setContentSize(width, width * frame.originalSize.height / frame.originalSize.width);
    return { node, sprite };
  }
  private actor(parent: Node, art: string, x: number, y: number, width: number): Actor {
    const item = this.sprite(parent, art, width); item.node.getComponent(UITransform)!.setAnchorPoint(0.5, 0);
    const p = isoProject(x, y); item.node.setPosition(p.x, p.y);
    return { ...item, x, y, width, opacity: item.node.addComponent(UIOpacity) };
  }
  private shade(hex: string, factor: number): string {
    return hex.match(/../g)!.map(v => Math.round(Math.min(255, parseInt(v, 16) * factor)).toString(16).padStart(2, "0")).join("");
  }
  private ensureView(depth: number): LayerView {
    const layer = this.lab.layer(depth), existing = this.layerViews.get(depth);
    if (existing?.revision === layer.revision) return existing;
    if (existing) {
      if (this.player?.node.parent === existing.actorsNode) this.player.node.parent = this.world;
      existing.node.destroy(); this.layerViews.delete(depth);
    }
    const node = this.make("地层 " + (depth + 1), this.world); node.setPosition(0, -depth * LAB_LAYER_GAP);
    const theme = LAB_THEMES[layer.theme], edge = this.make("地层剖面", node).addComponent(Graphics), n = MAP.size;
    const left = isoProject(0, n), bottom = isoProject(n, n), right = isoProject(n, 0);
    for (let band = 0; band < 3; band++) {
      const offset = band * 18, lower = offset + 18;
      this.polygon(edge, [{ x: left.x, y: left.y - offset }, { x: bottom.x, y: bottom.y - offset }, { x: bottom.x, y: bottom.y - lower }, { x: left.x, y: left.y - lower }], this.shade(theme.side, 1 - band * 0.14));
      this.polygon(edge, [{ x: bottom.x, y: bottom.y - offset }, { x: right.x, y: right.y - offset }, { x: right.x, y: right.y - lower }, { x: bottom.x, y: bottom.y - lower }], this.shade(theme.edge, 1 - band * 0.12));
    }
    const ground = this.make("地面网格", node), floors = new Map<string, Node>();
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (layer.tiles[y][x].hole) continue;
      const p = isoProject(x + 0.5, y + 0.5), tile = this.make("地块", ground, p.x, p.y);
      floors.set(x + "," + y, tile); tile.setScale(1, H / W, 1);
      const image = this.sprite(tile, theme.texture, (W + 0.5) / Math.SQRT2);
      image.node.setRotationFromEuler(0, 0, 45);
      if (layer.theme > 0) image.sprite.color = this.color(layer.theme === 1 ? "b5ac94" : "a3b6cd");
    }
    const paths = this.make("路径水面与入口", node).addComponent(Graphics);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const tile = layer.tiles[y][x];
      if (tile.hole) { this.drawPortal(paths, layer, x, y); continue; }
      if (tile.kind === "path") this.diamond(paths, x, y, theme.path);
      if (tile.kind === "water") {
        this.diamond(paths, x, y, layer.theme === 0 ? "527e78" : "3c625c");
        const p = isoProject(x + 0.5, y + 0.5); paths.strokeColor = this.color("91b6a4"); paths.lineWidth = 1;
        paths.ellipse(p.x, p.y, 14, 5); paths.stroke();
      }
      if (tile.kind === "ore") {
        const p = isoProject(x + 0.5, y + 0.5); paths.fillColor = this.color(theme.light + "35");
        paths.ellipse(p.x, p.y, 45, 18); paths.fill();
        paths.strokeColor = this.color(theme.light + "95"); paths.lineWidth = 2;
        paths.moveTo(p.x - 32, p.y - 6); paths.lineTo(p.x - 10, p.y + 1); paths.lineTo(p.x + 30, p.y - 8); paths.stroke();
      }
    }
    for (const p of layer.entrances) {
      const at = isoProject(p.x + 0.5, p.y + 0.5); paths.strokeColor = this.color(C.accent); paths.lineWidth = 3;
      paths.moveTo(at.x - 8, at.y); paths.lineTo(at.x - 8, at.y + 32); paths.moveTo(at.x + 8, at.y); paths.lineTo(at.x + 8, at.y + 32);
      for (let i = 0; i < 4; i++) { paths.moveTo(at.x - 8, at.y + i * 9); paths.lineTo(at.x + 8, at.y + i * 9); } paths.stroke();
    }
    const grid = this.make("地块网格", node).addComponent(Graphics);
    grid.strokeColor = new Color(229, 231, 197, 90); grid.lineWidth = 1;
    for (let i = 0; i <= n; i++) {
      const a = isoProject(i, 0), b = isoProject(i, n), c = isoProject(0, i), d = isoProject(n, i);
      grid.moveTo(a.x, a.y); grid.lineTo(b.x, b.y); grid.moveTo(c.x, c.y); grid.lineTo(d.x, d.y);
    }
    grid.stroke();
    const actorsNode = this.make("脚底排序", node), actors: Actor[] = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const kind = layer.tiles[y][x].kind;
      if (kind === "tree" || kind === "rock" || kind === "ore") {
        const original = MAP.props.find(p => p.x === x && p.y === y);
        const art = kind === "ore" ? (layer.theme === 1 ? "node_emerald" : "node_crystal") : original?.art ?? "xpaa_stone";
        const actor = this.actor(actorsNode, art, x + 0.5, y + 0.5, kind === "ore" ? 72 : original?.width ?? 64);
        if (kind === "ore" && layer.theme === 2) actor.sprite!.color = this.color("81c7e0");
        actors.push(actor);
      } else if (kind === "root" || kind === "wall") {
        const p = isoProject(x + 0.5, y + 0.5), obstacle = this.make(kind, actorsNode, p.x, p.y, W, 90), g = obstacle.addComponent(Graphics);
        obstacle.getComponent(UITransform)!.setAnchorPoint(0.5, 0);
        if (kind === "root") {
          g.strokeColor = this.color("3c2e23"); g.lineWidth = 18;
          g.moveTo(-35, -2); g.bezierCurveTo(-14, 29, 5, 9, 32, 32); g.stroke();
          g.strokeColor = this.color("967450"); g.lineWidth = 9;
          g.moveTo(-35, 2); g.bezierCurveTo(-14, 33, 5, 13, 32, 36); g.stroke();
          g.lineWidth = 4; g.moveTo(-6, 19); g.bezierCurveTo(8, 48, 25, 34, 35, 46); g.stroke();
        } else {
          this.polygon(g, [{ x: -48, y: 0 }, { x: 0, y: -24 }, { x: 0, y: 22 }, { x: -48, y: 46 }], "394453");
          this.polygon(g, [{ x: 0, y: -24 }, { x: 48, y: 0 }, { x: 48, y: 46 }, { x: 0, y: 22 }], "263240");
          this.polygon(g, [{ x: 0, y: 70 }, { x: 48, y: 46 }, { x: 0, y: 22 }, { x: -48, y: 46 }], "647180");
        }
        actors.push({ node: obstacle, x: x + 0.5, y: y + 0.5, width: W, opacity: obstacle.addComponent(UIOpacity) });
      }
    }
    const view = { node, actorsNode, actors, grid, revision: layer.revision, floors }; this.layerViews.set(depth, view); return view;
  }

  private drawPortal(g: Graphics, layer: LabLayer, x: number, y: number): void {
    const below = this.lab.layer(layer.depth + 1), theme = LAB_THEMES[below.theme], points = [isoProject(x, y), isoProject(x + 1, y), isoProject(x + 1, y + 1), isoProject(x, y + 1)];
    this.polygon(g, points, "101713");
    for (let band = 0; band < 3; band++) {
      const top = band * 18, bottom = top + 18;
      for (const [a, b] of [[0, 1], [3, 0]]) this.polygon(g, [{ x: points[a].x, y: points[a].y - top }, { x: points[b].x, y: points[b].y - top }, { x: points[b].x, y: points[b].y - bottom }, { x: points[a].x, y: points[a].y - bottom }], this.shade(theme.side, 1 - band * 0.15));
    }
    this.polygon(g, points.map(p => ({ x: p.x, y: p.y - 54 })), theme.floor);
    const center = isoProject(x + 0.5, y + 0.5), kind = below.tiles[y][x].kind;
    g.fillColor = this.color(kind === "ore" ? theme.light : this.shade(theme.floor, 1.25));
    g.ellipse(center.x, center.y - 54, kind === "root" ? 20 : 10, 5); g.fill();
    g.strokeColor = this.color(C.accent); g.lineWidth = 2;
    g.moveTo(center.x - 7, center.y); g.lineTo(center.x - 7, center.y - 54); g.moveTo(center.x + 7, center.y); g.lineTo(center.x + 7, center.y - 54);
    for (let i = 0; i < 5; i++) { g.moveTo(center.x - 7, center.y - i * 12); g.lineTo(center.x + 7, center.y - i * 12); } g.stroke();
  }

  private toggleGrid(): void { this.grid = !this.grid; this.gridButton.string = "网格 · " + (this.grid ? "开" : "关"); }
  private toggleCamera(): void { this.follow = !this.follow; this.cameraButton.string = "镜头 · " + (this.follow ? "跟随" : "全景"); }
  private keyDown(e: EventKeyboard): void {
    if (this.keys.has(e.keyCode) || view.getFrameSize().height > view.getFrameSize().width) return;
    this.keys.add(e.keyCode);
    if (e.keyCode === KeyCode.KEY_G) this.toggleGrid(); if (e.keyCode === KeyCode.KEY_F) this.toggleCamera();
    if (e.keyCode === KeyCode.SPACE) { this.striking = true; this.playSound("hit"); }
    if (e.keyCode === KeyCode.KEY_Q) { this.lab.ascend(); this.resetInput(); }
    if (e.keyCode === KeyCode.KEY_R) { this.lab.returnToEntry(); this.resetInput(); }
  }
  private keyUp(e: EventKeyboard): void { this.keys.delete(e.keyCode); if (e.keyCode === KeyCode.SPACE) this.striking = false; }
  private resetInput(): void {
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
    this.playSound(event.kind);
    if (event.kind === "arrive") return;
    const theme = LAB_THEMES[this.lab.layer(event.depth).theme], p = isoProject(event.x + 0.5, event.y + 0.5);
    const count = event.kind === "collapse" ? 14 : 4;
    for (let i = 0; i < count; i++) this.fragments.push({ x: p.x, y: p.y + 10, depth: event.depth, vx: (Math.random() - 0.5) * 105, vy: 20 + Math.random() * 65, age: 0, life: 0.4 + Math.random() * 0.35, size: 3 + Math.random() * 5, color: i % 3 === 0 ? theme.light : theme.side });
    if (this.fragments.length > LAB_PARTICLE_CAP) this.fragments.splice(0, this.fragments.length - LAB_PARTICLE_CAP);
    this.shake = event.kind === "collapse" ? 0.13 : 0.055;
    if (event.kind === "collapse") this.sinks.push({ x: event.x, y: event.y, depth: event.depth, age: 0, color: theme.floor });
    if (this.sinks.length > 6) this.sinks.shift();
    if (event.kind === "resource") { this.pickupPoint = { x: p.x, y: p.y, depth: event.depth }; this.pickupAge = 0; }
  }

  private drawEffects(dt: number): void {
    const g = this.marker; g.clear();
    const target = this.lab.selected(), tile = this.lab.tile(target.x, target.y)!;
    const at = isoProject(target.x + 0.5, target.y + 0.5), offset = 0;
    if (this.lab.depth > 0) {
      const foot = isoProject(this.walk.x, this.walk.y), theme = LAB_THEMES[this.lab.layer().theme];
      for (let ring = 3; ring > 0; ring--) {
        g.fillColor = this.color(theme.light + "08"); g.ellipse(foot.x, foot.y + offset, W * ring * 0.65, H * ring * 0.65); g.fill();
      }
    }
    g.strokeColor = this.color(C.accent); g.lineWidth = 2;
    this.polygon(g, [isoProject(target.x, target.y), isoProject(target.x + 1, target.y), isoProject(target.x + 1, target.y + 1), isoProject(target.x, target.y + 1)].map(p => ({ x: p.x, y: p.y + offset })));
    if (tile.damage > 0 && !this.lab.travel) {
      const phase = Math.ceil(tile.damage * 3), cx = at.x, cy = at.y + offset;
      g.strokeColor = this.color("201d19"); g.lineWidth = 2 + tile.damage;
      g.moveTo(cx - 15, cy + 7); g.lineTo(cx - 3, cy); g.lineTo(cx + 6, cy - 8);
      if (phase >= 2) { g.moveTo(cx - 3, cy); g.lineTo(cx + 15, cy + 5); g.lineTo(cx + 28, cy + 4); }
      if (phase >= 3) { g.moveTo(cx - 15, cy + 7); g.lineTo(cx - 31, cy + 4); g.moveTo(cx + 6, cy - 8); g.lineTo(cx + 22, cy - 12); } g.stroke();
      const floor = this.layerViews.get(this.lab.depth)?.floors.get(target.x + "," + target.y);
      if (floor) floor.setPosition(at.x + Math.sin(this.elapsed * 100) * (this.striking ? 1.2 : 0), at.y);
      // 镐柄与镐头围绕角色手部挥动；角色贴图本身不变形。
      const player = isoProject(this.walk.x, this.walk.y), swing = Math.sin(this.elapsed * 18), dx = at.x - player.x;
      const hx = player.x + (dx >= 0 ? 18 : -18), hy = player.y + offset + 22;
      g.strokeColor = this.color("be9b65"); g.lineWidth = 4; g.moveTo(hx, hy); g.lineTo(hx + swing * 21, hy + 18 - swing * 8); g.stroke();
      g.strokeColor = this.color("d4dbda"); g.moveTo(hx + swing * 21 - 10, hy + 16 - swing * 8); g.lineTo(hx + swing * 21 + 9, hy + 24 - swing * 8); g.stroke();
    }
    this.sinks = this.sinks.filter(s => s.age < 0.4);
    for (const s of this.sinks) {
      s.age += dt; const alpha = Math.max(0, 1 - s.age / 0.4), drop = s.age * 95 + (s.depth - this.lab.depth) * LAB_LAYER_GAP;
      const points = [isoProject(s.x, s.y), isoProject(s.x + 1, s.y), isoProject(s.x + 1, s.y + 1), isoProject(s.x, s.y + 1)];
      this.polygon(g, points.map(p => ({ x: p.x, y: p.y - drop })), s.color + Math.round(alpha * 200).toString(16).padStart(2, "0"));
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
    this.lab.tick(dt, this.joystick.x + pressed(KeyCode.KEY_D, KeyCode.ARROW_RIGHT) - pressed(KeyCode.KEY_A, KeyCode.ARROW_LEFT), this.joystick.y + pressed(KeyCode.KEY_W, KeyCode.ARROW_UP) - pressed(KeyCode.KEY_S, KeyCode.ARROW_DOWN), this.striking);
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
    this.cameraX += ((this.follow ? this.walk.x : MAP.size / 2) - this.cameraX) * blend;
    this.cameraY += ((this.follow ? this.walk.y : MAP.size / 2) - this.cameraY) * blend;
    const camera = isoProject(this.cameraX, this.cameraY), zoom = travel ? 0.72 : this.follow ? ISO_FOLLOW_ZOOM : ISO_OVERVIEW_ZOOM;
    const shake = this.shake > 0 ? Math.sin(this.elapsed * 92) * 2.2 * this.shake / 0.13 : 0;
    this.world.setScale(zoom, zoom, 1); this.world.setPosition(-camera.x * zoom + shake, (-camera.y + viewDepth * LAB_LAYER_GAP) * zoom - 15);
    const p = isoProject(this.walk.x, this.walk.y), art = walkFrame(this.walk.facing.x, this.walk.facing.y, this.walk.distance, this.walk.distance > before + 0.0001);
    const active = this.layerViews.get(this.lab.depth)!;
    this.player.node.parent = travel ? this.world : active.actorsNode;
    this.player.x = this.walk.x; this.player.y = this.walk.y; this.player.node.setPosition(p.x, p.y - (travel ? playerDepth * LAB_LAYER_GAP : 0)); this.player.sprite!.spriteFrame = this.frames.get(art)!;
    this.actors = [...active.actors, this.player];
    this.actors.sort((a, b) => (a.x + a.y) - (b.x + b.y));
    this.actors.forEach((actor, i) => {
      if (!travel || actor !== this.player) actor.node.setSiblingIndex(i);
      const foot = isoProject(actor.x, actor.y), h = actor.node.getComponent(UITransform)!.height;
      actor.opacity.opacity = actor === this.player ? 255 : Math.round(255 * occlusionAlpha(foot.x - p.x, p.y - foot.y, actor.width, h, 48, 69));
    });
    Array.from(this.layerViews.entries()).sort((a, b) => b[0] - a[0]).forEach(([, v], i) => { v.node.setSiblingIndex(i); v.grid.node.active = this.grid; });
    this.marker.node.setSiblingIndex(this.world.children.length - 1); this.pickup.node.setSiblingIndex(this.world.children.length - 1);
    if (travel) this.player.node.setSiblingIndex(this.world.children.length - 1);
    this.marker.node.setPosition(0, -this.lab.depth * LAB_LAYER_GAP);
    this.drawEffects(dt);
    this.titleText.string = "第 " + (this.lab.depth + 1) + " 层 · " + theme.name;
    this.subtitleText.string = "最深 " + (this.lab.maxDepth + 1) + " 层 · 矿晶 " + this.lab.resources;
    const selected = this.lab.selected(), targetTile = this.lab.tile(selected.x, selected.y)!, damage = targetTile.damage;
    const action = targetTile.kind === "ore" ? "敲开矿晶" : ["root", "tree", "wall", "rock"].includes(targetTile.kind) ? "敲开障碍" : "砸穿地面";
    this.impactButton.string = travel ? (travel.to > travel.from ? "下潜中…" : "返回中…") : action + "\n长按 / 空格";
    this.readout.string = damage > 0 ? "地块裂开 " + Math.round(damage * 100) + "% · 松手可暂停" : theme.objective;
    if (this.lab.message !== this.lastMessage) { this.lastMessage = this.lab.message; this.notice.string = this.lab.message; this.noticeTime = 3.5; }
    this.noticeTime = Math.max(0, this.noticeTime - dt); this.notice.node.active = this.noticeTime > 0;
    this.camera.clearColor = travel ? Color.lerp(new Color(), this.color(LAB_THEMES[this.lab.layer(travel.from).theme].background), this.color(LAB_THEMES[this.lab.layer(travel.to).theme].background), smooth) : this.color(theme.background);
    this.stick.clear(); this.stick.fillColor = this.color(C.background + "df"); this.stick.strokeColor = this.color(C.border); this.stick.lineWidth = 2;
    this.stick.circle(0, 0, 86); this.stick.fill(); this.stick.stroke(); this.stick.circle(0, 0, 62); this.stick.stroke();
    this.stick.fillColor = this.color(this.joystick.id === -1 ? C.muted : C.accent); this.stick.circle(this.joystick.x * 50, this.joystick.y * 50, 27); this.stick.fill();
  }
  onDestroy(): void {
    if (this.audio) void this.audio.close();
    this.safeAreaObserver?.disconnect(); input.off(Input.EventType.KEY_DOWN, this.keyDown, this); input.off(Input.EventType.KEY_UP, this.keyUp, this);
    game.off(Game.EVENT_HIDE, this.resetInput, this); view.off("canvas-resize", this.resetInput, this);
    for (const [name, frame] of this.frames) if (name.startsWith("walk_") || name.startsWith("xpaa_")) frame.destroy();
  }
}
