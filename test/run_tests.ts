// Core logic tests. Run: npm test   (node test/run_tests.ts)
// No test framework on purpose: plain node:assert, zero dependencies.

import assert from "node:assert";
import { hashString } from "../cocos/assets/core/rng.ts";
import { stratumAt } from "../cocos/assets/core/strata.ts";
import { getTile, genChunk, guaranteedChestPos, CHEST_BLOCK } from "../cocos/assets/core/worldgen.ts";
import { WORDS_TIER1 } from "../cocos/assets/core/vocab.ts";
import { ChestSession, makeQuestion, REWARD_STEPS } from "../cocos/assets/core/quiz.ts";
import { MasteryBook, pickChestWord } from "../cocos/assets/core/mastery.ts";
import { newSave, setDiff, getDiff, placeStubborn, addItem, serializeSave, deserializeSave } from "../cocos/assets/data/player-data/save.ts";
import { PlayerStore } from "../cocos/assets/data/player-data/PlayerStore.ts";
import { PLAYER_STORAGE_KEY } from "../cocos/assets/data/constants/GameRules.ts";
import { readWorldContent } from "../cocos/assets/data/external-files/WorldContent.ts";
import { Expedition } from "../cocos/assets/core/Expedition.ts";
import { VILLAGE } from "../cocos/assets/data/external-files/Village.ts";
import { SALT, WORD_DROP_CHANCE, WORD_PICKUP_COINS } from "../cocos/assets/data/constants/GameRules.ts";
import { hashCoords } from "../cocos/assets/core/rng.ts";
import { ART_NAMES, ORE_ART } from "../cocos/assets/data/resource-config/ArtCatalog.ts";
import { readFileSync } from "node:fs";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log("ok -", name);
}

const SEED = hashString("xap-test-world");

check("strata boundaries match DESIGN.md", () => {
  assert.equal(stratumAt(1).id, 1);
  assert.equal(stratumAt(30).id, 1);
  assert.equal(stratumAt(31).id, 2);
  assert.equal(stratumAt(100).id, 2);
  assert.equal(stratumAt(101).id, 3);
  assert.equal(stratumAt(250).id, 3);
  assert.equal(stratumAt(251).id, 4);
  assert.equal(stratumAt(500).id, 4);
  assert.equal(stratumAt(501).id, 5);
  assert.equal(stratumAt(99999).id, 5);
});

check("world generation is deterministic for the same seed", () => {
  for (const z of [0, 5, 40, 120]) {
    const a = genChunk(SEED, 3, -2, z);
    const b = genChunk(SEED, 3, -2, z);
    assert.deepEqual(a, b);
  }
});

check("a different seed produces a different world somewhere", () => {
  const other = hashString("another-world");
  let differs = false;
  for (let x = 0; x < 64 && !differs; x++)
    for (let y = 0; y < 64 && !differs; y++)
      if (getTile(SEED, x, y, 10).type !== getTile(other, x, y, 10).type) differs = true;
  assert.ok(differs);
});

check("surface slice only contains surface tiles", () => {
  const kinds = new Set(["grass", "tree", "flower", "surface_rock"]);
  for (let x = 0; x < 100; x++)
    for (let y = 0; y < 100; y++) assert.ok(kinds.has(getTile(SEED, x, y, 0).type));
});

check("every CHEST_BLOCK x CHEST_BLOCK area holds its guaranteed chest", () => {
  let found = 0;
  let total = 0;
  for (let x = 0; x < 100; x++)
    for (let y = 0; y < 100; y++) {
      total++;
      if (getTile(SEED, x, y, 10).type === "chest") found++;
    }
  // 100x100 = 16 full guarantee blocks -> at least 16 chests, and chests stay rare.
  assert.ok(found >= 16, "expected >=16 chests, got " + found);
  assert.ok(found / total < 0.02, "chests too dense: " + found);
  const p = guaranteedChestPos(SEED, 37, 42, 10);
  assert.ok(p.x >= 25 && p.x < 50 && p.y >= 25 && p.y < 50);
  assert.equal(getTile(SEED, p.x, p.y, 10).type, "chest");
  assert.ok(CHEST_BLOCK === 25);
});

