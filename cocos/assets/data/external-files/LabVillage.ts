import { VILLAGE } from './Village.ts';

// Translate the existing village into the expanded positive-coordinate map.
export const LAB_VILLAGE = {
  houses: VILLAGE.houses.map(h => ({ ...h, x: h.x + 12, y: h.y + 18 })),
  npc: { ...VILLAGE.npc, x: VILLAGE.npc.x + 12, y: VILLAGE.npc.y + 18 },
  paths: VILLAGE.paths.map(p => ({ minX: p.minX + 12, maxX: p.maxX + 12, minY: p.minY + 18, maxY: p.maxY + 18 })),
  farm: { minX: VILLAGE.farm.minX + 12, maxX: VILLAGE.farm.maxX + 12, minY: VILLAGE.farm.minY + 18, maxY: VILLAGE.farm.maxY + 18 },
};
