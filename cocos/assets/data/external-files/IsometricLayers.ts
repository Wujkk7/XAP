export const LAB_THEMES = [
  { id: "forest", name: "阳光森林", floor: "80995e", path: "beaa77", side: "6b5940", edge: "4c4732", background: "19271f", light: "fff2c5", texture: "xpaa_grass", toughness: 1, objective: "长按砸穿脚下，看看树根下面的世界" },
  { id: "roots", name: "湿土与巨根", floor: "796044", path: "997955", side: "503e2f", edge: "352f29", background: "131f1c", light: "a1c9a0", texture: "tile_dirt", toughness: 1.2, objective: "绕过巨根，敲开根髓；继续向下寻找矿脉" },
  { id: "rock", name: "发光矿岩", floor: "626c79", path: "818591", side: "414854", edge: "272d39", background: "101722", light: "90cae8", texture: "tile_rock", toughness: 1.5, objective: "敲开蓝色矿晶，再寻找下一处突破口" },
] as const;

// 后续设计序列，当前不宣称这些主题已经可玩。
export const LAB_FUTURE_THEMES = ["埋藏遗迹", "洞穴与地下水域", "熔岩裂缝", "异常地底空间", "地心秘密"] as const;
