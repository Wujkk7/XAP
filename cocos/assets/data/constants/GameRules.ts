// 固定规则：变更世界生成数值会影响既有种子，必须先考虑存档兼容。
export const SAVE_VERSION = 1;
export const PLAYER_STORAGE_KEY = "xap-cocos-slot-v1";
export const PLAYER_RADIUS = 0.28;
export const MAX_FRAME_SECONDS = 0.05;
export const CHUNK_SIZE = 16;
export const CHEST_BLOCK = 25;
export const CHEST_RANDOM_P = 0.0015;
export const CAVE_CELL = 4;
export const VEIN_CELL = 3;
export const REVIEW_GAP_M = 15;
export const STUBBORN_MIN = 10;
export const STUBBORN_SPAN = 21;
export const REWARD_STEPS = [1, 0.7, 0.4];
export const FLOOR_REWARD = 0.25;
export const MAX_ATTEMPTS = 3;
export const NPC_TALK_RADIUS = 1.7;
export const WORD_DROP_CHANCE = 0.16;
export const WORD_PICKUP_RADIUS = 0.55;
export const WORD_PICKUP_COINS = 2;
export const MAX_WORD_DROPS = 12;
export const SHAFT_GRACE_SECONDS = 0.9;
export const SALT = {
  base: 1, cave: 2, veinCell: 3, veinFill: 4,
  chestRandom: 5, chestBlock: 6, surfaceKind: 7, quiz: 100, wordDrop: 101, dropWord: 102,
} as const;
