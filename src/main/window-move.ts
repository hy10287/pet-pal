export interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Move a window without changing its locked size (DPI/move must not resize). */
export function movedBounds(current: WindowRect, dx: number, dy: number, lock: { width: number; height: number }): WindowRect {
  return {
    x: Math.round(current.x + dx),
    y: Math.round(current.y + dy),
    width: lock.width,
    height: lock.height,
  };
}

export function sameSize(a: { width: number; height: number }, b: { width: number; height: number }, slop = 1): boolean {
  return Math.abs(a.width - b.width) <= slop && Math.abs(a.height - b.height) <= slop;
}

/** Keep the top-left corner; apply the current locked size (window-crop). */
export function applyLockedSize(current: WindowRect, lock: { width: number; height: number }): WindowRect {
  return {
    x: Math.round(current.x),
    y: Math.round(current.y),
    width: lock.width,
    height: lock.height,
  };
}

/** Place window at screen DIP position with locked size (absolute drag). */
export function placeAt(x: number, y: number, lock: { width: number; height: number }): WindowRect {
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: lock.width,
    height: lock.height,
  };
}

/**
 * Keep the current top-left when the locked crop size changes (preset switch).
 * Does not pull a window back into the work area — the pet can sit on the true
 * screen edges. Optional edge-snap on drag-end is the only edge alignment.
 */
export function placeChromeBounds(
  current: WindowRect,
  size: { width: number; height: number },
  workArea?: { x: number; y: number; width: number; height: number },
): WindowRect {
  let x = current.x;
  let y = current.y;
  if (workArea) {
    const maxX = workArea.x + workArea.width - size.width;
    const maxY = workArea.y + workArea.height - size.height;
    if (x + size.width > workArea.x + workArea.width) x = Math.max(workArea.x, maxX);
    if (y + size.height > workArea.y + workArea.height) y = Math.max(workArea.y, maxY);
    if (x < workArea.x) x = workArea.x;
    if (y < workArea.y) y = workArea.y;
  }
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: size.width,
    height: size.height,
  };
}
