import type { DisplayPresetId } from "../shared/types";
import {
  DISPLAY_PRESETS,
  DEFAULT_DISPLAY_PRESET,
  parseDisplayPreset,
  presetById,
  windowHeightForPreset,
  croppedWindowSize,
  displayWindowSize,
  resolveFullWindow,
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
  displayWindowSize,
  resolveFullWindow,
};

/** Live2D / PIXI: bottom-center so scale grows from the display-range floor. */
export const MODEL_ANCHOR_Y = 1;

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

/**
 * Bottom-center home for a sprite whose PIXI anchor is (0.5, 1).
 * At scale 1 the feet sit on the full-body floor (`fullHeight`).
 * The visible crop's bottom edge is the scale origin, so enlarging grows
 * upward instead of leaving a gap under the character.
 */
export function bottomPinHome(
  viewWidth: number,
  viewHeight: number,
  userScale: number,
  fullHeight: number,
): { x: number; y: number } {
  const scale = Math.max(0.2, userScale);
  const cropH = viewHeight > 0 ? viewHeight : fullHeight;
  const baseH = Number.isFinite(fullHeight) && fullHeight > 0 ? fullHeight : cropH;
  return {
    x: viewWidth / 2,
    y: cropH + Math.max(0, baseH - cropH) * scale,
  };
}

/** Fallback actor: origin is not the Cubism anchor; pin by local bottom Y. */
export function bottomPinFromLocalBottom(
  viewWidth: number,
  viewHeight: number,
  localBottom: number,
  fitted: number,
  userScale: number,
  fullHeight: number,
): { x: number; y: number } {
  const scale = Math.max(0.2, userScale);
  const floor = bottomPinHome(viewWidth, viewHeight, userScale, fullHeight).y;
  return {
    x: viewWidth / 2,
    y: floor - localBottom * fitted * scale,
  };
}

/** Lock #stage to the crop so a taller HUD/menu window cannot stretch the character view. */
export function applyStageCrop(
  stage: HTMLElement | null,
  full: { width: number; height: number },
  preset: DisplayPresetId,
): { width: number; height: number } {
  const size = croppedWindowSize(full, preset);
  if (stage) {
    stage.style.width = `${size.width}px`;
    stage.style.height = `${size.height}px`;
    stage.style.minWidth = `${size.width}px`;
    stage.style.maxWidth = `${size.width}px`;
    stage.style.minHeight = `${size.height}px`;
    stage.style.maxHeight = `${size.height}px`;
    stage.style.overflow = "hidden";
  }
  return size;
}

export function applyPreviewStageCrop(
  full: { width: number; height: number },
  preset: DisplayPresetId,
): { width: number; height: number } {
  const size = applyStageCrop(document.getElementById("stage"), full, preset);
  document.body.style.height = `${size.height}px`;
  document.body.style.width = `${size.width}px`;
  window.dispatchEvent(new Event("resize"));
  return size;
}
