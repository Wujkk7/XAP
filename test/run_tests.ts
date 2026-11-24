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
import { obliqueProjection, occlusionAlpha } from "../cocos/assets/scripts/ObliqueProjection.ts";
import { XPAA_ATLAS_SIZE, XPAA_REGIONS, WALK_CANVAS, walkFrame } from "../cocos/assets/data/resource-config/XPAAArt.ts";
import { isoProject, isoUnproject, isoBlocked, IsometricWalk } from "../cocos/assets/core/Isometric.ts";
import { ISOMETRIC_MAP } from "../cocos/assets/data/external-files/IsometricMap.ts";
import { LayeredLab, makeLabLayer } from "../cocos/assets/core/LayeredLab.ts";
import { WordPassages } from "../cocos/assets/core/WordPassages.ts";
import { LETTERS, LAB_SERVICES } from "../cocos/assets/data/constants/WordPassageRules.ts";
import { labBrightness, smoothBrightness } from "../cocos/assets/core/LabLighting.ts";

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

check("lower front camera exposes upright bodies while compressing ground depth", () => {
  const level = obliqueProjection(48, 45), low = obliqueProjection(48, 25);
  assert.ok(Math.abs(level.uprightScale - 1) < 1e-12);
  assert.ok(low.rowHeight < level.rowHeight);
  assert.ok(low.uprightScale > level.uprightScale);
  const half = obliqueProjection(24, 25);
  assert.equal(half.rowHeight * 2, low.rowHeight);
  assert.equal(half.uprightScale, low.uprightScale);
  for (const pitch of [NaN, Infinity, 0, 90]) assert.throws(() => obliqueProjection(48, pitch));
  assert.throws(() => obliqueProjection(0, 25));
});

check("foreground occlusion accounts for tall trees at low camera angles", () => {
  assert.equal(occlusionAlpha(0, -1, 90, 150, 30, 50), 1, "background stays opaque");
  assert.equal(occlusionAlpha(120, 60, 90, 150, 30, 50), 1, "off to the side stays opaque");
  assert.equal(occlusionAlpha(0, 160, 90, 150, 30, 50), 1, "tree top below player stays opaque");
  assert.ok(occlusionAlpha(0, 60, 90, 150, 30, 50) < 0.4, "tree three rows ahead still fades");
  assert.ok(occlusionAlpha(0, 130, 90, 150, 30, 50) > occlusionAlpha(0, 60, 90, 150, 30, 50));
});

check("XPAA atlas regions fit the source image and walking canvas", () => {
  const bytes = readFileSync(new URL("../cocos/assets/resources/xpaa/validation-board.png", import.meta.url));
  assert.equal(bytes.toString("ascii", 1, 4), "PNG");
  const dimensions = [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  assert.deepEqual(dimensions, XPAA_ATLAS_SIZE);
  for (const [name, [x, y, w, h]] of Object.entries(XPAA_REGIONS)) {
    assert.ok([x, y, w, h].every(Number.isInteger), name);
    assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= dimensions[0] && y + h <= dimensions[1], name);
    if (name.startsWith("walk_")) assert.ok(w <= WALK_CANVAS[0] && h <= WALK_CANVAS[1], name);
  }
});

check("XPAA walking selects existing directional frames and returns to idle", () => {
  for (const [x, y, direction] of [[0, 1, "down"], [-1, 0, "left"], [1, 0, "right"], [0, -1, "up"]] as const) {
    for (let step = 0; step < 8; step++) {
      const frame = walkFrame(x, y, (step + 0.5) * 0.22, true);
      assert.equal(frame, `walk_${direction}_${step % 4}`);
      assert.ok(XPAA_REGIONS[frame], frame);
    }
    assert.equal(walkFrame(x, y, 123, false), `walk_${direction}_0`);
  }
});

check("isometric projection is invertible and forms 2:1 diamonds", () => {
  for (const [x, y] of [[0, 0], [1, 0], [0, 1], [6.5, 7.25], [13, 13], [-1.5, 3.1]]) {
    const point = isoProject(x, y), restored = isoUnproject(point.x, point.y);
    assert.ok(Math.abs(restored.x - x) < 1e-10 && Math.abs(restored.y - y) < 1e-10);
  }
  assert.equal(isoProject(1, 0).x, 48); assert.equal(isoProject(0, 1).x, -48);
  assert.equal(isoProject(1, 0).y, -24); assert.equal(isoProject(0, 1).y, -24);
});

check("isometric controls follow screen directions and reset without touching saves", () => {
  const walk = new IsometricWalk(); walk.x = walk.y = 6.5;
  const before = isoProject(walk.x, walk.y);
  for (let i = 0; i < 10; i++) walk.tick(1 / 60, 1, 0);
  const after = isoProject(walk.x, walk.y);
  assert.ok(after.x > before.x); assert.ok(Math.abs(after.y - before.y) < 1e-8);
  walk.reset(); assert.equal(walk.x, ISOMETRIC_MAP.spawn.x); assert.equal(walk.y, ISOMETRIC_MAP.spawn.y);
  assert.equal(walk.vx, 0); assert.equal(walk.vy, 0); assert.equal(walk.distance, 0);
});

