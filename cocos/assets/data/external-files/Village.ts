// 已有 Web 原型的手工村庄样本：布局与台词只有这一份，核心碰撞与视图共用。
export const VILLAGE = {
  houses: [
    { x: 3, y: -4, width: 2, depth: 2, sprite: "house_red" },
    { x: 6, y: -4, width: 2, depth: 2, sprite: "house_blue" },
  ],
  npc: { x: 5, y: -2, name: "梅婆婆 May", label: "梅婆婆", sprite: "tom_front" },
  paths: [
    { minX: -4, maxX: 10, minY: -1, maxY: -1 },
    { minX: 5, maxX: 5, minY: -1, maxY: 4 },
  ],
  farm: { minX: -7, maxX: -5, minY: -4, maxY: -2 },
  dialogue: [
    { en: "Hello! I am May. Dig deep, find gold!", zh: "你好！我是梅婆婆。往深挖，能找到金子！" },
    { en: "A chest needs a word. The word is the key.", zh: "宝箱需要一个单词。单词就是钥匙。" },
    { en: "Wrong word? No fear. It sleeps under the stone.", zh: "答错词？别怕。它睡在石头下面等你。" },
    { en: "Trees give wood. Wood makes good tools.", zh: "树给木头。木头能做好工具。" },
  ],
} as const;

export function villageBlocked(x: number, y: number, depth: number): boolean {
  return depth === 0 && (
    VILLAGE.houses.some(h => x >= h.x && x < h.x + h.width && y >= h.y && y < h.y + h.depth) ||
    (x === VILLAGE.npc.x && y === VILLAGE.npc.y)
  );
}
