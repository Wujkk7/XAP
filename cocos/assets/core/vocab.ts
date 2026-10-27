// Vocabulary data. One entry per word; distractors are hand-picked to be
// same-tier, same-theme near misses (DESIGN.md: 干扰项生成规则) — never
// filler options from unrelated categories, or the quiz teaches nothing.
//
// Format: { word, meaning, tier, theme, example, distractors[3] }
// Later tiers ship as data/tierN.json generated from this same shape.

export interface WordEntry {
  word: string;
  meaning: string; // correct Chinese meaning
  tier: number; // 1 = A1 ... 5 = C1, matches strata vocabTier
  theme: string;
  example: string; // one simple English example sentence
  distractors: string[]; // exactly 3 wrong Chinese meanings, same theme/tier
}

import { WORDS_TIER1 } from "../data/external-files/Tier1Vocabulary.ts";
export { WORDS_TIER1 } from "../data/external-files/Tier1Vocabulary.ts";


export function wordsByTier(tier: number): WordEntry[] {
  // Only tier 1 ships with the MVP; other tiers join as data files later.
  return WORDS_TIER1.filter((w) => w.tier === tier);
}