check("isometric finite map blocks water, trees and boundary during extended movement", () => {
  assert.ok(!isoBlocked(ISOMETRIC_MAP.spawn.x, ISOMETRIC_MAP.spawn.y));
  for (const p of ISOMETRIC_MAP.props) assert.ok(isoBlocked(p.x + 0.5, p.y + 0.5));
  for (const [x, y] of ISOMETRIC_MAP.water) assert.ok(isoBlocked(x + 0.5, y + 0.5));
  assert.ok(isoBlocked(-0.1, 6)); assert.ok(isoBlocked(13.1, 6));
  const walk = new IsometricWalk();
  for (let i = 0; i < 8000; i++) {
    walk.tick(i % 37 === 0 ? 1 : 1 / 60, Math.sin(i / 111), Math.cos(i / 97));
    assert.ok(!isoBlocked(walk.x, walk.y), `blocked position ${walk.x},${walk.y}`);
  }
});

check("layered experiment generates independent forest, roots and mineral grids", () => {
  const a = makeLabLayer(0), b = makeLabLayer(1), c = makeLabLayer(2);
  assert.equal(a.theme, 0); assert.equal(b.theme, 1); assert.equal(c.theme, 2);
  assert.ok(b.tiles.flat().some(t => t.kind === "root")); assert.ok(c.tiles.flat().some(t => t.kind === "wall"));
  assert.ok(c.tiles.flat().some(t => t.kind === "ore"));
  a.tiles[7][6].damage = 0.8; assert.equal(b.tiles[7][6].damage, 0);
  assert.deepEqual(makeLabLayer(8), makeLabLayer(8));
});

check("breaking opens a real channel and can repeatedly enter different layers", () => {
  const lab = new LayeredLab();
  for (let depth = 1; depth <= 5; depth++) {
    lab.tick(0.05, 0, 0, false);
    for (let i = 0; i < 100 && !lab.travel; i++) lab.tick(0.05, 0, 0, true);
    assert.ok(lab.travel); assert.ok(lab.tile(6, 7, depth - 1)?.hole);
    for (let i = 0; i < 30; i++) lab.tick(0.05, 0, 0, false);
    assert.equal(lab.depth, depth); assert.equal(lab.maxDepth, depth);
    assert.ok(!lab.collides(lab.walk.x, lab.walk.y));
    assert.ok(lab.layer().entrances.some(p => p.x === 6 && p.y === 7));
  }
});

check("returning through an entrance preserves lower passages and mined resources", () => {
  const lab = new LayeredLab();
  const breakFloor = () => {
    lab.tick(0.05, 0, 0, false);
    for (let i = 0; i < 100 && !lab.travel; i++) lab.tick(0.05, 0, 0, true);
    for (let i = 0; i < 30; i++) lab.tick(0.05, 0, 0, false);
  };
  breakFloor(); breakFloor(); assert.equal(lab.depth, 2);
  assert.ok(lab.ascend()); for (let i = 0; i < 30; i++) lab.tick(0.05, 0, 0, false);
  assert.equal(lab.depth, 1); assert.ok(lab.tile(6, 7, 1)?.hole);
  lab.tick(0.05, 0, 0, true); assert.ok(lab.travel);
  for (let i = 0; i < 30; i++) lab.tick(0.05, 0, 0, false);
  assert.equal(lab.depth, 2); assert.ok(!lab.collides(lab.walk.x, lab.walk.y));
  lab.walk.x = 5.5; lab.walk.y = 5.5; assert.ok(lab.select(5, 4));
  for (let i = 0; i < 100; i++) lab.tick(0.05, 0, 0, true);
  assert.equal(lab.resources, 1); assert.equal(lab.tile(5, 4)?.kind, "floor");
  assert.equal(lab.depth, 2); assert.equal(lab.travel, null);
});

check("holding a strike does not auto-chain descents and water cannot be broken", () => {
  const lab = new LayeredLab();
  for (let i = 0; i < 200; i++) lab.tick(0.05, 0, 0, true);
  assert.equal(lab.depth, 1); assert.equal(lab.travel, null);
  const wet = new LayeredLab(); wet.walk.x = 2.5; wet.walk.y = 3.5;
  assert.ok(wet.select(2, 4)); for (let i = 0; i < 80; i++) wet.tick(0.05, 0, 0, true);
  assert.equal(wet.tile(2, 4)?.hole, false); assert.equal(wet.depth, 0);
});

check("layered movement and strikes survive 1500 frames without embedding", () => {
  let random = 42;
  const next = () => { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return random / 4294967296; };
  for (let depth = 0; depth < 3; depth++) {
    const lab = new LayeredLab(); lab.depth = depth; lab.layer(depth);
    for (let i = 0; i < 500; i++) {
      lab.tick(1 / 60, next() * 2 - 1, next() * 2 - 1, i % 240 < 85);
      assert.ok(!lab.collides(lab.walk.x, lab.walk.y), `embedded at layer ${lab.depth}, frame ${i}`);
      assert.ok(lab.effects.length <= 32);
    }
  }
});

