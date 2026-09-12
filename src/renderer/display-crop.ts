import type { DisplayPresetId } from "../shared/types";
import {
  DISPLAY_PRESETS,
  DEFAULT_DISPLAY_PRESET,
  parseDisplayPreset,
  presetById,
  windowHeightForPreset,
  croppedWindowSize,
} from "../shared/display-preset";
import { fitScale, lockFitted } from "./fit-scale";

export type { DisplayPresetId };
export {
  DISPLAY_PRESETS,
  DEFAULT_DISPLAY_PRESET,
  parseDisplayPreset,
  presetById,
  windowHeightForPreset,
  croppedWindowSize,
};

export const MODEL_ANCHOR_Y = 0.62;

/** Padding from the window top, relative to the full-body baseline height. */
export function clipTopPx(fullHeight: number): number {
  const base = Number.isFinite(fullHeight) && fullHeight > 0 ? fullHeight : 560;
  return Math.max(8, base * 0.08);
}

/**
 * Full-body contain-fit against the baseline window — never the cropped height.
 * Presets must not change this value; only the user size slider multiplies it.
 */
export function fullBodyFitted(
  naturalWidth: number,
  naturalHeight: number,
  fullWidth: number,
  fullHeight: number,
): number {
  return fitScale(naturalWidth, naturalHeight, fullWidth, fullHeight);
}

export function lockFullBodyFitted(
  current: number | null,
  naturalWidth: number,
  naturalHeight: number,
  fullWidth: number,
  fullHeight: number,
): number {
  return lockFitted(current, naturalWidth, naturalHeight, fullWidth, fullHeight);
}

/** Horizontal center + top-pin so the head stays near the window top after a height crop. */
export function topPinHome(
  viewWidth: number,
  naturalHeight: number,
  fitted: number,
  userScale: number,
  fullHeight: number,
  anchorY = MODEL_ANCHOR_Y,
): { x: number; y: number } {
  const scaledH = naturalHeight * fitted * Math.max(0.2, userScale);
  return {
    x: viewWidth / 2,
    y: clipTopPx(fullHeight) + anchorY * scaledH,
  };
}

/** Fallback actor: origin is not the Cubism anchor; pin by local top Y. */
export function topPinFromLocalTop(
  viewWidth: number,
  localTop: number,
  fitted: number,
  userScale: number,
  fullHeight: number,
): { x: number; y: number } {
  return {
    x: viewWidth / 2,
    y: clipTopPx(fullHeight) - localTop * fitted * Math.max(0.2, userScale),
  };
}

export function applyPreviewStageCrop(
  full: { width: number; height: number },
  preset: DisplayPresetId,
): { width: number; height: number } {
  const size = croppedWindowSize(full, preset);
  const stage = document.getElementById("stage");
  if (stage) {
    stage.style.width = `${size.width}px`;
    stage.style.height = `${size.height}px`;
    stage.style.overflow = "hidden";
  }
  document.body.style.height = `${size.height}px`;
  document.body.style.overflow = "hidden";
  window.dispatchEvent(new Event("resize"));
  return size;
}
