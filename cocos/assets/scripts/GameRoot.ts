import {
  _decorator, Component, Node, Canvas, Camera, UITransform, Graphics, Label, Color,
  Layers, view, ResolutionPolicy, input, Input, EventKeyboard, KeyCode, EventTouch,
  BlockInputEvents, sys, game, Game, profiler,
} from "cc";
import { GameTuning } from "../data/exposed-variables/GameTuning";
import { readWorldContent } from "../data/external-files/WorldContent";
import { UI_COLORS } from "../data/resource-config/TileStyles";
import { ITEM_NAMES } from "../data/resource-config/ArtCatalog";
import { VILLAGE } from "../data/external-files/Village";
import { WORDS_TIER1 } from "../core/vocab";
import { stratumAt } from "../core/strata";
import { MAX_FRAME_SECONDS } from "../data/constants/GameRules";
import { PlayerStore } from "../data/player-data/PlayerStore";
import { Expedition } from "../core/Expedition";
import { WorldView } from "./WorldView";

const { ccclass, requireComponent } = _decorator;
const WIDTH = 1280, HEIGHT = 720, PAGE_SIZE = 8;
type Icon = "pickaxe" | "bag" | "book" | "coin";
interface ButtonOptions {
  primary?: boolean; icon?: Icon; hint?: string;
  enabled?: () => boolean; hold?: (down: boolean) => void;
}

@ccclass("GameRoot")
@requireComponent(GameTuning)
export class GameRoot extends Component {
  private expedition: Expedition | null = null;
  private store: PlayerStore | null = null;
  private tuning!: GameTuning;
  private root!: Node;
  private world!: WorldView;
  private hud!: Label;
  private coins!: Label;
  private status!: Label;
  private toast!: Node;
  private toastTimer = 0;
  private saveError = "";
  private quizPanel!: Node;
  private quizWord!: Label;
  private quizExample!: Label;
  private quizHint!: Label;
  private quizOptions: Label[] = [];
  private dexPanel!: Node;
  private dexRows: Label[] = [];
  private dexTitle!: Label;
  private dexPageText!: Label;
  private dexPage = 0;
  private bagPanel!: Node;
  private bagText!: Label;
  private bagTextRight!: Label;
  private actionButton!: Label;
  private npcPanel!: Node;
  private npcText!: Label;
  private dialogueLine = 0;
  private joystick!: Graphics;
  private stick = { x: 0, y: 0, id: -1 };
  private keys = new Set<KeyCode>();
  private digging = false;
  private cameraX = 0.5;
  private cameraY = 0.5;
  private depth = 0;
  private saveTimer = 0;
  private savedMessage = "";
  private shownQuiz: object | null = null;
  private title = "地心寻词";
  private buttonUpdates: (() => void)[] = [];
  private buttonResets: (() => void)[] = [];
  private safeAreaObserver: ResizeObserver | null = null;

  onLoad(): void {
    profiler.hideStats();
    view.setDesignResolutionSize(WIDTH, HEIGHT, ResolutionPolicy.SHOW_ALL);
    if (sys.isBrowser && typeof ResizeObserver !== "undefined") {
      const host = document.getElementById("SafeArea");
      if (host) {
        // Web 的完整窗口模式忽略安全区；跟随安全区容器实际尺寸。
        const fit = () => { if (host.clientWidth && host.clientHeight) view.setFrameSize(host.clientWidth, host.clientHeight); };
        fit(); this.safeAreaObserver = new ResizeObserver(fit); this.safeAreaObserver.observe(host);
      }
    }
    this.tuning = this.getComponent(GameTuning)!;
    this.buildInterface(); this.showMessage("正在装入像素世界…", true);
    void this.loadGame();
    input.on(Input.EventType.KEY_DOWN, this.keyDown, this);
    input.on(Input.EventType.KEY_UP, this.keyUp, this);
    game.on(Game.EVENT_HIDE, this.onHide, this);
    view.on("canvas-resize", this.resetInput, this);
  }

