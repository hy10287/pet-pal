import type { HitZone } from "../shared/types";

const HEAD_NAMES = ["head", "face", "hair", "hitareahead", "facea", "head_hit"];
const BODY_NAMES = ["body", "bust", "torso", "hitareabody", "bodya", "leg"];

export function mapHitAreaName(name: string): HitZone {
  const key = name.toLowerCase().replace(/[^a-z]/g, "");
  if (HEAD_NAMES.some((token) => key.includes(token))) {
    return key.includes("face") ? "face" : "head";
  }
  if (BODY_NAMES.some((token) => key.includes(token))) return "body";
  return "body";
}

export function geometricHitZone(
  x: number,
  y: number,
  bounds: { x: number; y: number; width: number; height: number },
): HitZone {
  if (x < bounds.x || y < bounds.y || x > bounds.x + bounds.width || y > bounds.y + bounds.height) {
    return "empty";
  }
  const relY = (y - bounds.y) / Math.max(1, bounds.height);
  return relY < 0.52 ? "head" : "body";
}

export function isHeadZone(zone: HitZone): boolean {
  return zone === "head" || zone === "face";
}

/**
 * When the camera crop shows only the upper model, local "body" is off-screen.
 * The lower part of whatever is visible still counts as body so chat / body-drag remain reachable.
 */
export function refineVisibleZone(
  localZone: HitZone,
  x: number,
  y: number,
  bounds: { x: number; y: number; width: number; height: number },
): HitZone {
  if (localZone === "empty") return "empty";
  if (bounds.width <= 0 || bounds.height <= 0) return localZone;
  const relY = (y - bounds.y) / bounds.height;
  if (relY >= 0.38) return "body";
  return isHeadZone(localZone) ? localZone : "head";
}

/** Hit map for the original fallback actor, in local character space. */
export function fallbackHitZone(x: number, y: number): HitZone {
  const inHead = x * x + (y + 82) * (y + 82) <= 78 * 78;
  const inLeftBun = (x + 58) * (x + 58) + (y + 116) * (y + 116) <= 24 * 24;
  const inRightBun = (x - 58) * (x - 58) + (y + 116) * (y + 116) <= 24 * 24;
  if (inHead || inLeftBun || inRightBun) return "head";
  if (x > -52 && x < 52 && y > -6 && y < 148) return "body";
  return "empty";
}
