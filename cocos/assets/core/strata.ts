// Depth strata = difficulty tiers (DESIGN.md: 难度分层 = 深度地层).
// Depth z is in "meters": z = 0 is the surface, z >= 1 is underground.
// Going deeper raises the vocabulary tier, block hardness and loot class together.

export interface Stratum {
  id: number; // 1..5
  name: string;
  minDepth: number;
  maxDepth: number; // inclusive; Infinity for the bottomless layer
  vocabTier: number; // 1 = A1 ... 5 = C1, matches vocab entry tier
  cefr: string;
  poolSize: number; // approximate vocabulary pool this layer draws from
  hardness: number; // pickaxe hits needed for a plain block of this layer
  baseTile: string;
  oreTile: string;
  chestKind: string;
}

import { STRATA } from "../data/constants/Strata.ts";
export { STRATA } from "../data/constants/Strata.ts";


/** Stratum for an underground depth (z >= 1). Depth 0 is the surface and has no stratum. */
export function stratumAt(depth: number): Stratum {
  for (const s of STRATA) {
    if (depth >= s.minDepth && depth <= s.maxDepth) return s;
  }
  return STRATA[STRATA.length - 1];
}

/** Pickaxe level required to dig a stratum's plain blocks at full speed.
 *  Learning gate: upgrading the pickaxe also requires mastered-word counts
 *  (see DESIGN.md), the numbers live with the future progression module. */
export function pickaxeFor(stratumId: number): number {
  return stratumId;
}
