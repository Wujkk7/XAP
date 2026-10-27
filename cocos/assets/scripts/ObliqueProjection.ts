// Orthographic view from the south: ground depth and upright height share one pitch.
export function obliqueProjection(tileSize: number, pitchDegrees: number) {
  if (!Number.isFinite(tileSize) || tileSize <= 0 || !Number.isFinite(pitchDegrees) || pitchDegrees < 20 || pitchDegrees > 60) {
    throw new Error("地块宽度必须为正数，镜头俯角必须在 20–60° 之间");
  }
  const angle = pitchDegrees * Math.PI / 180;
  return {
    rowHeight: tileSize * Math.sin(angle),
    // shortcut: existing sprites have baked perspective; replace with lower-angle art later.
    uprightScale: Math.cos(angle) / Math.SQRT1_2,
  };
}

// Fade only a foreground sprite whose projected body overlaps the player's body.
export function occlusionAlpha(dx: number, depthPixels: number, width: number, height: number, playerWidth: number, playerHeight: number): number {
  if (depthPixels <= 0) return 1;
  const overlapX = (width + playerWidth) / 2 - Math.abs(dx);
  const overlapY = height - depthPixels;
  const overlap = Math.max(0, Math.min(1, overlapX / playerWidth, overlapY / playerHeight));
  return 1 - 0.65 * overlap;
}
