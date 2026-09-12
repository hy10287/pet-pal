import type { AppConfig, BootstrapPayload, DisplayPresetId } from "../shared/types";
import { applyPreviewStageCrop, parseDisplayPreset } from "./display-crop";
import type { NoriBridge } from "../main/preload";

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
    setUiChrome: async () => ({ width: 420, height: 560, hudOn: false, menuOpen: false }),
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
  };
}

export function getBridge(): NoriBridge {
  return window.nori ?? createWebBridge();
}
