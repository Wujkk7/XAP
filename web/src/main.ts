// XAP web prototype — the MVP's playable Web preview (DESIGN.md).
// Rendering/input layer only: every rule (world generation, vocabulary,
// quiz, mastery, save) comes from ../../core. Nothing here re-implements core.

import { getTile } from "../../cocos/assets/core/worldgen.ts";
import type { Tile } from "../../cocos/assets/core/worldgen.ts";
import { stratumAt } from "../../cocos/assets/core/strata.ts";
import { WORDS_TIER1 } from "../../cocos/assets/core/vocab.ts";
import type { WordEntry } from "../../cocos/assets/core/vocab.ts";
import { ChestSession } from "../../cocos/assets/core/quiz.ts";
import { MasteryBook, pickChestWord } from "../../cocos/assets/core/mastery.ts";
import {
  newSave, getDiff, setDiff, placeStubborn, addItem,
  serializeSave, deserializeSave, key as saveKey,
} from "../../cocos/assets/data/player-data/save.ts";
import type { GameSave } from "../../cocos/assets/data/player-data/save.ts";
import { VILLAGE, villageBlocked } from "../../cocos/assets/data/external-files/Village.ts";
import { WORD_DROP_CHANCE, WORD_PICKUP_RADIUS, WORD_PICKUP_COINS, MAX_WORD_DROPS } from "../../cocos/assets/data/constants/GameRules.ts";
import { obliqueProjection, occlusionAlpha } from "../../cocos/assets/scripts/ObliqueProjection.ts";

// ---------- constants ----------
const TILE = 24; // 360px Web viewport matches Cocos 48px at 720px design width.
const PROJECTION = obliqueProjection(TILE, 25);
const ROW_H = PROJECTION.rowHeight;
const FACE = 7; // px fake height of a block's front face
const SAVE_KEY = "xap-save-v1";
const SEED_STRING = "xap-world-1";

// ---------- state ----------
let save: GameSave;
try {
  const raw = localStorage.getItem(SAVE_KEY);
  save = raw ? deserializeSave(raw) : newSave(SEED_STRING);
} catch {
  save = newSave(SEED_STRING);
}
if (!Array.isArray(save.seenWords)) save.seenWords = [];
const seed = save.seed;
let book = MasteryBook.deserialize(save.mastery);

const player = { x: 0.5, y: 0.5, z: 0, fx: 0, fy: 1, moving: false, vx: 0, vy: 0 };
const cam = { x: 0.5, y: 0.5 }; // smoothed camera (Stardew-style gentle follow)
let strideDist = 0; // distance travelled; drives the run cycle + footstep dust
let stridePhase = 0;
function snapCam() { cam.x = player.x; cam.y = player.y; }
let coins = save.inventory["coin"] ?? 0;
let digTarget: string | null = null;
let digProgress = 0;
let quizOpen = false;
let dexOpen = false;
function markSeen(word: string) {
  if (!save.seenWords.includes(word)) save.seenWords.push(word);
}

function persist() {
  save.mastery = book.serialize();
  save.inventory["coin"] = coins;
  save.maxDepth = Math.max(save.maxDepth, player.z);
  try { localStorage.setItem(SAVE_KEY, serializeSave(save)); } catch { /* storage full/blocked: play on */ }
}

// ---------- tile resolution (core world + player diffs) ----------
interface RTile { type: string; hardness: number; solid: boolean }

function tileAt(wx: number, wy: number, z: number): RTile {
  const d = getDiff(save, wx, wy, z);
  if (d === "dug") return { type: "empty", hardness: 0, solid: false };
  if (d === "pit") return { type: "pit", hardness: 0, solid: false };
  if (d === "shaft") return { type: "shaft", hardness: 0, solid: false };
  if (d === "stubborn") return { type: "stubborn", hardness: 2, solid: true };
  const t: Tile = getTile(seed, wx, wy, z);
  if (t.type === "empty" || t.type === "grass" || t.type === "flower") {
    return { type: t.type, hardness: 0, solid: false };
  }
  return { type: t.type, hardness: Math.max(1, t.hardness), solid: true };
}

// Village sample (hand-made, surface only): two houses + one NPC.
const NPC_POS = VILLAGE.npc;
function isSolid(wx: number, wy: number, z: number): boolean {
  return villageBlocked(wx, wy, z) || tileAt(wx, wy, z).solid;
}

// ---------- DOM ----------
const $ = (id: string) => document.getElementById(id)!;
const canvas = $("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
let W = 0, H = 0;
function resize() {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  W = r.width; H = r.height;
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);

let toastTimer = 0;
function toast(msg: string) {
  const el = $("toast");
  el.textContent = msg;
  el.style.opacity = "1";
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.style.opacity = "0"), 2100);
}

// ---------- input: joystick + buttons + keyboard ----------
const joy = { active: false, dx: 0, dy: 0 };
let digHeld = false;
const keys = new Set<string>();

