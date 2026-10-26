"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key2, value) => key2 in obj ? __defProp(obj, key2, { enumerable: true, configurable: true, writable: true, value }) : obj[key2] = value;
  var __publicField = (obj, key2, value) => __defNormalProp(obj, typeof key2 !== "symbol" ? key2 + "" : key2, value);

  // core/rng.ts
  function hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function hashCoords(seed2, x, y, z, salt) {
    let h = seed2 >>> 0;
    h = Math.imul(h ^ (x | 0), 668265261);
    h = Math.imul(h ^ (y | 0), 374761393);
    h = Math.imul(h ^ (z | 0), 2654435761);
    h = Math.imul(h ^ salt, 2246822507);
    h ^= h >>> 15;
    h = Math.imul(h, 739982445);
    h ^= h >>> 12;
    return h >>> 0;
  }
  function roll(seed2, x, y, z, salt) {
    return hashCoords(seed2, x, y, z, salt) / 4294967296;
  }
  function rngFrom(seed2) {
    let a = seed2 >>> 0;
    return () => {
      a = a + 1831565813 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var SALT = {
    base: 1,
    cave: 2,
    veinCell: 3,
    veinFill: 4,
    chestRandom: 5,
    chestBlock: 6,
    surfaceKind: 7
  };

  // core/strata.ts
  var STRATA = [
    { id: 1, name: "\u8868\u571F\u5C42", minDepth: 1, maxDepth: 30, vocabTier: 1, cefr: "A1", poolSize: 600, hardness: 1, baseTile: "dirt", oreTile: "ore_copper", chestKind: "wood" },
    { id: 2, name: "\u6D45\u5CA9\u5C42", minDepth: 31, maxDepth: 100, vocabTier: 2, cefr: "A2", poolSize: 1600, hardness: 2, baseTile: "sandstone", oreTile: "ore_iron", chestKind: "iron" },
    { id: 3, name: "\u5CA9\u6838\u5C42", minDepth: 101, maxDepth: 250, vocabTier: 3, cefr: "B1", poolSize: 3500, hardness: 3, baseTile: "granite", oreTile: "ore_gold", chestKind: "gold" },
    { id: 4, name: "\u6DF1\u6E0A\u5C42", minDepth: 251, maxDepth: 500, vocabTier: 4, cefr: "B2", poolSize: 6e3, hardness: 5, baseTile: "basalt", oreTile: "ore_diamond", chestKind: "mithril" },
    { id: 5, name: "\u5730\u5FC3\u5C42", minDepth: 501, maxDepth: Infinity, vocabTier: 5, cefr: "C1", poolSize: 8e3, hardness: 8, baseTile: "obsidian", oreTile: "ore_starcore", chestKind: "starcore" }
  ];
  function stratumAt(depth) {
    for (const s of STRATA) {
      if (depth >= s.minDepth && depth <= s.maxDepth) return s;
    }
    return STRATA[STRATA.length - 1];
  }

  // core/worldgen.ts
  var CHEST_BLOCK = 25;
  var CHEST_RANDOM_P = 15e-4;
  var CAVE_CELL = 4;
  var VEIN_CELL = 3;
  function surfaceTile(seed2, x, y) {
    const r = roll(seed2, x, y, 0, SALT.surfaceKind);
    if (r < 0.06) return { type: "tree", hardness: 1, stratum: 0 };
    if (r < 0.09) return { type: "surface_rock", hardness: 2, stratum: 0 };
    if (r < 0.16) return { type: "flower", hardness: 0, stratum: 0 };
    return { type: "grass", hardness: 0, stratum: 0 };
  }
  function guaranteedChestPos(seed2, x, y, z) {
    const bx = Math.floor(x / CHEST_BLOCK);
    const by = Math.floor(y / CHEST_BLOCK);
    const h = hashCoords(seed2, bx, by, z, SALT.chestBlock);
    return {
      x: bx * CHEST_BLOCK + h % CHEST_BLOCK,
      y: by * CHEST_BLOCK + Math.floor(h / CHEST_BLOCK) % CHEST_BLOCK
    };
  }
  function getTile(seed2, x, y, z) {
    if (z <= 0) return surfaceTile(seed2, x, y);
    const s = stratumAt(z);
    const g = guaranteedChestPos(seed2, x, y, z);
    if (g.x === x && g.y === y || roll(seed2, x, y, z, SALT.chestRandom) < CHEST_RANDOM_P) {
      return { type: "chest", hardness: 1, stratum: s.id, chestKind: s.chestKind };
    }
    if (z >= 6) {
      const cell = roll(seed2, Math.floor(x / CAVE_CELL), Math.floor(y / CAVE_CELL), z, SALT.cave);
      if (cell > 0.93) return { type: "empty", hardness: 0, stratum: s.id };
    }
    const veinCell = roll(seed2, Math.floor(x / VEIN_CELL), Math.floor(y / VEIN_CELL), z, SALT.veinCell);
    if (veinCell > 0.9 && roll(seed2, x, y, z, SALT.veinFill) < 0.75) {
      return { type: s.oreTile, hardness: s.hardness + 1, stratum: s.id };
    }
    return { type: s.baseTile, hardness: s.hardness, stratum: s.id };
  }

  // core/vocab.ts
  var WORDS_TIER1 = [
    { word: "apple", meaning: "\u82F9\u679C", tier: 1, theme: "food", example: "I eat an apple every day.", distractors: ["\u68A8\u5B50", "\u9999\u8549", "\u6A58\u5B50"] },
    { word: "dig", meaning: "\u6316", tier: 1, theme: "action", example: "We dig a deep hole.", distractors: ["\u780D", "\u79CD", "\u63A8"] },
    { word: "gold", meaning: "\u91D1\u5B50", tier: 1, theme: "treasure", example: "The box is full of gold.", distractors: ["\u94F6\u5B50", "\u94DC", "\u94C1"] },
    { word: "stone", meaning: "\u77F3\u5934", tier: 1, theme: "nature", example: "This stone is very hard.", distractors: ["\u6728\u5934", "\u6C99\u5B50", "\u73BB\u7483"] },
    { word: "water", meaning: "\u6C34", tier: 1, theme: "nature", example: "Fish live in water.", distractors: ["\u725B\u5976", "\u6CB9", "\u96EA"] },
    { word: "fire", meaning: "\u706B", tier: 1, theme: "nature", example: "The fire is warm.", distractors: ["\u70DF", "\u7070", "\u70AD"] },
    { word: "tree", meaning: "\u6811", tier: 1, theme: "nature", example: "A bird sits in the tree.", distractors: ["\u82B1", "\u8349", "\u53F6\u5B50"] },
    { word: "sun", meaning: "\u592A\u9633", tier: 1, theme: "sky", example: "The sun is hot today.", distractors: ["\u6708\u4EAE", "\u661F\u661F", "\u4E91"] },
    { word: "moon", meaning: "\u6708\u4EAE", tier: 1, theme: "sky", example: "The moon is bright tonight.", distractors: ["\u592A\u9633", "\u661F\u661F", "\u591C\u665A"] },
    { word: "star", meaning: "\u661F\u661F", tier: 1, theme: "sky", example: "I can see a star.", distractors: ["\u6708\u4EAE", "\u592A\u9633", "\u706F"] },
    { word: "cat", meaning: "\u732B", tier: 1, theme: "animal", example: "The cat is sleeping.", distractors: ["\u72D7", "\u9E1F", "\u9C7C"] },
    { word: "dog", meaning: "\u72D7", tier: 1, theme: "animal", example: "My dog likes to run.", distractors: ["\u732B", "\u72FC", "\u9A6C"] },
    { word: "bird", meaning: "\u9E1F", tier: 1, theme: "animal", example: "The bird can fly.", distractors: ["\u9C7C", "\u732B", "\u8774\u8776"] },
    { word: "fish", meaning: "\u9C7C", tier: 1, theme: "animal", example: "A fish swims fast.", distractors: ["\u9E1F", "\u867E", "\u86C7"] },
    { word: "book", meaning: "\u4E66", tier: 1, theme: "school", example: "I read a book at night.", distractors: ["\u7B14", "\u672C\u5B50", "\u4E66\u5305"] },
    { word: "key", meaning: "\u94A5\u5319", tier: 1, theme: "daily", example: "This key opens the door.", distractors: ["\u9501", "\u95E8", "\u5200"] },
    { word: "map", meaning: "\u5730\u56FE", tier: 1, theme: "adventure", example: "The map shows the cave.", distractors: ["\u7167\u7247", "\u753B", "\u4FE1"] },
    { word: "cave", meaning: "\u6D1E\u7A74", tier: 1, theme: "adventure", example: "The cave is dark and deep.", distractors: ["\u5C71\u9876", "\u6CB3\u8FB9", "\u68EE\u6797"] },
    { word: "gem", meaning: "\u5B9D\u77F3", tier: 1, theme: "treasure", example: "She found a green gem.", distractors: ["\u91D1\u5B50", "\u77F3\u5934", "\u6C34\u6676"] },
    { word: "box", meaning: "\u76D2\u5B50", tier: 1, theme: "daily", example: "Open the box slowly.", distractors: ["\u888B\u5B50", "\u7BEE\u5B50", "\u74F6\u5B50"] }
  ];

  // core/quiz.ts
  var REWARD_STEPS = [1, 0.7, 0.4];
  var FLOOR_REWARD = 0.25;
  var MAX_ATTEMPTS = 3;
  function makeQuestion(entry, shuffleSeed) {
    const options = [entry.meaning, ...entry.distractors];
    const rand = rngFrom(shuffleSeed);
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    return {
      word: entry.word,
      example: entry.example,
      options,
      correctIndex: options.indexOf(entry.meaning)
    };
  }
  var ChestSession = class {
    constructor(entry, shuffleSeed) {
      __publicField(this, "question");
      __publicField(this, "attempts", 0);
      __publicField(this, "openedFlag", false);
      this.question = makeQuestion(entry, shuffleSeed);
    }
    get attemptsUsed() {
      return this.attempts;
    }
    get isOpen() {
      return this.openedFlag;
    }
    answer(optionIndex) {
      if (this.openedFlag) throw new Error("chest already open");
      this.attempts++;
      const correct = optionIndex === this.question.correctIndex;
      if (correct) {
        this.openedFlag = true;
        return {
          correct,
          opened: true,
          rewardMultiplier: REWARD_STEPS[Math.min(this.attempts, MAX_ATTEMPTS) - 1],
          attemptsUsed: this.attempts
        };
      }
      if (this.attempts >= MAX_ATTEMPTS) {
        this.openedFlag = true;
        return { correct, opened: true, rewardMultiplier: FLOOR_REWARD, attemptsUsed: this.attempts };
      }
      return { correct, opened: false, rewardMultiplier: 0, attemptsUsed: this.attempts };
    }
  };

  // core/mastery.ts
  var REVIEW_GAP_M = 15;
  var STUBBORN_MIN = 10;
  var STUBBORN_SPAN = 21;
  function freshState(word) {
    return { word, status: "unknown", correctStreak: 0, encounters: 0, wrongCount: 0, lastSeenDepth: 0, dueDepth: 0 };
  }
  var MasteryBook = class _MasteryBook {
    constructor() {
      __publicField(this, "states", /* @__PURE__ */ new Map());
    }
    get(word) {
      let s = this.states.get(word);
      if (!s) {
        s = freshState(word);
        this.states.set(word, s);
      }
      return s;
    }
    recordAnswer(word, correct, depth) {
      const s = this.get(word);
      s.encounters++;
      s.lastSeenDepth = depth;
      let becameMastered = false;
      let stubbornDepth;
      if (correct) {
        s.correctStreak++;
        if (s.status !== "mastered" && s.correctStreak >= 2) {
          s.status = "mastered";
          becameMastered = true;
        } else if (s.status === "unknown") {
          s.status = "learning";
        }
        s.dueDepth = depth + REVIEW_GAP_M;
      } else {
        s.correctStreak = 0;
        s.wrongCount++;
        s.status = "learning";
        const offset = STUBBORN_MIN + hashString(word + "@" + s.wrongCount) % STUBBORN_SPAN;
        stubbornDepth = depth + offset;
        s.dueDepth = stubbornDepth;
      }
      return { state: s, stubbornDepth, becameMastered };
    }
    masteredCount() {
      let n = 0;
      for (const s of this.states.values()) if (s.status === "mastered") n++;
      return n;
    }
    /** Words due for review at this depth (learning words whose dueDepth has arrived). */
    dueWords(depth) {
      const out = [];
      for (const s of this.states.values()) {
        if (s.status === "learning" && s.dueDepth <= depth) out.push(s);
      }
      return out;
    }
    serialize() {
      return Object.fromEntries(this.states);
    }
    static deserialize(data) {
      const book2 = new _MasteryBook();
      for (const [k, v] of Object.entries(data ?? {})) book2.states.set(k, { ...v });
      return book2;
    }
  };
  function pickChestWord(pool, book2, depth, rand) {
    if (pool.length === 0) return void 0;
    const tiers = [...new Set(pool.map((w) => w.tier))].sort((a, b) => a - b);
    const currentTier = tiers[tiers.length - 1];
    const rollPick = rand();
    const due = book2.dueWords(depth).map((s) => pool.find((w) => w.word === s.word)).filter((w) => !!w);
    if (rollPick >= 0.7 && rollPick < 0.9 && due.length > 0) {
      return due[Math.floor(rand() * due.length)];
    }
    const nextTierWords = pool.filter((w) => w.tier === currentTier + 1);
    if (rollPick >= 0.9 && nextTierWords.length > 0) {
      return nextTierWords[Math.floor(rand() * nextTierWords.length)];
    }
    const fresh = pool.filter((w) => w.tier === currentTier && book2.get(w.word).status === "unknown");
    const candidates = fresh.length > 0 ? fresh : pool.filter((w) => w.tier === currentTier);
    if (candidates.length === 0) return pool[Math.floor(rand() * pool.length)];
    return candidates[Math.floor(rand() * candidates.length)];
  }

  // core/save.ts
  function key(x, y, z) {
    return x + "," + y + "," + z;
  }
  function newSave(seedString) {
    return {
      version: 1,
      seedString,
      seed: hashString(seedString),
      diffs: {},
      stubborn: {},
      mastery: {},
      inventory: {},
      maxDepth: 0,
      pickaxeLevel: 1
    };
  }
  function setDiff(save2, x, y, z, tile) {
    save2.diffs[key(x, y, z)] = tile;
  }
  function getDiff(save2, x, y, z) {
    return save2.diffs[key(x, y, z)];
  }
  function placeStubborn(save2, x, y, depth, word) {
    save2.stubborn[key(x, y, depth)] = word;
    save2.diffs[key(x, y, depth)] = "stubborn";
  }
  function addItem(save2, item, n) {
    save2.inventory[item] = (save2.inventory[item] ?? 0) + n;
    if (save2.inventory[item] <= 0) delete save2.inventory[item];
  }
  function serializeSave(save2) {
    return JSON.stringify(save2);
  }
  function deserializeSave(json) {
    const data = JSON.parse(json);
    if (data.version !== 1) throw new Error("unsupported save version: " + data.version);
    return data;
  }

  // web/src/main.ts
  var TILE = 46;
  var ROW_H = 40;
  var FACE = 11;
  var SAVE_KEY = "xap-save-v1";
  var SEED_STRING = "xap-world-1";
  var save;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    save = raw ? deserializeSave(raw) : newSave(SEED_STRING);
  } catch {
    save = newSave(SEED_STRING);
  }
  var seed = save.seed;
  var book = MasteryBook.deserialize(save.mastery);
  var player = { x: 0.5, y: 0.5, z: 0, fx: 0, fy: 1, moving: false };
  var coins = save.inventory["coin"] ?? 0;
  var digTarget = null;
  var digProgress = 0;
  var quizOpen = false;
  function persist() {
    save.mastery = book.serialize();
    save.inventory["coin"] = coins;
    save.maxDepth = Math.max(save.maxDepth, player.z);
    try {
      localStorage.setItem(SAVE_KEY, serializeSave(save));
    } catch {
    }
  }
  function tileAt(wx, wy, z) {
    const d = getDiff(save, wx, wy, z);
    if (d === "dug") return { type: "empty", hardness: 0, solid: false };
    if (d === "pit") return { type: "pit", hardness: 0, solid: false };
    if (d === "stubborn") return { type: "stubborn", hardness: 2, solid: true };
    const t = getTile(seed, wx, wy, z);
    if (t.type === "empty" || t.type === "grass" || t.type === "flower") {
      return { type: t.type, hardness: 0, solid: false };
    }
    return { type: t.type, hardness: Math.max(1, t.hardness), solid: true };
  }
  var HOUSE_TILES = /* @__PURE__ */ new Set(["3,-4", "4,-4", "3,-3", "4,-3", "6,-4", "7,-4", "6,-3", "7,-3"]);
  var NPC_POS = { x: 5, y: -2 };
  function villageBlocked(wx, wy, z) {
    if (z !== 0) return false;
    if (HOUSE_TILES.has(wx + "," + wy)) return true;
    return wx === NPC_POS.x && wy === NPC_POS.y;
  }
  function isSolid(wx, wy, z) {
    return villageBlocked(wx, wy, z) || tileAt(wx, wy, z).solid;
  }
  var $ = (id) => document.getElementById(id);
  var canvas = $("game");
  var ctx = canvas.getContext("2d");
  var W = 0;
  var H = 0;
  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width;
    H = r.height;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);
  var toastTimer = 0;
  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.style.opacity = "1";
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => el.style.opacity = "0", 2100);
  }
  var joy = { active: false, dx: 0, dy: 0 };
  var digHeld = false;
  var keys = /* @__PURE__ */ new Set();
  function bindJoystick() {
    const base = $("joy"), stick = $("stick");
    const setStick = (dx, dy) => {
      stick.style.transform = `translate(calc(-50% + ${dx * 34}px), calc(-50% + ${dy * 34}px))`;
    };
    const handle = (e, phase) => {
      const r = base.getBoundingClientRect();
      if (phase === "up") {
        joy.active = false;
        joy.dx = 0;
        joy.dy = 0;
        setStick(0, 0);
        return;
      }
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let dx = (e.clientX - cx) / (r.width / 2), dy = (e.clientY - cy) / (r.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        dx /= len;
        dy /= len;
      }
      joy.active = true;
      joy.dx = dx;
      joy.dy = dy;
      setStick(dx, dy);
    };
    base.addEventListener("pointerdown", (e) => {
      base.setPointerCapture(e.pointerId);
      handle(e, "down");
    });
    base.addEventListener("pointermove", (e) => {
      if (joy.active) handle(e, "move");
    });
    base.addEventListener("pointerup", (e) => handle(e, "up"));
    base.addEventListener("pointercancel", (e) => handle(e, "up"));
  }
  function bindButton(id, onDown, onUp) {
    const el = $(id);
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      onDown();
    });
    if (onUp) {
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onUp);
      el.addEventListener("pointerleave", onUp);
    }
  }
  window.addEventListener("keydown", (e) => {
    keys.add(e.key.toLowerCase());
    if (e.key === " ") {
      digHeld = true;
      e.preventDefault();
    }
    if (e.key.toLowerCase() === "k" || e.key === "Enter") actButton();
  });
  window.addEventListener("keyup", (e) => {
    keys.delete(e.key.toLowerCase());
    if (e.key === " ") digHeld = false;
  });
  function inputVector() {
    let x = joy.dx, y = joy.dy;
    if (keys.has("a") || keys.has("arrowleft")) x -= 1;
    if (keys.has("d") || keys.has("arrowright")) x += 1;
    if (keys.has("w") || keys.has("arrowup")) y -= 1;
    if (keys.has("s") || keys.has("arrowdown")) y += 1;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }
  var ORE_NAMES = {
    ore_copper: "copper \u94DC\u77FF",
    ore_iron: "iron \u94C1\u77FF",
    ore_gold: "gold \u91D1\u77FF",
    ore_diamond: "diamond \u94BB\u77F3",
    ore_starcore: "star core \u661F\u6838"
  };
  function facingTile() {
    return { x: Math.floor(player.x + player.fx * 0.9), y: Math.floor(player.y + player.fy * 0.9) };
  }
  function tryDig(dt) {
    if (quizOpen) return;
    const t = facingTile();
    const tile = tileAt(t.x, t.y, player.z);
    if (!tile.solid || villageBlocked(t.x, t.y, player.z)) {
      digTarget = null;
      digProgress = 0;
      return;
    }
    if (tile.type === "chest") {
      openChestQuiz(t.x, t.y);
      return;
    }
    if (tile.type === "stubborn") {
      openStubbornQuiz(t.x, t.y);
      return;
    }
    const k = key(t.x, t.y, player.z);
    if (digTarget !== k) {
      digTarget = k;
      digProgress = 0;
    }
    digProgress += dt / (tile.hardness * 0.42);
    if (digProgress < 1) return;
    setDiff(save, t.x, t.y, player.z, "dug");
    digTarget = null;
    digProgress = 0;
    if (tile.type.startsWith("ore_")) {
      addItem(save, tile.type, 1);
      toast("+1 " + (ORE_NAMES[tile.type] ?? tile.type));
    } else if (tile.type === "tree") {
      addItem(save, "wood", 1);
      toast("+1 wood \u6728\u5934 \xB7 tree = \u6811");
    } else if (tile.type === "surface_rock") {
      addItem(save, "stone", 1);
      toast("+1 stone \u77F3\u5934");
    }
    persist();
  }
  function descendOrAct() {
    if (quizOpen) return;
    const dNpc = Math.hypot(player.x - (NPC_POS.x + 0.5), player.y - (NPC_POS.y + 0.5));
    if (player.z === 0 && dNpc < 1.7) {
      talkToNpc();
      return;
    }
    const px = Math.floor(player.x), py = Math.floor(player.y);
    const here = getDiff(save, px, py, player.z);
    if (here === "pit" && player.z > 0) {
      player.z -= 1;
      toast("\u56DE\u5230 " + player.z + "m");
      persist();
      return;
    }
    setDiff(save, px, py, player.z, "pit");
    player.z += 1;
    const landing = tileAt(px, py, player.z);
    if (landing.solid && landing.type !== "chest" && landing.type !== "stubborn") {
      setDiff(save, px, py, player.z, "dug");
    }
    if (player.z === 31) toast("\u8FDB\u5165\u6D45\u5CA9\u5C42 \xB7 \u5355\u8BCD\u53D8\u96BE\u4E86");
    else if (player.z === 101) toast("\u8FDB\u5165\u5CA9\u6838\u5C42");
    else toast("\u4E0B\u5230 " + player.z + "m");
    persist();
  }
  function actButton() {
    descendOrAct();
  }
  var NPC_LINES = [
    { name: "\u8001\u77FF\u5DE5 Tom", en: "Hello! I am Tom. Dig deep, find gold!", zh: "\u4F60\u597D\uFF01\u6211\u662F Tom\u3002\u5F80\u6DF1\u6316\uFF0C\u80FD\u627E\u5230\u91D1\u5B50\uFF01" },
    { name: "\u8001\u77FF\u5DE5 Tom", en: "A chest needs a word. The word is the key.", zh: "\u5B9D\u7BB1\u9700\u8981\u4E00\u4E2A\u5355\u8BCD\u3002\u5355\u8BCD\u5C31\u662F\u94A5\u5319\u3002" },
    { name: "\u8001\u77FF\u5DE5 Tom", en: "Wrong word? No fear. It sleeps under the stone.", zh: "\u7B54\u9519\u8BCD\uFF1F\u522B\u6015\u3002\u5B83\u7761\u5728\u77F3\u5934\u4E0B\u9762\u7B49\u4F60\u3002" },
    { name: "\u8001\u77FF\u5DE5 Tom", en: "Trees give wood. Wood makes good tools.", zh: "\u6811\u7ED9\u6728\u5934\u3002\u6728\u5934\u80FD\u505A\u597D\u5DE5\u5177\u3002" }
  ];
  var npcIdx = 0;
  function talkToNpc() {
    const line = NPC_LINES[npcIdx++ % NPC_LINES.length];
    $("npcName").textContent = line.name;
    $("npcText").innerHTML = '<span class="en"></span><br><span class="zh"></span>';
    $("npcText").querySelector(".en").textContent = line.en;
    $("npcText").querySelector(".zh").textContent = line.zh;
    $("npcSheet").classList.add("open");
  }
  var activeQuiz = null;
  function wordForChest() {
    const picked = pickChestWord(WORDS_TIER1, book, Math.max(1, player.z), Math.random);
    return picked ?? WORDS_TIER1[0];
  }
  function openChestQuiz(x, y) {
    const entry = wordForChest();
    startQuiz(entry, "chest", x, y);
  }
  function openStubbornQuiz(x, y) {
    const word = save.stubborn[key(x, y, player.z)];
    const entry = WORDS_TIER1.find((w) => w.word === word) ?? wordForChest();
    startQuiz(entry, "stubborn", x, y);
  }
  function startQuiz(entry, kind, x, y) {
    quizOpen = true;
    const session = new ChestSession(entry, x * 73856093 ^ y * 19349663 ^ player.z * 83492791);
    activeQuiz = { session, entry, kind, x, y, z: player.z, everCorrect: false };
    $("qKind").textContent = kind === "chest" ? "\u5B9D\u7BB1 \xB7 \u9009\u5BF9\u610F\u601D\u5F00\u7BB1" : "\u987D\u56FA\u77F3 \xB7 \u8FD9\u4E2A\u8BCD\u53C8\u56DE\u6765\u4E86";
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
  function answerQuiz(i, btn) {
    if (!activeQuiz || activeQuiz.session.isOpen) return;
    const q = activeQuiz;
    const res = q.session.answer(i);
    btn.classList.add(res.correct ? "right" : "wrong");
    if (res.correct) q.everCorrect = true;
    if (!res.opened) {
      $("qFeedback").textContent = "\u4E0D\u5BF9\uFF0C\u518D\u60F3\u60F3 \u2014 \u8FD8\u5269 " + (3 - res.attemptsUsed) + " \u6B21\u673A\u4F1A";
      return;
    }
    const outcome = book.recordAnswer(q.entry.word, q.everCorrect, q.z);
    let reward = 0;
    if (q.kind === "chest") {
      reward = Math.round(10 * Math.max(1, stratumAt(Math.max(1, q.z)).id) * res.rewardMultiplier);
      setDiff(save, q.x, q.y, q.z, "dug");
    } else if (q.everCorrect) {
      reward = Math.round(15 * res.rewardMultiplier);
      setDiff(save, q.x, q.y, q.z, "dug");
      delete save.stubborn[key(q.x, q.y, q.z)];
    }
    coins += reward;
    let msg = q.everCorrect ? "\u5F00\u7BB1\uFF01+" + reward + " \u{1FA99} \xB7 " + q.entry.word + " = " + q.entry.meaning : "\u7BB1\u5B50\u5F00\u4E86\uFF08\u4FDD\u5E95\uFF09+" + reward + " \u{1FA99} \xB7 " + q.entry.word + " = " + q.entry.meaning + "\uFF0C\u8BB0\u4F4F\u5B83";
    if (!q.everCorrect && outcome.stubbornDepth) {
      const px = Math.floor(player.x), py = Math.floor(player.y);
      placeStubborn(save, px, py, outcome.stubbornDepth, q.entry.word);
      msg += " \u2014 \u5B83\u57CB\u5230\u4E86 " + outcome.stubbornDepth + "m \u6DF1\u5904";
    }
    if (outcome.becameMastered) msg += " \xB7 \u5DF2\u638C\u63E1 \u2B50";
    $("qFeedback").textContent = msg;
    persist();
    window.setTimeout(() => {
      $("quizSheet").classList.remove("open");
      quizOpen = false;
      activeQuiz = null;
      toast(msg);
    }, 1100);
  }
  function update(dt) {
    if (quizOpen) {
      player.moving = false;
      return;
    }
    const v = inputVector();
    const speed = 3.4;
    player.moving = Math.hypot(v.x, v.y) > 0.12;
    if (player.moving) {
      player.fx = Math.abs(v.x) > 0.3 ? Math.sign(v.x) : 0;
      player.fy = Math.abs(v.y) > 0.3 ? Math.sign(v.y) : player.fx === 0 ? player.fy : 0;
      if (player.fx === 0 && player.fy === 0) player.fy = 1;
      const nx = player.x + v.x * speed * dt;
      const ny = player.y + v.y * speed * dt;
      const r = 0.32;
      if (!isSolid(Math.floor(nx + Math.sign(v.x) * r), Math.floor(player.y), player.z) && !isSolid(Math.floor(nx + Math.sign(v.x) * r), Math.floor(player.y + r * 0.7), player.z) && !isSolid(Math.floor(nx + Math.sign(v.x) * r), Math.floor(player.y - r * 0.7), player.z)) {
        player.x = nx;
      }
      if (!isSolid(Math.floor(player.x), Math.floor(ny + Math.sign(v.y) * r), player.z) && !isSolid(Math.floor(player.x + r * 0.7), Math.floor(ny + Math.sign(v.y) * r), player.z) && !isSolid(Math.floor(player.x - r * 0.7), Math.floor(ny + Math.sign(v.y) * r), player.z)) {
        player.y = ny;
      }
    }
    if (digHeld) tryDig(dt);
    else {
      digTarget = null;
      digProgress = 0;
    }
  }
  var COLORS = {
    grass: ["#69a84f", "#55853e"],
    flower: ["#74b455", "#55853e"],
    tree: ["#69a84f", "#55853e"],
    surface_rock: ["#9a958c", "#6f6a61"],
    dirt: ["#8a5a33", "#6b4423"],
    sandstone: ["#c2a165", "#9a7f4e"],
    granite: ["#8d8d94", "#5f5f66"],
    basalt: ["#4e4c59", "#35343f"],
    obsidian: ["#332a47", "#1e1830"],
    ore_copper: ["#8a5a33", "#6b4423"],
    ore_iron: ["#c2a165", "#9a7f4e"],
    ore_gold: ["#8d8d94", "#5f5f66"],
    ore_diamond: ["#4e4c59", "#35343f"],
    ore_starcore: ["#332a47", "#1e1830"],
    chest: ["#a06a2c", "#774d1d"],
    stubborn: ["#7a3b2e", "#57281e"],
    pit: ["#17110b", "#17110b"],
    empty: ["#241a10", "#241a10"]
  };
  var ORE_DOT = {
    ore_copper: "#e08a4c",
    ore_iron: "#d8d8e0",
    ore_gold: "#ffd94d",
    ore_diamond: "#7de8ff",
    ore_starcore: "#c07dff"
  };
  function drawTile(sx, sy, wx, wy) {
    const t = tileAt(wx, wy, player.z);
    const [top, front] = COLORS[t.type] ?? COLORS.dirt;
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
        ctx.fillRect(sx + 10, sy + 10, 4, 4);
        ctx.fillRect(sx + 30, sy + 22, 4, 4);
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
    const t2 = facingTile();
    if (digTarget === key(t2.x, t2.y, player.z) && wx === t2.x && wy === t2.y && digProgress > 0) {
      ctx.strokeStyle = "rgba(0,0,0,.65)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      const p = digProgress;
      ctx.moveTo(sx + 8, sy + 8);
      ctx.lineTo(sx + 8 + 26 * p, sy + 14 + 8 * p);
      ctx.moveTo(sx + TILE - 10, sy + 6);
      ctx.lineTo(sx + TILE - 10 - 20 * p, sy + 16 + 10 * p);
      ctx.stroke();
    }
  }
  function drawHouse(sx, sy) {
    ctx.fillStyle = "#8a6642";
    ctx.fillRect(sx, sy - 6, TILE * 2 - 2, ROW_H * 2 - 4);
    ctx.fillStyle = "#b0402f";
    ctx.beginPath();
    ctx.moveTo(sx - 4, sy - 6);
    ctx.lineTo(sx + TILE - 1, sy - 34);
    ctx.lineTo(sx + TILE * 2 + 2, sy - 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#4a2f1a";
    ctx.fillRect(sx + TILE - 10, sy + ROW_H - 2, 18, ROW_H - 6);
    ctx.fillStyle = "#ffd94d";
    ctx.fillRect(sx + 12, sy + 8, 12, 12);
    ctx.fillRect(sx + TILE * 2 - 26, sy + 8, 12, 12);
  }
  function drawPerson(sx, sy, shirt, cap, label) {
    ctx.fillStyle = "rgba(0,0,0,.3)";
    ctx.beginPath();
    ctx.ellipse(sx, sy + 26, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3b3b46";
    ctx.fillRect(sx - 7, sy + 14, 6, 12);
    ctx.fillRect(sx + 1, sy + 14, 6, 12);
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
  function render(now) {
    ctx.fillStyle = player.z === 0 ? "#5d8f43" : "#241a10";
    ctx.fillRect(0, 0, W, H);
    const camX = player.x, camY = player.y;
    const halfCols = Math.ceil(W / TILE / 2) + 2;
    const halfRows = Math.ceil(H / ROW_H / 2) + 2;
    const x0 = Math.floor(camX) - halfCols, x1 = Math.floor(camX) + halfCols;
    const y0 = Math.floor(camY) - halfRows, y1 = Math.floor(camY) + halfRows;
    const toScreen = (wx, wy) => ({
      sx: Math.round((wx - camX) * TILE + W / 2 - TILE / 2),
      sy: Math.round((wy - camY) * ROW_H + H * 0.42 - ROW_H / 2)
    });
    for (let wy = y0; wy <= y1; wy++) {
      for (let wx = x0; wx <= x1; wx++) {
        const { sx, sy } = toScreen(wx, wy);
        drawTile(sx, sy, wx, wy);
      }
      if (player.z === 0 && wy === -4) {
        const h1 = toScreen(3, -4);
        drawHouse(h1.sx, h1.sy);
        const h2 = toScreen(6, -4);
        drawHouse(h2.sx, h2.sy);
      }
      if (player.z === 0 && wy === NPC_POS.y) {
        const n = toScreen(NPC_POS.x, NPC_POS.y);
        drawPerson(n.sx + TILE / 2, n.sy + 8, "#7a4d8f", "#4a2c5a", "Tom \xB7 \u77FF\u5DE5");
      }
      if (Math.floor(player.y) === wy || player.y > wy && player.y < wy + 1) {
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
      const dark = Math.min(0.42, player.z * 4e-3);
      ctx.fillStyle = `rgba(8,4,2,${dark})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
  function updateHud() {
    $("hDepth").textContent = player.z + "m";
    $("hLayer").textContent = player.z === 0 ? "\u5730\u8868 \xB7 \u6751\u5E84" : stratumAt(player.z).name + " L" + stratumAt(player.z).id;
    $("hCoins").textContent = String(coins);
    $("hWords").textContent = String(book.masteredCount());
    const bag = Object.entries(save.inventory).filter(([k, v]) => k !== "coin" && v > 0).map(([k, v]) => (ORE_NAMES[k] ?? k) + "\xD7" + v).join(" ");
    $("hBag").textContent = bag || "\u80CC\u5305\u7A7A";
    const nearNpc = player.z === 0 && Math.hypot(player.x - (NPC_POS.x + 0.5), player.y - (NPC_POS.y + 0.5)) < 1.7;
    const px = Math.floor(player.x), py = Math.floor(player.y);
    $("btnAct").textContent = nearNpc ? "\u804A\u5929" : getDiff(save, px, py, player.z) === "pit" && player.z > 0 ? "\u4E0A\u68AF" : "\u4E0B\u6316";
    $("hint").textContent = player.z === 0 ? "\u901B\u901B\u6751\u5E84\uFF0C\u627E Tom \u804A\u5929 \xB7 \u5728\u8349\u5730\u4E0A\u6309\u4E0B\u6316\u5F00\u59CB\u6316\u5B9D" : "\u5BF9\u7740\u65B9\u5757\u6309\u4F4F\u300C\u6316\u300D\xB7 \u811A\u4E0B\u6309\u300C\u4E0B\u6316\u300D\u7EE7\u7EED\u6DF1\u5165 \xB7 \u6316\u5230\u5B9D\u7BB1\u7B54\u8BCD\u5F00\u7BB1";
  }
  var last = 0;
  function frame(now) {
    if (canvas.clientWidth && (canvas.clientWidth !== W || canvas.clientHeight !== H)) resize();
    const dt = Math.min(0.05, (now - last) / 1e3 || 0.016);
    last = now;
    update(dt);
    render(now);
    updateHud();
    requestAnimationFrame(frame);
  }
  bindJoystick();
  bindButton("btnDig", () => digHeld = true, () => digHeld = false);
  bindButton("btnAct", () => actButton());
  $("npcClose").addEventListener("click", () => $("npcSheet").classList.remove("open"));
  resize();
  for (const [wx, wy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    if (tileAt(wx, wy, 0).solid) setDiff(save, wx, wy, 0, "dug");
  }
  persist();
  if (!localStorage.getItem("xap-seen")) {
    toast("\u6B22\u8FCE\u6765\u5230 XAP \u6751 \xB7 \u53BB\u5730\u4E0B\u6316\u5B9D\u5427");
    try {
      localStorage.setItem("xap-seen", "1");
    } catch {
    }
  }
  requestAnimationFrame(frame);
})();
