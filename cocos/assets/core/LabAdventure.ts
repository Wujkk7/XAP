import type { LayeredLab, LabTileKind } from './LayeredLab.ts';
import { newSave, deserializeSave, placeStubborn, addItem, key } from '../data/player-data/save.ts';
import { MasteryBook, pickChestWord } from './mastery.ts';
import { hashCoords, rngFrom, SALT } from './rng.ts';
import { WORDS_TIER1, WORDS_ALL } from './vocab.ts';
import { ChestSession } from './quiz.ts';
import { stratumAt } from './strata.ts';
import { WORD_DROP_CHANCE, WORD_PICKUP_RADIUS, WORD_PICKUP_COINS, MAX_WORD_DROPS } from '../data/constants/GameRules.ts';
import { LAB_WORLD_SEED } from '../data/constants/IsometricRules.ts';
import { LAB_PACK_RULES, LAB_RELIC_CATALOG, LAB_RELIC_TIERS, LAB_UPGRADE_RULES } from '../data/constants/WordPassageRules.ts';
import type { LabRelicTier } from '../data/constants/WordPassageRules.ts';

export interface LabRelic {
  id: string;
  kind: 'relic' | 'pack_part';
  tier: LabRelicTier;
  category: string;
  name: string;
  en: string;
  identified: boolean;
}

export type PendingLoot =
  | { kind: 'material'; item: string; count: number }
  | { kind: 'relic'; relic: LabRelic };

export type PackSlot =
  | { kind: 'material'; item: string; count: number }
  | { kind: 'relic'; index: number; relic: LabRelic };

/** Engine-free adapter reusing the verified inventory, quiz and mastery rules, plus finite pack & relics. */
export class LabAdventure {
  game = newSave('xap-isometric-adventure');
  book = new MasteryBook();
  chestRecords: Record<string, { word: string; attempts: number }> = {};
  quiz: { x: number; y: number; depth: number; stubborn: boolean; session: ChestSession } | null = null;
  drops: { x: number; y: number; depth: number; word: string }[] = [];
  notices: string[] = [];
  capacity: number = LAB_PACK_RULES.initialCapacity;
  expanded = false;
  lampLevel = 0;
  pickLevel = 0;
  relics: LabRelic[] = [];
  relicDex: string[] = [];
  pendingLoot: PendingLoot | null = null;
  private lastDepth = -1;
  lab: LayeredLab;

  constructor(lab: LayeredLab) {
    this.lab = lab;
    lab.onMined = (x, y, kind) => this.mined(x, y, kind);
  }

  private reveal(word: string): void {
    if (!this.game.seenWords.includes(word)) this.game.seenWords.push(word);
  }

  slots(): PackSlot[] {
    const out: PackSlot[] = [];
    for (const [item, count] of Object.entries(this.game.inventory)) {
      if (item !== 'coin' && count > 0) out.push({ kind: 'material', item, count });
    }
    this.relics.forEach((relic, index) => out.push({ kind: 'relic', index, relic }));
    return out;
  }

  usedSlots(): number {
    return this.slots().length;
  }

  consumeMaterials(count: number): void {
    for (const [item, n] of Object.entries(this.game.inventory)) {
      if (item === 'coin') continue;
      const used = Math.min(count, n);
      addItem(this.game, item, -used);
      count -= used;
      if (!count) break;
    }
  }

  mined(x: number, y: number, kind: LabTileKind): void {
    const depth = this.lab.depth;
    const item = kind === 'soil' ? 'dirt' : kind === 'tree' || kind === 'root' ? 'wood' : kind === 'ore' ? stratumAt(Math.max(1, depth)).oreTile : 'stone';
    if ((this.game.inventory[item] ?? 0) > 0 || this.usedSlots() < this.capacity) {
      addItem(this.game, item, 1);
      this.lab.message = '+1 ' + item;
    } else {
      // LayeredLab.strike() incremented lab.resources eagerly; roll back until the player accepts this item.
      this.lab.resources = Math.max(0, this.lab.resources - 1);
      if (!this.pendingLoot) {
        this.pendingLoot = { kind: 'material', item, count: 1 };
        this.lab.walk.stop();
        this.lab.message = '背包已满 · 请选择替换或放弃新收获';
      }
    }
    if (hashCoords(LAB_WORLD_SEED, x, y, depth, SALT.wordDrop) / 4294967296 < WORD_DROP_CHANCE) {
      const fresh = WORDS_TIER1.filter(w => this.book.get(w.word).status !== 'mastered');
      const pool = fresh.length ? fresh : WORDS_TIER1;
      const entry = pool[hashCoords(LAB_WORLD_SEED, x, y, depth, SALT.dropWord) % pool.length];
      this.drops.push({ x, y, depth, word: entry.word });
      if (this.drops.length > MAX_WORD_DROPS) this.drops.shift();
    }
  }

