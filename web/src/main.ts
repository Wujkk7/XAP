// XAP web prototype — the MVP's playable Web preview (DESIGN.md).
// Rendering/input layer only: every rule (world generation, vocabulary,
// quiz, mastery, save) comes from ../../core. Nothing here re-implements core.

import { getTile } from "../../core/worldgen.ts";
import type { Tile } from "../../core/worldgen.ts";
import { stratumAt } from "../../core/strata.ts";
import { WORDS_TIER1 } from "../../core/vocab.ts";
import type { WordEntry } from "../../core/vocab.ts";
import { ChestSession } from "../../core/quiz.ts";
import { MasteryBook, pickChestWord } from "../../core/mastery.ts";
import {
  newSave, getDiff, setDiff, placeStubborn, addItem,
  serializeSave, deserializeSave, key as saveKey,
} from "../../core/save.ts";
import type { GameSave } from "../../core/save.ts";

// ---------- constants ----------
const TILE = 46; // px, top-face size
const ROW_H = 40; // px per row (squashed for the oblique view)
const FACE = 11; // px fake height of a block's front face
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
const seed = save.seed;
let book = MasteryBook.deserialize(save.mastery);

const player = { x: 0.5, y: 0.5, z: 0, fx: 0, fy: 1, moving: false };
let coins = save.inventory["coin"] ?? 0;
let digTarget: string | null = null;
let digProgress = 0;
let quizOpen = false;

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
  if (d === "stubborn") return { type: "stubborn", hardness: 2, solid: true };
  const t: Tile = getTile(seed, wx, wy, z);
  if (t.type === "empty" || t.type === "grass" || t.type === "flower") {
    return { type: t.type, hardness: 0, solid: false };
  }
  return { type: t.type, hardness: Math.max(1, t.hardness), solid: true };
}

// Village sample (hand-made, surface only): two houses + one NPC.
const HOUSE_TILES = new Set(["3,-4", "4,-4", "3,-3", "4,-3", "6,-4", "7,-4", "6,-3", "7,-3"]);
const NPC_POS = { x: 5, y: -2 };
function villageBlocked(wx: number, wy: number, z: number): boolean {
  if (z !== 0) return false;
  if (HOUSE_TILES.has(wx + "," + wy)) return true;
  return wx === NPC_POS.x && wy === NPC_POS.y;
}
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

