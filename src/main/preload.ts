import { contextBridge, ipcRenderer } from "electron";
import type { AgentIntentCommand, AgentPlayedSummary } from "../shared/agent-control";
import type { AppConfig, BootstrapPayload, DisplayPresetId } from "../shared/types";

export type NoriRendererCommand = string | AgentIntentCommand;

export interface NoriBridge {
  isElectron: boolean;
  preview: boolean;
  getBootstrap: () => Promise<BootstrapPayload>;
  saveConfig: (patch: Partial<AppConfig>) => Promise<AppConfig>;
  setDisplayPreset: (
    preset: DisplayPresetId,
  ) => Promise<{ width: number; height: number; displayPreset: DisplayPresetId }>;
  setUiChrome: (state: { hudOn?: boolean; menuOpen?: boolean; menuHeight?: number }) => Promise<{
    width: number;
    height: number;
    hudOn: boolean;
    menuOpen: boolean;
    menuHeight?: number;
  }>;
  moveBy: (dx: number, dy: number) => void;
  dragStart: () => void;
  dragMove: () => void;
  dragEnd: () => void;
  setClickThrough: (on: boolean) => Promise<void>;
  setHoverOpaque: (opaque: boolean) => void;
  setMenuOpen: (open: boolean, menuHeight?: number) => void;
  getCursorLocal: () => Promise<{ x: number; y: number; inWindow: boolean; near: boolean } | null>;
  quit: () => void;
  onCommand: (handler: (command: NoriRendererCommand) => void) => () => void;
  reportIntent: (requestId: string, played: AgentPlayedSummary) => void;
}

const bridge: NoriBridge = {
  isElectron: true,
  preview: false,
  getBootstrap: () => ipcRenderer.invoke("nori:bootstrap"),
  saveConfig: (patch) => ipcRenderer.invoke("nori:save-config", patch),
  setDisplayPreset: (preset) => ipcRenderer.invoke("nori:set-display-preset", preset),
  setUiChrome: (state) => ipcRenderer.invoke("nori:set-ui-chrome", state),
  moveBy: (dx, dy) => ipcRenderer.send("nori:move-by", dx, dy),
  dragStart: () => ipcRenderer.send("nori:drag-start"),
  dragMove: () => ipcRenderer.send("nori:drag-move"),
  dragEnd: () => ipcRenderer.send("nori:drag-end"),
  setClickThrough: (on) => ipcRenderer.invoke("nori:click-through", on),
  setHoverOpaque: (opaque) => ipcRenderer.send("nori:hover-opaque", opaque),
  setMenuOpen: (open, menuHeight) => ipcRenderer.send("nori:menu-open", open, menuHeight),
  getCursorLocal: () => ipcRenderer.invoke("nori:cursor-local"),
  quit: () => ipcRenderer.send("nori:quit"),
  onCommand: (handler) => {
    const listener = (_event: unknown, command: NoriRendererCommand) => handler(command);
    ipcRenderer.on("nori:command", listener);
    return () => ipcRenderer.removeListener("nori:command", listener);
  },
  reportIntent: (requestId, played) => {
    ipcRenderer.send("nori:intent-result", requestId, played);
  },
};

contextBridge.exposeInMainWorld("nori", bridge);
