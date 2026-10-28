import { ISOMETRIC_MAP as MAP } from "../data/external-files/IsometricMap.ts";
import { ISO_TILE_WIDTH as W, ISO_TILE_HEIGHT as H, ISO_MOVE_PIXELS, ISO_PLAYER_RADIUS as R } from "../data/constants/IsometricRules.ts";
import { MAX_FRAME_SECONDS } from "../data/constants/GameRules.ts";

export function isoProject(x: number, y: number): { x: number; y: number } {
  return { x: (x - y) * W / 2, y: -(x + y) * H / 2 };
}

export function isoUnproject(x: number, y: number): { x: number; y: number } {
  return { x: x / W - y / H, y: -x / W - y / H };
}

export function isoBlocked(x: number, y: number): boolean {
  if (x - R < 0 || y - R < 0 || x + R > MAP.size || y + R > MAP.size) return true;
  for (let cy = Math.floor(y - R); cy <= Math.floor(y + R); cy++) {
    for (let cx = Math.floor(x - R); cx <= Math.floor(x + R); cx++) {
      if (MAP.props.some(p => p.x === cx && p.y === cy) || MAP.water.some(p => p[0] === cx && p[1] === cy)) return true;
    }
  }
  return false;
}

export class IsometricWalk {
  x: number = MAP.spawn.x;
  y: number = MAP.spawn.y;
  vx = 0;
  vy = 0;
  facing = { x: 0, y: 1 };
  distance = 0;

  stop(): void { this.vx = this.vy = 0; }
  reset(): void { this.x = MAP.spawn.x; this.y = MAP.spawn.y; this.distance = 0; this.stop(); }

  tick(seconds: number, screenX: number, screenY: number): void {
    const dt = Math.max(0, Math.min(seconds, MAX_FRAME_SECONDS));
    const length = Math.max(1, Math.hypot(screenX, screenY));
    const x = screenX / length, y = screenY / length;
    const desired = isoUnproject(x * ISO_MOVE_PIXELS, y * ISO_MOVE_PIXELS);
    const blend = 1 - Math.exp(-12 * dt);
    this.vx += (desired.x - this.vx) * blend; this.vy += (desired.y - this.vy) * blend;
    if (Math.hypot(x, y) > 0.1) this.facing = { x, y: -y };
    const old = isoProject(this.x, this.y);
    // 以小步推进，防止低帧率时越过一格障碍。
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(this.vx * dt), Math.abs(this.vy * dt)) / 0.08));
    for (let i = 0; i < steps; i++) {
      const nx = this.x + this.vx * dt / steps, ny = this.y + this.vy * dt / steps;
      if (!isoBlocked(nx, this.y)) this.x = nx;
      if (!isoBlocked(this.x, ny)) this.y = ny;
    }
    const now = isoProject(this.x, this.y);
    this.distance += Math.hypot(now.x - old.x, now.y - old.y) / W;
  }
}