check("underground hardness grows with depth", () => {
  assert.equal(getTile(SEED, 1, 1, 10).hardness >= 1, true);
  assert.ok(stratumAt(300).hardness > stratumAt(10).hardness);
});

check("vocab pool: 20 tier-1 words, each with 3 clean distractors", () => {
  assert.equal(WORDS_TIER1.length, 20);
  for (const w of WORDS_TIER1) {
    assert.equal(w.tier, 1);
    assert.equal(w.distractors.length, 3);
    assert.equal(new Set(w.distractors).size, 3, w.word);
    assert.ok(!w.distractors.includes(w.meaning), w.word);
    assert.ok(w.example.toLowerCase().includes(w.word), w.word);
  }
});

check("quiz question contains the correct meaning exactly once", () => {
  for (const w of WORDS_TIER1) {
    const q = makeQuestion(w, 42);
    assert.equal(q.options.length, 4);
    assert.equal(q.options.filter((o) => o === w.meaning).length, 1);
    assert.equal(q.options[q.correctIndex], w.meaning);
  }
});

check("chest reward steps: 100 / 70 / 40, and the floor opens the chest", () => {
  const entry = WORDS_TIER1[0];
  // first-try correct
  let s = new ChestSession(entry, 1);
  let r = s.answer(s.question.correctIndex);
  assert.deepEqual([r.opened, r.rewardMultiplier], [true, REWARD_STEPS[0]]);
  // wrong then correct
  s = new ChestSession(entry, 1);
  const wrong = (s.question.correctIndex + 1) % 4;
  r = s.answer(wrong);
  assert.deepEqual([r.opened, r.rewardMultiplier], [false, 0]);
  r = s.answer(s.question.correctIndex);
  assert.deepEqual([r.opened, r.rewardMultiplier], [true, REWARD_STEPS[1]]);
  // three wrongs -> floor opens, never blocks
  s = new ChestSession(entry, 1);
  s.answer(wrong);
  s.answer(wrong);
  r = s.answer(wrong);
  assert.deepEqual([r.opened, r.rewardMultiplier], [true, 0.25]);
});

check("mastery: wrong answer re-buries the word 10-30 m deeper", () => {
  const book = new MasteryBook();
  const out = book.recordAnswer("gold", false, 20);
  assert.equal(out.state.status, "learning");
  assert.ok(out.stubbornDepth !== undefined);
  assert.ok(out.stubbornDepth >= 30 && out.stubbornDepth <= 50, "stubbornDepth=" + out.stubbornDepth);
});

check("mastery: two spaced correct answers master a word", () => {
  const book = new MasteryBook();
  book.recordAnswer("gold", true, 10);
  const out = book.recordAnswer("gold", true, 30);
  assert.equal(out.state.status, "mastered");
  assert.equal(out.becameMastered, true);
  assert.equal(book.masteredCount(), 1);
});

check("chest word picking serves due review words", () => {
  const book = new MasteryBook();
  book.recordAnswer("apple", false, 5); // now due at its stubborn depth
  const due = book.dueWords(100);
  assert.equal(due.length, 1);
  const picked = pickChestWord(WORDS_TIER1, book, 100, () => 0.8); // 0.8 lands in the review band
  assert.equal(picked?.word, "apple");
});

check("save round-trips through JSON unchanged", () => {
  const save = newSave("xap-test-world");
  setDiff(save, 3, 4, 12, "dug");
  placeStubborn(save, 3, 4, 40, "gold");
  addItem(save, "ore_copper", 3);
  save.maxDepth = 40;
  const book = new MasteryBook();
  book.recordAnswer("gold", false, 20);
  save.mastery = book.serialize();
  const back = deserializeSave(serializeSave(save));
  assert.deepEqual(back, save);
  assert.equal(getDiff(back, 3, 4, 12), "dug");
  assert.equal(MasteryBook.deserialize(back.mastery).get("gold").status, "learning");
});