function bindJoystick() {
  const base = $("joy"), stick = $("stick");
  const setStick = (dx: number, dy: number) => {
    stick.style.transform = `translate(calc(-50% + ${dx * 34}px), calc(-50% + ${dy * 34}px))`;
  };
  const handle = (e: PointerEvent, phase: "down" | "move" | "up") => {
    const r = base.getBoundingClientRect();
    if (phase === "up") {
      joy.active = false; joy.dx = 0; joy.dy = 0; setStick(0, 0);
      return;
    }
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = (e.clientX - cx) / (r.width / 2), dy = (e.clientY - cy) / (r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    joy.active = true; joy.dx = dx; joy.dy = dy; setStick(dx, dy);
  };
  base.addEventListener("pointerdown", (e) => { base.setPointerCapture(e.pointerId); handle(e, "down"); });
  base.addEventListener("pointermove", (e) => { if (joy.active) handle(e, "move"); });
  base.addEventListener("pointerup", (e) => handle(e, "up"));
  base.addEventListener("pointercancel", (e) => handle(e, "up"));
}

function bindButton(id: string, onDown: () => void, onUp?: () => void) {
  const el = $(id);
  el.addEventListener("pointerdown", (e) => { e.preventDefault(); onDown(); });
  if (onUp) {
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("pointerleave", onUp);
  }
}

window.addEventListener("keydown", (e) => {
  keys.add(e.key.toLowerCase());
  if (e.key === " ") { digHeld = true; e.preventDefault(); }
  if (e.key.toLowerCase() === "k" || e.key === "Enter") actButton();
});
window.addEventListener("keyup", (e) => {
  keys.delete(e.key.toLowerCase());
  if (e.key === " ") digHeld = false;
});

function inputVector(): { x: number; y: number } {
  let x = joy.dx, y = joy.dy;
  if (keys.has("a") || keys.has("arrowleft")) x -= 1;
  if (keys.has("d") || keys.has("arrowright")) x += 1;
  if (keys.has("w") || keys.has("arrowup")) y -= 1;
  if (keys.has("s") || keys.has("arrowdown")) y += 1;
  const len = Math.hypot(x, y);
  if (len > 1) { x /= len; y /= len; }
  return { x, y };
}

// ---------- digging / interaction ----------
const ORE_NAMES: Record<string, string> = {
  ore_copper: "copper 铜矿", ore_iron: "iron 铁矿", ore_gold: "gold 金矿",
  ore_diamond: "diamond 钻石", ore_starcore: "star core 星核",
};

function facingTile(): { x: number; y: number } {
  return { x: Math.floor(player.x + player.fx * 0.9), y: Math.floor(player.y + player.fy * 0.9) };
}

function findDigTarget(): { x: number; y: number } | null {
  // The tile that digging will hit: the faced adjacent tile if it is solid;
  // otherwise auto-turn to the nearest solid neighbour so the player never
  // has to guess which block is being dug (feedback 2026-10-27).
  const px = Math.floor(player.x), py = Math.floor(player.y);
  const order: Array<[number, number]> = [];
  const base: Array<[number, number]> = [
    [0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];
  const start = base.findIndex(([dx, dy]) => dx === player.fx && dy === player.fy);
  for (let i = 0; i < base.length; i++) {
    const d = base[(start + i + base.length) % base.length];
    order.push(d);
    order.push(base[(start - i + base.length * 2) % base.length]);
  }
  const seen = new Set<string>();
  for (const [dx, dy] of order) {
    const k = dx + "," + dy;
    if (seen.has(k)) continue;
    seen.add(k);
    const tx = px + dx, ty = py + dy;
    if (villageBlocked(tx, ty, player.z)) continue;
    if (tileAt(tx, ty, player.z).solid) {
      if (dx !== player.fx || dy !== player.fy) { player.fx = dx; player.fy = dy; }
      return { x: tx, y: ty };
    }
  }
  return null;
}

function tryDig(dt: number) {
  if (quizOpen) return;
  const t = findDigTarget();
  if (!t) { digTarget = null; digProgress = 0; return; }
  const tile = tileAt(t.x, t.y, player.z);
  if (tile.type === "chest") { openChestQuiz(t.x, t.y); return; }
  if (tile.type === "stubborn") { openStubbornQuiz(t.x, t.y); return; }

  const k = saveKey(t.x, t.y, player.z);
  if (digTarget !== k) { digTarget = k; digProgress = 0; digParticleTimer = 0; }
  digProgress += dt / (tile.hardness * 0.42);
  digParticleTimer += dt;
  if (digParticleTimer > 0.07) { digParticleTimer = 0; spawnDebris(t.x, t.y, tile.type, 2, false); }
  if (digProgress < 1) return;
  spawnDebris(t.x, t.y, tile.type, 14, true);
  maybeSpawnDrop(t.x, t.y, tile.type);

  setDiff(save, t.x, t.y, player.z, "dug");
  digTarget = null; digProgress = 0;
  if (tile.type.startsWith("ore_")) {
    addItem(save, tile.type, 1);
    toast("+1 " + (ORE_NAMES[tile.type] ?? tile.type));
  } else if (tile.type === "tree") {
    addItem(save, "wood", 1);
    toast("+1 wood 木头 · tree = 树");
  } else if (tile.type === "surface_rock") {
    addItem(save, "stone", 1);
    toast("+1 stone 石头");
  }
  persist();
}

function goDown(px: number, py: number) {
  // Land one slice below (px,py): clear an ordinary-solid landing tile so the
  // player never materialises inside rock (that was the stuck + clipping bug).
  player.z += 1;
  const landing = tileAt(px, py, player.z);
  if (landing.solid && landing.type !== "chest" && landing.type !== "stubborn") {
    setDiff(save, px, py, player.z, "dug");
    spawnDebris(px, py, landing.type, 12, true);
  }
  if (tileAt(px, py, player.z).type === "empty") setDiff(save, px, py, player.z, "shaft");
  // Land centred on the shaft column so the body box fits the cleared tile
  // exactly; next to a chest/stone landing, push out immediately instead.
  if (!tileAt(px, py, player.z).solid) { player.x = px + 0.5; player.y = py + 0.5; }
  else resolveEmbed();
  ascendGrace = 0.9;
  snapCam();
  if (player.z === 31) toast("进入浅岩层 · 单词变难了");
  else if (player.z === 101) toast("进入岩核层");
  else if (player.z % 10 === 0) {
    const w = WORDS_TIER1[(player.z / 10) % WORDS_TIER1.length];
    toast("下到 " + player.z + "m · " + w.word + " " + w.meaning);
  } else toast("下到 " + player.z + "m");
}

function descendOrAct() {
  if (quizOpen) return;
  // NPC first when close.
  const dNpc = Math.hypot(player.x - (NPC_POS.x + 0.5), player.y - (NPC_POS.y + 0.5));
  if (player.z === 0 && dNpc < 1.7) { talkToNpc(); return; }

  const px = Math.floor(player.x), py = Math.floor(player.y);
  // Climb back up: you are at the bottom of a shaft (marked "shaft"), or the
  // tile directly above you is a pit mouth (shafts dug before shaft marks
  // existed — old saves land on plain "dug" tiles and must still get out).
  const canAscend = player.z > 0 && (getDiff(save, px, py, player.z) === "shaft" || tileAt(px, py, player.z - 1).type === "pit");
  if (canAscend) {
    player.z -= 1;
    ascendGrace = 0.9;
    snapCam();
    toast("回到 " + player.z + "m");
    persist();
    return;
  }
  // Dig down: leave a pit behind, land in the slice below.
  setDiff(save, px, py, player.z, "pit");
  goDown(px, py);
  persist();
}
function actButton() { descendOrAct(); }

// ---------- NPC (village sample) ----------
let npcIdx = 0;
function talkToNpc() {
  const line = VILLAGE.dialogue[npcIdx++ % VILLAGE.dialogue.length];
  $("npcName").textContent = VILLAGE.npc.name;
  $("npcText").innerHTML = '<span class="en"></span><br><span class="zh"></span>';
  ($("npcText").querySelector(".en") as HTMLElement).textContent = line.en;
  ($("npcText").querySelector(".zh") as HTMLElement).textContent = line.zh;
  $("npcSheet").classList.add("open");
}

// ---------- chest & stubborn-stone quizzes ----------
let activeQuiz: {
  session: ChestSession;
  entry: WordEntry;
  kind: "chest" | "stubborn";
  x: number; y: number; z: number;
  everCorrect: boolean;
} | null = null;

function wordForChest(): WordEntry {
  const picked = pickChestWord(WORDS_TIER1, book, Math.max(1, player.z), Math.random);
  return picked ?? WORDS_TIER1[0];
}

function openChestQuiz(x: number, y: number) {
  const entry = wordForChest();
  startQuiz(entry, "chest", x, y);
}
function openStubbornQuiz(x: number, y: number) {
  const word = save.stubborn[saveKey(x, y, player.z)];
  const entry = WORDS_TIER1.find((w) => w.word === word) ?? wordForChest();
  startQuiz(entry, "stubborn", x, y);
}

function startQuiz(entry: WordEntry, kind: "chest" | "stubborn", x: number, y: number) {
  quizOpen = true;
  markSeen(entry.word);
  const session = new ChestSession(entry, (x * 73856093) ^ (y * 19349663) ^ (player.z * 83492791));
  activeQuiz = { session, entry, kind, x, y, z: player.z, everCorrect: false };
  $("qKind").textContent = kind === "chest" ? "宝箱 · 选对意思开箱" : "顽固石 · 这个词又回来了";
  $("qWord").textContent = entry.word;
  $("qExample").textContent = entry.example;
  $("qFeedback").textContent = "";
  const box = $("qOpts");
  box.innerHTML = "";
  session.question.options.forEach((opt, i) => {
    const b = document.createElement("button");
    b.className = "opt";
    b.textContent = opt;
    b.addEventListener("click", () => answerQuiz(i, b));
    box.appendChild(b);
  });
  $("quizSheet").classList.add("open");
}

function answerQuiz(i: number, btn: HTMLButtonElement) {
  if (!activeQuiz || activeQuiz.session.isOpen) return;
  const q = activeQuiz;
  const res = q.session.answer(i);
  btn.classList.add(res.correct ? "right" : "wrong");
  if (res.correct) q.everCorrect = true;

  if (!res.opened) {
    $("qFeedback").textContent = "不对，再想想 — 还剩 " + (3 - res.attemptsUsed) + " 次机会";
    return;
  }
  // Chest/stone resolved: settle mastery exactly once, on the final outcome.
  const outcome = book.recordAnswer(q.entry.word, q.everCorrect, q.z);
  let reward = 0;
  if (q.kind === "chest") {
    reward = Math.round(10 * Math.max(1, stratumAt(Math.max(1, q.z)).id) * res.rewardMultiplier);
    setDiff(save, q.x, q.y, q.z, "dug");
    spawnDebris(q.x, q.y, "chest", 16, true);
  } else if (q.everCorrect) {
    reward = Math.round(15 * res.rewardMultiplier);
    setDiff(save, q.x, q.y, q.z, "dug");
    spawnDebris(q.x, q.y, "stubborn", 14, true);
    delete save.stubborn[saveKey(q.x, q.y, q.z)];
  }
  coins += reward;
  let msg = q.everCorrect
    ? "开箱！+" + reward + " 🪙 · " + q.entry.word + " = " + q.entry.meaning
    : "箱子开了（保底）+" + reward + " 🪙 · " + q.entry.word + " = " + q.entry.meaning + "，记住它";
  if (!q.everCorrect && outcome.stubbornDepth) {
    const px = Math.floor(player.x), py = Math.floor(player.y);
    placeStubborn(save, px, py, outcome.stubbornDepth, q.entry.word);
    msg += " — 它埋到了 " + outcome.stubbornDepth + "m 深处";
  }
  if (outcome.becameMastered) msg += " · 已掌握 ⭐";
  $("qFeedback").textContent = msg;
  persist();
  window.setTimeout(() => {
    $("quizSheet").classList.remove("open");
    quizOpen = false;
    activeQuiz = null;
    toast(msg);
  }, 1100);
}

// ---------- word drops & the word dex (learning presence in the core loop) ----------
interface WordDrop { x: number; y: number; z: number; entry: WordEntry; }
const drops: WordDrop[] = [];

function pickDropWord(): WordEntry {
  const fresh = WORDS_TIER1.filter((w) => book.get(w.word).status !== "mastered");
  const pool = fresh.length ? fresh : WORDS_TIER1;
  return pool[(Math.random() * pool.length) | 0];
}
function maybeSpawnDrop(x: number, y: number, type: string) {
  if (type === "chest" || type === "stubborn") return;
  if (Math.random() > WORD_DROP_CHANCE) return;
  drops.push({ x, y, z: player.z, entry: pickDropWord() });
  if (drops.length > MAX_WORD_DROPS) drops.shift();
}
function collectDrops() {
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    if (d.z !== player.z) continue;
    if (Math.hypot(player.x - (d.x + 0.5), player.y - (d.y + 0.5)) < WORD_PICKUP_RADIUS) {
      drops.splice(i, 1);
      markSeen(d.entry.word);
      coins += WORD_PICKUP_COINS;
      toast("词卡 +" + d.entry.word + " · " + d.entry.meaning + "（图鉴 " + save.seenWords.length + "/" + WORDS_TIER1.length + "）");
      persist();
    }
  }
}
function drawDrops(now: number) {
  for (const d of drops) {
    if (d.z !== player.z) continue;
    const s = { sx: W / 2 + (d.x + 0.5 - cam.x) * TILE, sy: H * 0.52 + (d.y + 0.5 - cam.y) * ROW_H };
    const bobY = Math.sin(now / 280 + d.x * 1.7 + d.y) * 2.5;
    ctx.save();
    ctx.translate(s.sx, s.sy - 6 + bobY);
    ctx.fillStyle = "rgba(24,16,6,.92)";
    ctx.strokeStyle = "#ffd94d";
    ctx.lineWidth = 1.5;
    const wpx = Math.max(30, d.entry.word.length * 7.5 + 12);
    ctx.beginPath();
    ctx.roundRect(-wpx / 2, -10, wpx, 20, 6);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#ffe9bd";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(d.entry.word, 0, 4);
    ctx.restore();
  }
}
function renderDex() {
  const list = $("dexList");
  list.innerHTML = "";
  for (const w of WORDS_TIER1) {
    const seen = save.seenWords.includes(w.word);
    const st = book.get(w.word).status;
    const row = document.createElement("div");
    row.className = "dexRow" + (seen ? "" : " locked");
    const wEl = document.createElement("span"); wEl.className = "w"; wEl.textContent = seen ? w.word : "？？？";
    const mEl = document.createElement("span"); mEl.className = "m"; mEl.textContent = seen ? w.meaning + " · " + w.example : "还没收集到 · 挖宝箱、捡词卡";
    const sEl = document.createElement("span"); sEl.className = "st"; sEl.textContent = st === "mastered" ? "⭐ 已掌握" : seen ? "学习中" : "未收集";
    row.appendChild(wEl); row.appendChild(mEl); row.appendChild(sEl);
    list.appendChild(row);
  }
}

// ---------- debris particles (Minecraft-style block break feedback) ----------
interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number; }
const particles: Particle[] = [];
let ascendGrace = 0; // seconds after a level change during which pit walk-in is ignored
let lastTileKey = "";
let digParticleTimer = 0;
let stepTimer = 0;

