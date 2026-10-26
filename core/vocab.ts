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

export const WORDS_TIER1: WordEntry[] = [
  { word: "apple", meaning: "苹果", tier: 1, theme: "food", example: "I eat an apple every day.", distractors: ["梨子", "香蕉", "橘子"] },
  { word: "dig", meaning: "挖", tier: 1, theme: "action", example: "We dig a deep hole.", distractors: ["砍", "种", "推"] },
  { word: "gold", meaning: "金子", tier: 1, theme: "treasure", example: "The box is full of gold.", distractors: ["银子", "铜", "铁"] },
  { word: "stone", meaning: "石头", tier: 1, theme: "nature", example: "This stone is very hard.", distractors: ["木头", "沙子", "玻璃"] },
  { word: "water", meaning: "水", tier: 1, theme: "nature", example: "Fish live in water.", distractors: ["牛奶", "油", "雪"] },
  { word: "fire", meaning: "火", tier: 1, theme: "nature", example: "The fire is warm.", distractors: ["烟", "灰", "炭"] },
  { word: "tree", meaning: "树", tier: 1, theme: "nature", example: "A bird sits in the tree.", distractors: ["花", "草", "叶子"] },
  { word: "sun", meaning: "太阳", tier: 1, theme: "sky", example: "The sun is hot today.", distractors: ["月亮", "星星", "云"] },
  { word: "moon", meaning: "月亮", tier: 1, theme: "sky", example: "The moon is bright tonight.", distractors: ["太阳", "星星", "夜晚"] },
  { word: "star", meaning: "星星", tier: 1, theme: "sky", example: "I can see a star.", distractors: ["月亮", "太阳", "灯"] },
  { word: "cat", meaning: "猫", tier: 1, theme: "animal", example: "The cat is sleeping.", distractors: ["狗", "鸟", "鱼"] },
  { word: "dog", meaning: "狗", tier: 1, theme: "animal", example: "My dog likes to run.", distractors: ["猫", "狼", "马"] },
  { word: "bird", meaning: "鸟", tier: 1, theme: "animal", example: "The bird can fly.", distractors: ["鱼", "猫", "蝴蝶"] },
  { word: "fish", meaning: "鱼", tier: 1, theme: "animal", example: "A fish swims fast.", distractors: ["鸟", "虾", "蛇"] },
  { word: "book", meaning: "书", tier: 1, theme: "school", example: "I read a book at night.", distractors: ["笔", "本子", "书包"] },
  { word: "key", meaning: "钥匙", tier: 1, theme: "daily", example: "This key opens the door.", distractors: ["锁", "门", "刀"] },
  { word: "map", meaning: "地图", tier: 1, theme: "adventure", example: "The map shows the cave.", distractors: ["照片", "画", "信"] },
  { word: "cave", meaning: "洞穴", tier: 1, theme: "adventure", example: "The cave is dark and deep.", distractors: ["山顶", "河边", "森林"] },
  { word: "gem", meaning: "宝石", tier: 1, theme: "treasure", example: "She found a green gem.", distractors: ["金子", "石头", "水晶"] },
  { word: "box", meaning: "盒子", tier: 1, theme: "daily", example: "Open the box slowly.", distractors: ["袋子", "篮子", "瓶子"] },
];

export function wordsByTier(tier: number): WordEntry[] {
  // Only tier 1 ships with the MVP; other tiers join as data files later.
  return WORDS_TIER1.filter((w) => w.tier === tier);
}
