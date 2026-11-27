import { IsometricWalk, isoProject } from "./Isometric.ts";
import { hashCoords } from "./rng.ts";
import { ISOMETRIC_MAP as MAP } from "../data/external-files/IsometricMap.ts";
import { LAB_THEMES } from "../data/external-files/IsometricLayers.ts";
import { ISO_PLAYER_RADIUS as R, LAB_BREAK_SECONDS, LAB_TRAVEL_SECONDS, LAB_TAP_SECONDS } from "../data/constants/IsometricRules.ts";
import { MAX_FRAME_SECONDS } from "../data/constants/GameRules.ts";
import { LAB_MAP_SIZE, LAB_WORLD_SEED, LAB_DIG_REACH, LAB_AIM_BIAS, LAB_WALL_HEIGHT, LAB_SOIL_HEIGHT, LAB_EXCAVATION as EX } from '../data/constants/IsometricRules.ts';
import { getTile, guaranteedChestPos } from './worldgen.ts';
import { LAB_VILLAGE } from '../data/external-files/LabVillage.ts';

export type LabTileKind = "floor" | "path" | "water" | "tree" | "rock" | "root" | "ore" | "wall" | "soil" | "chest" | "stubborn" | "village" | "relic" | "pack_part";
export interface LabTile { kind: LabTileKind; hole: boolean; damage: number }
export interface LabLayer {
  depth: number; theme: number; tiles: LabTile[][];
  entrances: { x: number; y: number }[]; revision: number;
}
export interface LabTravel { from: number; to: number; x: number; y: number; elapsed: number }
export interface LabEffect { kind: "hit" | "collapse" | "resource" | "arrive" | "chest"; x: number; y: number; depth: number; height?:number }
const open = (tile: LabTile) => tile.kind === "floor" || tile.kind === "path";
const walkable = (tile: LabTile) => open(tile) || tile.kind === "relic" || tile.kind === "pack_part";
const CHAMBER_CENTERS: readonly [number, number][] = [[19, 11], [11, 20], [21, 18], [19, 3]];

export function makeLabLayer(depth: number, excavation = true): LabLayer {
  const theme = Math.min(depth, LAB_THEMES.length - 1), n = LAB_MAP_SIZE;
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
      if ((x === 6 && y >= 6) || (y === 6 && x >= 6)) kind = "path";
    }
    if(x>=MAP.size||y>=MAP.size){
      const tile=getTile(LAB_WORLD_SEED,x,y,depth),h=hashCoords(LAB_WORLD_SEED,x,y,depth,702);
      kind=depth===0?(tile.type==='tree'?'tree':tile.type==='surface_rock'?'rock':'floor')
        :tile.type==='chest'?'chest':tile.type.startsWith('ore_')?'ore'
        :depth>=3&&h%19===0?'water'
        :depth>=3&&h%13===0?'ore'
        :h%7===0?(theme===1?'root':'wall'):'floor';
      if(x===6||y===6||x%8===0||y%8===0)kind='path';
    }
    if(depth===0){
      if(LAB_VILLAGE.paths.some(p=>x>=p.minX&&x<=p.maxX&&y>=p.minY&&y<=p.maxY))kind='path';
      if(LAB_VILLAGE.houses.some(h=>x>=h.x&&x<h.x+h.width&&y>=h.y&&y<h.y+h.depth)||(x===LAB_VILLAGE.npc.x&&y===LAB_VILLAGE.npc.y))kind='village';
    }
    return { kind, hole: false, damage: 0 };
  }));
  if(depth>0){const p=guaranteedChestPos(LAB_WORLD_SEED,0,0,depth);
    // Keep guaranteed treasure outside central & scattered underground service tiles.
    const hitsService=(p.x===6&&[4,5,7,8,10,16,18].includes(p.y))||(p.y===6&&[5,7,8,10,14,16].includes(p.x))||(p.x===16&&p.y===16);
    if(hitsService){p.x=20;p.y=20;}
    tiles[p.y][p.x].kind='chest';}
  const layer={ depth, theme, tiles, entrances: [], revision: 0 };
  if(excavation){addLabExcavations(layer);addLabChambers(layer);}
  return layer;
}