  private async loadGame(): Promise<void> {
    try {
      const t = this.tuning;
      if (![t.moveSpeed, t.acceleration, t.digSeconds, t.cameraFollow, t.tileSize, t.rowHeight].every(v => Number.isFinite(v) && v > 0)) throw new Error("GameTuning 参数必须是正数");
      if (!Number.isFinite(t.cameraAnchor) || t.cameraAnchor < 0.4 || t.cameraAnchor > 0.65) throw new Error("角色脚底位置必须在 0.4–0.65 之间");
      const content = readWorldContent(t.worldContent?.json);
      this.title = content.title;
      await this.world.loadArt();
      if (!this.isValid) return;
      this.store = new PlayerStore(sys.localStorage);
      this.expedition = new Expedition(this.store.load(content.seedString));
      const p = this.expedition.slot.position;
      this.cameraX = p.x; this.cameraY = p.y; this.depth = p.z;
      this.showMessage(content.welcome);
    } catch (error) {
      this.showMessage("启动失败：" + (error as Error).message, true);
      this.status.color = this.color(UI_COLORS.error); console.error(error);
    }
  }

  private color(hex: string): Color { return new Color().fromHEX(hex); }

  private nodeAt(name: string, parent: Node, x: number, y: number, w: number, h: number): Node {
    const node = new Node(name); node.layer = Layers.Enum.UI_2D;
    parent.addChild(node); node.setPosition(x, y);
    node.addComponent(UITransform).setContentSize(w, h);
    return node;
  }

  private text(parent: Node, name: string, content: string, x: number, y: number, w: number, h: number, size = 28, left = false): Label {
    const label = this.nodeAt(name, parent, x, y, w, h).addComponent(Label);
    label.string = content; label.fontSize = size; label.lineHeight = size * 1.35;
    label.color = this.color(UI_COLORS.ink); label.overflow = Label.Overflow.SHRINK;
    if (left) {
      label.horizontalAlign = Label.HorizontalAlign.LEFT;
      label.getComponent(UITransform)!.setAnchorPoint(0, 0.5);
    }
    return label;
  }

  private frame(g: Graphics, w: number, h: number, fill: string, border: string = UI_COLORS.border): void {
    g.clear();
    const x = -w / 2, y = -h / 2, cut = 6;
    g.fillColor = this.color(fill); g.strokeColor = this.color(border); g.lineWidth = 2;
    g.moveTo(x + cut, y); g.lineTo(x + w - cut, y); g.lineTo(x + w, y + cut);
    g.lineTo(x + w, y + h - cut); g.lineTo(x + w - cut, y + h);
    g.lineTo(x + cut, y + h); g.lineTo(x, y + h - cut); g.lineTo(x, y + cut);
    g.close(); g.fill(); g.stroke();
  }

  private icon(parent: Node, kind: Icon, x: number, y: number, ink: string): void {
    const g = this.nodeAt(kind, parent, x, y, 40, 40).addComponent(Graphics);
    g.strokeColor = this.color(ink); g.lineWidth = 3;
    if (kind === "pickaxe") {
      g.moveTo(-13, -17); g.lineTo(10, 11); g.moveTo(-13, 9); g.lineTo(-1, 17);
      g.lineTo(11, 13); g.lineTo(18, 1);
    } else if (kind === "bag") {
      g.rect(-14, -16, 28, 26); g.rect(-7, 10, 14, 7); g.rect(-8, -10, 16, 10);
    } else if (kind === "book") {
      g.moveTo(0, -14); g.lineTo(-16, -10); g.lineTo(-16, 16); g.lineTo(0, 12);
      g.lineTo(16, 16); g.lineTo(16, -10); g.lineTo(0, -14); g.lineTo(0, 12);
    } else {
      g.circle(0, 0, 14); g.moveTo(0, -8); g.lineTo(0, 8);
      g.moveTo(-5, 5); g.lineTo(5, 5); g.moveTo(-5, -5); g.lineTo(5, -5);
    }
    g.stroke();
  }