check("word passage consumes repeated letters atomically and opens a real returnable channel", () => {
  const lab = new LayeredLab(), words = new WordPassages(lab);
  words.room.answer = "APPLE"; lab.walk.x = 6.5; lab.walk.y = 6.5;
  words.letters.A=1; words.letters.P=1; words.letters.L=1; words.letters.E=1;
  assert.equal(words.available("P","AP"),0); assert.equal(words.submit("APPLE"),false);
  assert.equal(words.submit("APBLE"),false); assert.equal(words.letters.P,1);
  words.letters.P++; assert.ok(words.submit("APPLE")); assert.equal(words.letters.P,0); assert.equal(words.correct.APPLE,1);
  assert.equal(words.adventure.book.get('apple').encounters,1);
  assert.equal(words.submit("APPLE"),false); assert.ok(lab.tile(6,5)!.hole);
  lab.walk.x=6.5;lab.walk.y=5.5;lab.tick(.05,0,0,true);
  for(let i=0;i<30;i++)lab.tick(.05,0,0,false);
  words.prepare(); assert.equal(lab.depth,1); assert.ok(lab.layer().entrances.some(p=>p.x===6&&p.y===5));
  assert.ok(!lab.collides(lab.walk.x,lab.walk.y)); assert.ok(lab.ascend());
  for(let i=0;i<30;i++)lab.tick(.05,0,0,false);
  assert.equal(lab.depth,0);assert.ok(lab.tile(6,5)!.hole);
});

check("new gates never reuse reserved or seen words and exhausted pools stop new descent", () => {
  const lab=new LayeredLab(), words=new WordPassages(lab), answers=new Set<string>();
  for(let d=0;d<40;d++){
    lab.depth=d;lab.walk.x=6.5;lab.walk.y=7.5;const r=words.prepare();
    if(r.answer){assert.ok(!answers.has(r.answer));answers.add(r.answer);words.discover();}
  }
  assert.equal(answers.size,36);assert.equal(words.room.answer,'');
  lab.tick(.05,0,0,false);for(let i=0;i<150&&!lab.travel;i++)lab.tick(.05,0,0,true);
  assert.equal(lab.travel,null,'exhausted vocabulary cannot be bypassed through ordinary ground');
  assert.equal(lab.tile(6,7)!.hole,false);
});

check("wrong quiz attempts preserve the same letter rewards but reduce extra coins", () => {
  const a=new WordPassages(new LayeredLab()),b=new WordPassages(new LayeredLab());
  const q=a.quiz(0).question;
  const first=a.answerChest(0,q.correctIndex);
  assert.equal(b.answerChest(0,(q.correctIndex+1)%4).opened,false);
  assert.equal(b.answerChest(0,(q.correctIndex+1)%4).opened,false);
  const floor=b.answerChest(0,(q.correctIndex+1)%4);
  assert.ok(floor.opened);assert.equal(first.letters,floor.letters);assert.equal(first.letters.length,12);
  assert.ok(a.coins>b.coins);assert.throws(()=>b.answerChest(0,q.correctIndex));
});

check("planning is free and targeted exchange cannot create letters without payment", () => {
  const words=new WordPassages(new LayeredLab());
  assert.ok(words.track('APPLE'));assert.deepEqual(words.needs(),{A:1,P:2,L:1,E:1});assert.equal(words.letters.P,0);
  assert.equal(words.exchange('P'),false);words.lab.resources=1;assert.ok(words.exchange('P'));assert.equal(words.lab.resources,0);
  words.letters.E=3;assert.ok(words.exchange('P','E'));assert.equal(words.letters.E,0);assert.equal(words.letters.P,2);
  assert.equal(words.exchange('P','P'),false);assert.equal(words.exchange('Q','A'),false);
  assert.equal(words.track('A1'),false);assert.equal(words.exchange('AB'),false);
});

check("tracked shortages gently bias deterministic loot without changing letter count", () => {
  let tracked=0,plain=0;
  for(let d=0;d<30;d++){
    const a=new WordPassages(new LayeredLab()),b=new WordPassages(new LayeredLab());
    a.lab.depth=d;b.lab.depth=d;a.prepare();b.prepare();a.track('QQQQQQQQQQQQQQQQ');
    for(let index=0;index<3;index++){
      const qa=a.quiz(index).question,qb=b.quiz(index).question;
      const aa=a.answerChest(index,qa.correctIndex),bb=b.answerChest(index,qb.correctIndex);
      assert.equal(aa.letters.length,bb.letters.length);
      tracked+=Array.from(aa.letters).filter(c=>c==='Q').length;plain+=Array.from(bb.letters).filter(c=>c==='Q').length;
    }
  }
  assert.ok(tracked>plain);assert.ok(tracked<30*3*12*.5,'bias must not replace random drops');
});

