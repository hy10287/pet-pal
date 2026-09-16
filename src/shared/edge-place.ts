import { EDGE_SNAP_PX, snapRectToEdges, type SnapRect } from "./edge-snap";

export interface PlacePadding {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const EMPTY_PADDING: PlacePadding = { left: 0, right: 0, top: 0, bottom: 0 };

function clamp(value: number, min: number, max: number): number {
  if (max < min) return 0;
  return Math.min(max, Math.max(min, value));
}

/** Empty canvas around the drawn character, in window/stage pixels. */
export function visualPadding(
  view: { width: number; height: number },
  visual: { x: number; y: number; width: number; height: number },
): PlacePadding {
  if (view.width <= 0 || view.height <= 0 || visual.width <= 0 || visual.height <= 0) {
    return { ...EMPTY_PADDING };
  }
  return {
    left: Math.max(0, visual.x),
    right: Math.max(0, view.width - (visual.x + visual.width)),
    top: Math.max(0, visual.y),
    bottom: Math.max(0, view.height - (visual.y + visual.height)),
  };
}

/**
 * When the OS clamps the HWND (Windows work area / thick frame), `desired - actual`
 * is how far the window failed to move. Shift the character by that amount, but
 * never past the drawable's remaining canvas padding.
 */
export function clampPlaceShift(
  deficit: { x: number; y: number },
  padding: PlacePadding,
): { x: number; y: number } {
  return {
    x: clamp(deficit.x, -padding.left, padding.right),
    y: clamp(deficit.y, -padding.top, padding.bottom),
  };
}

export function boundsDeficit(
  desired: { x: number; y: number },
  actual: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: Math.round(desired.x - actual.x),
    y: Math.round(desired.y - actual.y),
  };
}

/**
 * Snap the *character* (visual rect in window space) to the display bounds.
 * The returned window origin may be negative so empty canvas can hang off-screen.
 */
export function snapWindowByVisual(
  windowOrigin: { x: number; y: number },
  visual: SnapRect,
  area: SnapRect,
  enabled: boolean,
  distance = EDGE_SNAP_PX,
): { x: number; y: number } {
  if (!enabled || visual.width <= 0 || visual.height <= 0) {
    return { x: Math.round(windowOrigin.x), y: Math.round(windowOrigin.y) };
  }
  const screenVisual: SnapRect = {
    x: windowOrigin.x + visual.x,
    y: windowOrigin.y + visual.y,
    width: visual.width,
    height: visual.height,
  };
  const snapped = snapRectToEdges(screenVisual, area, true, distance);
  return {
    x: Math.round(snapped.x - visual.x),
    y: Math.round(snapped.y - visual.y),
  };
}
