import type { AppConfig, BootstrapPayload, DisplayPresetId } from "../shared/types";
import { applyPreviewStageCrop, parseDisplayPreset } from "./display-crop";
import type { NoriBridge } from "../main/preload";
import { DEFAULT_TIPS } from "../tips/schema";

declare global {
  interface Window {
    nori?: NoriBridge;
  }
}

export async function getBootstrap(): Promise<BootstrapPayload> {
  if (window.nori?.getBootstrap) return window.nori.getBootstrap();
  const response = await fetch("/api/bootstrap");
  return response.json() as Promise<BootstrapPayload>;
}

export function createWebBridge(): NoriBridge {
  return {
    isElectron: false,
    preview: true,
    getBootstrap,
    saveConfig: async (patch: Partial<AppConfig>) => {
      const boot = await getBootstrap();
      return { ...boot.config, ...patch };
    },
    setUiChrome: async (state) => {
      // Size follows the live crop (#stage). Do not re-read bootstrap displayPreset —
      // that would undo a preset the user just switched.
      const stage = document.getElementById("stage");
      const width = stage?.clientWidth ?? 0;
      const height = stage?.clientHeight ?? 0;
      return {
        width,
        height,
        hudOn: Boolean(state.hudOn),
        menuOpen: Boolean(state.menuOpen),
        menuHeight: state.menuHeight,
      };
    },
    setDisplayPreset: async (preset: DisplayPresetId) => {
      const boot = await getBootstrap();
      const id = parseDisplayPreset(preset);
      const size = applyPreviewStageCrop(boot.config.window, id);
      return { ...size, displayPreset: id };
    },
    moveBy: () => undefined,
    dragStart: () => undefined,
    dragMove: () => undefined,
    dragEnd: () => undefined,
    setClickThrough: async () => undefined,
    setHoverOpaque: () => undefined,
    setMenuOpen: () => undefined,
    getCursorLocal: async () => null,
    quit: () => undefined,
    onCommand: () => () => undefined,
    reportIntent: () => undefined,
    getTips: async () => DEFAULT_TIPS,
    onTipsChanged: () => () => undefined,
    onTip: () => () => undefined,
  };
}

export function getBridge(): NoriBridge {
  return window.nori ?? createWebBridge();
}