  private rollRelic(x: number, y: number, depth: number, tileKind: 'relic' | 'pack_part'): LabRelic {
    if (tileKind === 'pack_part') {
      return { id: 'pack_part', kind: 'pack_part', tier: 'rare', category: '组件', name: '损坏的背包组件', en: 'Broken Pack Frame', identified: true };
    }
    const h = hashCoords(LAB_WORLD_SEED, x, y, depth, 751);
    const tierRoll = h % 100;
    const tier: LabRelicTier = depth >= 3 && tierRoll < 22 ? 'epic' : tierRoll < (depth >= 2 ? 62 : 42) ? 'rare' : 'common';
    const pool = LAB_RELIC_CATALOG.filter(r => r.tier === tier);
    const pick = pool[Math.floor(h / 100) % pool.length];
    return { id: pick.id, kind: 'relic', tier: pick.tier, category: pick.category, name: pick.name, en: pick.en, identified: false };
  }

  collectChamber(x: number, y: number): boolean {
    const tile = this.lab.tile(x, y);
    if (!tile || (tile.kind !== 'relic' && tile.kind !== 'pack_part') || this.pendingLoot || this.quiz) return false;
    const relic = this.rollRelic(x, y, this.lab.depth, tile.kind);
    tile.kind = 'floor';
    tile.damage = 0;
    this.lab.layer().revision++;
    this.lab.effects.push({ kind: 'chest', x, y, depth: this.lab.depth });
    if (this.usedSlots() < this.capacity) {
      this.relics.push(relic);
      const label = relic.kind === 'pack_part'
        ? '获得损坏的背包组件 · 回地表找梅婆婆修复扩容'
        : '发现未鉴定宝物 · ' + relic.category + '（' + LAB_RELIC_TIERS[relic.tier].label + '）';
      this.notices.push(label);
    } else {
      this.pendingLoot = { kind: 'relic', relic };
      this.lab.walk.stop();
      this.lab.message = '背包已满 · 请选择替换或放弃新收获';
    }
    return true;
  }

  resolvePending(replaceSlotIndex?: number): boolean {
    const pending = this.pendingLoot;
    if (!pending) return false;
    if (replaceSlotIndex === undefined) {
      this.pendingLoot = null;
      this.lab.message = '已放弃新收获，继续探索';
      return true;
    }
    const all = this.slots();
    if (!Number.isInteger(replaceSlotIndex) || replaceSlotIndex < 0 || replaceSlotIndex >= all.length) return false;
    const target = all[replaceSlotIndex];
    if (target.kind === 'material') {
      this.lab.resources = Math.max(0, this.lab.resources - target.count);
      delete this.game.inventory[target.item];
    } else {
      this.relics.splice(target.index, 1);
    }
    if (pending.kind === 'material') {
      addItem(this.game, pending.item, pending.count);
      this.lab.resources += pending.count;
    } else {
      this.relics.push(pending.relic);
    }
    this.pendingLoot = null;
    this.lab.message = '已替换并收下新收获';
    return true;
  }

  appraiseRelic(index: number): { ok: boolean; reason?: string; fee?: number; relic?: LabRelic } {
    const relic = this.relics[index];
    if (!relic || relic.kind !== 'relic' || relic.identified) return { ok: false, reason: '该物品无需鉴定' };
    const fee = LAB_RELIC_TIERS[relic.tier].appraiseFee;
    const coins = this.game.inventory.coin ?? 0;
    if (coins < fee) return { ok: false, reason: '金币不足（需要 ' + fee + ' 金币，可开箱、拾词卡或出售已鉴定宝物）' };
    addItem(this.game, 'coin', -fee);
    relic.identified = true;
    if (!this.relicDex.includes(relic.id)) this.relicDex.push(relic.id);
    return { ok: true, fee, relic };
  }

  sellRelic(index: number): { ok: boolean; coins?: number; relic?: LabRelic } {
    const relic = this.relics[index];
    if (!relic || relic.kind !== 'relic' || !relic.identified) return { ok: false };
    const coins = LAB_RELIC_TIERS[relic.tier].sellValue;
    this.relics.splice(index, 1);
    addItem(this.game, 'coin', coins);
    return { ok: true, coins, relic };
  }

