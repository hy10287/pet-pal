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