check("player storage resumes position and refuses invalid saves without overwriting", () => {
  const values = new Map<string, string>();
  let writes = 0;
  const store = new PlayerStore({ getItem: k => values.get(k) ?? null, setItem: (k, v) => { writes++; values.set(k, v); } });
  const slot = store.load("resume-test");
  slot.position = { x: -12.5, y: 8.5, z: 19 };
  slot.game.maxDepth = 19;
  store.save(slot);
  assert.deepEqual(store.load("ignored-new-seed"), slot);
  values.set(PLAYER_STORAGE_KEY, '{"version":99}');
  assert.throws(() => store.load("resume-test"));
  assert.equal(writes, 1);
  assert.equal(values.get(PLAYER_STORAGE_KEY), '{"version":99}');
  assert.throws(() => deserializeSave(JSON.stringify({ ...newSave("bad"), inventory: { coin: -1 } })));
  const old = newSave("old-v1") as any;
  delete old.seenWords;
  assert.deepEqual(deserializeSave(JSON.stringify(old)).seenWords, []);
});

check("storage write failures propagate while the old slot survives", () => {
  const original = "existing slot";
  let stored = original;
  const store = new PlayerStore({ getItem: () => stored, setItem: () => { throw new Error("quota exceeded"); } });
  const slot = new PlayerStore({ getItem: () => null, setItem: () => {} }).load("quota");
  assert.throws(() => store.save(slot), /quota exceeded/);
  assert.equal(stored, original);
});

check("external world content rejects incomplete or unknown-version data", () => {
  const valid = { version: 1, title: "地心寻词", seedString: "content-world", welcome: "开始探索" };
  assert.equal(readWorldContent(valid).seedString, "content-world");
  assert.throws(() => readWorldContent({ ...valid, seedString: "" }));
  assert.throws(() => readWorldContent({ ...valid, version: 2 }));
  assert.throws(() => readWorldContent(null));
});

const TUNING = { moveSpeed: 4, acceleration: 11, digSeconds: 0.42 };
const freshSlot = (seed = "expedition-test") => new PlayerStore({ getItem: () => null, setItem: () => {} }).load(seed);

check("Cocos expedition moves without crossing blocks and keeps shafts returnable", () => {
  const expedition = new Expedition(freshSlot());
  expedition.descend();
  assert.equal(expedition.slot.position.z, 1);
  assert.equal(expedition.tileAt(0, 0).type, "shaft");
  for (let i = 0; i < 60; i++) expedition.tick(1 / 60, 1, 0, false, TUNING);
  assert.equal(expedition.collides(expedition.slot.position.x, expedition.slot.position.y), false);
  assert.ok(expedition.slot.position.x < 1);
  expedition.ascend();
  assert.equal(expedition.slot.position.z, 0);
  expedition.descend();
  expedition.descend();
  assert.equal(expedition.slot.position.z, 2);
  expedition.ascend();
  expedition.ascend();
  assert.equal(expedition.slot.position.z, 0);
});

check("Cocos expedition opens an actual generated chest and persists mastery and rewards", () => {
  const slot = freshSlot();
  const chest = guaranteedChestPos(slot.game.seed, 0, 0, 1);
  slot.position = { x: chest.x - 0.5, y: chest.y + 0.5, z: 1 };
  setDiff(slot.game, chest.x - 1, chest.y, 1, "dug");
  const expedition = new Expedition(slot);
  expedition.tick(0.01, 1, 0, true, TUNING);
  assert.ok(expedition.quiz);
  const word = expedition.quiz.entry.word;
  expedition.answer(expedition.quiz.session.question.correctIndex);
  assert.equal(expedition.quiz, null);
  assert.equal(getDiff(slot.game, chest.x, chest.y, 1), "dug");
  assert.equal(slot.game.inventory.coin, 10);
  assert.equal(slot.game.mastery[word].status, "learning");
  assert.ok(slot.game.seenWords.includes(word));
});

check("Cocos downward digging preserves sealed tiles and mined blocks become walkable", () => {
  const slot = freshSlot();
  placeStubborn(slot.game, 0, 0, 1, "apple");
  const expedition = new Expedition(slot);
  expedition.descend();
  assert.equal(slot.position.z, 0);
  assert.equal(getDiff(slot.game, 0, 0, 0), undefined);
  delete slot.game.diffs["0,0,1"];
  delete slot.game.stubborn["0,0,1"];
  expedition.descend();
  for (let i = 0; i < 20 && getDiff(slot.game, 1, 0, 1) !== "dug"; i++) expedition.tick(0.05, 1, 0, true, TUNING);
  assert.equal(getDiff(slot.game, 1, 0, 1), "dug");
  assert.equal(expedition.tileAt(1, 0).solid, false);
});

