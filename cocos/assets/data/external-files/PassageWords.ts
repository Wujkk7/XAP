// Each answer has a deliberately specific bilingual clue; pools fall back across related themes.
export const PASSAGE_WORDS = [
  { word: 'TREE', theme: 0, clue: '有树干和枝叶，鸟儿在它上面筑巢。 / It has a trunk and branches. Birds nest in it.' },
  { word: 'APPLE', theme: 0, clue: '长在果树上，可以做果派的红色水果。 / A red orchard fruit used in pies.' },
  { word: 'BIRD', theme: 0, clue: '有羽毛和翅膀，在枝头鸣叫。 / It has feathers and wings, and sings on branches.' },
  { word: 'WATER', theme: 1, clue: '透明的液体，让树根保持湿润。 / A clear liquid that keeps roots wet.' },
  { word: 'STONE', theme: 1, clue: '坚硬的小块岩石，不是木头。 / A small hard piece of rock, not wood.' },
  { word: 'CAVE', theme: 1, clue: '岩石中可以走进去的天然空洞。 / A natural hollow in rock that you can enter.' },
  { word: 'GEM', theme: 2, clue: '可以镶在戒指里的珍贵彩色石头。 / A precious coloured stone set in a ring.' },
  { word: 'GOLD', theme: 2, clue: '制作金币的黄色贵金属。 / The yellow precious metal used for coins.' },
  { word: 'FIRE', theme: 2, clue: '燃烧时发光发热，要小心靠近。 / It gives light and heat when burning.' },
] as const;
