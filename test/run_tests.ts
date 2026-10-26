// Core logic tests. Run: npm test   (node test/run_tests.ts)
// No test framework on purpose: plain node:assert, zero dependencies.

import assert from "node:assert";
import { hashString } from "../core/rng.ts";
import { stratumAt } from "../core/strata.ts";
import { getTile, genChunk, guaranteedChestPos, CHEST_BLOCK } from "../core/worldgen.ts";
import { WORDS_TIER1 } from "../core/vocab.ts";
import { ChestSession, makeQuestion, REWARD_STEPS } from "../core/quiz.ts";
import { MasteryBook, pickChestWord } from "../core/mastery.ts";
import { newSave, setDiff, getDiff, placeStubborn, addItem, serializeSave, deserializeSave } from "../core/save.ts";

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

console.log("\n" + passed + " test groups passed");
