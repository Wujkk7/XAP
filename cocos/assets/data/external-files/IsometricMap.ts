// 手工视角试验场；与程序化世界和玩家存档无关。
export const ISOMETRIC_MAP = {
  size: 13,
  spawn: { x: 6.5, y: 7.5 },
  water: [[2, 4], [2, 5], [3, 4], [3, 5]],
  props: [
    { x: 2, y: 2, art: "xpaa_oak", width: 134 },
    { x: 3, y: 2, art: "xpaa_pine", width: 104 },
    { x: 9, y: 2, art: "xpaa_oak", width: 134 },
    { x: 10, y: 3, art: "xpaa_pine", width: 104 },
    { x: 2, y: 8, art: "xpaa_pine", width: 104 },
    { x: 3, y: 10, art: "xpaa_oak", width: 134 },
    { x: 9, y: 9, art: "xpaa_oak", width: 134 },
    { x: 10, y: 10, art: "xpaa_pine", width: 104 },
    { x: 6, y: 3, art: "xpaa_pine", width: 104 },
    { x: 3, y: 7, art: "xpaa_oak", width: 134 },
    { x: 9, y: 6, art: "xpaa_pine", width: 104 },
    { x: 5, y: 5, art: "xpaa_stone", width: 64 },
    { x: 8, y: 4, art: "xpaa_stone", width: 64 },
    { x: 4, y: 9, art: "xpaa_stone", width: 64 },
    { x: 10, y: 7, art: "xpaa_stone", width: 64 },
  ],
} as const;