/** Deterministic wall-ringed hidden chambers in outer underground zones; players freely dig any wall to enter. */
export function addLabChambers(layer: LabLayer, player?: { x: number; y: number }, skipPackPart = false): void {
  if (layer.depth <= 0 || layer.tiles.length < LAB_MAP_SIZE) return;
  const start = hashCoords(LAB_WORLD_SEED, layer.depth, 0, 0, 741) % CHAMBER_CENTERS.length;
  let placed = 0;
  for (let offset = 0; offset < CHAMBER_CENTERS.length && placed < 2; offset++) {
    const [cx, cy] = CHAMBER_CENTERS[(start + offset) % CHAMBER_CENTERS.length];
    let blocked = false;
    for (let dy = -1; dy <= 1 && !blocked; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx, y = cy + dy, t = layer.tiles[y]?.[x];
      if (!t || t.hole || t.damage > 0 || ['chest', 'stubborn', 'village', 'relic', 'pack_part'].includes(t.kind)) { blocked = true; break; }
      if (layer.entrances.some(e => e.x === x && e.y === y)) { blocked = true; break; }
      if (player && Math.abs(x + 0.5 - player.x) < EX.playerClearance && Math.abs(y + 0.5 - player.y) < EX.playerClearance) { blocked = true; break; }
    }
    if (blocked) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      layer.tiles[cy + dy][cx + dx] = { kind: 'wall', hole: false, damage: 0 };
    }
    const centerKind: LabTileKind = placed === 0 ? 'relic' : (layer.depth === 1 && !skipPackPart ? 'pack_part' : 'relic');
    layer.tiles[cy][cx] = { kind: centerKind, hole: false, damage: 0 };
    placed++;
  }
  if (placed) layer.revision++;
}

/** Only untouched original floor becomes a deposit; mined walls and legacy routes stay open. */
export function addLabExcavations(layer:LabLayer,player?:{x:number;y:number}):void{
  const original=makeLabLayer(layer.depth,false),size=layer.tiles.length;
  let changed=false;
  for(let y=1;y<size-1;y++)for(let x=1;x<size-1;x++){
    const tile=layer.tiles[y][x];
    if(x<MAP.size&&y<MAP.size||tile.kind!=='floor'||tile.hole||tile.damage>0||original.tiles[y][x].kind!=='floor')continue;
    if(layer.entrances.some(p=>p.x===x&&p.y===y)||player&&Math.abs(x+.5-player.x)<EX.playerClearance&&Math.abs(y+.5-player.y)<EX.playerClearance)continue;
    if(layer.depth===0&&x>=12&&x<=22&&y>=12&&y<=20)continue;
    const patch=hashCoords(LAB_WORLD_SEED,Math.floor(x/EX.patchSize),Math.floor(y/EX.patchSize),layer.depth,721);
    const h=hashCoords(LAB_WORLD_SEED,x,y,layer.depth,722);
    const ridge=layer.depth>0&&((x%EX.ridgePeriod===EX.ridgePeriod-2&&Math.floor(y/EX.ridgeSegment)%2===0)||(y%EX.ridgePeriod===EX.patchSize&&Math.floor(x/EX.ridgeSegment)%2===1));
    if(ridge||patch%100<100*EX.patchChance&&h%100<100*EX.fillChance){tile.kind=ridge?'wall':'soil';changed=true;}
  }
  if(changed)layer.revision++;
}