check("ordinary taps cannot bypass the seal, but work after its successful opening", () => {
  const lab=new LayeredLab(),words=new WordPassages(lab);
  lab.tapStrike();assert.equal(lab.tile(6,7)!.damage,0);assert.equal(lab.travel,null);
  const word=words.room.answer;lab.walk.x=6.5;lab.walk.y=6.5;
  for(const c of word)words.letters[c]++;
  assert.ok(words.submit(word));lab.walk.x=6.5;lab.walk.y=7.5;
  for(let i=0;i<4&&!lab.travel;i++){lab.tick(.01,0,0,false);lab.tapStrike();}
  assert.ok(lab.travel);assert.ok(lab.tile(6,7,0)!.hole);
});

check("clue observations support guessing without leaking unresolved answers through the dex", () => {
  const words=new WordPassages(new LayeredLab());assert.equal(words.hint(),false);
  words.lab.resources=1;assert.ok(words.hint());assert.ok(words.hint());assert.equal(words.lab.resources,0);
  words.discover();const observation=words.learn();assert.ok(observation.length>20);
  assert.ok(!new RegExp('\\b'+words.room.answer+'\\b','i').test(observation));
  assert.ok(words.seen.includes(words.room.answer));assert.ok(!words.visibleWords().includes(words.room.answer));
  words.room.opened=true;assert.ok(words.visibleWords().includes(words.room.answer));
});

check("underground lamp has finite smooth falloff while the surface remains bright", () => {
  assert.equal(labBrightness(0,100),1);assert.equal(labBrightness(1,0),1);
  assert.ok(labBrightness(1,1)>labBrightness(1,2));assert.ok(labBrightness(1,2)>labBrightness(1,3));
  assert.ok(labBrightness(1,4)<.04);assert.equal(labBrightness(1,10),labBrightness(9,10));
  let light=1;const target=labBrightness(1,4);
  for(let i=0;i<60;i++){const next=smoothBrightness(light,target,1/60);assert.ok(next<=light&&next>=target);light=next;}
  assert.ok(Math.abs(light-target)<.001);assert.equal(smoothBrightness(-1,target,1/60),target);
});

check("experiment save restores terrain, inventory, attempts and progression without formal save access", () => {
  const words=new WordPassages(new LayeredLab());words.lab.resources=5;words.track('APPLE');words.exchange('P');words.learn();
  const q=words.quiz(1).question;words.answerChest(1,(q.correctIndex+1)%4);
  const raw=words.snapshot(),copy=new WordPassages(new LayeredLab());copy.restore(raw);assert.equal(copy.snapshot(),raw);
  const state=copy.snapshot();for(const change of [
    (s:any)=>s.letters.P=-1,(s:any)=>s.x=NaN,(s:any)=>s.rooms['0'].attempts[0]=9,
    (s:any)=>s.layers[0].tiles[0][0].kind='invalid',(s:any)=>s.layers.push(s.layers[0]),
  ]){const bad=JSON.parse(raw);change(bad);assert.throws(()=>copy.restore(JSON.stringify(bad)));assert.equal(copy.snapshot(),state);}
});

check("service routes stay reachable and letter gameplay survives 1500 exploration frames", () => {
  for(let d=0;d<3;d++){
    const lab=new LayeredLab(),words=new WordPassages(lab);lab.depth=d;words.prepare();
    const queue=[[6,7]],seen=new Set(['6,7']);
    for(let i=0;i<queue.length;i++){const[x,y]=queue[i];for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+dx,ny=y+dy,k=nx+','+ny,t=lab.tile(nx,ny);
      if(t&&['floor','path'].includes(t.kind)&&!seen.has(k)){seen.add(k);queue.push([nx,ny]);}
    }}
    for(const p of words.services)assert.ok(seen.has(p.x+','+p.y)||p.id==='may'&&[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>seen.has((p.x+dx)+','+(p.y+dy))));
    for(let i=0;i<500;i++){lab.tick(1/60,Math.sin(i*.13),Math.cos(i*.19),i%100<20);words.prepare();assert.ok(!lab.collides(lab.walk.x,lab.walk.y));}
  }
});

check('expanded layers are deterministic 25x25 maps with treasure, resources and a protected village',()=>{
  for(let d=0;d<40;d++){
    const lab=new LayeredLab(),w=new WordPassages(lab);lab.depth=d;w.prepare();const layer=lab.layer();
    assert.equal(layer.tiles.length,25);assert.ok(layer.tiles.every(row=>row.length===25));
    if(d>0)assert.ok(layer.tiles.flat().some(t=>t.kind==='chest'),'depth '+d+' needs an exploration chest');
    assert.ok(layer.tiles.flat().some(t=>['tree','root','ore','rock','wall'].includes(t.kind)));
  }
  const lab=new LayeredLab();assert.equal(lab.tile(15,14)!.kind,'village');
  lab.walk.x=15.5;lab.walk.y=16.5;lab.select(15,15);
  for(let i=0;i<10;i++)lab.tapStrike();assert.equal(lab.tile(15,15)!.kind,'village');
});

