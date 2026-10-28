import {
  _decorator, Component, Node, Canvas, Camera, UITransform, Graphics, Sprite, SpriteFrame,
  Texture2D, Rect, Size, Vec2, Color, Label, Layers, UIOpacity, resources, view,
  ResolutionPolicy, input, Input, EventKeyboard, EventTouch, KeyCode, sys, game, Game, profiler,
} from "cc";
import { IsometricWalk, isoProject } from "../core/Isometric";
import { ISOMETRIC_MAP as MAP } from "../data/external-files/IsometricMap";
import { ISO_TILE_WIDTH as W, ISO_TILE_HEIGHT as H, ISO_OVERVIEW_ZOOM, ISO_FOLLOW_ZOOM } from "../data/constants/IsometricRules";
import { XPAA_REGIONS, WALK_CANVAS, walkFrame } from "../data/resource-config/XPAAArt";
import { UI_COLORS as C } from "../data/resource-config/TileStyles";
import { occlusionAlpha } from "./ObliqueProjection";

const { ccclass } = _decorator;
interface Actor { x: number; y: number; width: number; node: Node; sprite: Sprite; opacity: UIOpacity }

@ccclass("IsometricDemo")
export class IsometricDemo extends Component {
  private walk = new IsometricWalk();
  private frames = new Map<string, SpriteFrame>();
  private world!: Node;
  private actors: Actor[] = [];
  private player!: Actor;
  private groundGrid!: Graphics;
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

