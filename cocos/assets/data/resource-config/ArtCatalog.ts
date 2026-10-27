// 资源名沿用远程 Web 定稿；PNG 原始字节由 tools/recover_art.mjs 无损恢复。
export const ART_NAMES = [
  "house_blue", "house_red", "miner_back", "miner_front", "miner_side",
  "node_amethyst", "node_coal", "node_copper", "node_crystal", "node_emerald", "node_gold",
  "node_iron", "node_rock", "node_ruby", "node_sapphire", "node_silver", "node_starcore", "stump",
  "tile_dirt", "tile_grass", "tile_grass_flower", "tile_grass_tall", "tile_path_edge",
  "tile_plowed", "tile_rock", "tile_sand", "tom_front", "tree_apple", "tree_birch", "tree_oak", "tree_pine",
] as const;

export const ORE_ART: Record<string, string> = {
  ore_copper: "node_copper", ore_iron: "node_iron", ore_gold: "node_gold",
  ore_diamond: "node_sapphire", ore_starcore: "node_starcore", surface_rock: "node_rock", stubborn: "node_ruby",
};

export const STRATUM_TINT: Record<number, string> = {
  1: "ffffff", 2: "e4d3a8", 3: "c7c5d2", 4: "8d83ad", 5: "736080",
};

export const ITEM_NAMES: Record<string, string> = {
  coin: "金币", wood: "木头", stone: "石头", ore_copper: "铜矿", ore_iron: "铁矿",
  ore_gold: "金矿", ore_diamond: "钻石", ore_starcore: "星核",
};

export const DEBRIS_COLORS: Record<string, string[]> = {
  dirt: ["9b7852", "bd9b70"], sandstone: ["c6af7b", "a88d5e"],
  granite: ["aaa4a4", "827a86"], basalt: ["6d6878", "90859b"], obsidian: ["554961", "84708f"],
  tree: ["6b8a4d", "947149"], surface_rock: ["9f9c8c", "79766b"],
  chest: ["e4c66c", "b88a3d"], stubborn: ["a77baf", "dec5db"],
};
