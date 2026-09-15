import type { HitZone } from "../shared/types";
import { isHeadZone } from "./hit-zones";

export type PointerGesture = "none" | "head-pat" | "window-drag";

export const DRAG_THRESHOLD = 10;
export const PAT_THRESHOLD = 10;
export const DRAG_OVERRIDE = 36;
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
 * Decide whether a pointer stroke is a click, a head-pat, or a window move.
 *
 * - Movement below the drag threshold stays "none" so pointerup can fire a click.
 * - Middle button → window drag
 * - Far travel always becomes window-drag, even if a head-pat had started
 *   (so the window cannot lock to a pat gesture).
 * - Short horizontal stroke on the head → head-pat
 * - Any other movement on the character → window drag
 */
export function resolvePointerGesture(input: GestureInput): PointerGesture {
  if (input.downZone === "empty") return input.decided === "window-drag" ? "window-drag" : "none";

  const dragThreshold = input.dragThreshold ?? DRAG_THRESHOLD;
  const patThreshold = input.patThreshold ?? PAT_THRESHOLD;
  const dx = input.dx;
  const dy = input.dy;
  const moved = Math.hypot(dx, dy);

  if (input.button === 1 && moved >= dragThreshold) return "window-drag";
  if (input.button !== 0 && input.button !== 1) return input.decided;

  if (moved >= DRAG_OVERRIDE) return "window-drag";
  if (input.decided === "window-drag") return "window-drag";
  if (moved < dragThreshold) return input.decided === "none" ? "none" : input.decided;

  if (input.decided !== "none") return input.decided;

  if (isHeadZone(input.downZone) && Math.abs(dx) >= patThreshold && Math.abs(dx) >= Math.abs(dy) * 1.2) {
    return "head-pat";
  }

  return "window-drag";
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
