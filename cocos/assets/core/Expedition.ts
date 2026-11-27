import { getTile } from "./worldgen.ts";
import { hashCoords, rngFrom, SALT } from "./rng.ts";
import { stratumAt } from "./strata.ts";
import { WORDS_TIER1 } from "./vocab.ts";
import type { WordEntry } from "./vocab.ts";
import { ChestSession } from "./quiz.ts";
import { MasteryBook, pickChestWord } from "./mastery.ts";
import { getDiff, setDiff, placeStubborn, addItem, key } from "../data/player-data/save.ts";
import type { PlayerSlot } from "../data/player-data/PlayerStore.ts";
import {
  PLAYER_RADIUS, MAX_FRAME_SECONDS, NPC_TALK_RADIUS, WORD_DROP_CHANCE,
  WORD_PICKUP_RADIUS, WORD_PICKUP_COINS, MAX_WORD_DROPS, SHAFT_GRACE_SECONDS,
} from "../data/constants/GameRules.ts";
import { VILLAGE, villageBlocked } from "../data/external-files/Village.ts";

export interface MovementTuning { moveSpeed: number; acceleration: number; digSeconds: number }
export interface ResolvedTile { type: string; hardness: number; solid: boolean }
export interface ActiveQuiz {
  session: ChestSession; entry: WordEntry; x: number; y: number; z: number; stubborn: boolean;
}
export interface WorldEffect { kind: "dig" | "break" | "chest" | "pickup"; x: number; y: number; z: number; type: string }
export interface WordDrop { x: number; y: number; z: number; entry: WordEntry }

export class Expedition {
  slot: PlayerSlot;
  book: MasteryBook;
  facing = { x: 0, y: 1 };
  velocity = { x: 0, y: 0 };
  digProgress = 0;
  target: { x: number; y: number } | null = null;
  quiz: ActiveQuiz | null = null;
  dirty = false;
  message = "";
  effects: WorldEffect[] = [];
  // shortcut: 未拾取词卡沿用 Web 的临时掉落；需要退出保留时再升级存档格式。
  wordDrops: WordDrop[] = [];
  private digKey = "";
  private digEffectTimer = 0;
  private shaftGrace = 0;
  private lastTile = "";

  constructor(slot: PlayerSlot) {
    this.slot = slot;
    this.book = MasteryBook.deserialize(slot.game.mastery);
    this.resolveEmbed();
    const p = slot.position;
    this.lastTile = key(Math.floor(p.x), Math.floor(p.y), p.z);
  }

  tileAt(x: number, y: number, z = this.slot.position.z): ResolvedTile {
    if (villageBlocked(x, y, z)) return { type: "village", hardness: 0, solid: true };
    const diff = getDiff(this.slot.game, x, y, z);
    if (diff === "stubborn") return { type: diff, hardness: 2, solid: true };
    if (["dug", "pit", "shaft"].includes(diff ?? "")) {
      return { type: diff === "dug" ? "empty" : diff!, hardness: 0, solid: false };
    }
    const tile = getTile(this.slot.game.seed, x, y, z);
    return { type: tile.type, hardness: tile.hardness, solid: !["empty", "grass", "flower"].includes(tile.type) };
  }

  collides(x: number, y: number): boolean {
    for (let ty = Math.floor(y - PLAYER_RADIUS); ty <= Math.floor(y + PLAYER_RADIUS); ty++) {
      for (let tx = Math.floor(x - PLAYER_RADIUS); tx <= Math.floor(x + PLAYER_RADIUS); tx++) {
        if (this.tileAt(tx, ty).solid) return true;
      }
    }
    return false;
  }

  private resolveEmbed(): void {
    const p = this.slot.position;
    if (!this.collides(p.x, p.y)) return;
    for (let r = 0.15; r <= 2; r += 0.15) {
      for (let a = 0; a < 8; a++) {
        const x = p.x + Math.cos(a * Math.PI / 4) * r;
        const y = p.y + Math.sin(a * Math.PI / 4) * r;
        if (!this.collides(x, y)) { p.x = x; p.y = y; this.dirty = true; return; }
      }
    }
    throw new Error("存档角色位置被阻挡，已保留原档；需要修复出生位置");
  }