  onLoad(): void {
    profiler.hideStats(); view.setDesignResolutionSize(1280, 720, ResolutionPolicy.SHOW_ALL);
    if (sys.isBrowser && typeof ResizeObserver !== "undefined") {
      document.title = "地心寻词 · 等距视角实验";
      const host = document.getElementById("SafeArea");
      if (host) {
        const fit = () => { if (host.clientWidth && host.clientHeight) view.setFrameSize(host.clientWidth, host.clientHeight); };
        fit(); this.safeAreaObserver = new ResizeObserver(fit); this.safeAreaObserver.observe(host);
      }
    }
    const canvas = this.node.addComponent(Canvas), cameraNode = this.make("相机", this.node);
    cameraNode.setPosition(0, 0, 1000);
    const camera = cameraNode.addComponent(Camera);
    camera.projection = Camera.ProjectionType.ORTHO; camera.orthoHeight = 360;
    camera.visibility = Layers.Enum.UI_2D; camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = this.color(C.background); canvas.cameraComponent = camera;
    this.world = this.make("菱形试验场", this.node);
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
  private button(title: string, x: number, y: number, action: () => void): Label {
    const node = this.make(title, this.node, x, y, 180, 86), g = node.addComponent(Graphics);
    const paint = (pressed: boolean) => {
      g.clear(); g.fillColor = this.color(pressed ? C.pressed : C.panel); g.strokeColor = this.color(C.border); g.lineWidth = 2;
      g.rect(-90, -43, 180, 86); g.fill(); g.stroke();
    };
    paint(false);
    let pointer: number | null = null;
    node.on(Node.EventType.TOUCH_START, (e: EventTouch) => { if (pointer === null) { pointer = e.getID(); paint(true); } });
    node.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      if (e.getID() !== pointer) return;
      pointer = null; paint(false); if (node.getComponent(UITransform)!.hitTest(e.getLocation())) action();
    });
    node.on(Node.EventType.TOUCH_CANCEL, () => { pointer = null; paint(false); });
    return this.text(node, "文字", title, 0, 0, 160, 26);
  }
  private buildUI(): void {
    const plate = this.make("标题底色", this.node, -355, 286, 460, 94).addComponent(Graphics);
    plate.fillColor = this.color(C.background); plate.rect(-230, -47, 460, 94); plate.fill();
    this.text(this.node, "标题", "等距视角 · 13 × 13", -355, 306, 430, 30);
    this.text(this.node, "说明", "在树石之间走走，比较地面与遮挡", -355, 271, 430, 21).color = this.color(C.muted);
    this.gridButton = this.button("网格 · 开", 295, 286, () => this.toggleGrid());
    this.cameraButton = this.button("镜头 · 全景", 505, 286, () => this.toggleCamera());
    this.button("回到起点", 505, -281, () => { this.walk.reset(); this.resetInput(); });
    this.stick = this.make("摇杆", this.node, -495, -235, 192, 192).addComponent(Graphics);
    const move = (e: EventTouch) => {
      if (!this.ready || view.getFrameSize().height > view.getFrameSize().width) return;
      if (this.joystick.id !== -1 && this.joystick.id !== e.getID()) return;
      const p = e.getUILocation(), x = p.x - 640 + 495, y = p.y - 360 + 235, d = Math.max(65, Math.hypot(x, y));
      this.joystick = { x: x / d, y: y / d, id: e.getID()! };
    };
    this.stick.node.on(Node.EventType.TOUCH_START, move); this.stick.node.on(Node.EventType.TOUCH_MOVE, move);
    const end = (e: EventTouch) => { if (this.joystick.id === e.getID()) this.joystick = { x: 0, y: 0, id: -1 }; };
    this.stick.node.on(Node.EventType.TOUCH_END, end); this.stick.node.on(Node.EventType.TOUCH_CANCEL, end);
    this.text(this.node, "移动说明", sys.isMobile ? "移动" : "WASD / 方向键", -495, -340, 250, 20);
    this.readout = this.text(this.node, "位置", "正在装入试验场…", 0, -315, 520, 23);
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
      this.buildMap(); this.ready = true;
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
    const actor = { ...item, x, y, width, opacity: item.node.addComponent(UIOpacity) }; this.actors.push(actor); return actor;
  }
  private buildMap(): void {
    const edge = this.make("地块侧面", this.world).addComponent(Graphics), n = MAP.size;
    const left = isoProject(0, n), bottom = isoProject(n, n), right = isoProject(n, 0);
    this.polygon(edge, [left, bottom, { x: bottom.x, y: bottom.y - 22 }, { x: left.x, y: left.y - 22 }], "6b5940");
    this.polygon(edge, [bottom, right, { x: right.x, y: right.y - 22 }, { x: bottom.x, y: bottom.y - 22 }], "4c4732");
    const ground = this.make("地面", this.world);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const p = isoProject(x + 0.5, y + 0.5), tile = this.make("地块", ground, p.x, p.y);
      // 先旋转方形纹理，再压缩地面纵轴；直立精灵不继承这个变换。
      tile.setScale(1, H / W, 1);
      const image = this.sprite(tile, "xpaa_grass", (W + 0.5) / Math.SQRT2);
      image.node.setRotationFromEuler(0, 0, 45);
    }
    const paths = this.make("道路与水面", this.world).addComponent(Graphics);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (x === 6 || y === 6) this.diamond(paths, x, y, "beaa77");
    for (const [x, y] of MAP.water) this.diamond(paths, x, y, "527e78");
    this.groundGrid = this.make("地块网格", this.world).addComponent(Graphics);
    this.groundGrid.strokeColor = new Color(229, 231, 197, 65); this.groundGrid.lineWidth = 1;
    for (let i = 0; i <= n; i++) {
      const a = isoProject(i, 0), b = isoProject(i, n), c = isoProject(0, i), d = isoProject(n, i);
      this.groundGrid.moveTo(a.x, a.y); this.groundGrid.lineTo(b.x, b.y); this.groundGrid.moveTo(c.x, c.y); this.groundGrid.lineTo(d.x, d.y);
    }
    this.groundGrid.stroke();
    this.marker = this.make("脚底格与影子", this.world).addComponent(Graphics);
    const actors = this.make("脚底排序", this.world);
    for (const prop of MAP.props) this.actor(actors, prop.art, prop.x + 0.5, prop.y + 0.5, prop.width);
    this.player = this.actor(actors, "walk_down_0", this.walk.x, this.walk.y, 48);
  }

  private toggleGrid(): void { this.grid = !this.grid; this.gridButton.string = "网格 · " + (this.grid ? "开" : "关"); }
  private toggleCamera(): void { this.follow = !this.follow; this.cameraButton.string = "镜头 · " + (this.follow ? "跟随" : "全景"); }
  private keyDown(e: EventKeyboard): void {
    if (this.keys.has(e.keyCode) || view.getFrameSize().height > view.getFrameSize().width) return;
    this.keys.add(e.keyCode);
    if (e.keyCode === KeyCode.KEY_G) this.toggleGrid(); if (e.keyCode === KeyCode.KEY_F) this.toggleCamera();
    if (e.keyCode === KeyCode.KEY_R) { this.walk.reset(); this.resetInput(); }
  }
  private keyUp(e: EventKeyboard): void { this.keys.delete(e.keyCode); }
  private resetInput(): void { this.keys.clear(); this.joystick = { x: 0, y: 0, id: -1 }; this.walk.stop(); }

  update(seconds: number): void {
    if (!this.ready) return;
    if (view.getFrameSize().height > view.getFrameSize().width) { this.resetInput(); return; }
    const dt = Math.min(seconds, 0.05), pressed = (...keys: KeyCode[]) => keys.some(k => this.keys.has(k)) ? 1 : 0;
    const before = this.walk.distance;
    this.walk.tick(dt, this.joystick.x + pressed(KeyCode.KEY_D, KeyCode.ARROW_RIGHT) - pressed(KeyCode.KEY_A, KeyCode.ARROW_LEFT), this.joystick.y + pressed(KeyCode.KEY_W, KeyCode.ARROW_UP) - pressed(KeyCode.KEY_S, KeyCode.ARROW_DOWN));
    const blend = 1 - Math.exp(-8 * dt);
    this.cameraX += ((this.follow ? this.walk.x : MAP.size / 2) - this.cameraX) * blend;
    this.cameraY += ((this.follow ? this.walk.y : MAP.size / 2) - this.cameraY) * blend;
    const camera = isoProject(this.cameraX, this.cameraY), zoom = this.follow ? ISO_FOLLOW_ZOOM : ISO_OVERVIEW_ZOOM;
    this.world.setScale(zoom, zoom, 1); this.world.setPosition(-camera.x * zoom, -camera.y * zoom - 15);
    const p = isoProject(this.walk.x, this.walk.y), art = walkFrame(this.walk.facing.x, this.walk.facing.y, this.walk.distance, this.walk.distance > before + 0.0001);
    this.player.x = this.walk.x; this.player.y = this.walk.y; this.player.node.setPosition(p.x, p.y); this.player.sprite.spriteFrame = this.frames.get(art)!;
    this.actors.sort((a, b) => (a.x + a.y) - (b.x + b.y));
    this.actors.forEach((actor, i) => {
      actor.node.setSiblingIndex(i);
      const foot = isoProject(actor.x, actor.y), h = actor.node.getComponent(UITransform)!.height;
      actor.opacity.opacity = actor === this.player ? 255 : Math.round(255 * occlusionAlpha(foot.x - p.x, p.y - foot.y, actor.width, h, 48, 69));
    });
    this.groundGrid.node.active = this.grid;
    this.marker.clear(); this.marker.fillColor = new Color(17, 30, 22, 90); this.marker.ellipse(p.x, p.y, 14, 6); this.marker.fill();
    this.marker.strokeColor = this.color(C.accent); this.marker.lineWidth = 2; this.diamond(this.marker, Math.floor(this.walk.x), Math.floor(this.walk.y));
    this.readout.string = "地块 (" + Math.floor(this.walk.x) + ", " + Math.floor(this.walk.y) + ") · " + (this.follow ? "跟随镜头" : "全景镜头");
    this.stick.clear(); this.stick.fillColor = this.color(C.background + "df"); this.stick.strokeColor = this.color(C.border); this.stick.lineWidth = 2;
    this.stick.circle(0, 0, 86); this.stick.fill(); this.stick.stroke(); this.stick.circle(0, 0, 62); this.stick.stroke();
    this.stick.fillColor = this.color(this.joystick.id === -1 ? C.muted : C.accent); this.stick.circle(this.joystick.x * 50, this.joystick.y * 50, 27); this.stick.fill();
  }
  onDestroy(): void {
    this.safeAreaObserver?.disconnect(); input.off(Input.EventType.KEY_DOWN, this.keyDown, this); input.off(Input.EventType.KEY_UP, this.keyUp, this);
    game.off(Game.EVENT_HIDE, this.resetInput, this); view.off("canvas-resize", this.resetInput, this);
    for (const frame of this.frames.values()) frame.destroy();
  }
}