check("village houses and May block movement but are never digging targets", () => {
  const slot = freshSlot();
  slot.position = { x: VILLAGE.npc.x + 0.5, y: VILLAGE.npc.y + 1.5, z: 0 };
  const expedition = new Expedition(slot);
  assert.equal(expedition.canTalkToNpc(), true);
  assert.equal(expedition.collides(3.5, -3.5), true);
  assert.equal(expedition.collides(5.5, -1.5), true);
  expedition.facing = { x: 0, y: -1 };
  const target = expedition.findTarget();
  if (target) assert.notEqual(expedition.tileAt(target.x, target.y).type, "village");
  expedition.descend();
  assert.equal(expedition.canTalkToNpc(), false);
  assert.notEqual(expedition.tileAt(VILLAGE.npc.x, VILLAGE.npc.y).type, "village");
});

check("an old position inside a restored house is moved out without changing inventory or world diffs", () => {
  const slot = freshSlot();
  slot.position = { x: 4, y: -3, z: 0 };
  slot.game.inventory.coin = 27;
  const before = serializeSave(slot.game);
  const expedition = new Expedition(slot);
  assert.equal(expedition.collides(slot.position.x, slot.position.y), false);
  assert.equal(serializeSave(slot.game), before);
  assert.equal(expedition.dirty, true);
});

check("walking into a pit descends, while climbing out does not bounce back down", () => {
  const slot = freshSlot();
  setDiff(slot.game, 1, 0, 0, "pit");
  const expedition = new Expedition(slot);
  for (let i = 0; i < 30; i++) expedition.tick(1 / 60, 1, 0, false, TUNING);
  assert.equal(slot.position.z, 1);
  expedition.ascend();
  for (let i = 0; i < 90; i++) expedition.tick(1 / 60, 0, 0, false, TUNING);
  assert.equal(slot.position.z, 0);
  for (let i = 0; i < 28; i++) expedition.tick(1 / 60, -1, 0, false, TUNING);
  for (let i = 0; i < 38; i++) expedition.tick(1 / 60, 1, 0, false, TUNING);
  assert.equal(slot.position.z, 1);
});

check("word drops are deterministic per mined tile and collected only once", () => {
  const slot = freshSlot("drop-fixture");
  let x = 1;
  while (hashCoords(slot.game.seed, x, 0, 1, SALT.wordDrop) / 4294967296 >= WORD_DROP_CHANCE || getTile(slot.game.seed, x, 0, 1).type === "chest") x++;
  const mine = () => {
    const next = freshSlot("drop-fixture");
    next.position = { x: x - 0.5, y: 0.5, z: 1 };
    setDiff(next.game, x - 1, 0, 1, "dug");
    const expedition = new Expedition(next);
    for (let i = 0; i < 100 && getDiff(next.game, x, 0, 1) !== "dug"; i++) expedition.tick(0.05, 1, 0, true, TUNING);
    return expedition;
  };
  const expedition = mine();
  assert.equal(expedition.wordDrops.length, 1);
  assert.equal(mine().wordDrops[0].entry.word, expedition.wordDrops[0].entry.word);
  const word = expedition.wordDrops[0].entry.word;
  expedition.slot.position.x = x + 0.5;
  expedition.velocity.x = 0;
  expedition.tick(0.01, 0, 0, false, TUNING);
  expedition.tick(0.01, 0, 0, false, TUNING);
  assert.equal(expedition.wordDrops.length, 0);
  assert.ok(expedition.slot.game.seenWords.includes(word));
  assert.equal(expedition.slot.game.inventory.coin, WORD_PICKUP_COINS);
});

check("all approved sprite names resolve to real PNG assets", () => {
  assert.equal(new Set(ART_NAMES).size, 31);
  for (const name of ART_NAMES) {
    const bytes = readFileSync(new URL("../cocos/assets/resources/art/" + name + ".png", import.meta.url));
    assert.equal(bytes.toString("ascii", 1, 4), "PNG");
    assert.ok(bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0);
  }
  for (const name of Object.values(ORE_ART)) assert.ok((ART_NAMES as readonly string[]).includes(name));
});

console.log("\n" + passed + " test groups passed");