  tick(seconds: number, inputX: number, inputY: number, digging: boolean, tuning: MovementTuning): void {
    if (this.quiz) { this.velocity.x = this.velocity.y = 0; return; }
    const dt = Math.max(0, Math.min(seconds, MAX_FRAME_SECONDS));
    const length = Math.max(1, Math.hypot(inputX, inputY));
    const x = inputX / length, y = inputY / length;
    const p = this.slot.position;
    const oldX = p.x, oldY = p.y;
    this.velocity.x += (x * tuning.moveSpeed - this.velocity.x) * Math.min(1, dt * tuning.acceleration);
    this.velocity.y += (y * tuning.moveSpeed - this.velocity.y) * Math.min(1, dt * tuning.acceleration);
    if (Math.hypot(x, y) > 0.12) {
      this.facing.x = Math.abs(x) > 0.3 ? Math.sign(x) : 0;
      this.facing.y = Math.abs(y) > 0.3 ? Math.sign(y) : 0;
    }
    this.moveAxis(this.velocity.x * dt, true);
    this.moveAxis(this.velocity.y * dt, false);
    if (p.x !== oldX || p.y !== oldY) this.dirty = true;
    this.target = this.findTarget();
    if (digging && this.target) {
      this.facing = { x: this.target.x - Math.floor(p.x), y: this.target.y - Math.floor(p.y) };
      this.dig(dt, tuning.digSeconds);
    }
    else { this.digProgress = 0; this.digKey = ""; }
    this.shaftGrace = Math.max(0, this.shaftGrace - dt);
    const tileKey = key(Math.floor(p.x), Math.floor(p.y), p.z);
    if (tileKey !== this.lastTile && this.shaftGrace === 0 && this.tileAt(Math.floor(p.x), Math.floor(p.y)).type === "pit") this.descend();
    this.lastTile = key(Math.floor(p.x), Math.floor(p.y), p.z);
    this.collectWords();
  }

  canTalkToNpc(): boolean {
    const p = this.slot.position;
    return p.z === 0 && Math.hypot(p.x - VILLAGE.npc.x - 0.5, p.y - VILLAGE.npc.y - 0.5) < NPC_TALK_RADIUS;
  }

  private effect(kind: WorldEffect["kind"], x: number, y: number, type: string): void {
    if (this.effects.length >= 64) this.effects.shift();
    this.effects.push({ kind, x, y, z: this.slot.position.z, type });
  }

  private dropWord(x: number, y: number): void {
    const { seed } = this.slot.game, { z } = this.slot.position;
    if (hashCoords(seed, x, y, z, SALT.wordDrop) / 4294967296 >= WORD_DROP_CHANCE) return;
    const fresh = WORDS_TIER1.filter(word => this.book.get(word.word).status !== "mastered");
    const pool = fresh.length ? fresh : WORDS_TIER1;
    const entry = pool[hashCoords(seed, x, y, z, SALT.dropWord) % pool.length];
    this.wordDrops.push({ x, y, z, entry });
    if (this.wordDrops.length > MAX_WORD_DROPS) this.wordDrops.shift();
  }

  private collectWords(): void {
    const p = this.slot.position;
    for (let i = this.wordDrops.length - 1; i >= 0; i--) {
      const drop = this.wordDrops[i];
      if (drop.z !== p.z || Math.hypot(p.x - drop.x - 0.5, p.y - drop.y - 0.5) >= WORD_PICKUP_RADIUS) continue;
      this.wordDrops.splice(i, 1);
      if (!this.slot.game.seenWords.includes(drop.entry.word)) this.slot.game.seenWords.push(drop.entry.word);
      addItem(this.slot.game, "coin", WORD_PICKUP_COINS);
      this.effect("pickup", drop.x, drop.y, "chest");
      this.message = "词卡 · " + drop.entry.word + " = " + drop.entry.meaning + " · +" + WORD_PICKUP_COINS + " 金币";
      this.dirty = true;
    }
  }

  private moveAxis(amount: number, horizontal: boolean): void {
    const p = this.slot.position;
    const x = p.x + (horizontal ? amount : 0), y = p.y + (horizontal ? 0 : amount);
    if (!this.collides(x, y)) { p.x = x; p.y = y; return; }
    if (Math.abs(amount) < 0.001) return;
    const offset = Math.min(0.085, Math.abs(amount) + 0.02);
    const other = horizontal ? p.y : p.x;
    const towardCenter = other > Math.floor(other) + 0.5 ? -1 : 1;
    for (const sign of [towardCenter, -towardCenter]) {
      const slideX = x + (horizontal ? 0 : offset * sign);
      const slideY = y + (horizontal ? offset * sign : 0);
      if (!this.collides(slideX, slideY)) { p.x = slideX; p.y = slideY; return; }
    }
  }

  findTarget(): { x: number; y: number } | null {
    const p = this.slot.position;
    const directions = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    directions.sort((a, b) => (b[0] * this.facing.x + b[1] * this.facing.y) - (a[0] * this.facing.x + a[1] * this.facing.y));
    for (const [dx, dy] of directions) {
      const x = Math.floor(p.x) + dx, y = Math.floor(p.y) + dy;
      const tile = this.tileAt(x, y);
      if (tile.solid && tile.hardness > 0) return { x, y };
    }
    return null;
  }

