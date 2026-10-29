import { IsometricWalk } from "./Isometric.ts";
import { hashCoords } from "./rng.ts";
import { ISOMETRIC_MAP as MAP } from "../data/external-files/IsometricMap.ts";
import { LAB_THEMES } from "../data/external-files/IsometricLayers.ts";
import { ISO_PLAYER_RADIUS as R, LAB_BREAK_SECONDS, LAB_TRAVEL_SECONDS, LAB_TAP_SECONDS } from "../data/constants/IsometricRules.ts";
import { MAX_FRAME_SECONDS } from "../data/constants/GameRules.ts";

export type LabTileKind = "floor" | "path" | "water" | "tree" | "rock" | "root" | "ore" | "wall";
export interface LabTile { kind: LabTileKind; hole: boolean; damage: number }
export interface LabLayer {
  depth: number; theme: number; tiles: LabTile[][];
  entrances: { x: number; y: number }[]; revision: number;
}
export interface LabTravel { from: number; to: number; x: number; y: number; elapsed: number }
export interface LabEffect { kind: "hit" | "collapse" | "resource" | "arrive"; x: number; y: number; depth: number }
const open = (tile: LabTile) => tile.kind === "floor" || tile.kind === "path";

export function makeLabLayer(depth: number): LabLayer {
  const theme = Math.min(depth, LAB_THEMES.length - 1), n = MAP.size;
  const tiles: LabTile[][] = Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => {
    let kind: LabTileKind = x === 6 || y === 6 ? "path" : "floor";
    if (theme === 0) {
      if (MAP.water.some(p => p[0] === x && p[1] === y)) kind = "water";
      const prop = MAP.props.find(p => p.x === x && p.y === y);
      if (prop) kind = prop.art === "xpaa_stone" ? "rock" : "tree";
    } else if (theme === 1) {
      if ((x === 3 && y >= 2 && y <= 9 && y !== 5) || (x === 9 && y >= 3 && y <= 10 && y !== 7) || (y === 3 && x >= 5 && x <= 7)) kind = "root";
      if ((x === 1 || x === 2) && y >= 8 && y <= 10) kind = "water";
      if ((x === 5 && y === 4) || (x === 8 && y === 8) || (x === 4 && y === 10)) kind = "ore";
    } else {
      const h = hashCoords(314159, x, y, depth, 502);
      const chamber = Math.abs(x - 6) <= 4 + (y % 3 === 0 ? 1 : 0) && Math.abs(y - 6) <= 4;
      if (!chamber || ((x === 4 || x === 9) && (y === 4 || y === 9))) kind = "wall";
      else if (h % 17 === 0 && Math.abs(x - 6) + Math.abs(y - 7) > 2) kind = "ore";
      if ((x === 5 && y === 4) || (x === 8 && y === 8)) kind = "ore";
    }
    return { kind, hole: false, damage: 0 };
  }));
  return { depth, theme, tiles, entrances: [], revision: 0 };
}

export class LayeredLab {
  walk = new IsometricWalk();
  layers = new Map<number, LabLayer>();
  depth = 0;
  maxDepth = 0;
  resources = 0;
  target: { x: number; y: number } | null = null;
  travel: LabTravel | null = null;
  effects: LabEffect[] = [];
  message = "长按砸地，可以打开通向下一层的缺口";
  canStrike: (x: number, y: number) => boolean = () => true;
  private releaseRequired = false;
  private damageKey = "";
  private hitStage = 0;
  private arrivalGrace = 0;