  repairPack(): boolean {
    if (this.expanded) return false;
    const partIndex = this.relics.findIndex(r => r.kind === 'pack_part');
    if (partIndex < 0 || this.lab.resources < LAB_PACK_RULES.expandMaterials) return false;
    this.relics.splice(partIndex, 1);
    this.lab.resources -= LAB_PACK_RULES.expandMaterials;
    this.consumeMaterials(LAB_PACK_RULES.expandMaterials);
    this.expanded = true;
    this.capacity = LAB_PACK_RULES.expandedCapacity;
    this.notices.push('背包修复扩容成功 · 容量 ' + this.capacity + ' 格');
    return true;
  }

  lampBonus(): number {
    return this.lampLevel * LAB_UPGRADE_RULES.lampRadiusStep;
  }

  pickSpeed(): number {
    return 1 + this.pickLevel * LAB_UPGRADE_RULES.pickSpeedStep;
  }

  upgradeLamp(): { ok: boolean; reason?: string; cost?: number } {
    if (this.lampLevel >= LAB_UPGRADE_RULES.lampCosts.length) return { ok: false, reason: '矿灯已升至满级' };
    const cost = LAB_UPGRADE_RULES.lampCosts[this.lampLevel];
    if ((this.game.inventory.coin ?? 0) < cost) return { ok: false, reason: '金币不足（需要 ' + cost + ' 金币）' };
    addItem(this.game, 'coin', -cost);
    this.lampLevel++;
    this.notices.push('矿灯强化 Lv.' + this.lampLevel + ' · 地下视野扩大');
    return { ok: true, cost };
  }

  upgradePick(): { ok: boolean; reason?: string; cost?: number } {
    if (this.pickLevel >= LAB_UPGRADE_RULES.pickCosts.length) return { ok: false, reason: '镐头已打磨至满级' };
    const cost = LAB_UPGRADE_RULES.pickCosts[this.pickLevel];
    if ((this.game.inventory.coin ?? 0) < cost) return { ok: false, reason: '金币不足（需要 ' + cost + ' 金币）' };
    addItem(this.game, 'coin', -cost);
    this.pickLevel++;
    this.lab.digSpeed = this.pickSpeed();
    this.notices.push('镐速打磨 Lv.' + this.pickLevel + ' · 挖掘提速');
    return { ok: true, cost };
  }

