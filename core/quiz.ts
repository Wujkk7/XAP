// Chest quiz: one word per chest, never a blocking exam (DESIGN.md: 宝箱设计细节).
//
// - Correct on attempt 1/2/3 -> 100% / 70% / 40% of the chest reward.
// - Three wrong answers -> the chest still opens, at the 25% floor reward.
//   Progress is never gated by a word; the missed word is re-buried as a
//   "stubborn stone" instead (see mastery.ts).

import { rngFrom } from "./rng.ts";
import type { WordEntry } from "./vocab.ts";

export const REWARD_STEPS = [1, 0.7, 0.4];
export const FLOOR_REWARD = 0.25;
export const MAX_ATTEMPTS = 3;

export interface Question {
  word: string;
  example: string;
  options: string[]; // 4 Chinese meanings, shuffled
  correctIndex: number;
}

/** Build a 4-option question. shuffleSeed makes the layout reproducible per chest. */
export function makeQuestion(entry: WordEntry, shuffleSeed: number): Question {
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
    correctIndex: options.indexOf(entry.meaning),
  };
}

export interface AnswerResult {
  correct: boolean;
  opened: boolean;
  /** fraction of the chest reward paid out; 0 while the chest stays closed */
  rewardMultiplier: number;
  attemptsUsed: number;
}

export class ChestSession {
  readonly question: Question;
  private attempts = 0;
  private openedFlag = false;

  constructor(entry: WordEntry, shuffleSeed: number) {
    this.question = makeQuestion(entry, shuffleSeed);
  }

  get attemptsUsed(): number {
    return this.attempts;
  }

  get isOpen(): boolean {
    return this.openedFlag;
  }

  answer(optionIndex: number): AnswerResult {
    if (this.openedFlag) throw new Error("chest already open");
    this.attempts++;
    const correct = optionIndex === this.question.correctIndex;
    if (correct) {
      this.openedFlag = true;
      return {
        correct,
        opened: true,
        rewardMultiplier: REWARD_STEPS[Math.min(this.attempts, MAX_ATTEMPTS) - 1],
        attemptsUsed: this.attempts,
      };
    }
    if (this.attempts >= MAX_ATTEMPTS) {
      this.openedFlag = true; // 保底开箱: never block progress on a word
      return { correct, opened: true, rewardMultiplier: FLOOR_REWARD, attemptsUsed: this.attempts };
    }
    return { correct, opened: false, rewardMultiplier: 0, attemptsUsed: this.attempts };
  }
}
