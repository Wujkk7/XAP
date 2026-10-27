import {
  _decorator, Component, Node, Sprite, SpriteFrame, UITransform, UIOpacity, Graphics,
  Label, Color, Layers, Mask, Texture2D, resources,
} from "cc";
import type { Expedition } from "../core/Expedition";
import { hashCoords } from "../core/rng";
import { stratumAt } from "../core/strata";
import type { GameTuning } from "../data/exposed-variables/GameTuning";
import { VILLAGE } from "../data/external-files/Village";
import { ART_NAMES, ORE_ART, STRATUM_TINT, DEBRIS_COLORS } from "../data/resource-config/ArtCatalog";
import { UI_COLORS } from "../data/resource-config/TileStyles";

const { ccclass } = _decorator;
interface SpriteSlot { sprite: Sprite; transform: UITransform; opacity: UIOpacity; label: Label | null }
interface Entity { art: string; x: number; y: number; width: number; alpha?: number; flip?: boolean; angle?: number; label?: string }
interface Particle { x: number; y: number; z: number; vx: number; vy: number; age: number; life: number; size: number; color: string }

@ccclass("WorldView")
export class WorldView extends Component {
  private art = new Map<string, SpriteFrame>();
  private colors = new Map<string, Color>();
  private ground: SpriteSlot[] = [];
  private actors: SpriteSlot[] = [];
  private groundLayer!: Node;
  private actorLayer!: Node;
  private details!: Graphics;
  private overlay!: Graphics;
  private particles: Particle[] = [];
  private stride = 0;
  private dustDistance = 0;
  private oldX = NaN;
  private oldY = NaN;
  private oldDepth = -1;
  private elapsed = 0;

  onLoad(): void {
    this.node.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
    this.groundLayer = this.layer("地形精灵");
    this.details = this.layer("地面细节").addComponent(Graphics);
    this.actorLayer = this.layer("按深度排序的实体");
    this.overlay = this.layer("朝向与挖掘反馈").addComponent(Graphics);
  }

  async loadArt(): Promise<void> {
    const frames = await new Promise<SpriteFrame[]>((resolve, reject) => {
      resources.loadDir("art", SpriteFrame, (error, assets) => error ? reject(error) : resolve(assets));
    });
    for (const frame of frames) {
      frame.texture.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
      this.art.set(frame.name, frame);
    }
    const missing = ART_NAMES.filter(name => !this.art.has(name));
    if (missing.length) throw new Error("美术资源缺失：" + missing.join("、"));
  }

  private layer(name: string): Node {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    this.node.addChild(node);
    return node;
  }

  private color(hex: string): Color {
    if (!this.colors.has(hex)) this.colors.set(hex, new Color().fromHEX(hex));
    return this.colors.get(hex)!;
  }

  private put(pool: SpriteSlot[], index: number, parent: Node, art: string, x: number, y: number,
    width: number, height?: number, tint = "ffffff", alpha = 1, flip = false, angle = 0, label = ""): void {
    let slot = pool[index];
    if (!slot) {
      const node = new Node(art);
      node.layer = Layers.Enum.UI_2D;
      parent.addChild(node);
      const transform = node.addComponent(UITransform);
      transform.setAnchorPoint(0.5, 0);
      const sprite = node.addComponent(Sprite);
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      sprite.trim = false;
      const opacity = node.addComponent(UIOpacity);
      slot = { sprite, transform, opacity, label: null };
      pool.push(slot);
    }
    if (label && !slot.label) {
      const labelNode = new Node("名称");
      labelNode.layer = Layers.Enum.UI_2D;
      slot.sprite.node.addChild(labelNode);
      labelNode.addComponent(UITransform).setContentSize(280, 40);
      const text = labelNode.addComponent(Label);
      text.fontSize = 23; text.lineHeight = 30;
      text.color = this.color(UI_COLORS.ink);
      text.enableOutline = true; text.outlineWidth = 3; text.outlineColor = new Color(40, 32, 22);
      slot.label = text;
    }
    const frame = this.art.get(art)!;
    const node = slot.sprite.node;
    node.active = true;
    if (slot.sprite.spriteFrame !== frame) slot.sprite.spriteFrame = frame;
    const h = height ?? width * frame.originalSize.height / frame.originalSize.width;
    slot.transform.setContentSize(width, h);
    node.setPosition(x, y);
    node.setScale(flip ? -1 : 1, 1, 1);
    node.setRotationFromEuler(0, 0, angle);
    slot.sprite.color = this.color(tint);
    slot.opacity.opacity = Math.round(alpha * 255);
    if (slot.label) {
      slot.label.node.active = !!label;
      if (label) { slot.label.string = label; slot.label.node.setPosition(0, h + 16); }
    }
  }

