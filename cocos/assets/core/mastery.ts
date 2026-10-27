// Per-word mastery + spaced repetition, disguised as digging.
//
// unknown -> learning -> mastered (two correct answers, spaced apart).
// A wrong answer demotes the word and schedules a "stubborn stone":
// the same word re-buried 10-30 m below where the player missed it,
// so continued digging naturally re-encounters it (DESIGN.md: 单词掌握度).

import { hashString } from "./rng.ts";
import type { WordEntry } from "./vocab.ts";
import { REVIEW_GAP_M, STUBBORN_MIN, STUBBORN_SPAN } from "../data/constants/GameRules.ts";

export type WordStatus = "unknown" | "learning" | "mastered";

export interface WordState {
  word: string;
  status: WordStatus;
  correctStreak: number;
  encounters: number;
  wrongCount: number;
  lastSeenDepth: number;
  /** depth at/after which this word is due for review */
  dueDepth: number;
}

function freshState(word: string): WordState {
  return { word, status: "unknown", correctStreak: 0, encounters: 0, wrongCount: 0, lastSeenDepth: 0, dueDepth: 0 };
}

export interface AnswerOutcome {
  state: WordState;
  /** if set, place a stubborn stone carrying this word at this depth */
  stubbornDepth?: number;
  becameMastered: boolean;
}

export class MasteryBook {
  private states = new Map<string, WordState>();

  get(word: string): WordState {
    let s = this.states.get(word);
    if (!s) {
      s = freshState(word);
      this.states.set(word, s);
    }
    return s;
  }

  recordAnswer(word: string, correct: boolean, depth: number): AnswerOutcome {
    const s = this.get(word);
    s.encounters++;
    s.lastSeenDepth = depth;
    let becameMastered = false;
    let stubbornDepth: number | undefined;

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
      const offset = STUBBORN_MIN + (hashString(word + "@" + s.wrongCount) % STUBBORN_SPAN);
      stubbornDepth = depth + offset;
      s.dueDepth = stubbornDepth;
    }
    return { state: s, stubbornDepth, becameMastered };
  }

  masteredCount(): number {
    let n = 0;
    for (const s of this.states.values()) if (s.status === "mastered") n++;
    return n;
  }

  /** Words due for review at this depth (learning words whose dueDepth has arrived). */
  dueWords(depth: number): WordState[] {
    const out: WordState[] = [];
    for (const s of this.states.values()) {
      if (s.status === "learning" && s.dueDepth <= depth) out.push(s);
    }
    return out;
  }

  serialize(): Record<string, WordState> {
    return Object.fromEntries(this.states);
  }

  static deserialize(data: Record<string, WordState>): MasteryBook {
    const book = new MasteryBook();
    for (const [k, v] of Object.entries(data ?? {})) book.states.set(k, { ...v });
    return book;
  }
}

/** Choose the word for the next chest, following the 70/20/10 mix from DESIGN.md:
 *  ~70% new word of the current tier, ~20% due review, ~10% next-tier preview.
 *  Falls back gracefully while pools are small (the MVP has one tier). */
export function pickChestWord(
  pool: WordEntry[],
  book: MasteryBook,
  depth: number,
  rand: () => number,
): WordEntry | undefined {
  if (pool.length === 0) return undefined;
  const tiers = [...new Set(pool.map((w) => w.tier))].sort((a, b) => a - b);
  const currentTier = tiers[tiers.length - 1];
  const rollPick = rand();

  const due = book.dueWords(depth)
    .map((s) => pool.find((w) => w.word === s.word))
    .filter((w): w is WordEntry => !!w);
  if (rollPick >= 0.7 && rollPick < 0.9 && due.length > 0) {
    return due[Math.floor(rand() * due.length)];
  }

  const nextTierWords = pool.filter((w) => w.tier === currentTier + 1);
  if (rollPick >= 0.9 && nextTierWords.length > 0) {
    return nextTierWords[Math.floor(rand() * nextTierWords.length)];
  }

  const fresh = pool.filter((w) => w.tier === currentTier && book.get(w.word).status === "unknown");
  const candidates = fresh.length > 0 ? fresh : pool.filter((w) => w.tier === currentTier);
  if (candidates.length === 0) return pool[Math.floor(rand() * pool.length)];
  return candidates[Math.floor(rand() * candidates.length)];
}
