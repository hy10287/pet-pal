/** Fit an unscaled model into the view. Never pass already-scaled bounds. */
export function fitScale(
  naturalWidth: number,
  naturalHeight: number,
  viewWidth: number,
  viewHeight: number,
  fill = 0.86,
): number {
  if (naturalWidth <= 0 || naturalHeight <= 0 || viewWidth <= 0 || viewHeight <= 0) {
    return 1;
  }
  return Math.min(viewWidth / naturalWidth, viewHeight / naturalHeight) * fill;
}


/**
 * First successful fit is sticky. Later resize/move must not change visual size —
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
  if (viewWidth < 32 || viewHeight < 32 || naturalWidth <= 1 || naturalHeight <= 1) {
    return current ?? 0;
  }
  return fitScale(naturalWidth, naturalHeight, viewWidth, viewHeight);
}
