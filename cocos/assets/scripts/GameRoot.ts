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
import { MAX_FRAME_SECONDS } from "../data/constants/GameRules";
import { PlayerStore } from "../data/player-data/PlayerStore";
import { Expedition } from "../core/Expedition";
import { WorldView } from "./WorldView";
import { obliqueProjection } from "./ObliqueProjection";

const { ccclass, requireComponent } = _decorator;
const WIDTH = 720, HEIGHT = 1280;

@ccclass("GameRoot")
@requireComponent(GameTuning)
export class GameRoot extends Component {
  private expedition: Expedition | null = null;
  private store: PlayerStore | null = null;
  private tuning!: GameTuning;
  private root!: Node;
  private world!: WorldView;
  private hud!: Label;
  private status!: Label;
  private quizPanel!: Node;
  private quizWord!: Label;
  private quizHint!: Label;
  private quizOptions: Label[] = [];
  private dexPanel!: Node;
  private dexText!: Label;
  private dexTitle!: Label;
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

  onLoad(): void {
    profiler.hideStats();
    view.setDesignResolutionSize(WIDTH, HEIGHT, ResolutionPolicy.SHOW_ALL);
    this.tuning = this.getComponent(GameTuning)!;
    this.buildInterface();
    this.status.string = "正在装入原创像素素材…";
    void this.loadGame();
    input.on(Input.EventType.KEY_DOWN, this.keyDown, this);
    input.on(Input.EventType.KEY_UP, this.keyUp, this);
    game.on(Game.EVENT_HIDE, this.onHide, this);
  }

  private async loadGame(): Promise<void> {
    try {
      const t = this.tuning;
      if (![t.moveSpeed, t.acceleration, t.digSeconds, t.cameraFollow, t.tileSize].every(v => Number.isFinite(v) && v > 0)) {
        throw new Error("GameTuning 参数必须是正数");
      }
      obliqueProjection(t.tileSize, t.cameraPitch);
      if (!Number.isFinite(t.cameraAnchor) || t.cameraAnchor < 0.4 || t.cameraAnchor > 0.65) {
        throw new Error("角色脚底位置必须在 0.4–0.65 之间");
      }
      const content = readWorldContent(t.worldContent?.json);
      this.title = content.title;
      await this.world.loadArt();
      if (!this.isValid) return;
      this.store = new PlayerStore(sys.localStorage);
      this.expedition = new Expedition(this.store.load(content.seedString));
      const p = this.expedition.slot.position;
      this.cameraX = p.x; this.cameraY = p.y; this.depth = p.z;
      this.status.string = content.welcome;
    } catch (error) {
      this.status.string = "启动失败：" + (error as Error).message;
      console.error(error);
    }
  }

  private nodeAt(name: string, parent: Node, x: number, y: number, w: number, h: number): Node {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    parent.addChild(node);
    node.setPosition(x, y);
    node.addComponent(UITransform).setContentSize(w, h);
    return node;
  }

  private text(parent: Node, name: string, text: string, x: number, y: number, w: number, h: number, size = 24): Label {
    const label = this.nodeAt(name, parent, x, y, w, h).addComponent(Label);
    label.string = text;
    label.fontSize = size; label.lineHeight = size * 1.4;
    label.color = new Color().fromHEX(UI_COLORS.ink);
    label.overflow = Label.Overflow.SHRINK;
    return label;
  }

  private button(parent: Node, title: string, x: number, y: number, w: number, h: number, action: () => void, hold?: (down: boolean) => void): Label {
    const node = this.nodeAt(title, parent, x, y, w, h);
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = new Color().fromHEX(UI_COLORS.panel + "e1");
    graphics.roundRect(-w / 2, -h / 2, w, h, 14); graphics.fill();
    graphics.strokeColor = new Color().fromHEX(UI_COLORS.accent);
    graphics.lineWidth = 2; graphics.stroke();
    node.on(Node.EventType.TOUCH_START, (e: EventTouch) => { e.propagationStopped = true; hold?.(true); });
    node.on(Node.EventType.TOUCH_END, (e: EventTouch) => { e.propagationStopped = true; hold?.(false); action(); });
    node.on(Node.EventType.TOUCH_CANCEL, () => hold?.(false));
    return this.text(node, "文字", title, 0, 0, w - 16, h - 10);
  }