  prepare(): void {
    this.lab.digSpeed = this.pickSpeed();
    const d = this.lab.depth, layer = this.lab.layer();
    if (this.lastDepth !== d) {
      this.lastDepth = d;
      if (d > 0 && d % 10 === 0) {
        const word = WORDS_TIER1[(d / 10) % WORDS_TIER1.length];
        this.notices.push(d + 'm · ' + word.word + ' = ' + word.meaning);
      }
    }
    for (const [id] of Object.entries(this.game.stubborn)) {
      const [x, y, z] = id.split(',').map(Number), tile = layer.tiles[y]?.[x];
      if (z === d && tile && !tile.hole && tile.kind !== 'village' && !layer.entrances.some(p => p.x === x && p.y === y) && tile.kind !== 'stubborn') {
        tile.kind = 'stubborn';
        layer.revision++;
      }
    }
    this.game.maxDepth = Math.max(this.game.maxDepth, d);
    const px = Math.floor(this.lab.walk.x), py = Math.floor(this.lab.walk.y);
    const underfoot = this.lab.tile(px, py);
    if (underfoot && (underfoot.kind === 'relic' || underfoot.kind === 'pack_part')) this.collectChamber(px, py);
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const p = this.drops[i];
      if (p.depth !== d || Math.hypot(this.lab.walk.x - p.x - 0.5, this.lab.walk.y - p.y - 0.5) >= WORD_PICKUP_RADIUS) continue;
      this.drops.splice(i, 1);
      this.reveal(p.word);
      addItem(this.game, 'coin', WORD_PICKUP_COINS);
      const w = WORDS_ALL.find(w => w.word === p.word) ?? WORDS_TIER1[0];
      this.notices.push('词卡 · ' + w.word + ' = ' + w.meaning + ' · +' + WORD_PICKUP_COINS + ' 金币');
    }
  }

  nearbyWorldTarget(): { x: number; y: number; kind: 'chest' | 'stubborn'; title: string } | undefined {
    const sel = this.lab.selected();
    const selTile = this.lab.tile(sel.x, sel.y);
    if (selTile && (selTile.kind === 'chest' || selTile.kind === 'stubborn') && Math.hypot(sel.x + 0.5 - this.lab.walk.x, sel.y + 0.5 - this.lab.walk.y) <= 1.65) {
      return { x: sel.x, y: sel.y, kind: selTile.kind, title: selTile.kind === 'stubborn' ? '顽固石' : '探索宝箱' };
    }
    const cx = Math.floor(this.lab.walk.x), cy = Math.floor(this.lab.walk.y);
    let best: { x: number; y: number; kind: 'chest' | 'stubborn'; title: string; dist: number } | undefined;
    for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) {
      const tile = this.lab.tile(x, y);
      if (!tile || (tile.kind !== 'chest' && tile.kind !== 'stubborn')) continue;
      const dist = Math.hypot(x + 0.5 - this.lab.walk.x, y + 0.5 - this.lab.walk.y);
      if (dist <= 1.65 && (!best || dist < best.dist)) {
        best = { x, y, kind: tile.kind, title: tile.kind === 'stubborn' ? '顽固石' : '探索宝箱', dist };
      }
    }
    return best ? { x: best.x, y: best.y, kind: best.kind, title: best.title } : undefined;
  }

  record(word: string, correct: boolean, x: number, y: number, depth: number, hadMistake = !correct): void {
    const outcome = this.book.recordAnswer(word.toLowerCase(), correct, depth, hadMistake);
    this.reveal(word.toLowerCase());
    if (outcome.stubbornDepth) placeStubborn(this.game, x, y, outcome.stubbornDepth, word.toLowerCase());
    this.game.mastery = this.book.serialize();
  }

  open(x: number, y: number): boolean {
    const tile = this.lab.tile(x, y);
    if (this.quiz || this.pendingLoot || !tile || !['chest', 'stubborn'].includes(tile.kind) || this.lab.travel || Math.hypot(x + 0.5 - this.lab.walk.x, y + 0.5 - this.lab.walk.y) > 1.65) return false;
    const d = this.lab.depth, id = key(x, y, d), random = rngFrom(hashCoords(LAB_WORLD_SEED, x, y, d, SALT.quiz));
    let stored = this.chestRecords[id];
    if (!stored) {
      const word = tile.kind === 'stubborn' ? this.game.stubborn[id] : pickChestWord(WORDS_ALL, this.book, d, random)?.word;
      if (!word) return false;
      stored = this.chestRecords[id] = { word, attempts: 0 };
    }
    const entry = WORDS_ALL.find(w => w.word === stored.word);
    if (!entry) return false;
    const session = new ChestSession(entry, hashCoords(LAB_WORLD_SEED, x, y, d, 716));
    for (let i = 0; i < stored.attempts; i++) session.answer((session.question.correctIndex + 1) % 4);
    this.quiz = { x, y, depth: d, stubborn: tile.kind === 'stubborn', session };
    this.reveal(entry.word);
    this.lab.walk.stop();
    return true;
  }

  answer(option: number): { opened: boolean; correct: boolean; word: string; coins: number } {
    const q = this.quiz;
    if (!q) throw Error('没有可回答的宝箱');
    const r = q.session.answer(option), id = key(q.x, q.y, q.depth);
    this.chestRecords[id].attempts = r.attemptsUsed;
    let coins = 0;
    if (r.opened) {
      this.record(q.session.question.word, r.correct, q.x, q.y, q.depth, r.attemptsUsed > 1);
      if (!q.stubborn || r.correct) {
        const tile = this.lab.tile(q.x, q.y)!;
        tile.kind = 'floor';
        tile.damage = 0;
        this.lab.layer().revision++;
        delete this.game.stubborn[id];
        delete this.game.diffs[id];
        delete this.chestRecords[id];
        coins = Math.round((q.stubborn ? 15 : 10 * stratumAt(Math.max(1, q.depth)).id) * r.rewardMultiplier);
        addItem(this.game, 'coin', coins);
        this.lab.effects.push({ kind: 'chest', x: q.x, y: q.y, depth: q.depth });
      } else delete this.chestRecords[id];
      this.quiz = null;
    }
    return { opened: r.opened, correct: r.correct, word: q.session.question.word, coins };
  }

  snapshot(): unknown {
    return {
      game: this.game,
      chests: this.chestRecords,
      capacity: this.capacity,
      expanded: this.expanded,
      lampLevel: this.lampLevel,
      pickLevel: this.pickLevel,
      relics: this.relics,
      relicDex: this.relicDex,
      pendingLoot: this.pendingLoot,
    };
  }

  private validRelic(r: unknown): r is LabRelic {
    if (!r || typeof r !== 'object') return false;
    const x = r as LabRelic;
    return ['relic', 'pack_part'].includes(x.kind) && ['common', 'rare', 'epic'].includes(x.tier) &&
      typeof x.id === 'string' && typeof x.name === 'string' && typeof x.en === 'string' &&
      typeof x.category === 'string' && typeof x.identified === 'boolean';
  }

  restore(data: unknown): void {
    if (!data || typeof data !== 'object') throw Error('探险存档无效');
    const s = data as { game: unknown; chests: unknown; capacity?: unknown; expanded?: unknown; lampLevel?: unknown; pickLevel?: unknown; relics?: unknown; relicDex?: unknown; pendingLoot?: unknown };
    const game = deserializeSave(JSON.stringify(s.game));
    if (!s.chests || typeof s.chests !== 'object' || Array.isArray(s.chests)) throw Error('宝箱记录无效');
    const chests = s.chests as typeof this.chestRecords;
    for (const [id, c] of Object.entries(chests)) {
      if (!/^\d+,\d+,\d+$/.test(id) || !c || !WORDS_ALL.some(w => w.word === c.word) || !Number.isInteger(c.attempts) || c.attempts < 0 || c.attempts > 2) {
        throw Error('宝箱进度无效');
      }
    }
    let capacity: number = LAB_PACK_RULES.initialCapacity;
    let expanded = false;
    let lampLevel = 0;
    let pickLevel = 0;
    let relics: LabRelic[] = [];
    let relicDex: string[] = [];
    let pendingLoot: PendingLoot | null = null;
    if (s.capacity !== undefined) {
      if (!Number.isInteger(s.capacity) || Number(s.capacity) < LAB_PACK_RULES.initialCapacity || Number(s.capacity) > 64) throw Error('背包容量无效');
      capacity = Number(s.capacity);
    }
    if (s.expanded !== undefined) {
      if (typeof s.expanded !== 'boolean') throw Error('扩容状态无效');
      expanded = s.expanded;
    }
    if (s.lampLevel !== undefined) {
      if (!Number.isInteger(s.lampLevel) || Number(s.lampLevel) < 0 || Number(s.lampLevel) > LAB_UPGRADE_RULES.lampCosts.length) throw Error('矿灯等级无效');
      lampLevel = Number(s.lampLevel);
    }
    if (s.pickLevel !== undefined) {
      if (!Number.isInteger(s.pickLevel) || Number(s.pickLevel) < 0 || Number(s.pickLevel) > LAB_UPGRADE_RULES.pickCosts.length) throw Error('镐具等级无效');
      pickLevel = Number(s.pickLevel);
    }
    if (s.relics !== undefined) {
      if (!Array.isArray(s.relics)) throw Error('宝物列表无效');
      for (const r of s.relics) {
        if (!this.validRelic(r)) throw Error('宝物数据无效');
      }
      relics = (s.relics as LabRelic[]).map(r => ({ ...r }));
    }
    if (s.relicDex !== undefined) {
      if (!Array.isArray(s.relicDex) || s.relicDex.some(id => typeof id !== 'string')) throw Error('宝物图鉴无效');
      relicDex = [...s.relicDex];
    }
    if (s.pendingLoot !== undefined && s.pendingLoot !== null) {
      const p = s.pendingLoot as Record<string, unknown>;
      if (!p || typeof p !== 'object') throw Error('待决收获无效');
      if (p.kind === 'material' && typeof p.item === 'string' && p.item.length > 0 && Number.isInteger(p.count) && Number(p.count) > 0) {
        pendingLoot = { kind: 'material', item: p.item, count: Number(p.count) };
      } else if (p.kind === 'relic' && this.validRelic(p.relic)) {
        pendingLoot = { kind: 'relic', relic: { ...p.relic } };
      } else {
        throw Error('待决收获无效');
      }
    }
    this.game = game;
    this.book = MasteryBook.deserialize(game.mastery);
    this.chestRecords = chests;
    this.capacity = capacity;
    this.expanded = expanded;
    this.lampLevel = lampLevel;
    this.pickLevel = pickLevel;
    this.lab.digSpeed = this.pickSpeed();
    this.relics = relics;
    this.relicDex = relicDex;
    this.quiz = null;
    this.drops = [];
    this.pendingLoot = pendingLoot;
  }
}
