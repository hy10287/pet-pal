import type { DisplayPresetId } from "./types";
import { SETTINGS_SIDEBAR_WIDTH, croppedWindowSize } from "./display-preset";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const DOCK_TAB_WIDTH = 22;
export const DOCK_TAB_HEIGHT = 56;

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

/** Thin settings tab on the stage's right edge, in the empty margin beside the face. */
export function dockTabRect(stage: { width: number; height: number }): Rect {
  const height = Math.min(DOCK_TAB_HEIGHT, Math.max(36, Math.round(stage.height * 0.28)));
  return {
    x: Math.max(0, stage.width - DOCK_TAB_WIDTH),
    y: Math.round(stage.height * 0.4),
    width: DOCK_TAB_WIDTH,
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

export interface PetChromeLayout {
  window: { width: number; height: number };
  stage: Rect;
  sidebar: Rect | null;
  face: Rect;
  dockTab: Rect;
}

/**
 * Character stage stays the crop. Settings / HUD use a right-side rail so they
 * never cover the face and never stretch the Live2D view.
 */
export function petChromeLayout(
  full: { width: number; height: number },
  preset: DisplayPresetId,
  sidebarOpen: boolean,
): PetChromeLayout {
  const crop = croppedWindowSize(full, preset);
  const stage: Rect = { x: 0, y: 0, width: crop.width, height: crop.height };
  const face = faceSafeRect(crop);
  const dockTab = dockTabRect(crop);
  if (!sidebarOpen) {
    return { window: crop, stage, sidebar: null, face, dockTab };
  }
  const sidebar: Rect = {
    x: crop.width,
    y: 0,
    width: SETTINGS_SIDEBAR_WIDTH,
    height: crop.height,
  };
  return {
    window: { width: crop.width + SETTINGS_SIDEBAR_WIDTH, height: crop.height },
    stage,
    sidebar,
    face,
    dockTab,
  };
}
