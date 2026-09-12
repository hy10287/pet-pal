import type { HitZone } from "../shared/types";
import { isHeadZone } from "./hit-zones";

export type PointerGesture = "none" | "head-pat" | "window-drag";

export const DRAG_THRESHOLD = 12;
export const PAT_THRESHOLD = 10;
export const PAT_RELEASE_IDLE_MS = 420;

export interface GestureInput {
  button: number;
  downZone: HitZone;
  dx: number;
  dy: number;
  decided: PointerGesture;
  dragThreshold?: number;
  patThreshold?: number;
}

/**
 * Decide whether a pointer stroke is a head-pat or a window move.
 * Once decided, the gesture sticks so the two never fight.
 *
 * - Middle button → window drag
 * - Left + head + horizontal-dominant → head-pat
 * - Left + body, or left + head + vertical-dominant → window drag
 */
export function resolvePointerGesture(input: GestureInput): PointerGesture {
  if (input.decided !== "none") return input.decided;
  if (input.downZone === "empty") return "none";

  const dragThreshold = input.dragThreshold ?? DRAG_THRESHOLD;
  const patThreshold = input.patThreshold ?? PAT_THRESHOLD;
  const dx = input.dx;
  const dy = input.dy;
  const moved = Math.hypot(dx, dy);
  if (moved < dragThreshold) return "none";

  if (input.button === 1) return "window-drag";
  if (input.button !== 0) return "none";

  if (isHeadZone(input.downZone) && Math.abs(dx) >= patThreshold && Math.abs(dx) >= Math.abs(dy)) {
    return "head-pat";
  }

  if (!isHeadZone(input.downZone) || Math.abs(dy) > Math.abs(dx)) {
    return "window-drag";
  }

  return "none";
}

export function patStrokeAmount(dx: number): number {
  return Math.min(1, Math.abs(dx) / 88);
}

/** Extra shy/happy face mix while the pointer is stroking the head. */
export function patFaceBoost(stroke: number): Record<string, number> {
  const amount = Math.max(0.2, Math.min(1, stroke));
  return {
    ParamCheek: 0.45 + amount * 0.55,
    ParamEyeLSmile: 0.28 + amount * 0.45,
    ParamEyeRSmile: 0.28 + amount * 0.45,
    ParamMouthForm: 0.22 + amount * 0.3,
    ParamEyeLOpen: -0.06 * amount,
    ParamEyeROpen: -0.06 * amount,
  };
}