  private dig(dt: number, secondsPerHardness: number): void {
    const t = this.target!;
    const p = this.slot.position;
    const tile = this.tileAt(t.x, t.y);
    const tileKey = key(t.x, t.y, p.z);
    if (this.digKey !== tileKey) { this.digProgress = 0; this.digEffectTimer = 0; this.digKey = tileKey; }
    if (tile.type === "chest" || tile.type === "stubborn") {
      const storedWord = this.slot.game.stubborn[tileKey];
      const random = rngFrom(hashCoords(this.slot.game.seed, t.x, t.y, p.z, SALT.quiz));
      const entry = tile.type === "stubborn"
        ? WORDS_TIER1.find(w => w.word === storedWord)
        : pickChestWord(WORDS_TIER1, this.book, p.z, random);
      if (!entry) { this.message = "这个词的数据尚未就绪"; return; }
      this.quiz = { entry, x: t.x, y: t.y, z: p.z, stubborn: tile.type === "stubborn", session: new ChestSession(entry, random() * 4294967296) };
      if (!this.slot.game.seenWords.includes(entry.word)) this.slot.game.seenWords.push(entry.word);
      this.dirty = true;
      this.digProgress = 0;
      return;
    }
    this.digProgress += dt / (Math.max(1, tile.hardness) * secondsPerHardness);
    this.digEffectTimer += dt;
    if (this.digEffectTimer >= 0.08) { this.digEffectTimer = 0; this.effect("dig", t.x, t.y, tile.type); }
    if (this.digProgress < 1) return;
    setDiff(this.slot.game, t.x, t.y, p.z, "dug");
    this.effect("break", t.x, t.y, tile.type);
    this.dropWord(t.x, t.y);
    const item = tile.type.startsWith("ore_") ? tile.type : tile.type === "tree" ? "wood" : tile.type === "surface_rock" ? "stone" : "";
    if (item) { addItem(this.slot.game, item, 1); this.message = "+1 " + item; }
    this.digProgress = 0;
    this.digKey = "";
    this.dirty = true;
  }

  answer(index: number): string {
    const quiz = this.quiz;
    if (!quiz) return "";
    const result = quiz.session.answer(index);
    if (!result.opened) return "再想想，还剩 " + (3 - result.attemptsUsed) + " 次机会";
    const hadMistake = result.attemptsUsed > 1;
    const outcome = this.book.recordAnswer(quiz.entry.word, result.correct, quiz.z, hadMistake);
    let reward = 0;
    if (!quiz.stubborn || result.correct) {
      setDiff(this.slot.game, quiz.x, quiz.y, quiz.z, "dug");
      delete this.slot.game.stubborn[key(quiz.x, quiz.y, quiz.z)];
      reward = Math.round((quiz.stubborn ? 15 : 10 * stratumAt(Math.max(1, quiz.z)).id) * result.rewardMultiplier);
      addItem(this.slot.game, "coin", reward);
      this.effect("chest", quiz.x, quiz.y, quiz.stubborn ? "stubborn" : "chest");
    }
    if ((!result.correct || hadMistake) && outcome.stubbornDepth) placeStubborn(this.slot.game, quiz.x, quiz.y, outcome.stubbornDepth, quiz.entry.word);
    this.message = quiz.entry.word + " = " + quiz.entry.meaning + " · +" + reward + " 金币";
    this.slot.game.mastery = this.book.serialize();
    this.quiz = null;
    this.dirty = true;
    return this.message;
  }

  descend(): void {
    if (this.quiz) return;
    const p = this.slot.position;
    const x = Math.floor(p.x), y = Math.floor(p.y);
    const below = this.tileAt(x, y, p.z + 1);
    if (["chest", "stubborn"].includes(below.type)) { this.message = "下方有封印，换一格下挖再从侧面探索"; return; }
    setDiff(this.slot.game, x, y, p.z, "pit");
    p.z++;
    if (below.type !== "pit") setDiff(this.slot.game, x, y, p.z, "shaft");
    p.x = x + 0.5; p.y = y + 0.5;
    this.slot.game.maxDepth = Math.max(this.slot.game.maxDepth, p.z);
    this.velocity.x = this.velocity.y = 0;
    this.target = null; this.digProgress = 0; this.digKey = "";
    this.message = "深入 " + p.z + "m · " + stratumAt(p.z).name;
    if (p.z % 10 === 0) {
      const word = WORDS_TIER1[(p.z / 10) % WORDS_TIER1.length];
      this.message += " · " + word.word + " = " + word.meaning;
    }
    this.shaftGrace = SHAFT_GRACE_SECONDS;
    this.lastTile = key(x, y, p.z);
    this.dirty = true;
  }

  ascend(): void {
    if (this.quiz) return;
    const p = this.slot.position;
    const x = Math.floor(p.x), y = Math.floor(p.y);
    if (p.z === 0 || (this.tileAt(x, y).type !== "shaft" && this.tileAt(x, y, p.z - 1).type !== "pit")) {
      this.message = "走回下挖的位置才能爬梯子"; return;
    }
    // 不允许旧档的梯子把角色送进上层实体。
    if (this.tileAt(x, y, p.z - 1).solid) { this.message = "上方出口被阻挡"; return; }
    p.z--; p.x = x + 0.5; p.y = y + 0.5;
    this.velocity.x = this.velocity.y = 0;
    this.target = null; this.digProgress = 0; this.digKey = "";
    this.message = "回到 " + p.z + "m";
    this.shaftGrace = SHAFT_GRACE_SECONDS;
    this.lastTile = key(x, y, p.z);
    this.dirty = true;
  }
}
