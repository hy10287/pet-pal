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

/** 精灵盒高度小于窗口时居中，否则贴顶（保证头永远不出框）。返回盒子顶边的屏幕 y。 */
export function pinnedTopY(boxHeight: number, cropHeight: number): number {
  const crop = cropHeight > 0 ? cropHeight : boxHeight;
  if (boxHeight >= crop) return 0;
  return (crop - boxHeight) / 2;
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
