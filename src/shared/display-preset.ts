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
  const base = Number.isFinite(fullHeight) && fullHeight > 0 ? fullHeight : 560;
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
