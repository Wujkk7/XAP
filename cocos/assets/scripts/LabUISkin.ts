import { Color, Node, Sprite, SpriteFrame, UITransform } from 'cc';

const HUD_ICONS: Record<string, string> = {
  '网格 · 开': 'grid', '镜头 · 跟随': 'camera', '回到入口': 'entry',
  '返回上层': 'ladder', '敲击地面': 'dig', '声音 · 开': 'sound',
  '字母袋': 'letters', '资源背包': 'pack', '词义图鉴': 'book', '探索互动': 'interact',
};

/** HUD nodes exist before the resource bundle finishes loading. */
export class LabUISkin {
  private frames?: ReadonlyMap<string, SpriteFrame>;
  private waiting = new Map<Sprite, string>();

  bind(frames: ReadonlyMap<string, SpriteFrame>): void {
    this.frames = frames;
    for (const [sprite, name] of this.waiting) {
      if (sprite.isValid) this.assign(sprite, name);
    }
    this.waiting.clear();
  }

  private assign(sprite: Sprite, name: string): void {
    const frame = this.frames?.get(name);
    if (!frame) throw new Error('缺少界面精灵 ' + name);
    if (sprite.spriteFrame !== frame) sprite.spriteFrame = frame;
  }

  frame(node: Node, name: string, sliced = false): Sprite {
    const sprite = node.getComponent(Sprite) ?? node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.type = sliced ? Sprite.Type.SLICED : Sprite.Type.SIMPLE;
    if (this.frames) this.assign(sprite, name);
    else this.waiting.set(sprite, name);
    return sprite;
  }

  icon(parent: Node, name: string, x: number, y: number, size: number): Node {
    const node = new Node(name);
    node.layer = parent.layer;
    parent.addChild(node);
    node.setPosition(x, y);
    node.addComponent(UITransform).setContentSize(size, size);
    this.frame(node, name);
    return node;
  }

  hudButton(node: Node, title: string, primary: boolean): (down: boolean) => void {
    const icon = HUD_ICONS[title];
    if (icon) this.icon(node, 'ui-' + icon, primary ? 0 : -64, primary ? 36 : 0, primary ? 58 : 34);
    const skin = primary ? 'ui-button-primary' : 'ui-button';
    return down => { this.frame(node, down ? skin + '-down' : skin, true); };
  }

  joystick(node: Node): (x: number, y: number, active: boolean) => void {
    this.icon(node, 'ui-stick-base', 0, 0, 176);
    const thumb = this.icon(node, 'ui-stick-thumb', 0, 0, 56);
    const sprite = thumb.getComponent(Sprite)!;
    const pressed = new Color().fromHEX('ffe6ac');
    return (x, y, active) => {
      if (thumb.position.x !== x * 50 || thumb.position.y !== y * 50) thumb.setPosition(x * 50, y * 50);
      const tint = active ? pressed : Color.WHITE;
      if (!sprite.color.equals(tint)) sprite.color = tint;
    };
  }
}
