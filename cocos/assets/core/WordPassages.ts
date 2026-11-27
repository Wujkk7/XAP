import { LayeredLab, makeLabLayer, addLabExcavations, addLabChambers } from './LayeredLab.ts';
import type { LabLayer } from './LayeredLab.ts';
import { hashCoords } from './rng.ts';
import { ChestSession } from './quiz.ts';
import { WORDS_TIER1 } from './vocab.ts';
import { PASSAGE_WORDS } from '../data/external-files/PassageWords.ts';
import { LETTERS, LETTER_WEIGHTS, LAB_WORD_RULES as RULE, LAB_SERVICES, LAB_LIFT_RULES } from '../data/constants/WordPassageRules.ts';
import { LabAdventure } from './LabAdventure.ts';
import { LAB_VILLAGE } from '../data/external-files/LabVillage.ts';
import { LAB_MAP_SIZE } from '../data/constants/IsometricRules.ts';

export interface WordLayer { answer: string; discovered: boolean; learned: boolean; hint: boolean; letterHint?: boolean; opened: boolean; chests: number[]; attempts: number[] }
export class WordPassages {
  letters: Record<string, number> = Object.fromEntries(Array.from(LETTERS, c => [c, 0]));
  seen: string[] = [];
  correct: Record<string, number> = {};
  rooms: Record<string, WordLayer> = {};
  tracked = '';
  repairedLifts: number[] = [0];
  liftCleared: Record<string, number> = {};
  adventure: LabAdventure;
  legacyDepth = 0;
  get coins():number{return this.adventure.game.inventory.coin??0;}
  set coins(value:number){if(value)this.adventure.game.inventory.coin=value;else delete this.adventure.game.inventory.coin;}
  private drops = 0;
  lab: LayeredLab;
  constructor(lab: LayeredLab) {
    this.lab = lab;
    this.adventure=new LabAdventure(lab);
    lab.canStrike = (x, y) => {if(this.adventure.open(x,y))return false;return !this.serviceAt(x,y);};
    lab.canDescend=d=>d<this.legacyDepth||!!this.rooms[String(d)]?.opened;
    lab.canLand=(x,y,d)=>!this.adventure.game.stubborn[x+','+y+','+d];
    lab.canAutoTarget=(x,y)=>!this.serviceAt(x,y);
    lab.onBeforeDescend = from => {
      if (from > 0 && !this.repairedLifts.includes(from)) {
        const dist = this.nearestRepairedDistance(from + 1);
        return '提示：第 ' + (from + 1) + ' 层升降站未修 · 最近已修站距下层 ' + dist + ' 层';
      }
    };
    this.prepare();
  }
  get services(): { id: string; x: number; y: number; title: string }[] {
    const d = this.lab.depth;
    if (d === 0) {
      const services = LAB_SERVICES.map(p => ({ ...p })) as { id: string; x: number; y: number; title: string }[];
      services.push({ id: 'lift', x: 4, y: 6, title: '营地升降总站' });
      if (this.lab.layer().tiles.length > 13) services.push({ id: 'may', x: LAB_VILLAGE.npc.x, y: LAB_VILLAGE.npc.y, title: LAB_VILLAGE.npc.name });
      return services;
    }
    // Underground: keep seal + merchant near entry; place lift station separately on main road; scatter clue & chests into dark outer roads.
    return [
      { id: 'seal', x: 6, y: d % 2 ? 4 : 5, title: '符文通道' },
      { id: 'npc', x: 7, y: 6, title: '兑换商人' },
      { id: 'lift', x: 10, y: 6, title: this.repairedLifts.includes(d) ? '升降站 · 可通行' : '损坏的升降站' },
      { id: 'clue', x: d % 2 ? 16 : 6, y: d % 2 ? 6 : 16, title: '线索碑' },
      { id: 'chest0', x: 14, y: 6, title: '字母宝箱' },
      { id: 'chest1', x: 6, y: 18, title: '字母宝箱' },
      { id: 'chest2', x: 16, y: 16, title: '字母宝箱' },
    ];
  }
  prepare(): WordLayer {
    const depth = this.lab.depth, id = String(depth);
    if (!this.rooms[id]) {
      const available = PASSAGE_WORDS.filter(w => !Object.values(this.rooms).some(r => r.answer === w.word));
      const themed = available.filter(w => w.theme === this.lab.layer().theme), pool = themed.length ? themed : available;
      const answer = pool.length ? pool[hashCoords(314159, 6, 5, depth, 601) % pool.length].word : '';
      this.rooms[id] = { answer, discovered: false, learned: false, hint: false, letterHint: false, opened: false, chests: [], attempts: [0, 0, 0] };
      const layer = this.lab.layer();
      for (const p of this.services) if (p.id!=='may'&&!layer.tiles[p.y][p.x].hole && !layer.entrances.some(e => e.x === p.x && e.y === p.y)) layer.tiles[p.y][p.x] = { kind: 'path', hole: false, damage: 0 };
      // Backup pack_part spawn every 3 underground floors if player discarded/missed depth 1's part.
      const hasPart = this.adventure.expanded || this.adventure.relics.some(r => r.kind === 'pack_part') || (this.adventure.pendingLoot?.kind === 'relic' && this.adventure.pendingLoot.relic.kind === 'pack_part');
      if (depth >= 2 && depth % 3 === 1 && !hasPart) {
        const relicTiles: { x: number; y: number }[] = [];
        layer.tiles.forEach((row, y) => row.forEach((t, x) => { if (t.kind === 'relic') relicTiles.push({ x, y }); }));
        if (relicTiles.length >= 2) layer.tiles[relicTiles[1].y][relicTiles[1].x].kind = 'pack_part';
      }
      layer.revision++;
    }
    this.adventure.prepare();return this.rooms[id];
  }
  get room(): WordLayer { return this.prepare(); }
  serviceAt(x: number, y: number): typeof this.services[number] | undefined {
    const p = this.services.find(s => s.x === x && s.y === y);
    if (!p) return;
    const room = this.rooms[String(this.lab.depth)];
    if (!room || this.lab.layer().entrances.some(e => e.x === x && e.y === y) || this.lab.tile(x,y)?.hole || this.lab.tile(x,y)?.kind==='stubborn' || (p.id === 'seal' && (!room.answer || room.opened)) || (p.id.startsWith('chest') && room.chests.includes(Number(p.id.slice(-1))))) return;
    return p;
  }
  nearby(): typeof this.services[number] | undefined {
    const target = this.lab.selected(), selected = this.serviceAt(target.x, target.y);
    if (selected) return selected;
    return this.services.find(p => this.serviceAt(p.x, p.y) && Math.hypot(p.x + 0.5 - this.lab.walk.x, p.y + 0.5 - this.lab.walk.y) <= 1.65);
  }
  discover(): void { const r = this.room; r.discovered = true; this.markSeen(r.answer); }
  private markSeen(word: string): void { if (word && !this.seen.includes(word)) this.seen.push(word); }
  clue(): string { return PASSAGE_WORDS.find(w => w.word === this.room.answer)?.clue ?? '新词库已探索完，暂不开放更深层；可返回已探索区域。'; }
  available(letter: string, draft = ''): number { return (this.letters[letter] ?? 0) - Array.from(draft).filter(c => c === letter).length; }
  needs(word = this.tracked): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const c of word) counts[c] = (counts[c] ?? 0) + 1;
    for (const c of Object.keys(counts)) { counts[c] = Math.max(0, counts[c] - this.letters[c]); if (!counts[c]) delete counts[c]; }
    return counts;
  }
  track(word: string): boolean { if (!/^[A-Z]{1,16}$/.test(word)) return false; this.tracked = word; return true; }
  hint(): boolean { if (this.room.hint) return true; if (!this.room.answer || this.lab.resources < RULE.hintCost) return false; this.lab.resources -= RULE.hintCost;this.adventure.consumeMaterials(RULE.hintCost); this.room.hint = true; return true; }
  letterHint(): boolean {
    if (this.room.letterHint) return true;
    if (!this.room.answer || this.lab.resources < RULE.letterHintCost) return false;
    this.lab.resources -= RULE.letterHintCost; this.adventure.consumeMaterials(RULE.letterHintCost);
    this.room.letterHint = true; return true;
  }
  learn(): string { this.room.learned = true; this.markSeen(this.room.answer); return this.observation(); }
  observation(): string { return PASSAGE_WORDS.find(w => w.word === this.room.answer)?.observation ?? '没有新的刻痕。'; }
  visibleWords(): string[] {
    return [...new Set([...this.seen,...this.adventure.game.seenWords.map(w=>w.toUpperCase())])].filter(w => !Object.values(this.rooms).some(r => r.answer === w && !r.opened));
  }
  cost(letter: string): number { return 'JQXZKV'.includes(letter) ? RULE.rareCost : RULE.commonCost; }
  exchange(letter: string, source?: string): boolean {
    if (!LETTERS.includes(letter) || letter.length !== 1) return false;
    if (source) {
      if (!LETTERS.includes(source) || source.length !== 1 || source === letter) return false;
      const count = this.cost(letter) === RULE.rareCost ? RULE.rareSwap : RULE.commonSwap;
      if (this.letters[source] < count) return false;
      this.letters[source] -= count;
    } else {
      const count = this.cost(letter); if (this.lab.resources < count) return false; this.lab.resources -= count;this.adventure.consumeMaterials(count);
    }
    this.letters[letter]++; return true;
  }
  quiz(index: number): ChestSession {
    const n = hashCoords(314159, index, 0, this.lab.depth, 612) % WORDS_TIER1.length;
    const entry = WORDS_TIER1[n]; this.markSeen(entry.word.toUpperCase());
    return new ChestSession(entry, hashCoords(314159, index, 1, this.lab.depth, 613));
  }
  answerChest(index: number, option: number): { opened: boolean; correct: boolean; letters: string; word: string } {
    if (index < 0 || index > 2 || !Number.isInteger(index) || this.room.chests.includes(index)) throw Error('宝箱不可重复领取');
    const session = this.quiz(index), used = this.room.attempts[index];
    // Reconstruct attempts through the shared quiz rules, so reload cannot reset penalties.
    for (let i = 0; i < used; i++) session.answer((session.question.correctIndex + 1) % 4);
    const result = session.answer(option); this.room.attempts[index] = result.attemptsUsed;
    let letters = '';
    if (result.opened) {
      this.room.chests.push(index); this.coins += Math.round(RULE.chestCoins * result.rewardMultiplier);
      this.lab.layer().revision++;
      const p=this.services.find(p=>p.id==='chest'+index)!;
      this.adventure.record(session.question.word,result.correct,p.x,p.y,this.lab.depth,result.attemptsUsed>1);
      this.lab.effects.push({kind:'chest',x:p.x,y:p.y,depth:this.lab.depth});
      for (let i = 0; i < RULE.chestLetters; i++) {
        const h = hashCoords(314159, index, this.drops++, this.lab.depth, 614), needed = Object.keys(this.needs());
        const c = needed.length && (h % 1000) / 1000 < RULE.shortageChance ? needed[h % needed.length] : LETTER_WEIGHTS[h % LETTER_WEIGHTS.length];
        this.letters[c]++; letters += c;
      }
    }
    return { opened: result.opened, correct: result.correct, letters, word: session.question.word };
  }
  grantWorldChestLetters(x: number, y: number, depth: number): string {
    let letters = '';
    for (let i = 0; i < RULE.worldChestLetters; i++) {
      const h = hashCoords(314159, x * 31 + y, this.drops++, depth, 619), needed = Object.keys(this.needs());
      const c = needed.length && (h % 1000) / 1000 < RULE.shortageChance ? needed[h % needed.length] : LETTER_WEIGHTS[h % LETTER_WEIGHTS.length];
      this.letters[c]++; letters += c;
    }
    return letters;
  }
  liftProgress(depth = this.lab.depth): { repaired: boolean; cleared: number; requiredClear: number; materialsNeeded: number } {
    return {
      repaired: this.repairedLifts.includes(depth),
      cleared: this.liftCleared[String(depth)] ?? 0,
      requiredClear: LAB_LIFT_RULES.clearSteps,
      materialsNeeded: LAB_LIFT_RULES.repairMaterials,
    };
  }
  clearLiftTrack(depth = this.lab.depth): boolean {
    if (this.repairedLifts.includes(depth)) return false;
    const id = String(depth), cur = this.liftCleared[id] ?? 0;
    if (cur >= LAB_LIFT_RULES.clearSteps) return false;
    this.liftCleared[id] = cur + 1;
    return true;
  }
  repairLift(depth = this.lab.depth): boolean {
    if (this.repairedLifts.includes(depth)) return true;
    const id = String(depth);
    if ((this.liftCleared[id] ?? 0) < LAB_LIFT_RULES.clearSteps || this.lab.resources < LAB_LIFT_RULES.repairMaterials) return false;
    this.lab.resources -= LAB_LIFT_RULES.repairMaterials;
    this.adventure.consumeMaterials(LAB_LIFT_RULES.repairMaterials);
    this.repairedLifts.push(depth);
    this.repairedLifts.sort((a, b) => a - b);
    delete this.liftCleared[id];
    this.lab.layer(depth).revision++;
    return true;
  }
  nearestRepairedDistance(depth = this.lab.depth): number {
    let best = depth;
    for (const d of this.repairedLifts) if (d <= depth) best = Math.min(best, depth - d);
    return best;
  }
  canLiftTo(targetDepth: number): boolean {
    const cur = this.lab.depth;
    if (targetDepth === cur || !this.repairedLifts.includes(cur) || !this.repairedLifts.includes(targetDepth)) return false;
    if (targetDepth < cur) return true;
    for (let d = cur; d < targetDepth; d++) if (!this.lab.canDescend(d)) return false;
    return true;
  }
  rideLift(targetDepth: number): boolean {
    if (!this.canLiftTo(targetDepth)) return false;
    return this.lab.warpTo(targetDepth, targetDepth === 0 ? 4 : 10, 6);
  }
  submit(word: string): boolean {
    const r = this.room;
    if (!word || word !== r.answer || r.opened || Object.keys(this.needs(word)).length || this.lab.travel) return false;
    const p = this.services[0];
    if (Math.hypot(p.x + 0.5 - this.lab.walk.x, p.y + 0.5 - this.lab.walk.y) > 1.65) return false;
    for (const c of word) this.letters[c]--;
    this.correct[word] = (this.correct[word] ?? 0) + 1; r.opened = true;
    this.adventure.record(word,true,p.x,p.y,this.lab.depth,false);
    this.lab.openPassage(p.x, p.y); return true;
  }
  snapshot(): string {
    return JSON.stringify({ version: 5, depth: this.lab.depth, maxDepth: this.lab.maxDepth, resources: this.lab.resources, x: this.lab.walk.x, y: this.lab.walk.y,
      layers: Array.from(this.lab.layers.values()), letters: this.letters, seen: this.seen, correct: this.correct, rooms: this.rooms, tracked: this.tracked, coins: this.coins, drops: this.drops, legacyDepth:this.legacyDepth, repairedLifts:this.repairedLifts, liftCleared:this.liftCleared, adventure:this.adventure.snapshot() });
  }
  restore(raw: string): void {
    const s = JSON.parse(raw), integer = (v: unknown, max = 1000000): boolean => Number.isInteger(v) && Number(v) >= 0 && Number(v) <= max;
    if (!s || ![1,2,3,4,5].includes(s.version) || !integer(s.depth, 10000) || !integer(s.maxDepth, 10000) || s.maxDepth < s.depth || !integer(s.resources) || !integer(s.coins) || !integer(s.drops) || !Number.isFinite(s.x) || !Number.isFinite(s.y)) throw Error('实验存档头部无效');
    const record = (v: unknown) => v !== null && typeof v === 'object' && !Array.isArray(v);
    if (!Array.isArray(s.layers) || !s.layers.length || s.layers.length > 10002 || !record(s.rooms) || !record(s.letters) || !record(s.correct)) throw Error('实验存档结构无效');
    const layers = new Map<number, LabLayer>();
    const kinds = ['floor','path','water','tree','rock','root','ore','wall','soil','chest','stubborn','village','relic','pack_part'];
    for (const l of s.layers) {
      if (!integer(l.depth, 10001) || layers.has(l.depth) || l.theme !== Math.min(l.depth, 2) || !integer(l.revision) || !Array.isArray(l.tiles) || ![13,LAB_MAP_SIZE].includes(l.tiles.length) || !Array.isArray(l.entrances)) throw Error('地层无效');
      for (const row of l.tiles) {
        if (!Array.isArray(row) || row.length !== l.tiles.length) throw Error('网格无效');
        for (const t of row) if (!t || !kinds.includes(t.kind) || typeof t.hole !== 'boolean' || !Number.isFinite(t.damage) || t.damage < 0 || t.damage > 1 || (t.hole && !['floor','path'].includes(t.kind))) throw Error('地块无效');
      }
      for (const p of l.entrances) if (!p || !integer(p.x, l.tiles.length-1) || !integer(p.y, l.tiles.length-1)) throw Error('入口无效');
      layers.set(l.depth, l);
    }
    if (!layers.has(s.depth)) throw Error('当前层缺失');
    for (const c of LETTERS) if (!integer(s.letters[c])) throw Error('字母库存无效');
    if (!Array.isArray(s.seen) || s.seen.some((w: unknown) => typeof w !== 'string' || !/^[A-Z]{1,16}$/.test(w))) throw Error('已见词无效');
    if (typeof s.tracked !== 'string' || (s.tracked && !/^[A-Z]{1,16}$/.test(s.tracked))) throw Error('追踪词无效');
    for (const [w,n] of Object.entries(s.correct)) if (!/^[A-Z]{1,16}$/.test(w) || !integer(n)) throw Error('拼写记录无效');
    const answers = new Set<string>();
    for (const [d,r] of Object.entries(s.rooms) as [string,WordLayer][]) {
      if (!/^\d+$/.test(d) || !layers.has(Number(d)) || !r || typeof r.answer !== 'string' || (r.answer && (!PASSAGE_WORDS.some(w => w.word === r.answer) || answers.has(r.answer)))) throw Error('通道词无效');
      if (r.answer) answers.add(r.answer);
      if (['discovered','learned','hint','opened'].some(k => typeof (r as unknown as Record<string,unknown>)[k] !== 'boolean') || (r.letterHint !== undefined && typeof r.letterHint !== 'boolean') || !Array.isArray(r.chests) || new Set(r.chests).size !== r.chests.length || r.chests.some(n => !integer(n,2)) || !Array.isArray(r.attempts) || r.attempts.length !== 3 || r.attempts.some(n => !integer(n,3))) throw Error('通道状态无效');
      r.letterHint = Boolean(r.letterHint);
      for (let i = 0; i < 3; i++) if (r.attempts[i] === 3 && !r.chests.includes(i)) throw Error('宝箱状态冲突');
      if (r.opened && !layers.get(Number(d))!.tiles[Number(d)%2 ? 4 : 5][6].hole) throw Error('通道状态冲突');
    }
    if (!s.rooms[String(s.depth)]) throw Error('当前层服务缺失');
    // A draft is transient; never resurrect provisional spelling cracks without its input.
    for (const [d,r] of Object.entries(s.rooms) as [string,WordLayer][]) if (!r.opened) layers.get(Number(d))!.tiles[Number(d)%2?4:5][6].damage=0;
    // Validate position against candidate tiles before replacing live state.
    const row = layers.get(s.depth)!.tiles, radius = 0.22;
    if (s.x - radius < 0 || s.y - radius < 0 || s.x + radius >= row.length || s.y + radius >= row.length) throw Error('位置越界');
    for (let y = Math.floor(s.y-radius); y <= Math.floor(s.y+radius); y++) for (let x = Math.floor(s.x-radius); x <= Math.floor(s.x+radius); x++) if (!['floor','path','relic','pack_part'].includes(row[y][x].kind)) throw Error('位置嵌墙');
    const candidate=new LabAdventure(new LayeredLab());
    if(s.version>=2){if(!integer(s.legacyDepth,10000)||s.legacyDepth>s.maxDepth)throw Error('历史通行资格无效');candidate.restore(s.adventure);if((candidate.game.inventory.coin??0)!==s.coins)throw Error('金币记录冲突');}
    for(const layer of layers.values())if(layer.tiles.length<LAB_MAP_SIZE){
      const expanded=makeLabLayer(layer.depth);
      for(let y=0;y<layer.tiles.length;y++)for(let x=0;x<layer.tiles.length;x++)expanded.tiles[y][x]=layer.tiles[y][x];
      layer.tiles=expanded.tiles;layer.revision++;
      if(layer.depth>0&&!layer.tiles.some(row=>row.some(t=>t.kind==='chest')))layer.tiles[20][20].kind='chest';
    }
    if(s.version<3)for(const layer of layers.values())addLabExcavations(layer,layer.depth===s.depth?{x:s.x,y:s.y}:undefined);
    if(s.version<4){
      const skipPart=candidate.expanded||candidate.relics.some(r=>r.kind==='pack_part');
      for(const layer of layers.values())addLabChambers(layer,layer.depth===s.depth?{x:s.x,y:s.y}:undefined,skipPart);
    }
    let repairedLifts: number[] = [0];
    let liftCleared: Record<string, number> = {};
    if (s.version >= 5) {
      if (!Array.isArray(s.repairedLifts) || !s.repairedLifts.includes(0) || new Set(s.repairedLifts).size !== s.repairedLifts.length || s.repairedLifts.some((d: unknown) => !integer(d, 10000))) throw Error('升降站列表无效');
      if (!record(s.liftCleared)) throw Error('升降站修复进度无效');
      for (const [k, v] of Object.entries(s.liftCleared)) if (!/^\d+$/.test(k) || !integer(v, LAB_LIFT_RULES.clearSteps)) throw Error('升降站清理进度无效');
      repairedLifts = [...(s.repairedLifts as number[])].sort((a, b) => a - b);
      liftCleared = { ...(s.liftCleared as Record<string, number>) };
    }
    if(s.version===1&&s.resources>0&&!Object.entries(candidate.game.inventory).some(([k,v])=>k!=='coin'&&v>0))candidate.game.inventory.stone=s.resources;
    this.adventure.game=candidate.game;this.adventure.book=candidate.book;this.adventure.chestRecords=candidate.chestRecords;
    this.adventure.capacity=candidate.capacity;this.adventure.expanded=candidate.expanded;this.adventure.lampLevel=candidate.lampLevel;this.adventure.pickLevel=candidate.pickLevel;
    this.adventure.relics=candidate.relics;this.adventure.relicDex=candidate.relicDex;
    this.adventure.quiz=null;this.adventure.drops=[];this.adventure.pendingLoot=candidate.pendingLoot;
    this.legacyDepth=s.version===1?s.maxDepth:s.legacyDepth;
    this.repairedLifts=repairedLifts;this.liftCleared=liftCleared;
    this.lab.layers = layers; this.lab.depth = s.depth; this.lab.maxDepth = s.maxDepth; this.lab.resources = s.resources; this.lab.digSpeed = this.adventure.pickSpeed();
    this.lab.walk.x = s.x; this.lab.walk.y = s.y; this.lab.walk.stop(); this.lab.target = null; this.lab.travel = null; this.lab.effects = [];
    this.letters = Object.fromEntries(Array.from(LETTERS, c => [c,s.letters[c]])); this.seen = s.seen; this.correct = s.correct;
    this.rooms = s.rooms; this.tracked = s.tracked; this.coins = s.coins; this.drops = s.drops;
  }
}
