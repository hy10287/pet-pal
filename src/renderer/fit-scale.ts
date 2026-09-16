import { clampUserScale, USER_SCALE_MAX, USER_SCALE_MIN } from "../shared/display-preset";

export { clampUserScale, USER_SCALE_MAX, USER_SCALE_MIN };
export const FIT_FILL = 1;
const MIN_NATURAL = 8;
const MIN_VIEW = 32;

/** Fit an unscaled model into the full-body baseline. Never pass cropped height or already-scaled bounds. */
export function fitScale(
  naturalWidth: number,
  naturalHeight: number,
  viewWidth: number,
  viewHeight: number,
  fill = FIT_FILL,
): number {
  if (naturalWidth <= 0 || naturalHeight <= 0 || viewWidth <= 0 || viewHeight <= 0) {
    return 1;
  }
  return Math.min(viewWidth / naturalWidth, viewHeight / naturalHeight) * fill;
}

/**
 * First successful fit is sticky. Later resize/move/preset crop must not change visual size —
 * user scale is the only size control.
 */
export function lockFitted(
  current: number | null,
  naturalWidth: number,
  naturalHeight: number,
  viewWidth: number,
  viewHeight: number,
): number {
  if (current != null && current > 0) return current;
  if (
    viewWidth < MIN_VIEW ||
    viewHeight < MIN_VIEW ||
    naturalWidth < MIN_NATURAL ||
    naturalHeight < MIN_NATURAL
  ) {
    return current ?? 0;
  }
  return fitScale(naturalWidth, naturalHeight, viewWidth, viewHeight);
}

/** Single visual-size model: sticky full-body contain-fit × user slider. */
export function visualScale(fitted: number, userScale: number): number {
  const base = fitted > 0 ? fitted : FIT_FILL;
  return base * clampUserScale(userScale);
}