const DEBRIS_COLORS: Record<string, string[]> = {
  dirt: ["#8a613c", "#a0764a", "#6e4c2c"],
  sandstone: ["#c9b083", "#b89a68", "#dcc493"],
  rock: ["#8d8578", "#767065", "#a39a89"],
  granite: ["#7d7468", "#94897a", "#655c50"],
  obsidian: ["#4a4258", "#5d5470", "#38324a"],
  tree: ["#6e4c2c", "#4e7d3a", "#5d9146"],
  surface_rock: ["#8f8a80", "#76716a", "#b5b0a4"],
  chest: ["#a5722f", "#ffd94d", "#7d5222"],
  stubborn: ["#8d8578", "#c03a5e", "#767065"],
};
const ORE_GEMS: Record<string, string> = {
  ore_copper: "#d98a4a", ore_iron: "#e8e4da", ore_gold: "#ffd94d",
  ore_diamond: "#7fd4ff", ore_starcore: "#b48cff",
};
function debrisColors(type: string): string[] {
  if (type.startsWith("ore_")) return ["#8d8578", "#767065", ORE_GEMS[type] ?? "#ffffff"];
  return DEBRIS_COLORS[type] ?? DEBRIS_COLORS.rock;
}
function spawnDebris(wx: number, wy: number, type: string, n: number, burst: boolean) {
  const cols = debrisColors(type);
  for (let i = 0; i < n; i++) {
    particles.push({
      x: wx + 0.2 + Math.random() * 0.6,
      y: wy + 0.25 + Math.random() * 0.55,
      vx: (Math.random() - 0.5) * (burst ? 2.6 : 1.3),
      vy: -(0.7 + Math.random() * (burst ? 2.4 : 1.3)),
      life: 0,
      maxLife: 0.45 + Math.random() * 0.45,
      color: cols[(Math.random() * cols.length) | 0],
      size: 2 + Math.random() * (burst ? 4 : 3),
    });
  }
  if (particles.length > 260) particles.splice(0, particles.length - 260);
}
function updateParticles(dt: number) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const pt = particles[i];
    pt.life += dt;
    if (pt.life >= pt.maxLife) { particles.splice(i, 1); continue; }
    pt.vy += 7 * dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
  }
}
function drawParticles() {
  for (const pt of particles) {
    const sx = W / 2 + (pt.x - cam.x) * TILE;
    const sy = H * 0.52 + (pt.y - cam.y) * ROW_H;
    ctx.globalAlpha = Math.max(0, 1 - pt.life / pt.maxLife);
    ctx.fillStyle = pt.color;
    ctx.fillRect(sx - pt.size / 2, sy - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
}

// ---------- movement ----------
const PLAYER_HALF = 0.30; // collision half-extent; the sprite is drawn ~0.62 tiles wide to match

/** Push the player out of any solid he ended up inside (bad landing, a
 *  reburied stone, ...). Last resort: dig out the tile under him. */
function resolveEmbed() {
  if (!boxCollides(player.x, player.y, player.z)) return;
  for (let r = 0.15; r <= 1.6; r += 0.15) {
    for (let a = 0; a < 8; a++) {
      const nx = player.x + Math.cos((a * Math.PI) / 4) * r;
      const ny = player.y + Math.sin((a * Math.PI) / 4) * r;
      if (!boxCollides(nx, ny, player.z)) { player.x = nx; player.y = ny; return; }
    }
  }
  const px = Math.floor(player.x), py = Math.floor(player.y);
  const t = tileAt(px, py, player.z);
  if (t.solid && t.type !== "chest" && t.type !== "stubborn") setDiff(save, px, py, player.z, "dug");
}

function boxCollides(cx: number, cy: number, z: number): boolean {
  const h = PLAYER_HALF - 0.02;
  const x0 = Math.floor(cx - h), x1 = Math.floor(cx + h);
  const y0 = Math.floor(cy - h), y1 = Math.floor(cy + h);
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++)
      if (isSolid(tx, ty, z)) return true;
  return false;
}

function update(dt: number) {
  if (quizOpen || dexOpen) { player.moving = false; return; }
  resolveEmbed();
  const v = inputVector();
  // Velocity with exponential approach: soft starts/stops instead of the
  // instant on/off that made running feel robotic.
  const MAXS = 4.0, ACC = 11;
  player.vx += (v.x * MAXS - player.vx) * Math.min(1, dt * ACC);
  player.vy += (v.y * MAXS - player.vy) * Math.min(1, dt * ACC);
  if (Math.hypot(player.vx, player.vy) < 0.03 && Math.hypot(v.x, v.y) < 0.12) { player.vx = 0; player.vy = 0; }
  player.moving = Math.hypot(v.x, v.y) > 0.12;
  if (player.moving) {
    player.fx = Math.abs(v.x) > 0.3 ? Math.sign(v.x) : 0;
    player.fy = Math.abs(v.y) > 0.3 ? Math.sign(v.y) : (player.fx === 0 ? player.fy : 0);
    if (player.fx === 0 && player.fy === 0) player.fy = 1;
  }
  const ox = player.x, oy = player.y;
  const nx = player.x + player.vx * dt;
  const ny = player.y + player.vy * dt;
  // full-AABB, axis separated, with a corner assist: when an axis is blocked
  // by a hair, slide along the wall toward the opening instead of sticking.
  if (!boxCollides(nx, player.y, player.z)) player.x = nx;
  else if (Math.abs(player.vx) > 0.5) {
    const sl = Math.min(0.085, Math.abs(player.vx * dt) + 0.02);
    const dir = player.y - (Math.floor(player.y) + 0.5) > 0 ? -1 : 1;
    if (!boxCollides(nx, player.y + dir * sl, player.z)) { player.x = nx; player.y += dir * sl; }
    else if (!boxCollides(nx, player.y - dir * sl, player.z)) { player.x = nx; player.y -= dir * sl; }
  }
  if (!boxCollides(player.x, ny, player.z)) player.y = ny;
  else if (Math.abs(player.vy) > 0.5) {
    const sl = Math.min(0.085, Math.abs(player.vy * dt) + 0.02);
    const dir = player.x - (Math.floor(player.x) + 0.5) > 0 ? -1 : 1;
    if (!boxCollides(player.x + dir * sl, ny, player.z)) { player.y = ny; player.x += dir * sl; }
    else if (!boxCollides(player.x - dir * sl, ny, player.z)) { player.y = ny; player.x -= dir * sl; }
  }
  const movedDist = Math.hypot(player.x - ox, player.y - oy);
  strideDist += movedDist;
  stridePhase = (strideDist / 0.38) * Math.PI;
  if (movedDist > 0.001) {
    stepTimer += movedDist;
    if (stepTimer > 0.38) {
      stepTimer = 0;
      particles.push({
        x: player.x + (Math.random() - 0.5) * 0.34, y: player.y + 0.34,
        vx: (Math.random() - 0.5) * 0.5, vy: -0.35 - Math.random() * 0.4,
        life: 0, maxLife: 0.32 + Math.random() * 0.2,
        color: player.z === 0 ? "#a9c48a" : "#9a8a72", size: 2 + Math.random() * 2,
      });
    }
  }
  if (digHeld) tryDig(dt);
  else { digTarget = null; digProgress = 0; }

  // Walking into a pit drops you one slice (the pit is a real hole now, not
  // just a button action). The grace window + tile-change trigger stop the
  // bounce you would get right after climbing back up onto the pit tile.
  ascendGrace = Math.max(0, ascendGrace - dt);
  const px = Math.floor(player.x), py = Math.floor(player.y);
  const tk = px + "," + py + "," + player.z;
  if (tk !== lastTileKey) {
    const entered = lastTileKey !== "";
    lastTileKey = tk;
    if (entered && ascendGrace <= 0 && tileAt(px, py, player.z).type === "pit") {
      goDown(px, py);
      lastTileKey = px + "," + py + "," + player.z;
      persist();
    }
  }
  collectDrops();
  updateParticles(dt);
}

// ---------- rendering (art direction: the reference boards in assets/reference) ----------
import { SPRITES } from "./sprites.ts";
import { hashCoords } from "../../cocos/assets/core/rng.ts";

const IMG: Record<string, HTMLImageElement> = {};
function loadSprites() {
  if (typeof Image === "undefined") return;
  for (const [name, uri] of Object.entries(SPRITES)) {
    const im = new Image();
    im.src = uri;
    IMG[name] = im;
  }
}
function imgReady(name: string): boolean {
  const im = IMG[name];
  return !!im && im.complete && im.naturalWidth > 0;
}
/** Draw a sprite centered at cx, standing on `bottom`, scaled to width w. */
/** Alpha for an entity sprite when the player passes behind it (north of
 *  it): continuous with float distance so crossing rows never pops, and the
 *  player is never fully swallowed by pixels (the “被图层挡住” complaint). */
function behindAlpha(wx: number, wy: number, name: string, width: number): number {
  const im = IMG[name];
  return occlusionAlpha((wx + 0.5 - player.x) * TILE, (wy + 0.5 - player.y) * ROW_H,
    width, width * im.naturalHeight / im.naturalWidth * PROJECTION.uprightScale, TILE * 0.62, TILE * PROJECTION.uprightScale);
}

function drawSprite(name: string, cx: number, bottom: number, w: number, flip = false) {
  const im = IMG[name];
  const h = (w * im.naturalHeight) / im.naturalWidth * PROJECTION.uprightScale;
  ctx.save();
  if (flip) {
    ctx.translate(cx, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(im, -w / 2, bottom - h, w, h);
  } else {
    ctx.drawImage(im, cx - w / 2, bottom - h, w, h);
  }
  ctx.restore();
}

const COLORS: Record<string, [string, string]> = {
  grass: ["#69a84f", "#55853e"], flower: ["#74b455", "#55853e"], tree: ["#69a84f", "#55853e"],
  surface_rock: ["#9a958c", "#6f6a61"],
  dirt: ["#8a5a33", "#6b4423"], sandstone: ["#c2a165", "#9a7f4e"], granite: ["#8d8d94", "#5f5f66"],
  basalt: ["#4e4c59", "#35343f"], obsidian: ["#332a47", "#1e1830"],
  ore_copper: ["#8a5a33", "#6b4423"], ore_iron: ["#c2a165", "#9a7f4e"],
  ore_gold: ["#8d8d94", "#5f5f66"], ore_diamond: ["#4e4c59", "#35343f"], ore_starcore: ["#332a47", "#1e1830"],
  chest: ["#a06a2c", "#774d1d"], stubborn: ["#7a3b2e", "#57281e"], pit: ["#17110b", "#17110b"],
  empty: ["#241a10", "#241a10"],
};
const ORE_NODE: Record<string, string> = {
  ore_copper: "node_copper", ore_iron: "node_iron", ore_gold: "node_gold",
  ore_diamond: "node_sapphire", ore_starcore: "node_starcore",
};
const STRATUM_TINT: Record<number, string> = {
  1: "rgba(0,0,0,0)", 2: "rgba(196,164,101,0.26)", 3: "rgba(150,150,160,0.30)",
  4: "rgba(70,60,100,0.36)", 5: "rgba(40,25,70,0.44)",
};

// Village dressing (surface only): dirt paths + a small farm plot west of spawn.
function isPathTile(wx: number, wy: number): boolean {
  return VILLAGE.paths.some(path => wx >= path.minX && wx <= path.maxX && wy >= path.minY && wy <= path.maxY);
}
function isFarmTile(wx: number, wy: number): boolean {
  const farm = VILLAGE.farm;
  return wx >= farm.minX && wx <= farm.maxX && wy >= farm.minY && wy <= farm.maxY;
}

function drawGroundSprite(name: string, sx: number, sy: number) {
  // slight overdraw hides seams between tiles
  ctx.drawImage(IMG[name], sx - 1, sy - 1, TILE + 2, ROW_H + 2);
}
function flatTile(sx: number, sy: number, type: string) {
  const [top, front] = COLORS[type] ?? COLORS.dirt;
  ctx.fillStyle = front;
  ctx.fillRect(sx, sy + ROW_H - 4, TILE - 1, FACE);
  ctx.fillStyle = top;
  ctx.fillRect(sx, sy, TILE - 1, ROW_H - 1);
}

const FLAT_GROUND: Record<string, string> = {
  tile_grass: "#69a84f", tile_grass_tall: "#5c9a44", tile_grass_flower: "#74b455",
  tile_sand: "#d9bd85", tile_plowed: "#7a5230", tile_dirt: "#9a6a3d", tile_rock: "#8d8578",
};
/** Procedural ground used until the original art pass arrives (and as the
 *  fallback if a sprite fails to load). */
function flatGround(sx: number, sy: number, ground: string, wx: number, wy: number) {
  ctx.fillStyle = FLAT_GROUND[ground] ?? "#69a84f";
  ctx.fillRect(sx, sy, TILE - 1, ROW_H - 1);
  const h = hashCoords(seed, wx, wy, 0, 23) % 4;
  ctx.fillStyle = "rgba(0,0,0,0.10)";
  ctx.fillRect(sx + 6 + h * 7, sy + 8, 5, 3);
  ctx.fillRect(sx + 24 - h * 3, sy + 24, 5, 3);
  if (ground === "tile_plowed") {
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    for (let r = 0; r < 3; r++) ctx.fillRect(sx + 3, sy + 8 + r * 11, TILE - 7, 3);
  }
  if (ground === "tile_grass_flower") {
    ctx.fillStyle = "#ff8fb3";
    ctx.fillRect(sx + 10, sy + 10, 4, 4); ctx.fillRect(sx + 30, sy + 22, 4, 4);
    ctx.fillStyle = "#ffd166";
    ctx.fillRect(sx + 21, sy + 16, 4, 4);
  }
}

function grassVariant(wx: number, wy: number): string {
  const r = hashCoords(seed, wx, wy, 0, 21) % 100;
  return r < 55 ? "tile_grass" : r < 82 ? "tile_grass_tall" : "tile_grass_flower";
}

function drawTile(sx: number, sy: number, wx: number, wy: number) {
  const t = tileAt(wx, wy, player.z);

  if (player.z === 0) {
    // ----- surface -----
    // One unified grass base everywhere; tall/flower variants are small
    // decals on top, so the ground reads as one flat plain you can run on
    // (full-tile texture swaps had visible patch seams).
    let ground = "tile_grass";
    if (isFarmTile(wx, wy)) ground = "tile_plowed";
    else if (isPathTile(wx, wy)) ground = "tile_sand";
    if (imgReady(ground)) drawGroundSprite(ground, sx, sy);
    else flatGround(sx, sy, ground, wx, wy);
    if (ground === "tile_grass") {
      const gv = grassVariant(wx, wy);
      const decal = t.type === "flower" ? "tile_grass_flower" : gv !== "tile_grass" ? gv : null;
      if (decal && imgReady(decal)) {
        const dw = TILE * 0.62, dh = ROW_H * 0.62;
        ctx.globalAlpha = 0.95;
        ctx.drawImage(IMG[decal], sx + TILE - dw - 2, sy + ROW_H - dh - 1, dw, dh);
        ctx.globalAlpha = 1;
      }
    }
    if (t.type === "empty") { // a dug-out patch on the surface shows bare dirt
      if (imgReady("tile_dirt")) drawGroundSprite("tile_dirt", sx, sy);
    }
    if (t.type === "pit") {
      // The hole you dug on the surface: dark mouth, rim light, and the top
      // of the ladder. Walk into it to drop to the slice below.
      ctx.fillStyle = "#2a1a0c";
      ctx.beginPath(); ctx.ellipse(sx + TILE / 2, sy + ROW_H / 2 + 2, TILE * 0.36, ROW_H * 0.34, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#0f0803";
      ctx.beginPath(); ctx.ellipse(sx + TILE / 2, sy + ROW_H / 2 + 3, TILE * 0.27, ROW_H * 0.25, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(245,205,135,.6)";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(sx + TILE / 2, sy + ROW_H / 2 + 2, TILE * 0.36, ROW_H * 0.34, 0, Math.PI, Math.PI * 1.9); ctx.stroke();
      ctx.strokeStyle = "#a9743f";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx + TILE / 2 - 4, sy + ROW_H / 2 + 1); ctx.lineTo(sx + TILE / 2 - 4, sy + ROW_H / 2 + 9);
      ctx.moveTo(sx + TILE / 2 + 4, sy + ROW_H / 2 + 1); ctx.lineTo(sx + TILE / 2 + 4, sy + ROW_H / 2 + 9);
      ctx.moveTo(sx + TILE / 2 - 4, sy + ROW_H / 2 + 5); ctx.lineTo(sx + TILE / 2 + 4, sy + ROW_H / 2 + 5);
      ctx.stroke();
    }
    if (t.type === "tree") {
      const v = hashCoords(seed, wx, wy, 0, 22) % 3;
      const name = v === 0 ? "tree_oak" : v === 1 ? "tree_pine" : "tree_apple";
      if (imgReady(name)) {
        ctx.globalAlpha = behindAlpha(wx, wy, name, TILE * 1.8);
        drawSprite(name, sx + TILE / 2, sy + ROW_H + 8, TILE * 1.8);
        ctx.globalAlpha = 1;
      }
      else {
        ctx.fillStyle = "#6b4a26";
        ctx.fillRect(sx + TILE / 2 - 3, sy + 18, 6, 14);
        ctx.fillStyle = "#2f7a33";
        ctx.beginPath();
        ctx.arc(sx + TILE / 2, sy + 14, 15, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (t.type === "surface_rock") {
      if (imgReady("node_rock")) {
        ctx.globalAlpha = behindAlpha(wx, wy, "node_rock", TILE * 1.12);
        drawSprite("node_rock", sx + TILE / 2, sy + ROW_H + 5, TILE * 1.12);
        ctx.globalAlpha = 1;
      }
      else {
        ctx.fillStyle = "#8f8a80";
        ctx.beginPath();
        ctx.arc(sx + 16, sy + 26, 10, 0, Math.PI * 2);
        ctx.arc(sx + 30, sy + 24, 12, 0, Math.PI * 2);
        ctx.arc(sx + 23, sy + 16, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#b5b0a4";
        ctx.beginPath();
        ctx.arc(sx + 20, sy + 18, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return;
  }

  // ----- underground -----
  const stratum = stratumAt(player.z);
  const baseName = stratum.id === 1 ? "tile_dirt" : "tile_rock";
  const walkable = t.type === "empty" || t.type === "pit" || t.type === "shaft";
  if (imgReady(baseName)) drawGroundSprite(baseName, sx, sy);
  else flatTile(sx, sy, t.type);
  ctx.fillStyle = STRATUM_TINT[stratum.id];
  ctx.fillRect(sx, sy, TILE - 1, ROW_H - 1);
  if (walkable) {
    ctx.fillStyle = "rgba(24,13,5,0.45)"; // dug-out floor reads darker
    ctx.fillRect(sx, sy, TILE - 1, ROW_H - 1);
  }
  if (t.type === "pit") {
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(sx + TILE / 2, sy + ROW_H / 2, 15, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c9a86a";
    ctx.fillRect(sx + TILE / 2 - 2, sy + 4, 4, ROW_H - 8);
  } else if (t.type === "shaft") {
    // Bottom of a shaft: light spilling from the opening above + the ladder.
    ctx.fillStyle = "rgba(255,240,200,0.14)";
    ctx.beginPath(); ctx.ellipse(sx + TILE / 2, sy + 8, 13, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#c9a86a";
    ctx.fillRect(sx + TILE / 2 - 7, sy + 2, 3, ROW_H - 4);
    ctx.fillRect(sx + TILE / 2 + 4, sy + 2, 3, ROW_H - 4);
    ctx.fillRect(sx + TILE / 2 - 7, sy + 11, 14, 3);
    ctx.fillRect(sx + TILE / 2 - 7, sy + 21, 14, 3);
  } else if (t.type === "chest") {
    ctx.fillStyle = "#7a4d1c";
    ctx.fillRect(sx + 5, sy + 8, TILE - 11, 22);
    ctx.fillStyle = "#a8722a";
    ctx.fillRect(sx + 5, sy + 8, TILE - 11, 8);
    ctx.fillStyle = "#ffd94d";
    ctx.fillRect(sx + 5, sy + 17, TILE - 11, 4);
    ctx.fillRect(sx + TILE / 2 - 3, sy + 8, 6, 22);
    ctx.fillStyle = "#5a3a10";
    ctx.fillRect(sx + TILE / 2 - 2, sy + 18, 4, 5);
  } else if (t.type === "stubborn") {
    if (imgReady("node_ruby")) {
      ctx.globalAlpha = behindAlpha(wx, wy, "node_ruby", TILE * 1.08);
      drawSprite("node_ruby", sx + TILE / 2, sy + ROW_H + 4, TILE * 1.08);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = "#ffe9bd";
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("!", sx + TILE / 2, sy + 16);
  } else if (ORE_NODE[t.type]) {
    const name = ORE_NODE[t.type];
    if (imgReady(name)) {
      ctx.globalAlpha = behindAlpha(wx, wy, name, TILE * 1.12);
      drawSprite(name, sx + TILE / 2, sy + ROW_H + 5, TILE * 1.12);
      ctx.globalAlpha = 1;
    }
    else {
      ctx.fillStyle = "#e8e8e8";
      ctx.fillRect(sx + 12, sy + 12, 8, 7);
      ctx.fillRect(sx + 26, sy + 22, 8, 7);
    }
  }
  // dig cracks on the current target
  const t2 = facingTile();
  if (digTarget === saveKey(t2.x, t2.y, player.z) && wx === t2.x && wy === t2.y && digProgress > 0) {
    ctx.strokeStyle = "rgba(0,0,0,.65)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const p = digProgress;
    ctx.moveTo(sx + 8, sy + 8); ctx.lineTo(sx + 8 + 26 * p, sy + 14 + 8 * p);
    ctx.moveTo(sx + TILE - 10, sy + 6); ctx.lineTo(sx + TILE - 10 - 20 * p, sy + 16 + 10 * p);
    ctx.stroke();
  }
}

function drawHouseSprite(sx: number, sy: number, name: "house_red" | "house_blue") {
  if (imgReady(name)) {
    // footprint is 2x2 tiles starting one row above (wy-1); sy is the bottom row
    drawSprite(name, sx + TILE, sy + ROW_H + 12, TILE * 2.4);
    return;
  }
  ctx.fillStyle = "#8a6642";
  ctx.fillRect(sx, sy - 6, TILE * 2 - 2, ROW_H * 2 - 4);
  ctx.fillStyle = "#b0402f";
  ctx.beginPath();
  ctx.moveTo(sx - 4, sy - 6); ctx.lineTo(sx + TILE - 1, sy - 34); ctx.lineTo(sx + TILE * 2 + 2, sy - 6);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#4a2f1a";
  ctx.fillRect(sx + TILE - 10, sy + ROW_H - 2, 18, ROW_H - 6);
}

function drawPerson(sx: number, sy: number, shirt: string, cap: string, label?: string) {
  ctx.fillStyle = "rgba(0,0,0,.3)";
  ctx.beginPath(); ctx.ellipse(sx, sy + 26, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#3b3b46";
  ctx.fillRect(sx - 7, sy + 14, 6, 12); ctx.fillRect(sx + 1, sy + 14, 6, 12);
  ctx.fillStyle = shirt;
  ctx.fillRect(sx - 9, sy - 2, 18, 17);
  ctx.fillStyle = "#f2c89b";
  ctx.fillRect(sx - 7, sy - 16, 14, 14);
  ctx.fillStyle = cap;
  ctx.fillRect(sx - 8, sy - 19, 16, 6);
  if (label) {
    ctx.fillStyle = "#ffe9bd";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, sx, sy - 26);
  }
}

function drawPlayer(sx: number, sy: number, bob: number) {
  let name = "miner_front";
  let flip = false;
  if (player.fy < 0) name = "miner_back";
  else if (player.fx !== 0) { name = "miner_side"; flip = player.fx < 0; }
  ctx.fillStyle = "rgba(0,0,0,.3)";
  ctx.beginPath(); ctx.ellipse(sx, sy + ROW_H - 2, 11, 4, 0, 0, Math.PI * 2); ctx.fill();
  // Run cycle: the whole body sways/tilts while moving (the sprite sheet has
  // a single frame per direction, so the motion sells the run).
  const tilt = Math.sin(stridePhase) * 0.05 + Math.max(-0.05, Math.min(0.05, player.vx * 0.014));
  ctx.save();
  ctx.translate(sx, sy + ROW_H + 3);
  ctx.rotate(tilt);
  ctx.translate(-sx, -(sy + ROW_H + 3));
  if (imgReady(name)) {
    drawSprite(name, sx, sy + ROW_H + 2 + bob, TILE * 0.62, flip);
  } else {
    drawPerson(sx, sy + 6 + bob, "#2f6fb4", "#ffd94d");
  }
  ctx.restore();
  // facing arrow at the feet: always shows which way the miner will dig
  const ax = sx + player.fx * 19, ay = sy + ROW_H + 7 + player.fy * 9;
  const ang = Math.atan2(player.fy, player.fx);
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(ang);
  ctx.fillStyle = "#ffd94d";
  ctx.strokeStyle = "rgba(60,35,5,.8)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(7, 0); ctx.lineTo(-4, -4.5); ctx.lineTo(-4, 4.5);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}

function render(now: number) {
  ctx.fillStyle = player.z === 0 ? "#5d8f43" : "#241a10";
  ctx.fillRect(0, 0, W, H);
  const camX = cam.x, camY = cam.y;
  const halfCols = Math.ceil(W / TILE / 2) + 2;
  const halfRows = Math.ceil((H * 0.52 + TILE * 4 * PROJECTION.uprightScale) / ROW_H) + 1;
  const x0 = Math.floor(camX) - halfCols, x1 = Math.floor(camX) + halfCols;
  const y0 = Math.floor(camY) - halfRows, y1 = Math.floor(camY) + halfRows;
  const toScreen = (wx: number, wy: number) => ({
    sx: Math.round((wx - camX) * TILE + W / 2 - TILE / 2),
    sy: Math.round((wy - camY) * ROW_H + H * 0.52 - ROW_H / 2),
  });
  for (let wy = y0; wy <= y1; wy++) {
    for (let wx = x0; wx <= x1; wx++) {
      const { sx, sy } = toScreen(wx, wy);
      drawTile(sx, sy, wx, wy);
    }
    if (player.z === 0) {
      // Fade a house while the player walks behind it so he never vanishes
      // into pixels he cannot collide with.
      for (const house of VILLAGE.houses) {
        const lastRow = house.y + house.depth - 1;
        if (wy !== lastRow) continue;
        const h = toScreen(house.x, lastRow);
        const front = lastRow + 0.6;
        ctx.globalAlpha = imgReady(house.sprite)
          ? behindAlpha(house.x + house.width / 2 - 0.5, front - 0.5, house.sprite, TILE * 2.4) : 1;
        drawHouseSprite(h.sx, h.sy, house.sprite);
        ctx.globalAlpha = 1;
      }
    }
    if (player.z === 0 && wy === NPC_POS.y) {
      const n = toScreen(NPC_POS.x, NPC_POS.y);
      if (imgReady("tom_front")) {
        drawSprite("tom_front", n.sx + TILE / 2, n.sy + ROW_H + 4, TILE * 0.78);
        ctx.fillStyle = "#ffe9bd";
        ctx.font = "11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(NPC_POS.label, n.sx + TILE / 2, n.sy - TILE * 0.85);
      } else {
        drawPerson(n.sx + TILE / 2, n.sy + 8, "#7a4d8f", "#4a2c5a", NPC_POS.label);
      }
    }
    if (Math.floor(player.y) === wy || (player.y > wy && player.y < wy + 1)) {
      const p = toScreen(player.x, player.y);
      const spd = Math.hypot(player.vx, player.vy);
      const bob = spd > 0.4 ? Math.sin(stridePhase) * 2.2 : 0;
      // Anchor the sprite to the TOP of the tile row the player stands in:
      // p.sy is the screen y of the player's exact position (mid-tile at
      // spawn), so passing it straight to drawPlayer pushed the sprite half
      // a row too low and the next row's ground painted over the body.
      const topY = p.sy - (player.y - Math.floor(player.y)) * ROW_H;
      drawPlayer(p.sx + TILE / 2, topY, bob);
      if (digHeld && digTarget) {
        ctx.strokeStyle = "#d8d8e0";
        ctx.lineWidth = 3;
        ctx.beginPath();
        const hx = p.sx + TILE / 2 + player.fx * 16, hy = topY + ROW_H - 4 + bob;
        ctx.moveTo(p.sx + TILE / 2, topY + ROW_H - 10 + bob);
        ctx.lineTo(hx, hy - 8 + Math.sin(now / 60) * 4);
        ctx.stroke();
      }
    }
  }
  // dig-target highlight: the outlined block is exactly what will be dug
  const hl = quizOpen ? null : findDigTarget();
  if (hl) {
    const hs = toScreen(hl.x, hl.y);
    const pulse = 0.55 + Math.sin(now / 240) * 0.2;
    ctx.strokeStyle = "rgba(255,225,140," + pulse.toFixed(3) + ")";
    ctx.lineWidth = 2.5;
    ctx.strokeRect(hs.sx + 2, hs.sy + 2, TILE - 5, ROW_H - 5);
    if (digProgress > 0 && digTarget === saveKey(hl.x, hl.y, player.z)) {
      ctx.fillStyle = "rgba(0,0,0,.55)";
      ctx.fillRect(hs.sx + 4, hs.sy - 11, TILE - 9, 7);
      ctx.fillStyle = "#ffd94d";
      ctx.fillRect(hs.sx + 5, hs.sy - 10, (TILE - 11) * Math.min(1, digProgress), 5);
    }
  }
  if (player.z > 0) {
    drawParticles();
  drawDrops(now);
    const dark = Math.min(0.42, player.z * 0.004);
    ctx.fillStyle = `rgba(8,4,2,${dark})`;
    ctx.fillRect(0, 0, W, H);
  }
}


// ---------- HUD ----------
let lastHudSig = "";
function updateHud() {
  const px = Math.floor(player.x), py = Math.floor(player.y);
  const nearNpc = player.z === 0 && Math.hypot(player.x - (NPC_POS.x + 0.5), player.y - (NPC_POS.y + 0.5)) < 1.7;
  const canAscend = player.z > 0 && (getDiff(save, px, py, player.z) === "shaft" || tileAt(px, py, player.z - 1).type === "pit");
  const bag = Object.entries(save.inventory)
    .filter(([k, v]) => k !== "coin" && v > 0)
    .map(([k, v]) => (ORE_NAMES[k] ?? k) + "×" + v)
    .join(" ");
  const sig = [player.z, coins, book.masteredCount(), save.seenWords.length, bag, nearNpc, canAscend].join("|");
  if (sig === lastHudSig) return; // DOM writes every frame cause visible stutter
  lastHudSig = sig;
  $("hDepth").textContent = player.z + "m";
  $("hLayer").textContent = player.z === 0 ? "地表 · 村庄" : stratumAt(player.z).name + " L" + stratumAt(player.z).id;
  $("hCoins").textContent = String(coins);
  $("hWords").textContent = String(book.masteredCount());
  $("hBag").textContent = bag || "背包空";
  $("btnAct").textContent = nearNpc ? "聊天" : canAscend ? "上梯" : "下挖";
  $("dexBtn").textContent = "图鉴 " + save.seenWords.length + "/" + WORDS_TIER1.length;
  $("hint").textContent = player.z === 0
    ? "逛村庄 · 找梅婆婆 · 草地「下挖」"
    : "金框=要挖的土 · 按住「挖」";
}

// ---------- main loop ----------
let last = 0;
function frame(now: number) {
  // Some viewers size the canvas after first paint; re-check every frame.
  if (canvas.clientWidth && (canvas.clientWidth !== W || canvas.clientHeight !== H)) resize();
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
  last = now;
  try {
    update(dt);
    // smooth camera follow (frame-rate independent exponential approach)
    const cf = 1 - Math.exp(-7 * dt);
    cam.x += (player.x - cam.x) * cf;
    cam.y += (player.y - cam.y) * cf;
    render(now);
    updateHud();
  } catch (err) {
    // One bad frame must never freeze the game: reset transient input/quiz
    // state, surface the error, and keep the loop alive.
    console.error(err);
    quizOpen = false;
    activeQuiz = null;
    digHeld = false;
    keys.clear();
    joy.active = false; joy.dx = 0; joy.dy = 0;
    const eb = $("errbar");
    if (eb) {
      eb.style.display = "block";
      eb.textContent = "出错已自动恢复: " + String(err).slice(0, 90);
      window.clearTimeout((window as any).__errTimer);
      (window as any).__errTimer = window.setTimeout(() => { eb.style.display = "none"; }, 4000);
    }
  }
  requestAnimationFrame(frame);
}

loadSprites();
// Keep the game page from being swiped/pulled away mid-play (feedback
// 2026-10-27: page slid out and buttons became unreachable). Sheets keep
// their own touch behaviour so quiz options stay tappable/scrollable.
document.addEventListener("touchmove", (e) => {
  if (!(e.target as HTMLElement).closest(".sheet")) e.preventDefault();
}, { passive: false });
document.addEventListener("gesturestart", (e) => e.preventDefault());
// If the app is backgrounded mid-touch, pointerup/keyup may never arrive and
// a latched input leaves the miner pushing a wall forever: reset everything.
function resetInputs() {
  keys.clear();
  digHeld = false;
  joy.active = false; joy.dx = 0; joy.dy = 0;
}
window.addEventListener("blur", resetInputs);
document.addEventListener("visibilitychange", () => { if (document.hidden) resetInputs(); });
bindJoystick();
bindButton("btnDig", () => (digHeld = true), () => (digHeld = false));
bindButton("btnAct", () => actButton());
$("npcClose").addEventListener("click", () => $("npcSheet").classList.remove("open"));
$("dexBtn").addEventListener("click", () => { renderDex(); dexOpen = true; $("dexSheet").classList.add("open"); });
$("dexClose").addEventListener("click", () => { dexOpen = false; $("dexSheet").classList.remove("open"); });
resize();
// make sure spawn is walkable
for (const [wx, wy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
  if (tileAt(wx, wy, 0).solid) setDiff(save, wx, wy, 0, "dug");
}
persist();
if (!localStorage.getItem("xap-seen")) {
  toast("欢迎来到地心寻词 · 去地下挖宝吧");
  try { localStorage.setItem("xap-seen", "1"); } catch { /* ignore */ }
}
// test hook: lets the headless drive harness steer and inspect the game
(window as any).__xap = {
  player, cam, boxCollides, tileAt, drops, particles,
  pressAct: () => actButton(),
  setDig: (b: boolean) => { digHeld = b; },
  get save() { return save; },
};
requestAnimationFrame(frame);