  constructor() { this.layer(0); this.walk.isBlocked = (x, y) => this.collides(x, y); }
  layer(depth = this.depth): LabLayer {
    let layer = this.layers.get(depth);
    if (!layer) { layer = makeLabLayer(depth); this.layers.set(depth, layer); }
    return layer;
  }
  tile(x: number, y: number, depth = this.depth): LabTile | undefined { return this.layer(depth).tiles[y]?.[x]; }
  collides(x: number, y: number): boolean {
    if (x - R < 0 || y - R < 0 || x + R >= MAP.size || y + R >= MAP.size) return true;
    for (let cy = Math.floor(y - R); cy <= Math.floor(y + R); cy++) for (let cx = Math.floor(x - R); cx <= Math.floor(x + R); cx++) {
      const tile = this.tile(cx, cy); if (!tile || !open(tile)) return true;
    }
    return false;
  }
  select(x: number, y: number): boolean {
    if (this.travel || !this.tile(x, y) || Math.hypot(x + 0.5 - this.walk.x, y + 0.5 - this.walk.y) > 1.65) return false;
    this.target = { x, y }; return true;
  }
  selected(): { x: number; y: number } {
    if (this.target && Math.hypot(this.target.x + 0.5 - this.walk.x, this.target.y + 0.5 - this.walk.y) <= 1.65) return this.target;
    this.target = null; return { x: Math.floor(this.walk.x), y: Math.floor(this.walk.y) };
  }
  private effect(kind: LabEffect["kind"], x: number, y: number): void {
    if (this.effects.length >= 32) this.effects.shift(); this.effects.push({ kind, x, y, depth: this.depth });
  }
  private clearLanding(depth: number, x: number, y: number): void {
    const layer = this.layer(depth);
    // 通道落点是一块实际可站立的格子；仅清理这一列，不改变其他地图区域。
    if (!open(layer.tiles[y][x])) layer.tiles[y][x] = { kind: "floor", hole: false, damage: 0 };
    if (!layer.entrances.some(p => p.x === x && p.y === y)) layer.entrances.push({ x, y });
    layer.revision++;
  }
  private descend(x: number, y: number): void {
    this.clearLanding(this.depth + 1, x, y);
    this.travel = { from: this.depth, to: this.depth + 1, x, y, elapsed: 0 };
    this.walk.stop(); this.target = null; this.releaseRequired = true;
    this.message = "地面坍塌了，下面还有一层…";
  }
  openPassage(x: number, y: number): void {
    const tile = this.tile(x, y)!;
    tile.kind = "path"; tile.hole = true; tile.damage = 0;
    this.layer().revision++; this.clearLanding(this.depth + 1, x, y);
    this.effect("collapse", x, y); this.message = "符文通道打开了 · 走入缺口可下潜，入口可原路返回";
  }
  ascend(): boolean {
    if (this.travel || this.depth === 0) return false;
    const x = Math.floor(this.walk.x), y = Math.floor(this.walk.y);
    if (!this.layer().entrances.some(p => p.x === x && p.y === y)) { this.message = "回到入口的梯子旁，才能返回上一层"; return false; }
    this.travel = { from: this.depth, to: this.depth - 1, x, y, elapsed: 0 };
    this.walk.stop(); this.target = null; this.releaseRequired = true; return true;
  }
  returnToEntry(): void {
    if (this.travel) return;
    const p = this.layer().entrances[0];
    this.walk.x = p ? p.x + 0.5 : MAP.spawn.x; this.walk.y = p ? p.y + 0.5 : MAP.spawn.y;
    this.walk.stop(); this.target = null;
  }
  tapStrike(): void {
    if (this.travel || this.releaseRequired) return;
    this.walk.stop(); this.strike(LAB_TAP_SECONDS);
  }
  private strike(dt: number): void {
    const { x, y } = this.selected(), tile = this.tile(x, y)!;
    if (!this.canStrike(x, y)) { this.message = "附近有探索互动 · 点击互动按钮，或换一块普通地面下潜"; return; }
    if (tile.kind === "water") { this.message = "这里是水面，换一块干燥地面再砸"; return; }
    if (tile.hole) {
      if (Math.floor(this.walk.x) === x && Math.floor(this.walk.y) === y) this.descend(x, y);
      else this.message = "缺口已经打开，走过去就能下潜";
      return;
    }
    const key = this.depth + ":" + x + ":" + y;
    if (key !== this.damageKey) { this.damageKey = key; this.hitStage = Math.floor(tile.damage * 3); }
    tile.damage = Math.min(1, tile.damage + dt / (LAB_BREAK_SECONDS * LAB_THEMES[this.layer().theme].toughness));
    const stage = Math.floor(tile.damage * 3);
    if (stage > this.hitStage) { this.hitStage = stage; this.effect("hit", x, y); }
    if (tile.damage < 1) return;
    this.effect("collapse", x, y); tile.damage = 0; this.layer().revision++;
    if (!open(tile)) {
      if (tile.kind === "ore") { this.resources++; this.effect("resource", x, y); this.message = "发现了矿晶 · 本次收集 " + this.resources; }
      else { this.resources++; this.message = "障碍敲开 · 采集材料 +1，可用于兑换字母"; }
      tile.kind = "floor"; this.releaseRequired = true; return;
    }
    tile.hole = true; this.layer(this.depth + 1);
    if (Math.floor(this.walk.x) === x && Math.floor(this.walk.y) === y) this.descend(x, y);
    else { this.message = "通道打开了，走到缺口进入下一层"; this.releaseRequired = true; }
  }
  tick(seconds: number, x: number, y: number, striking: boolean): void {
    const dt = Math.max(0, Math.min(seconds, MAX_FRAME_SECONDS));
    if (!striking) this.releaseRequired = false;
    if (this.travel) {
      this.travel.elapsed += dt;
      if (this.travel.elapsed >= LAB_TRAVEL_SECONDS) {
        const t = this.travel; this.depth = t.to; this.maxDepth = Math.max(this.maxDepth, this.depth);
        this.walk.x = t.x + 0.5; this.walk.y = t.y + 0.5; this.walk.stop(); this.travel = null;
        this.arrivalGrace = 0.8; this.effect("arrive", t.x, t.y);
        this.message = "第 " + (this.depth + 1) + " 层 · " + LAB_THEMES[this.layer().theme].name;
      }
      return;
    }
    this.arrivalGrace = Math.max(0, this.arrivalGrace - dt);
    if (striking && !this.releaseRequired) { this.walk.stop(); this.strike(dt); }
    else {
      const oldX = Math.floor(this.walk.x), oldY = Math.floor(this.walk.y);
      this.walk.tick(dt, x, y);
      const cx = Math.floor(this.walk.x), cy = Math.floor(this.walk.y);
      if ((cx !== oldX || cy !== oldY) && this.arrivalGrace === 0 && this.tile(cx, cy)?.hole) this.descend(cx, cy);
    }
  }
}