check('collecting timber and minerals fills the independent adventure bag and survives reload',()=>{
  const lab=new LayeredLab(),w=new WordPassages(lab);lab.walk.x=14.5;lab.walk.y=8.5;
  lab.layer().tiles[8][15].kind='tree';lab.select(15,8);
  for(let i=0;i<8&&w.adventure.game.inventory.wood!==1;i++){lab.tick(.01,0,0,false);lab.tapStrike();}
  assert.equal(w.adventure.game.inventory.wood,1);assert.equal(lab.resources,1);
  w.adventure.mined(20,20,'ore');assert.equal(w.adventure.game.inventory.ore_copper,1);
  const copy=new WordPassages(new LayeredLab());copy.restore(w.snapshot());
  assert.deepEqual(copy.adventure.game.inventory,w.adventure.game.inventory);
});

check('world chests persist attempts, grant decreasing rewards and re-bury a real stubborn stone',()=>{
  const lab=new LayeredLab(),w=new WordPassages(lab),a=w.adventure;
  lab.depth=1;lab.maxDepth=1;w.prepare();lab.walk.x=14.5;lab.walk.y=8.5;lab.layer().tiles[8][15].kind='chest';
  assert.ok(a.open(15,8));const q=a.quiz!.session.question;
  a.answer((q.correctIndex+1)%4);const copy=new WordPassages(new LayeredLab());copy.restore(w.snapshot());
  assert.ok(copy.adventure.open(15,8));assert.equal(copy.adventure.quiz!.session.question.word,q.word);
  copy.adventure.answer((q.correctIndex+1)%4);const result=copy.adventure.answer((q.correctIndex+1)%4);
  assert.ok(result.opened);assert.equal(result.coins,3);assert.equal(copy.lab.tile(15,8)!.kind,'floor');
  assert.equal(copy.adventure.book.get(q.word).wrongCount,1);
  const [id,word]=Object.entries(copy.adventure.game.stubborn)[0],depth=Number(id.split(',')[2]);
  assert.ok(depth>=11&&depth<=31);copy.lab.depth=depth;copy.prepare();copy.lab.walk.x=14.5;copy.lab.walk.y=8.5;
  assert.equal(copy.lab.tile(15,8)!.kind,'stubborn');assert.ok(copy.adventure.open(15,8));
  assert.equal(copy.adventure.quiz!.session.question.word,word);
  const correct=copy.adventure.quiz!.session.question.correctIndex;copy.adventure.answer(correct);
  assert.equal(copy.lab.tile(15,8)!.kind,'floor');assert.equal(copy.adventure.game.stubborn[id],undefined);
  assert.equal(copy.adventure.book.get(word).correctStreak,1);
});

check('word cards use deterministic drop odds, proximity pickup and the shared collection book',()=>{
  const lab=new LayeredLab(),w=new WordPassages(lab),a=w.adventure;
  let x=13;while(hashCoords(314159,x,8,0,SALT.wordDrop)/4294967296>=WORD_DROP_CHANCE)x++;
  a.mined(x,8,'rock');assert.equal(a.drops.length,1);const word=a.drops[0].word;
  lab.walk.x=x+.5;lab.walk.y=8.5;a.prepare();assert.equal(a.drops.length,0);
  assert.ok(w.visibleWords().includes(word.toUpperCase()));assert.equal(w.coins,WORD_PICKUP_COINS);
  lab.depth=10;a.prepare();assert.ok(a.notices.some(n=>n.startsWith('10m')));
});

check('v1 lab saves expand around their unchanged 13x13 terrain, preserving balances and historical access',()=>{
  const w=new WordPassages(new LayeredLab());w.lab.depth=1;w.lab.maxDepth=1;w.prepare();
  const s=JSON.parse(w.snapshot());s.version=1;delete s.adventure;delete s.legacyDepth;s.coins=42;
  for(const l of s.layers)l.tiles=l.tiles.slice(0,13).map((row:any[])=>row.slice(0,13));
  const copy=new WordPassages(new LayeredLab());copy.restore(JSON.stringify(s));
  assert.equal(copy.lab.layer().tiles.length,25);assert.deepEqual(copy.lab.layer().tiles.slice(0,13).map(row=>row.slice(0,13)),s.layers.find((l:any)=>l.depth===1).tiles);
  assert.equal(copy.coins,42);assert.ok(copy.lab.canDescend(0));assert.equal(copy.lab.canDescend(1),false);
  assert.equal(copy.lab.layer(2).tiles.length,25);assert.equal(JSON.parse(copy.snapshot()).version,4);
  const before=copy.snapshot(),bad=JSON.parse(before);bad.adventure.game.inventory.coin=-1;
  assert.throws(()=>copy.restore(JSON.stringify(bad)));assert.equal(copy.snapshot(),before);
});