  private panel(name: string): Node {
    const panel = this.nodeAt(name, this.root, 0, 0, WIDTH, HEIGHT);
    panel.addComponent(BlockInputEvents);
    const g = panel.addComponent(Graphics);
    g.fillColor = new Color().fromHEX(UI_COLORS.background);
    g.rect(-WIDTH / 2, -HEIGHT / 2, WIDTH, HEIGHT); g.fill();
    panel.active = false;
    return panel;
  }

  private buildInterface(): void {
    // shortcut: 首轮 UI 由脚本创建；需要在编辑器逐个排版时迁为预制体。
    this.root = this.nodeAt("游戏画布", this.node, 0, 0, WIDTH, HEIGHT);
    const canvas = this.root.addComponent(Canvas);
    const cameraNode = new Node("界面相机");
    this.node.addChild(cameraNode);
    cameraNode.setPosition(0, 0, 1000);
    const camera = cameraNode.addComponent(Camera);
    camera.projection = Camera.ProjectionType.ORTHO;
    camera.orthoHeight = HEIGHT / 2;
    camera.visibility = Layers.Enum.UI_2D;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color().fromHEX(UI_COLORS.background);
    canvas.cameraComponent = camera;
    this.world = this.nodeAt("世界", this.root, 0, 0, WIDTH, HEIGHT).addComponent(WorldView);
    const hudBacking = this.nodeAt("状态底色", this.root, 0, 560, 680, 124).addComponent(Graphics);
    hudBacking.fillColor = new Color(24, 29, 21, 220);
    hudBacking.roundRect(-340, -62, 680, 124, 10); hudBacking.fill();
    this.hud = this.text(this.root, "进度", "加载中…", 0, 580, 652, 65, 24);
    this.status = this.text(this.root, "提示", "", 0, 526, 652, 34, 20);
    const joystick = this.nodeAt("摇杆", this.root, -230, -485, 180, 180);
    this.joystick = joystick.addComponent(Graphics);
    joystick.on(Node.EventType.TOUCH_START, this.moveJoystick, this);
    joystick.on(Node.EventType.TOUCH_MOVE, this.moveJoystick, this);
    const release = (event: EventTouch) => {
      if (event.getID() === this.stick.id) this.stick = { x: 0, y: 0, id: -1 };
    };
    joystick.on(Node.EventType.TOUCH_END, release);
    joystick.on(Node.EventType.TOUCH_CANCEL, release);
    this.button(this.root, "挖掘 [空格]", -25, -455, 158, 90, () => {}, down => { this.digging = down; });
    this.actionButton = this.button(this.root, "下挖 [E]", 180, -455, 158, 90, () => this.act());
    this.button(this.root, "图鉴 [I]", -25, -570, 158, 86, () => this.toggleDex());
    this.button(this.root, "上梯 [Q]", 180, -570, 158, 86, () => this.expedition?.ascend());
    this.quizPanel = this.panel("宝箱答题");
    this.text(this.quizPanel, "标题", "一个单词，一把钥匙", 0, 440, 650, 65, 30);
    this.quizWord = this.text(this.quizPanel, "单词", "", 0, 295, 650, 170, 42);
    this.quizHint = this.text(this.quizPanel, "反馈", "选择这个单词的意思", 0, -325, 630, 125, 24);
    for (let i = 0; i < 4; i++) {
      this.quizOptions.push(this.button(this.quizPanel, "选项 " + (i + 1), 0, 100 - i * 105, 550, 82, () => this.answer(i)));
    }
    this.dexPanel = this.panel("单词图鉴");
    this.dexTitle = this.text(this.dexPanel, "标题", "单词图鉴", 0, 540, 650, 70, 32);
    this.dexText = this.text(this.dexPanel, "词条", "", 0, 30, 630, 880, 24);
    this.button(this.dexPanel, "返回 [I]", 0, -530, 250, 85, () => this.toggleDex());
    this.npcPanel = this.nodeAt("梅婆婆对话", this.root, 0, 0, WIDTH, HEIGHT);
    this.npcPanel.addComponent(BlockInputEvents);
    const dialogueBackground = this.npcPanel.addComponent(Graphics);
    dialogueBackground.fillColor = new Color(18, 20, 15, 135);
    dialogueBackground.rect(-WIDTH / 2, -HEIGHT / 2, WIDTH, HEIGHT); dialogueBackground.fill();
    dialogueBackground.fillColor = new Color().fromHEX(UI_COLORS.panel);
    dialogueBackground.roundRect(-330, -540, 660, 620, 12); dialogueBackground.fill();
    dialogueBackground.strokeColor = new Color().fromHEX(UI_COLORS.accent);
    dialogueBackground.lineWidth = 2; dialogueBackground.stroke();
    this.text(this.npcPanel, "名字", VILLAGE.npc.name, 0, 20, 600, 65, 32);
    this.npcText = this.text(this.npcPanel, "双语台词", "", 0, -175, 600, 250, 28);
    this.button(this.npcPanel, "再聊一句 [E]", -156, -440, 282, 85, () => this.advanceDialogue());
    this.button(this.npcPanel, "继续探索 [Q]", 156, -440, 282, 85, () => this.closeDialogue());
    this.npcPanel.active = false;
  }

