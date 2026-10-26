// Deterministic procedural world generation.
//
// getTile(seed, x, y, z) is a pure function: no stored world, no Math.random.
// The save file only records tiles the player changed (see save.ts).
//
// Layout: (x, y) is the ground-plane coordinate of the oblique top-down view,
// z is depth in meters. z = 0 is the surface slice; z >= 1 are underground
// slices at the same (x, y), so a shaft dug straight down stays aligned.

import { roll, hashCoords, SALT } from "./rng.ts";
import { stratumAt } from "./strata.ts";

export type TileType =
  // surface (z = 0)
  | "grass" | "tree" | "flower" | "surface_rock"
  // underground
  | "dirt" | "sandstone" | "granite" | "basalt" | "obsidian"
  | "ore_copper" | "ore_iron" | "ore_gold" | "ore_diamond" | "ore_starcore"
  | "chest" | "empty";

export interface Tile {
  type: TileType;
  /** pickaxe hits to dig through; 0 = walkable / not diggable */
  hardness: number;
  /** stratum id for underground tiles, 0 on the surface */
  stratum: number;
  /** chest material when type === "chest" */
  chestKind?: string;
}

export const CHUNK_SIZE = 16;
/** One guaranteed chest inside every block of this many tiles (per depth slice). */
export const CHEST_BLOCK = 25;
const CHEST_RANDOM_P = 0.0015; // extra random chests, ~1.5 per 1000 tiles
const CAVE_CELL = 4; // cave pockets are rolled per 4x4 cell so they form blobs
const VEIN_CELL = 3; // ore veins likewise

function surfaceTile(seed: number, x: number, y: number): Tile {
  // Clearings: spawn surroundings and the village plot stay obstacle-free,
  // so the player can always run on flat ground there.
  if (Math.abs(x) <= 2 && Math.abs(y) <= 2) return { type: "grass", hardness: 0, stratum: 0 };
  if (x >= 2 && x <= 8 && y >= -5 && y <= -1) return { type: "grass", hardness: 0, stratum: 0 };
  // Trees grow in groves (one roll per 5x5 cell) instead of uniform scatter:
  // most of the surface is open, run-friendly grassland between the groves.
  const grove = roll(seed, Math.floor(x / 5), Math.floor(y / 5), 0, SALT.surfaceKind + 31);
  const r = roll(seed, x, y, 0, SALT.surfaceKind);
  if (grove > 0.72 && r < 0.30) return { type: "tree", hardness: 1, stratum: 0 };
  if (r >= 0.985) return { type: "surface_rock", hardness: 2, stratum: 0 };
  if (r < 0.16) return { type: "flower", hardness: 0, stratum: 0 };
  return { type: "grass", hardness: 0, stratum: 0 };
}

/** The guaranteed-chest position inside the CHEST_BLOCK x CHEST_BLOCK block
 *  that contains (x, y) at this depth. Deterministic, so chests never depend
 *  on the order chunks were generated in. */
export function guaranteedChestPos(seed: number, x: number, y: number, z: number): { x: number; y: number } {
  const bx = Math.floor(x / CHEST_BLOCK);
  const by = Math.floor(y / CHEST_BLOCK);
  const h = hashCoords(seed, bx, by, z, SALT.chestBlock);
  return {
    x: bx * CHEST_BLOCK + (h % CHEST_BLOCK),
    y: by * CHEST_BLOCK + (Math.floor(h / CHEST_BLOCK) % CHEST_BLOCK),
  };
}

export function getTile(seed: number, x: number, y: number, z: number): Tile {
  if (z <= 0) return surfaceTile(seed, x, y);

  const s = stratumAt(z);

  // Chests first: guaranteed slot, then a small random chance.
  const g = guaranteedChestPos(seed, x, y, z);
  if ((g.x === x && g.y === y) || roll(seed, x, y, z, SALT.chestRandom) < CHEST_RANDOM_P) {
    return { type: "chest", hardness: 1, stratum: s.id, chestKind: s.chestKind };
  }

  // Cave pockets (walkable air) in blobs, never in the topsoil layer's first meters.
  if (z >= 6) {
    const cell = roll(seed, Math.floor(x / CAVE_CELL), Math.floor(y / CAVE_CELL), z, SALT.cave);
    if (cell > 0.93) return { type: "empty", hardness: 0, stratum: s.id };
  }

  // Ore veins in blobs of the layer's ore.
  const veinCell = roll(seed, Math.floor(x / VEIN_CELL), Math.floor(y / VEIN_CELL), z, SALT.veinCell);
  if (veinCell > 0.9 && roll(seed, x, y, z, SALT.veinFill) < 0.75) {
    return { type: s.oreTile as TileType, hardness: s.hardness + 1, stratum: s.id };
  }

  return { type: s.baseTile as TileType, hardness: s.hardness, stratum: s.id };
}

/** Generate one 16x16 chunk. Tiles are returned row-major: tiles[y][x], local coords. */
export function genChunk(seed: number, cx: number, cy: number, z: number): Tile[][] {
  const rows: Tile[][] = [];
  for (let ly = 0; ly < CHUNK_SIZE; ly++) {
    const row: Tile[] = [];
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      row.push(getTile(seed, cx * CHUNK_SIZE + lx, cy * CHUNK_SIZE + ly, z));
    }
    rows.push(row);
  }
  return rows;
}
