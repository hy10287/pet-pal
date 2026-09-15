import type { DisplayPresetId } from "./types";
import { SETTINGS_POPUP_WIDTH, croppedWindowSize } from "./display-preset";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Upper-center of the stage: the pet's face / head, which overlays must not cover. */
export function faceSafeRect(stage: { width: number; height: number }): Rect {
  const width = Math.min(stage.width * 0.56, 240);
  const height = Math.min(stage.height * 0.62, Math.max(96, stage.height * 0.7));
  return {
    x: (stage.width - width) / 2,
    y: 0,
    width,
    height,
  };
}

export function rectsOverlap(a: Rect, b: Rect, pad = 0): boolean {
  return (
    a.x < b.x + b.width + pad &&
    a.x + a.width + pad > b.x &&
    a.y < b.y + b.height + pad &&
    a.y + a.height + pad > b.y
  );
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Place a settings popup beside the face (prefer right, then left, then below).
 * Used after the window grows a temporary popup strip, and after the user drags.
 */
export function placePopupAwayFromFace(
  face: Rect,
  popup: { width: number; height: number },
  viewport: { width: number; height: number },
  pad = 8,
): { x: number; y: number } {
  const maxX = Math.max(pad, viewport.width - popup.width - pad);
  const maxY = Math.max(pad, viewport.height - popup.height - pad);
  const y = clamp(face.y + pad, pad, maxY);

  const rightX = face.x + face.width + pad;
  const leftX = face.x - popup.width - pad;
  let x = rightX;
  if (rightX <= maxX) x = rightX;
  else if (leftX >= pad) x = leftX;
  else x = maxX;

  let placed: Rect = { x, y, width: popup.width, height: popup.height };
  if (rectsOverlap(placed, face, pad)) {
    x = maxX;
    placed = { x, y, width: popup.width, height: popup.height };
  }
  if (rectsOverlap(placed, face, pad)) {
    const below = face.y + face.height + pad;
    placed = { x, y: clamp(below, pad, maxY), width: popup.width, height: popup.height };
  }
  return { x: Math.round(placed.x), y: Math.round(placed.y) };
}

export interface PetPopupLayout {
  window: { width: number; height: number };
  stage: Rect;
  face: Rect;
  popup: Rect | null;
}

/** Crop stays on the left. An open settings popup uses a temporary strip to the right. */
export function petPopupLayout(
  full: { width: number; height: number },
  preset: DisplayPresetId,
  menuOpen: boolean,
  popupHeight = 320,
): PetPopupLayout {
  const crop = croppedWindowSize(full, preset);
  const stage: Rect = { x: 0, y: 0, width: crop.width, height: crop.height };
  const face = faceSafeRect(crop);
  if (!menuOpen) {
    return { window: crop, stage, face, popup: null };
  }
  const windowSize = {
    width: crop.width + SETTINGS_POPUP_WIDTH,
    height: crop.height,
  };
  const popupSize = {
    width: SETTINGS_POPUP_WIDTH - 8,
    height: Math.min(popupHeight, Math.max(120, crop.height - 16)),
  };
  const pos = placePopupAwayFromFace(face, popupSize, windowSize);
  return {
    window: windowSize,
    stage,
    face,
    popup: { ...pos, ...popupSize },
  };
}