function tryDig(dt: number) {
  if (quizOpen) return;
  const t = facingTile();
  const tile = tileAt(t.x, t.y, player.z);
  if (!tile.solid || villageBlocked(t.x, t.y, player.z)) { digTarget = null; digProgress = 0; return; }
  if (tile.type === "chest") { openChestQuiz(t.x, t.y); return; }
  if (tile.type === "stubborn") { openStubbornQuiz(t.x, t.y); return; }

  const k = saveKey(t.x, t.y, player.z);
  if (digTarget !== k) { digTarget = k; digProgress = 0; }
  digProgress += dt / (tile.hardness * 0.42);
  if (digProgress < 1) return;

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

function descendOrAct() {
  if (quizOpen) return;
  // NPC first when close.
  const dNpc = Math.hypot(player.x - (NPC_POS.x + 0.5), player.y - (NPC_POS.y + 0.5));
  if (player.z === 0 && dNpc < 1.7) { talkToNpc(); return; }

  const px = Math.floor(player.x), py = Math.floor(player.y);
  const here = getDiff(save, px, py, player.z);
  if (here === "pit" && player.z > 0) {
    player.z -= 1;
    toast("回到 " + player.z + "m");
    persist();
    return;
  }
  // Dig down: leave a pit behind, land in the slice below.
  setDiff(save, px, py, player.z, "pit");
  player.z += 1;
  const landing = tileAt(px, py, player.z);
  if (landing.solid && landing.type !== "chest" && landing.type !== "stubborn") {
    setDiff(save, px, py, player.z, "dug");
  }
  if (player.z === 31) toast("进入浅岩层 · 单词变难了");
  else if (player.z === 101) toast("进入岩核层");
  else toast("下到 " + player.z + "m");
  persist();
}
function actButton() { descendOrAct(); }

// ---------- NPC (village sample) ----------
const NPC_LINES = [
  { name: "老矿工 Tom", en: "Hello! I am Tom. Dig deep, find gold!", zh: "你好！我是 Tom。往深挖，能找到金子！" },
  { name: "老矿工 Tom", en: "A chest needs a word. The word is the key.", zh: "宝箱需要一个单词。单词就是钥匙。" },
  { name: "老矿工 Tom", en: "Wrong word? No fear. It sleeps under the stone.", zh: "答错词？别怕。它睡在石头下面等你。" },
  { name: "老矿工 Tom", en: "Trees give wood. Wood makes good tools.", zh: "树给木头。木头能做好工具。" },
];
let npcIdx = 0;
function talkToNpc() {
  const line = NPC_LINES[npcIdx++ % NPC_LINES.length];
  $("npcName").textContent = line.name;
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
  } else if (q.everCorrect) {
    reward = Math.round(15 * res.rewardMultiplier);
    setDiff(save, q.x, q.y, q.z, "dug");
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

// ---------- movement ----------
function update(dt: number) {
  if (quizOpen) { player.moving = false; return; }
  const v = inputVector();
  const speed = 3.4;
  player.moving = Math.hypot(v.x, v.y) > 0.12;
  if (player.moving) {
    player.fx = Math.abs(v.x) > 0.3 ? Math.sign(v.x) : 0;
    player.fy = Math.abs(v.y) > 0.3 ? Math.sign(v.y) : (player.fx === 0 ? player.fy : 0);
    if (player.fx === 0 && player.fy === 0) player.fy = 1;
    const nx = player.x + v.x * speed * dt;
    const ny = player.y + v.y * speed * dt;
    const r = 0.32;
    // axis-separated collision against tile centers' cells
    if (!isSolid(Math.floor(nx + Math.sign(v.x) * r), Math.floor(player.y), player.z) &&
        !isSolid(Math.floor(nx + Math.sign(v.x) * r), Math.floor(player.y + r * 0.7), player.z) &&
        !isSolid(Math.floor(nx + Math.sign(v.x) * r), Math.floor(player.y - r * 0.7), player.z)) {
      player.x = nx;
    }
    if (!isSolid(Math.floor(player.x), Math.floor(ny + Math.sign(v.y) * r), player.z) &&
        !isSolid(Math.floor(player.x + r * 0.7), Math.floor(ny + Math.sign(v.y) * r), player.z) &&
        !isSolid(Math.floor(player.x - r * 0.7), Math.floor(ny + Math.sign(v.y) * r), player.z)) {
      player.y = ny;
    }
  }
  if (digHeld) tryDig(dt);
  else { digTarget = null; digProgress = 0; }
}

// ---------- rendering ----------
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
const ORE_DOT: Record<string, string> = {
  ore_copper: "#e08a4c", ore_iron: "#d8d8e0", ore_gold: "#ffd94d", ore_diamond: "#7de8ff", ore_starcore: "#c07dff",
};

function drawTile(sx: number, sy: number, wx: number, wy: number) {
  const t = tileAt(wx, wy, player.z);
  const [top, front] = COLORS[t.type] ?? COLORS.dirt;
  // front face then top face, rows drawn top-to-bottom so faces overlap right
  ctx.fillStyle = front;
  ctx.fillRect(sx, sy + ROW_H - 4, TILE - 1, FACE);
  ctx.fillStyle = top;
  ctx.fillRect(sx, sy, TILE - 1, ROW_H - 1);
  if (player.z === 0) {
    if (t.type === "tree") {
      ctx.fillStyle = "#6b4a26";
      ctx.fillRect(sx + TILE / 2 - 3, sy + 18, 6, 14);
      ctx.fillStyle = "#2f7a33";
      ctx.beginPath();
      ctx.arc(sx + TILE / 2, sy + 14, 15, 0, Math.PI * 2);
      ctx.arc(sx + TILE / 2 - 11, sy + 20, 10, 0, Math.PI * 2);
      ctx.arc(sx + TILE / 2 + 11, sy + 20, 10, 0, Math.PI * 2);
      ctx.fill();
    } else if (t.type === "flower") {
      ctx.fillStyle = "#ff8fb3";
      ctx.fillRect(sx + 10, sy + 10, 4, 4); ctx.fillRect(sx + 30, sy + 22, 4, 4);
      ctx.fillStyle = "#ffd166";
      ctx.fillRect(sx + 22, sy + 16, 4, 4);
    }
    return;
  }
  if (t.type === "chest") {
    ctx.fillStyle = "#7a4d1c";
    ctx.fillRect(sx + 6, sy + 9, TILE - 13, 20);
    ctx.fillStyle = "#ffd94d";
    ctx.fillRect(sx + 6, sy + 17, TILE - 13, 4);
    ctx.fillRect(sx + TILE / 2 - 3, sy + 9, 6, 20);
  } else if (t.type === "stubborn") {
    ctx.fillStyle = "#ffe9bd";
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("!", sx + TILE / 2, sy + 27);
  } else if (t.type === "pit") {
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(sx + TILE / 2, sy + ROW_H / 2, 15, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c9a86a";
    ctx.fillRect(sx + TILE / 2 - 2, sy + 4, 4, ROW_H - 8);
  } else if (ORE_DOT[t.type]) {
    ctx.fillStyle = ORE_DOT[t.type];
    const h = (wx * 31 + wy * 57 + player.z) % 3;
    ctx.fillRect(sx + 9 + h * 5, sy + 10, 6, 5);
    ctx.fillRect(sx + 26, sy + 20 + h * 2, 6, 5);
    ctx.fillRect(sx + 15, sy + 26, 5, 4);
  }
  // dig cracks
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

function drawHouse(sx: number, sy: number) {
  ctx.fillStyle = "#8a6642";
  ctx.fillRect(sx, sy - 6, TILE * 2 - 2, ROW_H * 2 - 4);
  ctx.fillStyle = "#b0402f";
  ctx.beginPath();
  ctx.moveTo(sx - 4, sy - 6); ctx.lineTo(sx + TILE - 1, sy - 34); ctx.lineTo(sx + TILE * 2 + 2, sy - 6);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#4a2f1a";
  ctx.fillRect(sx + TILE - 10, sy + ROW_H - 2, 18, ROW_H - 6);
  ctx.fillStyle = "#ffd94d";
  ctx.fillRect(sx + 12, sy + 8, 12, 12); ctx.fillRect(sx + TILE * 2 - 26, sy + 8, 12, 12);
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

function render(now: number) {
  ctx.fillStyle = player.z === 0 ? "#5d8f43" : "#241a10";
  ctx.fillRect(0, 0, W, H);
  const camX = player.x, camY = player.y;
  const halfCols = Math.ceil(W / TILE / 2) + 2;
  const halfRows = Math.ceil(H / ROW_H / 2) + 2;
  const x0 = Math.floor(camX) - halfCols, x1 = Math.floor(camX) + halfCols;
  const y0 = Math.floor(camY) - halfRows, y1 = Math.floor(camY) + halfRows;
  const toScreen = (wx: number, wy: number) => ({
    sx: Math.round((wx - camX) * TILE + W / 2 - TILE / 2),
    sy: Math.round((wy - camY) * ROW_H + H * 0.42 - ROW_H / 2),
  });
  for (let wy = y0; wy <= y1; wy++) {
    for (let wx = x0; wx <= x1; wx++) {
      const { sx, sy } = toScreen(wx, wy);
      drawTile(sx, sy, wx, wy);
    }
    if (player.z === 0 && wy === -4) {
      const h1 = toScreen(3, -4); drawHouse(h1.sx, h1.sy);
      const h2 = toScreen(6, -4); drawHouse(h2.sx, h2.sy);
    }
    if (player.z === 0 && wy === NPC_POS.y) {
      const n = toScreen(NPC_POS.x, NPC_POS.y);
      drawPerson(n.sx + TILE / 2, n.sy + 8, "#7a4d8f", "#4a2c5a", "Tom · 矿工");
    }
    if (Math.floor(player.y) === wy || (player.y > wy && player.y < wy + 1)) {
      const p = toScreen(player.x, player.y);
      const bob = player.moving ? Math.sin(now / 90) * 2 : 0;
      drawPerson(p.sx + TILE / 2, p.sy + 6 + bob, "#2f6fb4", "#ffd94d");
      if (digHeld && digTarget) {
        ctx.strokeStyle = "#d8d8e0";
        ctx.lineWidth = 3;
        ctx.beginPath();
        const hx = p.sx + TILE / 2 + player.fx * 16, hy = p.sy + 12 + bob;
        ctx.moveTo(p.sx + TILE / 2, p.sy + 8 + bob);
        ctx.lineTo(hx, hy - 8 + Math.sin(now / 60) * 4);
        ctx.stroke();
      }
    }
  }
  if (player.z > 0) {
    const dark = Math.min(0.42, player.z * 0.004);
    ctx.fillStyle = `rgba(8,4,2,${dark})`;
    ctx.fillRect(0, 0, W, H);
  }
}

// ---------- HUD ----------
function updateHud() {
  $("hDepth").textContent = player.z + "m";
  $("hLayer").textContent = player.z === 0 ? "地表 · 村庄" : stratumAt(player.z).name + " L" + stratumAt(player.z).id;
  $("hCoins").textContent = String(coins);
  $("hWords").textContent = String(book.masteredCount());
  const bag = Object.entries(save.inventory)
    .filter(([k, v]) => k !== "coin" && v > 0)
    .map(([k, v]) => (ORE_NAMES[k] ?? k) + "×" + v)
    .join(" ");
  $("hBag").textContent = bag || "背包空";
  const nearNpc = player.z === 0 && Math.hypot(player.x - (NPC_POS.x + 0.5), player.y - (NPC_POS.y + 0.5)) < 1.7;
  const px = Math.floor(player.x), py = Math.floor(player.y);
  $("btnAct").textContent = nearNpc ? "聊天" : getDiff(save, px, py, player.z) === "pit" && player.z > 0 ? "上梯" : "下挖";
  $("hint").textContent = player.z === 0
    ? "逛逛村庄，找 Tom 聊天 · 在草地上按下挖开始挖宝"
    : "对着方块按住「挖」· 脚下按「下挖」继续深入 · 挖到宝箱答词开箱";
}

// ---------- main loop ----------
let last = 0;
function frame(now: number) {
  // Some viewers size the canvas after first paint; re-check every frame.
  if (canvas.clientWidth && (canvas.clientWidth !== W || canvas.clientHeight !== H)) resize();
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
  last = now;
  update(dt);
  render(now);
  updateHud();
  requestAnimationFrame(frame);
}

bindJoystick();
bindButton("btnDig", () => (digHeld = true), () => (digHeld = false));
bindButton("btnAct", () => actButton());
$("npcClose").addEventListener("click", () => $("npcSheet").classList.remove("open"));
resize();
// make sure spawn is walkable
for (const [wx, wy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
  if (tileAt(wx, wy, 0).solid) setDiff(save, wx, wy, 0, "dug");
}
persist();
if (!localStorage.getItem("xap-seen")) {
  toast("欢迎来到 XAP 村 · 去地下挖宝吧");
  try { localStorage.setItem("xap-seen", "1"); } catch { /* ignore */ }
}
requestAnimationFrame(frame);
