import { newSave, deserializeSave } from "./save.ts";
import type { GameSave } from "./save.ts";
import { PLAYER_STORAGE_KEY } from "../constants/GameRules.ts";

export interface PlayerPosition { x: number; y: number; z: number }
export interface PlayerSlot {
  version: 1;
  game: GameSave;
  position: PlayerPosition;
}
export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class PlayerStore {
  private storage: StoragePort;

  constructor(storage: StoragePort) { this.storage = storage; }

  load(seed: string): PlayerSlot {
    const raw = this.storage.getItem(PLAYER_STORAGE_KEY);
    if (raw === null) return { version: 1, game: newSave(seed), position: { x: 0.5, y: 0.5, z: 0 } };
    const data = JSON.parse(raw) as PlayerSlot;
    if (!data || data.version !== 1 || !data.position ||
        ![data.position.x, data.position.y].every(v => Number.isFinite(v) && Math.abs(v) < 2147483647) ||
        !Number.isSafeInteger(data.position.z) || data.position.z < 0 || data.position.z > 2147483647) {
      throw new Error("玩家存档格式错误，已保留原档，请先备份再处理");
    }
    data.game = deserializeSave(JSON.stringify(data.game));
    return data;
  }

  save(slot: PlayerSlot): void {
    // localStorage 单次 setItem 失败会保留原值；不先删除旧档。
    this.storage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(slot));
  }
}