  private act(): void {
    const g = this.expedition;
    if (!g || g.quiz || this.dexPanel.active || this.npcPanel.active) return;
    if (g.canTalkToNpc()) {
      this.resetInput();
      this.npcPanel.active = true;
      this.showDialogue();
    } else g.descend();
  }

  private showDialogue(): void {
    const line = VILLAGE.dialogue[this.dialogueLine];
    this.npcText.string = line.en + "\n\n" + line.zh;
  }

  private advanceDialogue(): void {
    this.dialogueLine = (this.dialogueLine + 1) % VILLAGE.dialogue.length;
    this.showDialogue();
  }

  private closeDialogue(): void { this.npcPanel.active = false; this.resetInput(); }

  private moveJoystick(event: EventTouch): void {
    const id = event.getID();
    if (id === null || (this.stick.id !== -1 && this.stick.id !== id)) return;
    const p = event.getUILocation();
    const dx = p.x - WIDTH / 2 + 230, dy = p.y - HEIGHT / 2 + 485;
    const length = Math.max(70, Math.hypot(dx, dy));
    this.stick = { x: dx / length, y: -dy / length, id };
    event.propagationStopped = true;
  }

  private keyDown(event: EventKeyboard): void {
    if (this.keys.has(event.keyCode)) return;
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
    if (event.keyCode === KeyCode.KEY_I) this.toggleDex();
    if (this.dexPanel.active) return;
    if (event.keyCode === KeyCode.KEY_E) this.act();
    if (event.keyCode === KeyCode.KEY_Q) this.expedition?.ascend();
  }

  private keyUp(event: EventKeyboard): void { this.keys.delete(event.keyCode); }

  private toggleDex(): void {
    const g = this.expedition;
    if (!g || g.quiz || this.npcPanel.active) return;
    this.resetInput();
    this.dexPanel.active = !this.dexPanel.active;
    const entries = g.slot.game.seenWords;
    this.dexTitle.string = "单词图鉴 · " + entries.length + "/" + WORDS_TIER1.length;
    this.dexText.string = WORDS_TIER1.map(entry => entries.includes(entry.word)
      ? entry.word + "  " + entry.meaning + " · " + (g.book.get(entry.word).status === "mastered" ? "已掌握" : "探索中")
      : "? ? ?  ·  尚未发现").join("\n");
  }

