export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const LETTER_WEIGHTS = 'EEEEEEEEEEEAAAAAAAAARRRRRRRRIIIIIIIIOOOOOOOOTTTTTTTTNNNNNNSSSSSSLLLLLLCCCCUUUUDDDDPPPPMMMMHHHHGGGBBFFYYWWKVXZJQ';
export const LAB_WORD_RULES = {
  chestLetters: 12,
  chestCoins: 20,
  shortageChance: 0.25,
  hintCost: 1,
  letterHintCost: 2,
  commonCost: 1,
  rareCost: 2,
  commonSwap: 3,
  rareSwap: 6,
  finishSeconds: 0.5,
} as const;

export const LAB_SERVICES = [
  { id: 'seal', x: 6, y: 5, title: '符文通道' },
  { id: 'npc', x: 7, y: 6, title: '兑换商人' },
  { id: 'clue', x: 5, y: 6, title: '线索碑' },
  { id: 'chest0', x: 6, y: 8, title: '字母宝箱' },
  { id: 'chest1', x: 6, y: 10, title: '字母宝箱' },
  { id: 'chest2', x: 8, y: 6, title: '字母宝箱' },
] as const;

export const LAB_PACK_RULES = {
  initialCapacity: 6,
  expandedCapacity: 10,
  expandMaterials: 3,
} as const;

export const LAB_RELIC_TIERS = {
  common: { label: '普通', appraiseFee: 5, sellValue: 18 },
  rare: { label: '稀有', appraiseFee: 12, sellValue: 45 },
  epic: { label: '珍稀', appraiseFee: 25, sellValue: 90 },
} as const;

export type LabRelicTier = keyof typeof LAB_RELIC_TIERS;

export const LAB_RELIC_CATALOG: readonly { id: string; tier: LabRelicTier; category: string; name: string; en: string }[] = [
  { id: 'amber_leaf', tier: 'common', category: '化石', name: '琥珀叶印', en: 'Amber Leaf' },
  { id: 'clay_seal', tier: 'common', category: '器物', name: '古陶印章', en: 'Clay Seal' },
  { id: 'copper_bell', tier: 'common', category: '器物', name: '地底铜铃', en: 'Copper Bell' },
  { id: 'root_compass', tier: 'rare', category: '仪具', name: '巨根罗盘', en: 'Root Compass' },
  { id: 'prism_shard', tier: 'rare', category: '晶石', name: '棱光晶核', en: 'Prism Shard' },
  { id: 'rune_tablet', tier: 'rare', category: '石板', name: '残缺符文板', en: 'Rune Tablet' },
  { id: 'star_astrolabe', tier: 'epic', category: '仪具', name: '星核星盘', en: 'Star Astrolabe' },
  { id: 'heart_crystal', tier: 'epic', category: '晶石', name: '地心髓晶', en: 'Heart Crystal' },
  { id: 'crown_fragment', tier: 'epic', category: '遗物', name: '古王冠片', en: 'Crown Shard' },
] as const;
