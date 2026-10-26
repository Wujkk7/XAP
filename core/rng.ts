// Deterministic hashing & RNG.
//
// The whole world is a pure function of (worldSeed, x, y, z): the same
// coordinates must produce the same tile on every device, forever.
// Nothing here may use Math.random() or the current time.

/** FNV-1a string hash -> uint32. Used to turn a world seed string into a number. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Integer coordinate hash -> uint32. salt separates independent rolls per tile. */
export function hashCoords(seed: number, x: number, y: number, z: number, salt: number): number {
  let h = seed >>> 0;
  h = Math.imul(h ^ (x | 0), 0x27d4eb2d);
  h = Math.imul(h ^ (y | 0), 0x165667b1);
  h = Math.imul(h ^ (z | 0), 0x9e3779b1);
  h = Math.imul(h ^ salt, 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}

/** Deterministic roll in [0, 1) for one tile + salt. */
export function roll(seed: number, x: number, y: number, z: number, salt: number): number {
  return hashCoords(seed, x, y, z, salt) / 4294967296;
}

/** mulberry32: small fast PRNG for local, non-world randomness (e.g. shuffling quiz options). */
export function rngFrom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Salt registry: one number per independent random decision per tile.
// Add new salts here, never reuse one for two different decisions.
export const SALT = {
  base: 1,
  cave: 2,
  veinCell: 3,
  veinFill: 4,
  chestRandom: 5,
  chestBlock: 6,
  surfaceKind: 7,
} as const;
