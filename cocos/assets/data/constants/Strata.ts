import type { Stratum } from "../../core/strata.ts";

export const STRATA: Stratum[] = [
  { id: 1, name: "表土层", minDepth: 1, maxDepth: 30, vocabTier: 1, cefr: "A1", poolSize: 600, hardness: 1, baseTile: "dirt", oreTile: "ore_copper", chestKind: "wood" },
  { id: 2, name: "浅岩层", minDepth: 31, maxDepth: 100, vocabTier: 2, cefr: "A2", poolSize: 1600, hardness: 2, baseTile: "sandstone", oreTile: "ore_iron", chestKind: "iron" },
  { id: 3, name: "岩核层", minDepth: 101, maxDepth: 250, vocabTier: 3, cefr: "B1", poolSize: 3500, hardness: 3, baseTile: "granite", oreTile: "ore_gold", chestKind: "gold" },
  { id: 4, name: "深渊层", minDepth: 251, maxDepth: 500, vocabTier: 4, cefr: "B2", poolSize: 6000, hardness: 5, baseTile: "basalt", oreTile: "ore_diamond", chestKind: "mithril" },
  { id: 5, name: "地心层", minDepth: 501, maxDepth: Infinity, vocabTier: 5, cefr: "C1", poolSize: 8000, hardness: 8, baseTile: "obsidian", oreTile: "ore_starcore", chestKind: "starcore" },
];