check('an unbroken seal blocks both hitting an old pit and walking into it',()=>{
  const lab=new LayeredLab(),w=new WordPassages(lab);lab.tile(6,7)!.hole=true;
  lab.tapStrike();assert.equal(lab.travel,null);
  lab.walk.x=6.5;lab.walk.y=8.5;
  for(let i=0;i<180;i++)lab.tick(1/60,0,1,false);
  assert.equal(lab.travel,null);assert.equal(lab.depth,0);assert.equal(w.room.opened,false);
});

check('material exchanges consume typed bag items and shafts cannot erase buried treasure',()=>{
  const lab=new LayeredLab(),w=new WordPassages(lab);w.adventure.game.inventory.wood=2;lab.resources=2;
  assert.ok(w.exchange('Q'));assert.equal(lab.resources,0);assert.equal(w.adventure.game.inventory.wood,undefined);
  w.legacyDepth=1;lab.layer(1).tiles[7][6].kind='chest';lab.tile(6,7)!.hole=true;
  lab.tapStrike();assert.equal(lab.travel,null);assert.equal(lab.tile(6,7,1)!.kind,'chest');
  lab.layer(1).tiles[7][6].kind='floor';w.adventure.game.stubborn['6,7,1']='apple';
  lab.tapStrike();assert.equal(lab.travel,null);assert.equal(w.adventure.game.stubborn['6,7,1'],'apple');
});

check('isometric movement slides around a nearby corner without entering its collision box',()=>{
  const walk=new IsometricWalk();walk.x=.77;walk.y=.85;
  walk.isBlocked=(x,y)=>x+.22>=1&&x-.22<2&&y+.22>=1&&y-.22<2;
  for(let i=0;i<10;i++){walk.tick(.05,1,-.5);assert.equal(walk.isBlocked(walk.x,walk.y),false);}
  assert.ok(walk.x>1);assert.ok(walk.y<.85);
});

check('nearby mining automatically aims forward, stays on a cracked block and skips treasure or services',()=>{
  const lab=new LayeredLab(),w=new WordPassages(lab);lab.walk.x=20.5;lab.walk.y=8.5;
  for(let y=7;y<=9;y++)for(let x=19;x<=21;x++)lab.layer().tiles[y][x]={kind:'floor',hole:false,damage:0};
  lab.tile(21,8)!.kind='soil';lab.tile(19,8)!.kind='rock';
  lab.walk.facing={x:1,y:0};assert.deepEqual(lab.selected(),{x:21,y:8});
  lab.tapStrike();assert.ok(lab.tile(21,8)!.damage>0);lab.walk.facing={x:-1,y:0};assert.deepEqual(lab.selected(),{x:21,y:8});
  for(let i=0;i<6&&lab.tile(21,8)!.kind==='soil';i++){lab.tick(.01,0,0,false);lab.tapStrike();}
  assert.equal(lab.tile(21,8)!.kind,'floor');assert.equal(w.adventure.game.inventory.dirt,1);
  assert.equal(lab.depth,0);assert.equal(lab.travel,null);assert.equal(lab.tile(21,8)!.hole,false);
  lab.tile(19,8)!.kind='chest';assert.deepEqual(lab.selected(),{x:20,y:8});assert.equal(w.adventure.quiz,null);
  lab.walk.x=6.5;lab.walk.y=7.5;lab.target=null;assert.notDeepEqual(lab.selected(),{x:6,y:8});
});

check('manual aiming remains available and automatic selection cannot reach through a blocked corner',()=>{
  const lab=new LayeredLab();lab.walk.x=20.5;lab.walk.y=8.5;
  for(let y=7;y<=9;y++)for(let x=19;x<=21;x++)lab.layer().tiles[y][x]={kind:'floor',hole:false,damage:0};
  lab.tile(21,8)!.kind='wall';lab.tile(20,9)!.kind='wall';lab.tile(21,9)!.kind='ore';
  lab.walk.facing={x:0,y:1};assert.notDeepEqual(lab.selected(),{x:21,y:9});
  assert.ok(lab.select(20,8));assert.deepEqual(lab.selected(),{x:20,y:8});
  lab.tick(.05,-1,.5,false);assert.notDeepEqual(lab.selected(),{x:20,y:8});
});

check('v2 excavation migration preserves mined walls, holes, partial work, player space and does not regenerate v3 deposits',()=>{
  const w=new WordPassages(new LayeredLab());w.lab.depth=1;w.lab.maxDepth=1;w.prepare();
  const s=JSON.parse(w.snapshot());s.version=2;
  for(const layer of s.layers)layer.tiles=makeLabLayer(layer.depth,false).tiles;
  const layer=s.layers.find((l:any)=>l.depth===1),original=makeLabLayer(1,false);
  let cleared:{x:number;y:number}|undefined;
  for(let y=13;y<24&&!cleared;y++)for(let x=13;x<24;x++)if(original.tiles[y][x].kind==='root'){cleared={x,y};break;}
  assert.ok(cleared);layer.tiles[cleared.y][cleared.x].kind='floor';
  layer.tiles[20][20]={kind:'floor',hole:true,damage:0};layer.entrances.push({x:20,y:20});
  const copy=new WordPassages(new LayeredLab());copy.restore(JSON.stringify(s));
  assert.equal(copy.lab.tile(cleared.x,cleared.y)!.kind,'floor');assert.equal(copy.lab.tile(20,20)!.hole,true);
  assert.equal(copy.lab.collides(copy.lab.walk.x,copy.lab.walk.y),false);
  assert.ok(copy.lab.layer().tiles.flat().some(t=>t.kind==='soil'));
  const soil=copy.lab.layer().tiles.flat().find(t=>t.kind==='soil')!;soil.kind='floor';
  const raw=copy.snapshot(),again=new WordPassages(new LayeredLab());again.restore(raw);assert.equal(again.snapshot(),raw);
  assert.equal(JSON.parse(raw).version,4);assert.equal(again.legacyDepth,w.legacyDepth);
});

