export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const LETTER_WEIGHTS = 'EEEEEEEEEEEAAAAAAAAARRRRRRRRIIIIIIIIOOOOOOOOTTTTTTTTNNNNNNSSSSSSLLLLLLCCCCUUUUDDDDPPPPMMMMHHHHGGGBBFFYYWWKVXZJQ';
export const LAB_WORD_RULES = { chestLetters: 12, chestCoins: 20, shortageChance: 0.25, hintCost: 1, commonCost: 1, rareCost: 2, commonSwap: 3, rareSwap: 6, finishSeconds: 0.5 } as const;
export const LAB_SERVICES = [
  { id: 'seal', x: 6, y: 5, title: '符文通道' },
  { id: 'npc', x: 7, y: 6, title: '兑换商人' },
  { id: 'clue', x: 5, y: 6, title: '线索碑' },
  { id: 'chest0', x: 6, y: 8, title: '字母宝箱' },
  { id: 'chest1', x: 6, y: 10, title: '字母宝箱' },
  { id: 'chest2', x: 8, y: 6, title: '字母宝箱' },
] as const;
