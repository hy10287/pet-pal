/** Release-time snap distance, in DIP pixels (screen / work-area edges). */
export const EDGE_SNAP_PX = 8;

export interface SnapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Snap a window to the nearest work-area edge when it is within `distance` px.
 * Only intended for pointer-up / drag-end — never while the pointer is held,
 * so the pet can be dragged off an edge without sticking.
 *
 * Other-window snapping is intentionally not implemented yet; keep this
 * function as the single place to add more target rects later.
 */
export function snapRectToEdges(
  rect: SnapRect,
  area: SnapRect,
  enabled: boolean,
  distance = EDGE_SNAP_PX,
): SnapRect {
  const next: SnapRect = {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: rect.width,
    height: rect.height,
  };
  if (!enabled || distance < 0) return next;

  const insideX = rect.x >= area.x && rect.x + rect.width <= area.x + area.width;
  const insideY = rect.y >= area.y && rect.y + rect.height <= area.y + area.height;
  if (!insideX || !insideY) return next;

  const left = rect.x - area.x;
  const right = area.x + area.width - (rect.x + rect.width);
  const top = rect.y - area.y;
  const bottom = area.y + area.height - (rect.y + rect.height);

  if (left <= distance || right <= distance) {
    next.x = Math.round(left <= right ? area.x : area.x + area.width - rect.width);
  }
  if (top <= distance || bottom <= distance) {
    next.y = Math.round(top <= bottom ? area.y : area.y + area.height - rect.height);
  }
  return next;
}

export function samePosition(a: { x: number; y: number }, b: { x: number; y: number }, slop = 0): boolean {
  return Math.abs(a.x - b.x) <= slop && Math.abs(a.y - b.y) <= slop;
}