export class LayeredLab {
  walk = new IsometricWalk();
  layers = new Map<number, LabLayer>();
  depth = 0;
  maxDepth = 0;
  resources = 0;
  digSpeed = 1;
  private _target: { x: number; y: number } | null = null;
  private manualTarget=false;
  get target(): {x:number;y:number}|null{return this._target;}
  set target(value:{x:number;y:number}|null){this._target=value;this.manualTarget=value!==null;}
  travel: LabTravel | null = null;
  effects: LabEffect[] = [];
  message = "探索采集与寻宝 · 破解符文后继续向下";
  canStrike: (x: number, y: number) => boolean = () => true;
  onMined: (x: number, y: number, kind: LabTileKind) => void = () => {};
  canDescend: (depth: number) => boolean = () => true;
  canLand: (x:number,y:number,depth:number) => boolean = () => true;
  canAutoTarget:(x:number,y:number)=>boolean=()=>true;
  onBeforeDescend?: (fromDepth: number) => string | void;
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
    const size=this.layer().tiles.length;
    if (x - R < 0 || y - R < 0 || x + R >= size || y + R >= size) return true;
    for (let cy = Math.floor(y - R); cy <= Math.floor(y + R); cy++) for (let cx = Math.floor(x - R); cx <= Math.floor(x + R); cx++) {
      const tile = this.tile(cx, cy); if (!tile || !walkable(tile)) return true;
    }
    return false;
  }
  select(x: number, y: number): boolean {
    if (this.travel || !this.tile(x, y) || Math.hypot(x + 0.5 - this.walk.x, y + 0.5 - this.walk.y) > LAB_DIG_REACH) return false;
    this.target = { x, y }; return true;
  }
  selected(): { x: number; y: number } {
    const current=this._target;
    if(current&&Math.hypot(current.x+.5-this.walk.x,current.y+.5-this.walk.y)<=LAB_DIG_REACH&&(this.manualTarget||(this.tile(current.x,current.y)?.damage??0)>0))return current;
    this.target=null;
    const cx=Math.floor(this.walk.x),cy=Math.floor(this.walk.y);
    if(this.tile(cx,cy)?.hole)return{x:cx,y:cy};
    let best:{x:number;y:number}|null=null,score=Infinity;
    for(let y=cy-1;y<=cy+1;y++)for(let x=cx-1;x<=cx+1;x++){
      const tile=this.tile(x,y);if(!tile||!['tree','rock','ore','root','wall','soil'].includes(tile.kind)||!this.canAutoTarget(x,y))continue;
      const dx=x+.5-this.walk.x,dy=y+.5-this.walk.y,distance=Math.hypot(dx,dy);
      if(distance>LAB_DIG_REACH)continue;
      if(x!==cx&&y!==cy&&!open(this.tile(x,cy)!)&&!open(this.tile(cx,y)!))continue;
      const p=isoProject(dx,dy),length=Math.hypot(p.x,p.y)||1;
      const alignment=(p.x*this.walk.facing.x-p.y*this.walk.facing.y)/length;
      const candidate=distance-LAB_AIM_BIAS*alignment;
      if(candidate<score){score=candidate;best={x,y};}
    }
    this._target=best;return best??{x:cx,y:cy};
  }
  private effect(kind: LabEffect["kind"], x: number, y: number): void {
    const tile=this.tile(x,y),height=tile?.kind==='wall'?LAB_WALL_HEIGHT:tile?.kind==='soil'?LAB_SOIL_HEIGHT:0;
    if (this.effects.length >= 32) this.effects.shift(); this.effects.push({ kind, x, y, depth: this.depth,height });
  }
  private clearLanding(depth: number, x: number, y: number): void {
    const layer = this.layer(depth);
    if(!layer.tiles[y]?.[x]){
      const expanded=makeLabLayer(depth);
      for(let cy=0;cy<layer.tiles.length;cy++)for(let cx=0;cx<layer.tiles.length;cx++)expanded.tiles[cy][cx]=layer.tiles[cy][cx];
      layer.tiles=expanded.tiles;
    }
    // 通道落点是一块实际可站立的格子；仅清理这一列，不改变其他地图区域。
    if (!open(layer.tiles[y][x])) layer.tiles[y][x] = { kind: "floor", hole: false, damage: 0 };
    if (!layer.entrances.some(p => p.x === x && p.y === y)) layer.entrances.push({ x, y });
    layer.revision++;
  }
  private descend(x: number, y: number): void {
    if(!this.canDescend(this.depth)){this.message='先破解本层封印，才能进入新的下层';return;}
    const below=this.tile(x,y,this.depth+1);
    if(!this.canLand(x,y,this.depth+1)||below&&['chest','stubborn','village','relic','pack_part'].includes(below.kind)){this.message='下方有宝藏或封印，换一格下潜再探索';return;}
    this.clearLanding(this.depth + 1, x, y);
    const reminder = this.onBeforeDescend?.(this.depth);
    this.travel = { from: this.depth, to: this.depth + 1, x, y, elapsed: 0 };
    this.walk.stop(); this.target = null; this.releaseRequired = true;
    this.message = reminder || "地面坍塌了，下面还有一层…";
  }
  warpTo(depth: number, x: number, y: number): boolean {
    if (this.travel || depth < 0 || depth === this.depth) return false;
    const target = this.layer(depth);
    if (!open(target.tiles[y][x])) target.tiles[y][x] = { kind: "path", hole: false, damage: 0 };
    target.revision++;
    this.travel = { from: this.depth, to: depth, x, y, elapsed: 0 };
    this.walk.stop(); this.target = null; this.releaseRequired = true;
    this.message = depth === 0 ? "搭乘升降站返回地表营地…" : "搭乘升降站前往第 " + (depth + 1) + " 层…";
    return true;
  }
  openPassage(x: number, y: number): void {
    const tile = this.tile(x, y)!;
    tile.kind = "path"; tile.hole = true; tile.damage = 0;
    this.layer().revision++;
    const below=this.tile(x,y,this.depth+1);
    if(this.canLand(x,y,this.depth+1)&&(!below||!['chest','stubborn','village','relic','pack_part'].includes(below.kind)))this.clearLanding(this.depth + 1, x, y);
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
    if (!this.canStrike(x, y)) { this.message = "附近有探索互动 · 点击互动按钮或 E"; return; }
    if(tile.kind==='village'){this.message='村庄建筑不能挖掘';return;}
    if(tile.kind==='relic'||tile.kind==='pack_part'){this.message='走近宝物即可拾取';return;}
    if(open(tile)&&!this.canDescend(this.depth)){this.message='本层封印尚未破解 · 可先采集、寻宝和收集字母';return;}
    if (tile.kind === "water") { this.message = "这里是水面，换一块干燥地面再砸"; return; }
    if (tile.hole) {
      if (Math.floor(this.walk.x) === x && Math.floor(this.walk.y) === y) this.descend(x, y);
      else this.message = "缺口已经打开，走过去就能下潜";
      return;
    }
    const key = this.depth + ":" + x + ":" + y;
    if (key !== this.damageKey) { this.damageKey = key; this.hitStage = Math.floor(tile.damage * 3); }
    tile.damage = Math.min(1, tile.damage + (dt * this.digSpeed) / (LAB_BREAK_SECONDS * LAB_THEMES[this.layer().theme].toughness));
    const stage = Math.floor(tile.damage * 3);
    if (stage > this.hitStage) { this.hitStage = stage; this.effect("hit", x, y); }
    if (tile.damage < 1) return;
    this.effect("collapse", x, y); tile.damage = 0; this.layer().revision++;
    if (!open(tile)) {
      if (tile.kind === "ore") { this.resources++; this.effect("resource", x, y); this.message = "发现了矿晶 · 本次收集 " + this.resources; }
      else { this.resources++; this.message = "障碍敲开 · 采集材料 +1，可用于兑换字母"; }
      this.onMined(x,y,tile.kind);tile.kind = "floor"; this.target=null;this.releaseRequired = true; return;
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
      if(this.manualTarget&&(x!==0||y!==0))this.target=null;
      const cx = Math.floor(this.walk.x), cy = Math.floor(this.walk.y);
      if ((cx !== oldX || cy !== oldY) && this.arrivalGrace === 0 && this.tile(cx, cy)?.hole) this.descend(cx, cy);
    }
  }
}
