import { BrowserWindow, screen } from "electron";
import { join } from "node:path";

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
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: false,
    },
  });

  win.setMinimumSize(Math.min(width, 200), 140);
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
