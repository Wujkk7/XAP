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

export const STRATA: Stratum[] = [
  { id: 1, name: "表土层", minDepth: 1, maxDepth: 30, vocabTier: 1, cefr: "A1", poolSize: 600, hardness: 1, baseTile: "dirt", oreTile: "ore_copper", chestKind: "wood" },
  { id: 2, name: "浅岩层", minDepth: 31, maxDepth: 100, vocabTier: 2, cefr: "A2", poolSize: 1600, hardness: 2, baseTile: "sandstone", oreTile: "ore_iron", chestKind: "iron" },
  { id: 3, name: "岩核层", minDepth: 101, maxDepth: 250, vocabTier: 3, cefr: "B1", poolSize: 3500, hardness: 3, baseTile: "granite", oreTile: "ore_gold", chestKind: "gold" },
  { id: 4, name: "深渊层", minDepth: 251, maxDepth: 500, vocabTier: 4, cefr: "B2", poolSize: 6000, hardness: 5, baseTile: "basalt", oreTile: "ore_diamond", chestKind: "mithril" },
  { id: 5, name: "地心层", minDepth: 501, maxDepth: Infinity, vocabTier: 5, cefr: "C1", poolSize: 8000, hardness: 8, baseTile: "obsidian", oreTile: "ore_starcore", chestKind: "starcore" },
];

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
