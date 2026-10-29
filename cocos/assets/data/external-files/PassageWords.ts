// Each answer has a deliberately specific bilingual clue; pools fall back across related themes.
export const PASSAGE_WORDS = [
  { word: 'TREE', theme: 0, clue: '有树干和枝叶，鸟儿在它上面筑巢。 / It has a trunk and branches. Birds nest in it.', observation: '刻痕上有一圈圈年轮，旁边画着向上伸展的枝杈。 / Rings mark its age; branches reach upward.' },
  { word: 'APPLE', theme: 0, clue: '长在果树上，可以做果派的红色水果。 / A red orchard fruit used in pies.', observation: '一颗圆果，短柄旁有叶片；咬开的地方露出浅色果肉。 / A round fruit with a short stem, a leaf and a pale bite mark.' },
  { word: 'BIRD', theme: 0, clue: '有羽毛和翅膀，在枝头鸣叫。 / It has feathers and wings, and sings on branches.', observation: '巢旁散落着羽毛，空中有一对展开的翅膀。 / Feathers surround a nest; two wings spread above it.' },
  { word: 'WATER', theme: 1, clue: '透明的液体，让树根保持湿润。 / A clear liquid that keeps roots wet.', observation: '裂隙下画着滴落的液珠，下面荡开一圈圈涟漪。 / Clear drops fall into spreading ripples.' },
  { word: 'STONE', theme: 1, clue: '坚硬的小块岩石，不是木头。 / A small hard piece of rock, not wood.', observation: '溪边一块灰色硬物，敲击处只有缺角，没有木纹。 / A grey hard piece by a stream, chipped but without grain.' },
  { word: 'CAVE', theme: 1, clue: '岩石中可以走进去的天然空洞。 / A natural hollow in rock that you can enter.', observation: '岩壁上是拱形入口，一串脚印消失在里面的黑暗中。 / Footprints lead through a rocky arch into darkness.' },
  { word: 'GEM', theme: 2, clue: '可以镶在戒指里的珍贵彩色石头。 / A precious coloured stone set in a ring.', observation: '环形饰物上嵌着多面的小晶体，旁边刻着闪光。 / A faceted crystal sparkles in a ring.' },
  { word: 'GOLD', theme: 2, clue: '制作金币的黄色贵金属。 / The yellow precious metal used for coins.', observation: '黄色金属被熔成圆币，矿工将它放在天平上。 / Yellow metal becomes coins on a miner’s scale.' },
  { word: 'FIRE', theme: 2, clue: '燃烧时发光发热，要小心靠近。 / It gives light and heat when burning.', observation: '木柴上方是跃动的尖舌，向上飘着烟和火星。 / Moving tongues rise from logs beneath smoke and sparks.' },
] as const;
