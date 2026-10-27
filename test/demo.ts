// Visual smoke demo: print one underground slice as ASCII and a sample chest
// question, so the generation can be eyeballed without the game engine.
// Run: npm run demo

import { hashString } from "../cocos/assets/core/rng.ts";
import { getTile } from "../cocos/assets/core/worldgen.ts";
import { stratumAt } from "../cocos/assets/core/strata.ts";
import { WORDS_TIER1 } from "../cocos/assets/core/vocab.ts";
import { makeQuestion } from "../cocos/assets/core/quiz.ts";

const seed = hashString("xap-test-world");
const z = 12;
const chars: Record<string, string> = {
  dirt: ".", sandstone: ":", granite: "#", basalt: "%", obsidian: "@",
  ore_copper: "c", ore_iron: "i", ore_gold: "g", ore_diamond: "d", ore_starcore: "*",
  chest: "B", empty: " ",
};
console.log("slice z=" + z + " (" + stratumAt(z).name + ")  B=chest c=copper ore .=dirt blank=cave");
for (let y = 0; y < 25; y++) {
  let line = "";
  for (let x = 0; x < 50; x++) line += chars[getTile(seed, x, y, z).type] ?? "?";
  console.log(line);
}
const q = makeQuestion(WORDS_TIER1[2], 7);
console.log("\nsample chest question:", q.word, "->", q.options.join(" / "), "| correct:", q.options[q.correctIndex]);
