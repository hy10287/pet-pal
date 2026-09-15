import { BrowserWindow, screen } from "electron";
import { join } from "node:path";
import { MIN_WINDOW_HEIGHT } from "../shared/display-preset";
import { applyLockedSize, sameSize } from "./window-move";

export interface PetWindowOptions {
  width: number;
  height: number;
  preload: string;
  page: string;
  preview: boolean;
}

/**
 * Sandbox + contextIsolation + preload is the supported Electron security model.
 * Preload uses contextBridge/ipcRenderer only (no Node in the page).
 */
export function createPetWindow(options: PetWindowOptions): BrowserWindow {
  const display = screen.getPrimaryDisplay().workArea;
  const width = options.width;
  const height = options.height;

  const win = new BrowserWindow({
    width,
    height,
    x: Math.max(display.x + 40, display.x + Math.floor((display.width - width) / 2)),
    y: Math.max(display.y + 40, display.y + Math.floor((display.height - height) / 2)),
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    roundedCorners: true,
    title: "Nori Deskpet",
    webPreferences: {
      preload: options.preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload + file model loads; revisit with custom protocol
      webSecurity: false, // file:// Live2D models/textures; custom protocol later
      backgroundThrottling: false,
    },
  });

  win.setMinimumSize(Math.min(width, 200), MIN_WINDOW_HEIGHT);
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setMenuBarVisibility(false);

  void win.loadFile(options.page, {
    query: { preview: options.preview ? "1" : "0" },
  });

  win.once("ready-to-show", () => {
    win.show();
    win.moveTop();
  });

  // Size lock / will-resize owned by main/index.ts (supports display-preset crop).
  return win;
}

/**
 * Apply a locked size on a typically non-resizable window.
 * Temporarily allows resize, lowers min size so shrinks are not clamped, then restores.
 */
export function commitPetWindowSize(
  win: BrowserWindow,
  size: { width: number; height: number },
  position?: { x: number; y: number },
): void {
  if (win.isDestroyed()) return;
  const current = win.getBounds();
  const next = position
    ? { x: Math.round(position.x), y: Math.round(position.y), width: size.width, height: size.height }
    : applyLockedSize(current, size);
  const wasResizable = win.isResizable();
  try {
    win.setMinimumSize(1, MIN_WINDOW_HEIGHT);
    if (!wasResizable) win.setResizable(true);
    win.setBounds(next, false);
    if (!sameSize(win.getBounds(), size)) {
      win.setSize(size.width, size.height);
    }
  } finally {
    if (!win.isDestroyed()) {
      if (!wasResizable) win.setResizable(false);
      win.setMinimumSize(Math.min(size.width, 200), MIN_WINDOW_HEIGHT);
    }
  }
}

export function applyClickThrough(win: BrowserWindow, ignore: boolean): void {
  if (win.isDestroyed()) return;
  if (ignore) {
    win.setIgnoreMouseEvents(true, { forward: true });
  } else {
    win.setIgnoreMouseEvents(false);
  }
}

export function rendererHtml(): string {
  return join(__dirname, "../renderer/pet.html");
}

export function preloadPath(): string {
  return join(__dirname, "preload.js");
}

