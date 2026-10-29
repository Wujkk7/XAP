import type { LayeredLab, LabLayer } from './LayeredLab.ts';
import { hashCoords } from './rng.ts';
import { ChestSession } from './quiz.ts';
import { WORDS_TIER1 } from './vocab.ts';
import { PASSAGE_WORDS } from '../data/external-files/PassageWords.ts';
import { LETTERS, LETTER_WEIGHTS, LAB_WORD_RULES as RULE, LAB_SERVICES } from '../data/constants/WordPassageRules.ts';

export interface WordLayer { answer: string; discovered: boolean; learned: boolean; hint: boolean; opened: boolean; chests: number[]; attempts: number[] }
export class WordPassages {
  letters: Record<string, number> = Object.fromEntries(Array.from(LETTERS, c => [c, 0]));
  seen: string[] = [];
  correct: Record<string, number> = {};
  rooms: Record<string, WordLayer> = {};
  tracked = '';
  coins = 0;
  private drops = 0;
  lab: LayeredLab;
  constructor(lab: LayeredLab) {
    this.lab = lab;
    lab.canStrike = (x, y) => !this.serviceAt(x, y);
    this.prepare();
  }
  get services(): { id: string; x: number; y: number; title: string }[] {
    return LAB_SERVICES.map(p => ({ ...p, y: p.id === 'seal' && this.lab.depth % 2 ? 4 : p.y }));
  }
  prepare(): WordLayer {
    const depth = this.lab.depth, id = String(depth);
    if (!this.rooms[id]) {
      const available = PASSAGE_WORDS.filter(w => !this.seen.includes(w.word) && !Object.values(this.rooms).some(r => r.answer === w.word));
      const themed = available.filter(w => w.theme === this.lab.layer().theme), pool = themed.length ? themed : available;
      const answer = pool.length ? pool[hashCoords(314159, 6, 5, depth, 601) % pool.length].word : '';
      this.rooms[id] = { answer, discovered: false, learned: false, hint: false, opened: false, chests: [], attempts: [0, 0, 0] };
      const layer = this.lab.layer();
      for (const p of this.services) if (!layer.tiles[p.y][p.x].hole && !layer.entrances.some(e => e.x === p.x && e.y === p.y)) layer.tiles[p.y][p.x] = { kind: 'path', hole: false, damage: 0 };
      layer.revision++;
    }
    return this.rooms[id];
  }
  get room(): WordLayer { return this.prepare(); }
  serviceAt(x: number, y: number): typeof this.services[number] | undefined {
    const p = this.services.find(s => s.x === x && s.y === y);
    if (!p) return;
    const room = this.rooms[String(this.lab.depth)];
    if (!room || this.lab.layer().entrances.some(e => e.x === x && e.y === y) || this.lab.tile(x,y)?.hole || (p.id === 'seal' && (!room.answer || room.opened)) || (p.id.startsWith('chest') && room.chests.includes(Number(p.id.slice(-1))))) return;
    return p;
  }
  nearby(): typeof this.services[number] | undefined {
    const target = this.lab.selected(), selected = this.serviceAt(target.x, target.y);
    if (selected) return selected;
    return this.services.find(p => this.serviceAt(p.x, p.y) && Math.hypot(p.x + 0.5 - this.lab.walk.x, p.y + 0.5 - this.lab.walk.y) <= 1.65);
  }
  discover(): void { const r = this.room; r.discovered = true; this.markSeen(r.answer); }
  private markSeen(word: string): void { if (word && !this.seen.includes(word)) this.seen.push(word); }
  clue(): string { return PASSAGE_WORDS.find(w => w.word === this.room.answer)?.clue ?? '本主题词库已探索完，普通砸地仍可下潜。'; }
  available(letter: string, draft = ''): number { return (this.letters[letter] ?? 0) - Array.from(draft).filter(c => c === letter).length; }
  needs(word = this.tracked): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const c of word) counts[c] = (counts[c] ?? 0) + 1;
    for (const c of Object.keys(counts)) { counts[c] = Math.max(0, counts[c] - this.letters[c]); if (!counts[c]) delete counts[c]; }
    return counts;
  }
  track(word: string): boolean { if (!/^[A-Z]{1,16}$/.test(word)) return false; this.tracked = word; return true; }
  hint(): boolean { if (this.room.hint) return true; if (this.lab.resources < RULE.hintCost) return false; this.lab.resources -= RULE.hintCost; this.room.hint = true; return true; }
  learn(): string { this.room.learned = true; this.markSeen(this.room.answer); return this.room.answer; }
  cost(letter: string): number { return 'JQXZKV'.includes(letter) ? RULE.rareCost : RULE.commonCost; }
  exchange(letter: string, source?: string): boolean {
    if (!LETTERS.includes(letter) || letter.length !== 1) return false;
    if (source) {
      if (!LETTERS.includes(source) || source.length !== 1 || source === letter) return false;
      const count = this.cost(letter) === RULE.rareCost ? RULE.rareSwap : RULE.commonSwap;
      if (this.letters[source] < count) return false;
      this.letters[source] -= count;
    } else {
      const count = this.cost(letter); if (this.lab.resources < count) return false; this.lab.resources -= count;
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
      for (let i = 0; i < RULE.chestLetters; i++) {
        const h = hashCoords(314159, index, this.drops++, this.lab.depth, 614), needed = Object.keys(this.needs());
        const c = needed.length && (h % 1000) / 1000 < RULE.shortageChance ? needed[h % needed.length] : LETTER_WEIGHTS[h % LETTER_WEIGHTS.length];
        this.letters[c]++; letters += c;
      }
    }
    return { opened: result.opened, correct: result.correct, letters, word: session.question.word };
  }
  submit(word: string): boolean {
    const r = this.room;
    if (!word || word !== r.answer || r.opened || Object.keys(this.needs(word)).length || this.lab.travel) return false;
    const p = this.services[0];
    if (Math.hypot(p.x + 0.5 - this.lab.walk.x, p.y + 0.5 - this.lab.walk.y) > 1.65) return false;
    for (const c of word) this.letters[c]--;
    this.correct[word] = (this.correct[word] ?? 0) + 1; r.opened = true;
    this.lab.openPassage(p.x, p.y); return true;
  }
  snapshot(): string {
    return JSON.stringify({ version: 1, depth: this.lab.depth, maxDepth: this.lab.maxDepth, resources: this.lab.resources, x: this.lab.walk.x, y: this.lab.walk.y,
      layers: Array.from(this.lab.layers.values()), letters: this.letters, seen: this.seen, correct: this.correct, rooms: this.rooms, tracked: this.tracked, coins: this.coins, drops: this.drops });
  }
  restore(raw: string): void {
    const s = JSON.parse(raw), integer = (v: unknown, max = 1000000): boolean => Number.isInteger(v) && Number(v) >= 0 && Number(v) <= max;
    if (!s || s.version !== 1 || !integer(s.depth, 10000) || !integer(s.maxDepth, 10000) || s.maxDepth < s.depth || !integer(s.resources) || !integer(s.coins) || !integer(s.drops) || !Number.isFinite(s.x) || !Number.isFinite(s.y)) throw Error('实验存档头部无效');
    const record = (v: unknown) => v !== null && typeof v === 'object' && !Array.isArray(v);
    if (!Array.isArray(s.layers) || !s.layers.length || s.layers.length > 10002 || !record(s.rooms) || !record(s.letters) || !record(s.correct)) throw Error('实验存档结构无效');
    const layers = new Map<number, LabLayer>();
    const kinds = ['floor','path','water','tree','rock','root','ore','wall'];
    for (const l of s.layers) {
      if (!integer(l.depth, 10001) || layers.has(l.depth) || l.theme !== Math.min(l.depth, 2) || !integer(l.revision) || !Array.isArray(l.tiles) || l.tiles.length !== 13 || !Array.isArray(l.entrances)) throw Error('地层无效');
      for (const row of l.tiles) {
        if (!Array.isArray(row) || row.length !== 13) throw Error('网格无效');
        for (const t of row) if (!t || !kinds.includes(t.kind) || typeof t.hole !== 'boolean' || !Number.isFinite(t.damage) || t.damage < 0 || t.damage > 1 || (t.hole && !['floor','path'].includes(t.kind))) throw Error('地块无效');
      }
      for (const p of l.entrances) if (!p || !integer(p.x, 12) || !integer(p.y, 12)) throw Error('入口无效');
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
      if (['discovered','learned','hint','opened'].some(k => typeof (r as unknown as Record<string,unknown>)[k] !== 'boolean') || !Array.isArray(r.chests) || new Set(r.chests).size !== r.chests.length || r.chests.some(n => !integer(n,2)) || !Array.isArray(r.attempts) || r.attempts.length !== 3 || r.attempts.some(n => !integer(n,3))) throw Error('通道状态无效');
      for (let i = 0; i < 3; i++) if (r.attempts[i] === 3 && !r.chests.includes(i)) throw Error('宝箱状态冲突');
      if (r.opened && !layers.get(Number(d))!.tiles[Number(d)%2 ? 4 : 5][6].hole) throw Error('通道状态冲突');
    }
    if (!s.rooms[String(s.depth)]) throw Error('当前层服务缺失');
    // A draft is transient; never resurrect provisional spelling cracks without its input.
    for (const [d,r] of Object.entries(s.rooms) as [string,WordLayer][]) if (!r.opened) layers.get(Number(d))!.tiles[Number(d)%2?4:5][6].damage=0;
    // Validate position against candidate tiles before replacing live state.
    const row = layers.get(s.depth)!.tiles, radius = 0.22;
    if (s.x - radius < 0 || s.y - radius < 0 || s.x + radius >= 13 || s.y + radius >= 13) throw Error('位置越界');
    for (let y = Math.floor(s.y-radius); y <= Math.floor(s.y+radius); y++) for (let x = Math.floor(s.x-radius); x <= Math.floor(s.x+radius); x++) if (!['floor','path'].includes(row[y][x].kind)) throw Error('位置嵌墙');
    this.lab.layers = layers; this.lab.depth = s.depth; this.lab.maxDepth = s.maxDepth; this.lab.resources = s.resources;
    this.lab.walk.x = s.x; this.lab.walk.y = s.y; this.lab.walk.stop(); this.lab.target = null; this.lab.travel = null; this.lab.effects = [];
    this.letters = Object.fromEntries(Array.from(LETTERS, c => [c,s.letters[c]])); this.seen = s.seen; this.correct = s.correct;
    this.rooms = s.rooms; this.tracked = s.tracked; this.coins = s.coins; this.drops = s.drops;
  }
}