check('diggable banks are deterministic, leave guaranteed chests and village routes intact, and survive extended auto-mining',()=>{
  const a=makeLabLayer(2),b=makeLabLayer(2);assert.deepEqual(a,b);
  assert.ok(a.tiles.flat().some(t=>t.kind==='soil'));assert.ok(a.tiles.flat().some(t=>t.kind==='chest'));
  for(const depth of [0,1,2]){
    const lab=new LayeredLab(),w=new WordPassages(lab);lab.depth=depth;w.prepare();
    for(let i=0;i<500;i++){lab.tick(1/60,Math.sin(i*.07),Math.cos(i*.11),i%80<30);w.prepare();assert.equal(lab.collides(lab.walk.x,lab.walk.y),false);}
    assert.equal(lab.depth,depth,'automatic mining cannot bypass the seal');
  }
});

check('underground layers generate wall-ringed hidden chambers with relics and a depth-1 pack part',()=>{
  const d1=makeLabLayer(1),d2=makeLabLayer(2);
  assert.deepEqual(d1,makeLabLayer(1));
  const findKind=(l:typeof d1,kind:string)=>{const out:[number,number][]=[];l.tiles.forEach((row,y)=>row.forEach((t,x)=>{if(t.kind===kind)out.push([x,y]);}));return out;};
  const relics1=findKind(d1,'relic'),parts1=findKind(d1,'pack_part'),relics2=findKind(d2,'relic');
  assert.equal(relics1.length,1);assert.equal(parts1.length,1);assert.equal(relics2.length,2);
  for(const [cx,cy] of [...relics1,...parts1]){
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy)assert.equal(d1.tiles[cy+dy][cx+dx].kind,'wall');
  }
  const lab=new LayeredLab(),w=new WordPassages(lab);lab.depth=1;w.prepare();
  const [rx,ry]=relics1[0];
  lab.tile(rx-1,ry)!.kind='floor';
  lab.walk.x=rx+.5;lab.walk.y=ry+.5;w.prepare();
  assert.equal(lab.tile(rx,ry)!.kind,'floor');assert.equal(w.adventure.relics.length,1);assert.equal(w.adventure.relics[0].identified,false);
});

check('underground clues and letter chests scatter into outer dark roads instead of crowding spawn',()=>{
  const lab=new LayeredLab(),w=new WordPassages(lab);lab.depth=1;w.prepare();
  for(const id of ['clue','chest0','chest1','chest2']){
    const s=w.services.find(p=>p.id===id)!;
    assert.ok(Math.hypot(s.x-6,s.y-7)>4,id+' should be outside spawn lamp radius');
  }
});

check('finite pack enforces slot overflow choices and camp appraisal, selling and pack repair work',()=>{
  const lab=new LayeredLab(),w=new WordPassages(lab),adv=w.adventure;
  adv.game.inventory={wood:2,stone:2,dirt:2,ore_copper:1,ore_iron:1,ore_silver:1,coin:50};
  lab.resources=9;assert.equal(adv.usedSlots(),6);
  adv.mined(15,15,'ore'); // depth 0 -> ore_copper already stacked, no overflow
  assert.equal(adv.pendingLoot,null);
  lab.depth=1;w.prepare();
  const partPos=lab.layer().tiles.flatMap((row,y)=>row.map((t,x)=>t.kind==='pack_part'?[x,y]:null)).filter(Boolean)[0] as [number,number];
  lab.walk.x=partPos[0]+.5;lab.walk.y=partPos[1]+.5;w.prepare();
  assert.ok(adv.pendingLoot&&adv.pendingLoot.kind==='relic');
  assert.ok(adv.resolvePending(5)); // replace last material slot with pack_part
  assert.equal(adv.pendingLoot,null);assert.ok(adv.relics.some(r=>r.kind==='pack_part'));
  assert.ok(adv.repairPack());assert.equal(adv.expanded,true);assert.equal(adv.capacity,10);
  const relicPos=lab.layer().tiles.flatMap((row,y)=>row.map((t,x)=>t.kind==='relic'?[x,y]:null)).filter(Boolean)[0] as [number,number];
  lab.walk.x=relicPos[0]+.5;lab.walk.y=relicPos[1]+.5;w.prepare();
  const relicIdx=adv.relics.findIndex(r=>r.kind==='relic');assert.ok(relicIdx>=0);
  const coinsBefore=w.coins;
  const app=adv.appraiseRelic(relicIdx);assert.ok(app.ok);assert.equal(adv.relics[relicIdx].identified,true);
  assert.ok(adv.relicDex.includes(adv.relics[relicIdx].id));
  const sold=adv.sellRelic(relicIdx);assert.ok(sold.ok);assert.ok(w.coins>coinsBefore);
});