  private answer(index: number): void {
    const g = this.expedition;
    if (!g?.quiz) return;
    const text = g.answer(index);
    this.quizHint.string = text;
    if (!g.quiz) { this.quizPanel.active = false; this.shownQuiz = null; this.resetInput(); }
    this.persist();
  }

  update(seconds: number): void {
    const g = this.expedition;
    if (!g) return;
    const dt = Math.min(seconds, MAX_FRAME_SECONDS);
    const pressed = (...codes: KeyCode[]) => codes.some(code => this.keys.has(code)) ? 1 : 0;
    if (!this.dexPanel.active && !this.npcPanel.active) {
      const x = this.stick.x + pressed(KeyCode.KEY_D, KeyCode.ARROW_RIGHT) - pressed(KeyCode.KEY_A, KeyCode.ARROW_LEFT);
      const y = this.stick.y + pressed(KeyCode.KEY_S, KeyCode.ARROW_DOWN) - pressed(KeyCode.KEY_W, KeyCode.ARROW_UP);
      g.tick(dt, x, y, this.digging || this.keys.has(KeyCode.SPACE), this.tuning);
    }
    const p = g.slot.position;
    if (this.depth !== p.z) { this.depth = p.z; this.cameraX = p.x; this.cameraY = p.y; }
    const follow = 1 - Math.exp(-this.tuning.cameraFollow * dt);
    this.cameraX += (p.x - this.cameraX) * follow;
    this.cameraY += (p.y - this.cameraY) * follow;
    this.world.render(g, this.tuning, this.cameraX, this.cameraY, dt, this.digging || this.keys.has(KeyCode.SPACE));
    const inventory = Object.entries(g.slot.game.inventory).map(([item, count]) => (ITEM_NAMES[item] ?? item) + " " + count).join(" · ");
    this.hud.string = this.title + " · " + p.z + "m · 图鉴 " + g.slot.game.seenWords.length + "/" + WORDS_TIER1.length + "\n" + (inventory || "背包空空，宝藏还在地下");
    this.actionButton.string = g.canTalkToNpc() ? "交谈 [E]" : "下挖 [E]";
    if (g.message && g.message !== this.savedMessage) { this.status.string = g.message; this.savedMessage = g.message; }
    if (g.quiz && g.quiz !== this.shownQuiz) {
      this.shownQuiz = g.quiz;
      this.resetInput();
      this.quizPanel.active = true;
      this.quizWord.string = g.quiz.entry.word + "\n" + g.quiz.entry.example;
      this.quizHint.string = "选择这个单词的意思";
      g.quiz.session.question.options.forEach((option, i) => { this.quizOptions[i].string = (i + 1) + ". " + option; });
    }
    this.saveTimer += dt;
    if (this.saveTimer >= 2) { this.saveTimer = 0; this.persist(); }
    this.joystick.clear();
    this.joystick.fillColor = new Color().fromHEX(UI_COLORS.panel + "b4");
    this.joystick.circle(0, 0, 80); this.joystick.fill();
    this.joystick.fillColor = new Color().fromHEX(UI_COLORS.accent);
    this.joystick.circle(this.stick.x * 52, -this.stick.y * 52, 29); this.joystick.fill();
  }

  private persist(): void {
    if (!this.expedition?.dirty || !this.store) return;
    try {
      this.store.save(this.expedition.slot);
      this.expedition.dirty = false;
    } catch (error) {
      this.status.string = "存档失败，当前进度还在内存中：" + (error as Error).message;
      console.error(error);
    }
  }

  private resetInput(): void {
    this.keys.clear(); this.digging = false; this.stick = { x: 0, y: 0, id: -1 };
    if (this.expedition) this.expedition.velocity.x = this.expedition.velocity.y = 0;
  }

  private onHide(): void { this.resetInput(); this.persist(); }

  onDestroy(): void {
    input.off(Input.EventType.KEY_DOWN, this.keyDown, this);
    input.off(Input.EventType.KEY_UP, this.keyUp, this);
    game.off(Game.EVENT_HIDE, this.onHide, this);
    this.persist();
  }
}
