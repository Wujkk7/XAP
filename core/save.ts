// Save format: the world itself is never stored (it is regenerated from the
// seed); a save is only the seed + the player's changes + learning progress.
//
// - diffs: "x,y,z" -> replacement tile type ("dug" = removed block / opened chest)
// - stubborn: "x,y,z" -> word carried by a stubborn stone placed by mastery.ts
// Everything is plain JSON so the same shape works for localStorage (mini
// games), Cocos sys.localStorage and a future cloud save.

import { hashString } from "./rng.ts";
import { MasteryBook } from "./mastery.ts";

export interface GameSave {
  version: 1;
  seedString: string;
  seed: number;
  diffs: Record<string, string>;
  stubborn: Record<string, string>;
  mastery: Record<string, ReturnType<MasteryBook["serialize"]>[string]>;
  inventory: Record<string, number>;
  seenWords: string[];
  maxDepth: number;
  pickaxeLevel: number;
}

export function key(x: number, y: number, z: number): string {
  return x + "," + y + "," + z;
}

export function newSave(seedString: string): GameSave {
  return {
    version: 1,
    seedString,
    seed: hashString(seedString),
    diffs: {},
    stubborn: {},
    mastery: {},
    inventory: {},
    seenWords: [],
    maxDepth: 0,
    pickaxeLevel: 1,
  };
}

export function setDiff(save: GameSave, x: number, y: number, z: number, tile: string): void {
  save.diffs[key(x, y, z)] = tile;
}

export function getDiff(save: GameSave, x: number, y: number, z: number): string | undefined {
  return save.diffs[key(x, y, z)];
}

export function placeStubborn(save: GameSave, x: number, y: number, depth: number, word: string): void {
  save.stubborn[key(x, y, depth)] = word;
  save.diffs[key(x, y, depth)] = "stubborn";
}

export function addItem(save: GameSave, item: string, n: number): void {
  save.inventory[item] = (save.inventory[item] ?? 0) + n;
  if (save.inventory[item] <= 0) delete save.inventory[item];
}

/** Full round-trip through JSON, exactly what the platform storage layer will do. */
export function serializeSave(save: GameSave): string {
  return JSON.stringify(save);
}

export function deserializeSave(json: string): GameSave {
  const data = JSON.parse(json) as GameSave;
  if (data.version !== 1) throw new Error("unsupported save version: " + data.version);
  return data;
}