check('second-stage letter hint costs materials and v3 saves migrate cleanly to v4 with chambers',()=>{
  const lab=new LayeredLab(),w=new WordPassages(lab);
  assert.equal(w.letterHint(),false);
  lab.resources=2;assert.ok(w.letterHint());assert.equal(lab.resources,0);assert.equal(w.room.letterHint,true);
  lab.depth=1;lab.maxDepth=1;w.prepare();
  const s=JSON.parse(w.snapshot());s.version=3;delete s.adventure.capacity;delete s.adventure.expanded;delete s.adventure.relics;delete s.adventure.relicDex;
  s.layers.find((l:any)=>l.depth===1).tiles=makeLabLayer(1,false).tiles;
  const copy=new WordPassages(new LayeredLab());copy.restore(JSON.stringify(s));
  assert.equal(JSON.parse(copy.snapshot()).version,4);
  assert.equal(copy.adventure.capacity,6);assert.equal(copy.rooms['0'].letterHint,true);
  assert.ok(copy.lab.layer(1).tiles.flat().some(t=>t.kind==='relic'));
  const raw=copy.snapshot(),bad=JSON.parse(raw);bad.adventure.capacity=2;
  assert.throws(()=>copy.restore(JSON.stringify(bad)));assert.equal(copy.snapshot(),raw);
});

check('art-v101 sprite atlases and standalone UI PNGs cover all required v1.0.1 frames',()=>{
  const root=new URL('../cocos/assets/resources/art-v101/',import.meta.url);
  const frames=new Set<string>();
  for(const rel of ['characters/field_crew','effects/digging','items/findings','world/props/props','world/terrain/terrain']){
    const png=readFileSync(new URL(rel+'.png',root));
    assert.equal(png.toString('ascii',1,4),'PNG',rel+'.png');
    const plist=readFileSync(new URL(rel+'.plist',root),'utf8');
    const body=plist.split('<key>frames</key>')[1]?.split('<key>metadata</key>')[0]??'';
    for(const m of body.matchAll(/^\t\t<key>([^<]+)<\/key>/gm))frames.add(m[1]);
  }
  const requiredAtlas=[
    'walk_down_0','walk_up_0','walk_left_0','walk_right_0','npc_may','npc_trader',
    'oak','pine','boulder','giant_root','root_heart','glow_vein','stubborn_stone','treasure_chest','letter_chest','seal_arch','inscription','house_blue','house_red',
    'forest_soil','forest_wall','roots_soil','roots_wall','rock_soil','rock_wall','unexamined_relic','damaged_pack_part',
    'ore_copper','ore_iron','ore_gold','ore_diamond','ore_starcore','field','ladder_up','forest_floor_0','roots_floor_0','rock_floor_0','forest_shaft','roots_shaft','rock_shaft',
    'item-coin','item-dirt','item-stone','item-wood','item-pack_part','item-ore_copper','item-ore_iron','item-ore_gold','item-ore_diamond','item-ore_starcore',
    'relic-amber_leaf','relic-clay_seal','relic-copper_bell','relic-root_compass','relic-prism_shard','relic-rune_tablet','relic-star_astrolabe','relic-heart_crystal','relic-crown_fragment',
  ];
  for(const name of requiredAtlas)assert.ok(frames.has(name),'missing atlas frame: '+name);
  const requiredUi=[
    'controls/ui-stick-base','controls/ui-stick-thumb',
    'icons/ui-book','icons/ui-camera','icons/ui-chest','icons/ui-clue','icons/ui-dig','icons/ui-entry','icons/ui-grid','icons/ui-interact','icons/ui-ladder','icons/ui-letters','icons/ui-pack','icons/ui-plan','icons/ui-seal','icons/ui-sound','icons/ui-trade',
    'surfaces/ui-button','surfaces/ui-button-down','surfaces/ui-button-primary','surfaces/ui-button-primary-down','surfaces/ui-key','surfaces/ui-key-down','surfaces/ui-key-empty','surfaces/ui-key-selected','surfaces/ui-panel-hud','surfaces/ui-panel-window',
  ];
  for(const rel of requiredUi){
    const png=readFileSync(new URL('ui/'+rel+'.png',root));
    assert.equal(png.toString('ascii',1,4),'PNG','ui/'+rel+'.png');
    readFileSync(new URL('ui/'+rel+'.png.meta',root),'utf8');
  }
});

console.log("\n" + passed + " test groups passed");