  private button(parent: Node, title: string, x: number, y: number, w: number, h: number, action: () => void, options: ButtonOptions = {}): Label {
    const node = this.nodeAt(title, parent, x, y, w, h), graphics = node.addComponent(Graphics);
    const ink = options.primary ? UI_COLORS.darkInk : UI_COLORS.ink, tall = !!options.primary;
    const label = this.text(node, "文字", title, options.icon && !tall ? 20 : 0, tall ? -16 : options.hint ? 10 : 0, w - (options.icon && !tall ? 58 : 16), 44, tall ? 32 : 28);
    label.color = this.color(ink);
    if (options.icon) this.icon(node, options.icon, tall ? 0 : -w / 2 + 30, tall ? 37 : 0, ink);
    if (options.hint) {
      const hint = this.text(node, "操作提示", options.hint, 0, tall ? -51 : -22, w - 12, 28, 20);
      hint.color = this.color(options.primary ? UI_COLORS.darkInk : UI_COLORS.muted);
    }
    let pointer: number | null = null, previous = "";
    const enabled = () => options.enabled?.() ?? true;
    const paint = () => {
      const active = enabled(), state = String(active) + ":" + pointer;
      if (state === previous) return;
      previous = state;
      const fill = options.primary ? (pointer === null ? UI_COLORS.primary : UI_COLORS.primaryPressed) : (pointer === null ? UI_COLORS.button : UI_COLORS.pressed);
      this.frame(graphics, w, h, active ? fill : options.primary ? UI_COLORS.disabledPrimary : UI_COLORS.panel, active && options.primary ? UI_COLORS.accent : UI_COLORS.border);
      label.color = this.color(active || options.primary ? ink : UI_COLORS.muted);
    };
    const release = () => { pointer = null; options.hold?.(false); paint(); };
    node.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
      event.propagationStopped = true;
      if (!enabled() || pointer !== null) return;
      pointer = event.getID(); options.hold?.(true); paint();
    });
    node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
      event.propagationStopped = true;
      if (event.getID() !== pointer) return;
      const activate = enabled() && node.getComponent(UITransform)!.hitTest(event.getLocation());
      release(); if (activate) action();
    });
    node.on(Node.EventType.TOUCH_CANCEL, (event: EventTouch) => { if (event.getID() === pointer) release(); });
    this.buttonUpdates.push(paint); this.buttonResets.push(release); paint();
    return label;
  }

  private panel(name: string, subtitle: string, compact = false): Node {
    const panel = this.nodeAt(name, this.root, 0, 0, WIDTH, HEIGHT);
    panel.addComponent(BlockInputEvents);
    const shade = panel.addComponent(Graphics);
    shade.fillColor = new Color(12, 22, 16, 170);
    shade.rect(-WIDTH / 2, -HEIGHT / 2, WIDTH, HEIGHT); shade.fill();
    const sheet = this.nodeAt("面板", panel, 0, compact ? -115 : 0, 1120, compact ? 370 : 600).addComponent(Graphics);
    this.frame(sheet, 1120, compact ? 370 : 600, UI_COLORS.background);
    this.text(panel, "标题", name, -500, compact ? 23 : 242, 780, 55, 36, true);
    this.text(panel, "说明", subtitle, -500, compact ? -25 : 193, 950, 35, 23, true).color = this.color(UI_COLORS.muted);
    panel.active = false;
    return panel;
  }

  private modalOpen(): boolean {
    return !!(this.expedition?.quiz || this.dexPanel?.active || this.bagPanel?.active || this.npcPanel?.active);
  }

  private playable(): boolean {
    const size = view.getFrameSize();
    return !!this.expedition && !this.modalOpen() && size.width >= size.height;
  }

  private buildInterface(): void {
    // shortcut: UI 沿用脚本创建；需编辑器逐节点排版时再迁为预制体。
    this.root = this.nodeAt("游戏画布", this.node, 0, 0, WIDTH, HEIGHT);
    const canvas = this.root.addComponent(Canvas), cameraNode = new Node("界面相机");
    this.node.addChild(cameraNode); cameraNode.setPosition(0, 0, 1000);
    const camera = cameraNode.addComponent(Camera);
    camera.projection = Camera.ProjectionType.ORTHO; camera.orthoHeight = HEIGHT / 2;
    camera.visibility = Layers.Enum.UI_2D; camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = this.color(UI_COLORS.background); canvas.cameraComponent = camera;
    this.world = this.nodeAt("世界", this.root, 0, 0, WIDTH, HEIGHT).addComponent(WorldView);
    const backing = this.nodeAt("位置底色", this.root, -450, 281, 280, 94).addComponent(Graphics);
    this.frame(backing, 280, 94, UI_COLORS.background);
    this.hud = this.text(this.root, "进度", "地心寻词\n正在进入世界", -570, 281, 240, 82, 28, true);
    const wallet = this.nodeAt("金币", this.root, -220, 281, 148, 94);
    this.frame(wallet.addComponent(Graphics), 148, 94, UI_COLORS.background);
    this.icon(wallet, "coin", -42, 0, UI_COLORS.accent);
    this.coins = this.text(wallet, "数量", "0", 14, 0, 93, 50, 32);
    this.coins.color = this.color(UI_COLORS.accent);
    this.button(this.root, "背包", 310, 281, 160, 94, () => this.toggleBag(), { icon: "bag", enabled: () => this.playable() });
    this.button(this.root, "图鉴", 500, 281, 180, 94, () => this.toggleDex(), { icon: "book", enabled: () => this.playable() });
    this.toast = this.nodeAt("探索消息", this.root, 0, 186, 800, 54);
    this.frame(this.toast.addComponent(Graphics), 800, 54, UI_COLORS.background);
    this.status = this.text(this.toast, "提示", "", 0, 0, 760, 44, 24);
    const joystick = this.nodeAt("摇杆", this.root, -485, -230, 192, 192);
    this.joystick = joystick.addComponent(Graphics);
    joystick.on(Node.EventType.TOUCH_START, this.moveJoystick, this);
    joystick.on(Node.EventType.TOUCH_MOVE, this.moveJoystick, this);
    const release = (event: EventTouch) => { if (event.getID() === this.stick.id) this.stick = { x: 0, y: 0, id: -1 }; };
    joystick.on(Node.EventType.TOUCH_END, release); joystick.on(Node.EventType.TOUCH_CANCEL, release);
    const help = this.text(this.root, "移动提示", sys.isMobile ? "移动" : "移动 · WASD", -485, -337, 240, 28, 20);
    help.enableOutline = true; help.outlineColor = this.color(UI_COLORS.background); help.outlineWidth = 3;
    this.button(this.root, "挖掘", 500, -232, 180, 164, () => {}, {
      primary: true, icon: "pickaxe", hint: sys.isMobile ? "长按" : "长按 · 空格",
      enabled: () => this.playable() && !!this.expedition?.target, hold: down => { this.digging = down; },
    });
    this.actionButton = this.button(this.root, "下挖", 300, -267, 160, 94, () => this.act(), {
      hint: sys.isMobile ? "脚下开井" : "脚下开井 · E", enabled: () => this.playable(),
    });
    this.button(this.root, "上梯", 300, -153, 160, 94, () => this.expedition?.ascend(), {
      hint: sys.isMobile ? "回到井口" : "回到井口 · Q", enabled: () => this.playable() && this.expedition!.slot.position.z > 0,
    });
    this.quizPanel = this.panel("开启宝箱", "选中词义，带走宝藏。答错也能继续探索。");
    this.quizWord = this.text(this.quizPanel, "单词", "", 0, 117, 990, 75, 54);
    this.quizWord.color = this.color(UI_COLORS.accent);
    this.quizExample = this.text(this.quizPanel, "例句", "", 0, 57, 990, 46, 25);
    for (let i = 0; i < 4; i++) this.quizOptions.push(this.button(this.quizPanel, "选项 " + (i + 1), i % 2 ? 260 : -260, -36 - Math.floor(i / 2) * 104, 480, 84, () => this.answer(i)));
    this.quizHint = this.text(this.quizPanel, "反馈", "", 0, -238, 990, 55, 26);
    this.dexPanel = this.panel("单词图鉴", "每一次发现，都留在这本手册里。");
    this.dexTitle = this.dexPanel.getChildByName("标题")!.getComponent(Label)!;
    for (let i = 0; i < PAGE_SIZE; i++) {
      const x = i < 4 ? -500 : 35, y = 116 - (i % 4) * 80;
      const line = this.nodeAt("词条分隔", this.dexPanel, x + 230, y - 38, 460, 1).addComponent(Graphics);
      line.fillColor = this.color(UI_COLORS.panel); line.rect(-230, 0, 460, 1); line.fill();
      this.dexRows.push(this.text(this.dexPanel, "词条 " + i, "", x, y, 460, 74, 27, true));
    }
    this.button(this.dexPanel, "关闭", 470, 242, 120, 84, () => this.toggleDex());
    this.button(this.dexPanel, "上一页", -400, -240, 200, 84, () => { this.dexPage--; this.refreshDex(); }, { enabled: () => this.dexPage > 0 });
    this.button(this.dexPanel, "下一页", 400, -240, 200, 84, () => { this.dexPage++; this.refreshDex(); }, { enabled: () => (this.dexPage + 1) * PAGE_SIZE < WORDS_TIER1.length });
    this.dexPageText = this.text(this.dexPanel, "页码", "", 0, -240, 300, 50, 26);
    this.bagPanel = this.panel("探险背包", "在地上收集木头与石头，往地下寻找矿石。");
    this.bagText = this.text(this.bagPanel, "物品左", "", -500, 5, 480, 330, 30, true);
    this.bagTextRight = this.text(this.bagPanel, "物品右", "", 35, 5, 465, 330, 30, true);
    this.button(this.bagPanel, "返回探索", 390, -240, 220, 84, () => this.toggleBag());
    this.npcPanel = this.panel(VILLAGE.npc.name, "村庄里的片刻休息", true);
    this.npcText = this.text(this.npcPanel, "双语台词", "", -500, -112, 1000, 120, 30, true);
    this.button(this.npcPanel, "再聊一句", -350, -239, 300, 84, () => this.advanceDialogue());
    this.button(this.npcPanel, "继续探索", 350, -239, 300, 84, () => this.closeDialogue());
  }

  private showMessage(message: string, sticky = false): void {
    this.status.string = message; this.status.color = this.color(UI_COLORS.ink);
    this.toastTimer = sticky ? Infinity : 6; this.toast.active = true;
  }

  private act(): void {
    const g = this.expedition;
    if (!g || !this.playable()) return;
    if (g.canTalkToNpc()) { this.resetInput(); this.npcPanel.active = true; this.showDialogue(); }
    else g.descend();
  }

  private showDialogue(): void {
    const line = VILLAGE.dialogue[this.dialogueLine];
    this.npcText.string = line.en + "\n" + line.zh;
  }
  private advanceDialogue(): void { this.dialogueLine = (this.dialogueLine + 1) % VILLAGE.dialogue.length; this.showDialogue(); }
  private closeDialogue(): void { this.npcPanel.active = false; this.resetInput(); }

  private moveJoystick(event: EventTouch): void {
    if (!this.playable()) return;
    const id = event.getID();
    if (id === null || (this.stick.id !== -1 && this.stick.id !== id)) return;
    const p = event.getUILocation();
    const dx = p.x - WIDTH / 2 - this.joystick.node.position.x, dy = p.y - HEIGHT / 2 - this.joystick.node.position.y;
    const length = Math.max(70, Math.hypot(dx, dy));
    this.stick = { x: dx / length, y: -dy / length, id }; event.propagationStopped = true;
  }

  private keyDown(event: EventKeyboard): void {
    const frame = view.getFrameSize();
    if (frame.height > frame.width || this.keys.has(event.keyCode)) return;
    this.keys.add(event.keyCode);
    if (this.expedition?.quiz) {
      const index = event.keyCode - KeyCode.DIGIT_1;
      if (index >= 0 && index < 4) this.answer(index);
      return;
    }
    if (this.npcPanel.active) {
      if (event.keyCode === KeyCode.KEY_E) this.advanceDialogue();
      if (event.keyCode === KeyCode.KEY_Q || event.keyCode === KeyCode.ESCAPE) this.closeDialogue();
      return;
    }
    if (event.keyCode === KeyCode.ESCAPE) {
      if (this.dexPanel.active) this.toggleDex();
      if (this.bagPanel.active) this.toggleBag();
      return;
    }
    if (event.keyCode === KeyCode.KEY_I) this.toggleDex();
    if (event.keyCode === KeyCode.KEY_B) this.toggleBag();
    if (this.modalOpen()) return;
    if (event.keyCode === KeyCode.KEY_E) this.act();
    if (event.keyCode === KeyCode.KEY_Q) this.expedition?.ascend();
  }
  private keyUp(event: EventKeyboard): void { this.keys.delete(event.keyCode); }

  private toggleBag(): void {
    const g = this.expedition;
    if (!g || g.quiz || this.dexPanel.active || this.npcPanel.active) return;
    this.resetInput(); this.bagPanel.active = !this.bagPanel.active;
    const rows = Object.entries(g.slot.game.inventory).filter(([, count]) => count > 0).map(([item, count]) => (ITEM_NAMES[item] ?? item) + "   × " + count);
    this.bagText.string = rows.length ? rows.slice(0, 4).join("\n\n") : "背包还空着\n\n试着砍一棵树，或下井挖一块矿石。";
    this.bagTextRight.string = rows.slice(4).join("\n\n");
  }
  private toggleDex(): void {
    const g = this.expedition;
    if (!g || g.quiz || this.bagPanel.active || this.npcPanel.active) return;
    this.resetInput(); this.dexPanel.active = !this.dexPanel.active; this.refreshDex();
  }
  private refreshDex(): void {
    const g = this.expedition!;
    this.dexTitle.string = "单词图鉴 · " + g.slot.game.seenWords.length + "/" + WORDS_TIER1.length;
    this.dexRows.forEach((label, i) => {
      const entry = WORDS_TIER1[this.dexPage * PAGE_SIZE + i]; label.node.active = !!entry;
      if (!entry) return;
      const seen = g.slot.game.seenWords.includes(entry.word);
      label.string = seen ? entry.word + " · " + entry.meaning + "\n" + (g.book.get(entry.word).status === "mastered" ? "已掌握" : "已发现 · 探索中") : "尚未发现\n在探索中收集这个单词";
      label.color = this.color(seen ? UI_COLORS.ink : UI_COLORS.muted);
    });
    this.dexPageText.string = (this.dexPage + 1) + " / " + Math.ceil(WORDS_TIER1.length / PAGE_SIZE);
  }
  private answer(index: number): void {
    const g = this.expedition;
    if (!g?.quiz) return;
    this.quizHint.string = g.answer(index);
    if (!g.quiz) { this.quizPanel.active = false; this.shownQuiz = null; this.resetInput(); }
    this.persist();
  }

  update(seconds: number): void {
    const g = this.expedition;
    if (!g) return;
    const dt = Math.min(seconds, MAX_FRAME_SECONDS), frame = view.getFrameSize();
    if (frame.height > frame.width) { this.resetInput(); return; }
    const pressed = (...codes: KeyCode[]) => codes.some(code => this.keys.has(code)) ? 1 : 0;
    if (!this.modalOpen()) {
      const x = this.stick.x + pressed(KeyCode.KEY_D, KeyCode.ARROW_RIGHT) - pressed(KeyCode.KEY_A, KeyCode.ARROW_LEFT);
      const y = this.stick.y + pressed(KeyCode.KEY_S, KeyCode.ARROW_DOWN) - pressed(KeyCode.KEY_W, KeyCode.ARROW_UP);
      g.tick(dt, x, y, this.digging || this.keys.has(KeyCode.SPACE), this.tuning);
    }
    const p = g.slot.position;
    if (this.depth !== p.z) { this.depth = p.z; this.cameraX = p.x; this.cameraY = p.y; }
    const follow = 1 - Math.exp(-this.tuning.cameraFollow * dt);
    this.cameraX += (p.x - this.cameraX) * follow; this.cameraY += (p.y - this.cameraY) * follow;
    this.world.render(g, this.tuning, this.cameraX, this.cameraY, dt, this.digging || this.keys.has(KeyCode.SPACE));
    this.hud.string = this.title + "\n" + (p.z === 0 ? "地表" : stratumAt(p.z).name) + " · " + p.z + " m";
    this.coins.string = String(g.slot.game.inventory.coin ?? 0);
    const talk = g.canTalkToNpc(); this.actionButton.string = talk ? "交谈" : "下挖";
    this.actionButton.node.parent!.getChildByName("操作提示")!.getComponent(Label)!.string = talk ? (sys.isMobile ? "梅婆婆" : "梅婆婆 · E") : (sys.isMobile ? "脚下开井" : "脚下开井 · E");
    if (g.message && g.message !== this.savedMessage) {
      this.savedMessage = g.message; if (!this.saveError) this.showMessage(g.message);
    }
    if (g.quiz && g.quiz !== this.shownQuiz) {
      this.shownQuiz = g.quiz; this.resetInput(); this.quizPanel.active = true;
      this.quizWord.string = g.quiz.entry.word; this.quizExample.string = g.quiz.entry.example;
      this.quizHint.string = sys.isMobile ? "轻点一个词义" : "选择词义 · 也可以按 1–4";
      g.quiz.session.question.options.forEach((option, i) => { this.quizOptions[i].string = option; });
    }
    this.toastTimer = Math.max(0, this.toastTimer - dt); this.toast.active = this.toastTimer > 0 && !this.modalOpen();
    this.saveTimer += dt;
    if (this.saveTimer >= 2) { this.saveTimer = 0; this.persist(); }
    for (const update of this.buttonUpdates) update();
    this.joystick.clear(); this.joystick.fillColor = this.color(UI_COLORS.background + "d8");
    this.joystick.strokeColor = this.color(UI_COLORS.border); this.joystick.lineWidth = 2;
    this.joystick.circle(0, 0, 88); this.joystick.fill(); this.joystick.stroke();
    this.joystick.circle(0, 0, 64); this.joystick.stroke();
    this.joystick.fillColor = this.color(this.stick.id === -1 ? UI_COLORS.muted : UI_COLORS.accent);
    this.joystick.circle(this.stick.x * 52, -this.stick.y * 52, 28); this.joystick.fill();
  }

  private persist(): void {
    if (!this.expedition?.dirty || !this.store) return;
    try {
      this.store.save(this.expedition.slot); this.expedition.dirty = false;
      if (this.saveError) { this.saveError = ""; this.showMessage("进度已保存"); }
    } catch (error) {
      this.saveError = "存档失败，进度暂留内存，请勿关闭游戏：" + (error as Error).message;
      this.showMessage(this.saveError, true); this.status.color = this.color(UI_COLORS.error); console.error(error);
    }
  }
  private resetInput(): void {
    this.keys.clear(); this.digging = false; this.stick = { x: 0, y: 0, id: -1 };
    if (this.expedition) this.expedition.velocity.x = this.expedition.velocity.y = 0;
    for (const reset of this.buttonResets) reset();
  }
  private onHide(): void { this.resetInput(); this.persist(); }
  onDestroy(): void {
    this.safeAreaObserver?.disconnect();
    input.off(Input.EventType.KEY_DOWN, this.keyDown, this); input.off(Input.EventType.KEY_UP, this.keyUp, this);
    game.off(Game.EVENT_HIDE, this.onHide, this); view.off("canvas-resize", this.resetInput, this); this.persist();
  }
}