  private spawn(x: number, y: number, z: number, type: string, count: number): void {
    const palette = DEBRIS_COLORS[type] ?? DEBRIS_COLORS.dirt;
    for (let i = 0; i < count; i++) {
      this.particles.push({ x: x + 0.5, y: y + 0.5, z, vx: (Math.random() - 0.5) * 2.8,
        vy: -0.8 - Math.random() * 2, age: 0, life: 0.25 + Math.random() * 0.4,
        size: 3 + Math.random() * 4, color: palette[i % palette.length] });
    }
    if (this.particles.length > 160) this.particles.splice(0, this.particles.length - 160);
  }

  render(expedition: Expedition, tuning: GameTuning, cameraX: number, cameraY: number, dt: number, digging: boolean): void {
    if (!this.art.size) return;
    const p = expedition.slot.position;
    this.elapsed += dt;
    const size = tuning.tileSize, row = tuning.rowHeight;
    const width = this.node.getComponent(UITransform)!.width;
    const height = this.node.getComponent(UITransform)!.height;
    const sx = (x: number) => (x - cameraX) * size;
    const sy = (y: number) => -(y - cameraY) * row;
    const moved = this.oldDepth === p.z ? Math.hypot(p.x - this.oldX, p.y - this.oldY) : 0;
    this.oldX = p.x; this.oldY = p.y;
    if (this.oldDepth !== p.z) this.particles.length = 0;
    this.oldDepth = p.z;
    if (Number.isFinite(moved) && moved < 1) { this.stride += moved / 0.38 * Math.PI; this.dustDistance += moved; }
    if (this.dustDistance >= 0.38) { this.dustDistance = 0; this.spawn(p.x - 0.5, p.y - 0.1, p.z, "dirt", 1); }
    for (const effect of expedition.effects.splice(0)) {
      if (effect.z === p.z) this.spawn(effect.x, effect.y, effect.z, effect.type, effect.kind === "dig" ? 2 : 16);
    }
    const behindAlpha = (x: number, y: number) => {
      const dy = y - p.y, dx = Math.abs(x - p.x);
      return dy > 0.15 && dy < 1.75 && dx < 1.35 ? Math.min(1, 0.32 + (dy - 0.15) * 0.55) : 1;
    };
    const detail = this.details;
    const overlay = this.overlay;
    detail.clear(); overlay.clear();
    let groundCount = 0;
    const entities: Entity[] = [];
    const radiusX = Math.ceil(width / size / 2) + 1;
    const radiusY = Math.ceil(height / row / 2) + 3;
    const tint = p.z === 0 ? "ffffff" : STRATUM_TINT[stratumAt(p.z).id];
    for (let y = Math.floor(cameraY) - radiusY; y <= Math.floor(cameraY) + radiusY; y++) {
      for (let x = Math.floor(cameraX) - radiusX; x <= Math.floor(cameraX) + radiusX; x++) {
        const tile = expedition.tileAt(x, y);
        let art = p.z > 0 ? (stratumAt(p.z).id === 1 ? "tile_dirt" : "tile_rock") : "tile_grass";
        if (p.z === 0) {
          const farm = VILLAGE.farm;
          if (x >= farm.minX && x <= farm.maxX && y >= farm.minY && y <= farm.maxY) art = "tile_plowed";
          else if (VILLAGE.paths.some(path => x >= path.minX && x <= path.maxX && y >= path.minY && y <= path.maxY)) art = "tile_sand";
          else if (tile.type === "empty") art = "tile_dirt";
        }
        const floorTint = p.z > 0 && !tile.solid ? "746453" : tint;
        this.put(this.ground, groundCount++, this.groundLayer, art, sx(x + 0.5), sy(y + 1), size + 1, row + 1, floorTint);
        if (p.z === 0 && art === "tile_grass") {
          const variant = hashCoords(expedition.slot.game.seed, x, y, 0, 21) % 100;
          const decal = tile.type === "flower" || variant >= 82 ? "tile_grass_flower" : variant >= 55 ? "tile_grass_tall" : "";
          if (decal) this.put(this.ground, groundCount++, this.groundLayer, decal, sx(x + 0.72), sy(y + 1), size * 0.4, row * 0.4);
        }
        if (p.z > 0 && tile.solid && !ORE_ART[tile.type] && tile.type !== "chest" && !expedition.tileAt(x, y + 1).solid) {
          detail.fillColor = new Color(45, 31, 22, 90);
          detail.rect(sx(x), sy(y + 1), size, 10); detail.fill();
        }
        if (tile.type === "pit" || tile.type === "shaft") {
          if (tile.type === "pit") {
            detail.fillColor = this.color("1f160e");
            detail.ellipse(sx(x + 0.5), sy(y + 0.5), size * 0.35, row * 0.3); detail.fill();
          }
          detail.strokeColor = this.color("cba973"); detail.lineWidth = 4;
          const lx = sx(x + 0.5), top = sy(y + 0.15), bottom = sy(y + 0.85);
          detail.moveTo(lx - 8, top); detail.lineTo(lx - 8, bottom);
          detail.moveTo(lx + 8, top); detail.lineTo(lx + 8, bottom);
          for (let i = 1; i < 4; i++) { const yy = top + (bottom - top) * i / 4; detail.moveTo(lx - 8, yy); detail.lineTo(lx + 8, yy); }
          detail.stroke();
        }
        if (tile.type === "tree") {
          const variants = ["tree_oak", "tree_pine", "tree_apple"];
          entities.push({ art: variants[hashCoords(expedition.slot.game.seed, x, y, 0, 22) % 3],
            x: x + 0.5, y: y + 0.85, width: size * 1.8, alpha: behindAlpha(x + 0.5, y + 0.5) });
        } else if (ORE_ART[tile.type]) {
          entities.push({ art: ORE_ART[tile.type], x: x + 0.5, y: y + 0.85, width: size * 1.12,
            alpha: behindAlpha(x + 0.5, y + 0.5), label: tile.type === "stubborn" ? "!" : "" });
        } else if (tile.type === "chest") {
          const xx = sx(x + 0.15), yy = sy(y + 0.77);
          detail.fillColor = this.color("85582f"); detail.rect(xx, yy, size * 0.7, row * 0.5); detail.fill();
          detail.fillColor = this.color("d7b263"); detail.rect(xx, yy + row * 0.2, size * 0.7, 6);
          detail.rect(xx + size * 0.3, yy, size * 0.1, row * 0.5); detail.fill();
        }
      }
    }
    for (let i = groundCount; i < this.ground.length; i++) this.ground[i].sprite.node.active = false;
    if (p.z === 0) {
      for (const house of VILLAGE.houses) {
        const x = house.x + house.width / 2, y = house.y + house.depth;
        if (Math.abs(sx(x)) > width / 2 + size * 3 || Math.abs(sy(y)) > height / 2 + size * 4) continue;
        const behind = p.y < y + 0.1 && p.y > house.y - 1 && p.x > house.x - 0.4 && p.x < house.x + house.width + 0.4;
        const fade = Math.min(y + 0.1 - p.y, p.x - house.x + 0.4, house.x + house.width + 0.4 - p.x);
        entities.push({ art: house.sprite, x, y: y + 0.2, width: size * 2.4, alpha: behind ? Math.max(0.35, 1 - fade * 0.8) : 1 });
      }
      const npc = VILLAGE.npc;
      if (Math.abs(sx(npc.x + 0.5)) < width / 2 + size && Math.abs(sy(npc.y + 0.5)) < height / 2 + size * 2) {
        entities.push({ art: npc.sprite, x: npc.x + 0.5, y: npc.y + 0.85, width: size * 0.78,
          label: expedition.canTalkToNpc() ? npc.label + " · 可交谈" : npc.label });
      }
    }
    const speed = Math.hypot(expedition.velocity.x, expedition.velocity.y);
    const playerArt = expedition.facing.y < 0 ? "miner_back" : expedition.facing.x ? "miner_side" : "miner_front";
    entities.push({ art: playerArt, x: p.x, y: p.y + 0.18 - (speed > 0.4 ? Math.sin(this.stride) * 0.035 : 0),
      width: size * 0.62, flip: playerArt === "miner_side" && expedition.facing.x < 0,
      angle: speed > 0.4 ? Math.sin(this.stride) * 3 : 0 });
    entities.sort((a, b) => a.y - b.y);
    detail.fillColor = new Color(22, 18, 12, 65);
    detail.ellipse(sx(p.x), sy(p.y + 0.18), size * 0.25, row * 0.1); detail.fill();
    entities.forEach((entity, i) => this.put(this.actors, i, this.actorLayer, entity.art, sx(entity.x), sy(entity.y),
      entity.width, undefined, "ffffff", entity.alpha ?? 1, entity.flip, entity.angle, entity.label));
    for (let i = entities.length; i < this.actors.length; i++) this.actors[i].sprite.node.active = false;

    for (const drop of expedition.wordDrops) {
      if (drop.z !== p.z) continue;
      const x = sx(drop.x + 0.5), y = sy(drop.y + 0.5) + Math.sin(this.elapsed * 4) * 3;
      overlay.fillColor = this.color("f7e4ab"); overlay.rect(x - 10, y - 3, 20, 26); overlay.fill();
      overlay.strokeColor = this.color("8e6539"); overlay.lineWidth = 2;
      for (let i = 0; i < 3; i++) { overlay.moveTo(x - 5, y + 3 + i * 6); overlay.lineTo(x + 5, y + 3 + i * 6); }
      overlay.stroke();
    }
    const target = expedition.quiz ? null : expedition.target;
    if (target) {
      overlay.strokeColor = this.color(UI_COLORS.accent); overlay.lineWidth = 3;
      overlay.rect(sx(target.x) + 2, sy(target.y + 1) + 2, size - 4, row - 4); overlay.stroke();
      if (expedition.digProgress > 0) {
        const x = sx(target.x), y = sy(target.y);
        overlay.strokeColor = this.color("453020"); overlay.lineWidth = 2;
        overlay.moveTo(x + size * 0.2, y - row * 0.2);
        overlay.lineTo(x + size * 0.5, y - row * 0.55);
        overlay.lineTo(x + size * (0.5 + expedition.digProgress * 0.3), y - row * 0.7);
        overlay.moveTo(x + size * 0.8, y - row * 0.2);
        overlay.lineTo(x + size * 0.5, y - row * 0.55); overlay.stroke();
        overlay.fillColor = this.color(UI_COLORS.accent);
        overlay.rect(sx(target.x) + 4, sy(target.y) + 4, (size - 8) * Math.min(1, expedition.digProgress), 5); overlay.fill();
      }
    }
    const ax = sx(p.x) + expedition.facing.x * size * 0.38, ay = sy(p.y + 0.28) - expedition.facing.y * row * 0.3;
    const angle = Math.atan2(-expedition.facing.y, expedition.facing.x);
    overlay.fillColor = this.color(UI_COLORS.accent);
    overlay.moveTo(ax + Math.cos(angle) * 8, ay + Math.sin(angle) * 8);
    overlay.lineTo(ax + Math.cos(angle + 2.5) * 7, ay + Math.sin(angle + 2.5) * 7);
    overlay.lineTo(ax + Math.cos(angle - 2.5) * 7, ay + Math.sin(angle - 2.5) * 7);
    overlay.close(); overlay.fill();
    if (digging && target && !expedition.quiz) {
      overlay.strokeColor = this.color("d5d2c7"); overlay.lineWidth = 4;
      overlay.moveTo(sx(p.x), sy(p.y) + 12);
      overlay.lineTo(ax, ay + 20 + Math.sin(this.elapsed * 25) * 9); overlay.stroke();
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      particle.age += dt;
      if (particle.age >= particle.life || particle.z !== p.z) { this.particles.splice(i, 1); continue; }
      particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.vy += dt * 7;
      overlay.fillColor = this.color(particle.color);
      const shrink = 1 - particle.age / particle.life;
      overlay.rect(sx(particle.x), sy(particle.y), particle.size * shrink, particle.size * shrink); overlay.fill();
    }
  }
}
