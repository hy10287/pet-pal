import type { DisplayPresetId } from "./types";

export interface DisplayPreset {
  id: DisplayPresetId;
  label: string;
  /** Fraction of the full-body window height. Crop is the shorter window, not a zoom. */
  heightFraction: number;
}

export const DISPLAY_PRESETS: readonly DisplayPreset[] = [
  { id: "compact", label: "头肩", heightFraction: 0.32 },
  { id: "balanced", label: "上半身", heightFraction: 0.44 },
  { id: "standard", label: "到腰", heightFraction: 0.58 },
  { id: "full", label: "全身", heightFraction: 1 },
] as const;

export const DEFAULT_DISPLAY_PRESET: DisplayPresetId = "balanced";

export const MIN_WINDOW_HEIGHT = 140;

/** Canonical full-body baseline. Presets only shorten height from this. */
export const DEFAULT_FULL_WINDOW = { width: 420, height: 560 } as const;

/** User size slider. The only control that changes character visual size. */
export const USER_SCALE_MIN = 0.6;
export const USER_SCALE_MAX = 1.8;

export function clampUserScale(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(USER_SCALE_MIN, Math.min(USER_SCALE_MAX, value));
}

/** Right-side settings/HUD rail. Crop height is never used as extra chrome. */
export const SETTINGS_SIDEBAR_WIDTH = 240;

export interface WindowChromeState {
  hudOn?: boolean;
  menuOpen?: boolean;
  /** Ignored for sizing (sidebar is a fixed-width rail). Kept for older callers. */
  menuHeight?: number;
}

export function parseDisplayPreset(value: unknown): DisplayPresetId {
  if (value === "compact" || value === "balanced" || value === "standard" || value === "full") {
    return value;
  }
  return DEFAULT_DISPLAY_PRESET;
}

export function presetById(id: DisplayPresetId): DisplayPreset {
  return DISPLAY_PRESETS.find((item) => item.id === id) ?? DISPLAY_PRESETS[1]!;
}

export function windowHeightForPreset(fullHeight: number, preset: DisplayPresetId): number {
  const base = Number.isFinite(fullHeight) && fullHeight > 0 ? fullHeight : DEFAULT_FULL_WINDOW.height;
  const fraction = presetById(preset).heightFraction;
  return Math.max(MIN_WINDOW_HEIGHT, Math.round(base * fraction));
}

export function croppedWindowSize(
  full: { width: number; height: number },
  preset: DisplayPresetId,
): { width: number; height: number } {
  return {
    width: full.width,
    height: windowHeightForPreset(full.height, preset),
  };
}

/**
 * Recover a full-body baseline if AppData saved an already-cropped height
 * (compact/balanced/standard of the default, or too short to tell presets apart).
 */
export function resolveFullWindow(
  raw?: { width?: number; height?: number } | null,
): { width: number; height: number } {
  const widthNum = Number(raw?.width);
  const heightNum = Number(raw?.height);
  const width = Number.isFinite(widthNum) && widthNum >= 200 ? Math.round(widthNum) : DEFAULT_FULL_WINDOW.width;
  const height =
    Number.isFinite(heightNum) && heightNum >= MIN_WINDOW_HEIGHT ? Math.round(heightNum) : DEFAULT_FULL_WINDOW.height;

  for (const preset of DISPLAY_PRESETS) {
    if (preset.heightFraction >= 1) continue;
    const croppedDefault = windowHeightForPreset(DEFAULT_FULL_WINDOW.height, preset.id);
    if (Math.abs(height - croppedDefault) <= 2) {
      return { width, height: DEFAULT_FULL_WINDOW.height };
    }
  }

  if (windowHeightForPreset(height, "compact") === windowHeightForPreset(height, "balanced")) {
    return { width, height: DEFAULT_FULL_WINDOW.height };
  }

  return { width, height };
}

/**
 * Electron outer size for a preset.
 * Character crop (height) is stable. Settings / HUD add a right-side rail
 * so overlays never stretch the Live2D view or cover the face.
 */
export function displayWindowSize(
  full: { width: number; height: number },
  preset: DisplayPresetId,
  chrome: WindowChromeState = {},
): { width: number; height: number } {
  const crop = croppedWindowSize(full, preset);
  const sidebar = Boolean(chrome.menuOpen || chrome.hudOn);
  return {
    width: crop.width + (sidebar ? SETTINGS_SIDEBAR_WIDTH : 0),
    height: crop.height,
  };
}
