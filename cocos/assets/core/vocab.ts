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
import { WORDS_TIER2 } from "../data/external-files/Tier2Vocabulary.ts";
export { WORDS_TIER1 } from "../data/external-files/Tier1Vocabulary.ts";
export { WORDS_TIER2 } from "../data/external-files/Tier2Vocabulary.ts";

export const WORDS_ALL: WordEntry[] = [...WORDS_TIER1, ...WORDS_TIER2];

export function wordsByTier(tier: number): WordEntry[] {
  return WORDS_ALL.filter((w) => w.tier === tier);
}
