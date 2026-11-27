import { LAB_LAMP } from "../data/constants/IsometricRules.ts";

/** Lighting is derived from the current lamp position, never stored in player data. */
export function labBrightness(depth: number, distance: number, lampBonus = 0): number {
  if (depth === 0) return 1;
  const clear = LAB_LAMP.clearRadius + lampBonus * 0.45;
  const radius = LAB_LAMP.radius + lampBonus;
  const t = Math.max(0, Math.min(1, (distance - clear) / (radius - clear)));
  return LAB_LAMP.ambient + (1 - LAB_LAMP.ambient) * (1 - t * t * (3 - 2 * t));
}

export function smoothBrightness(current: number, target: number, seconds: number): number {
  return current < 0 ? target : current + (target - current) * (1 - Math.exp(-LAB_LAMP.smoothing * Math.max(0, Math.min(seconds, .05))));
}
