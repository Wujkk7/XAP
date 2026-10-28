// Regions in the user-approved 1586×992 board, measured in source pixels.
export const XPAA_ATLAS_SIZE = [1586, 992] as const;
export const WALK_CANVAS = [144, 208] as const;
export const WALK_DIRECTIONS = ["down", "left", "right", "up"] as const;
export const XPAA_REGIONS: Record<string, readonly [number, number, number, number]> = {
  walk_down_0: [118, 97, 107, 190], walk_down_1: [278, 97, 107, 190],
  walk_down_2: [435, 96, 109, 191], walk_down_3: [593, 96, 108, 191],
  walk_left_0: [115, 312, 117, 185], walk_left_1: [268, 314, 117, 183],
  walk_left_2: [431, 314, 117, 184], walk_left_3: [592, 314, 116, 183],
  walk_right_0: [118, 529, 118, 183], walk_right_1: [273, 527, 118, 185],
  walk_right_2: [437, 530, 117, 182], walk_right_3: [595, 530, 117, 182],
  walk_up_0: [129, 743, 106, 190], walk_up_1: [289, 744, 99, 189],
  walk_up_2: [445, 743, 104, 190], walk_up_3: [603, 744, 105, 189],
  xpaa_oak: [780, 77, 389, 433], xpaa_pine: [831, 518, 293, 445],
  xpaa_stone: [1274, 174, 194, 166],
  // The interior avoids the reference board's transparent, ragged swatch border.
  xpaa_grass: [1245, 435, 270, 270], xpaa_tuft: [1295, 797, 142, 119],
};

export function walkFrame(x: number, y: number, distance: number, moving: boolean): string {
  const direction = Math.abs(x) > Math.abs(y) ? (x < 0 ? "left" : "right") : (y < 0 ? "up" : "down");
  return `walk_${direction}_${moving ? Math.floor(distance / 0.22) % 4 : 0}`;
}
