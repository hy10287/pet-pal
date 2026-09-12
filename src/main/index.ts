import { BrowserWindow, app, ipcMain, screen } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AppConfig, BootstrapPayload, DisplayPresetId } from "../shared/types";
import { croppedWindowSize, parseDisplayPreset } from "../shared/display-preset";
import {
  fileUrlIfExists,
  loadAppConfig,
  loadMotionCatalog,
  pathToFileUrl,
  resolveRepoPath,
  saveAppConfig,
} from "./config";
import { applyClickThrough, createPetWindow, preloadPath, rendererHtml } from "./window";
import { createTray } from "./tray";
import { applyLockedSize, movedBounds, placeAt, sameSize } from "./window-move";

const ROOT = join(__dirname, "../..");
const preview = process.argv.includes("--preview");

if (process.platform === "win32") {
  app.setAppUserModelId("nori.live2d.pet");
}

if (process.platform === "linux") {
  app.commandLine.appendSwitch("enable-transparent-visuals");
}

let configState = loadAppConfig(ROOT);
let persistPath = join(ROOT, "config", "local.json");

function sendCommand(command: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("nori:command", command);
  }
}

function resolveCubismFile(root: string, configuredPath: string): string {
  const vendor = join(root, "vendor", "live2dcubismcore.min.js");
  if (existsSync(vendor)) return vendor;
  return resolveRepoPath(root, configuredPath);
}

function bootstrapPayload(): BootstrapPayload {
  const { config } = configState;
  const cubism = resolveCubismFile(ROOT, config.cubismCorePath);
  const model = resolveRepoPath(ROOT, config.modelPath);
  const motions = resolveRepoPath(ROOT, config.motionsDir);
  return {
    config,
    catalog: loadMotionCatalog(ROOT, config),
    cubismCoreUrl: fileUrlIfExists(cubism),
    modelUrl: fileUrlIfExists(model),
    motionsBaseUrl: motions && existsSync(motions) ? pathToFileUrl(motions) : null,
    isElectron: true,
    preview,
  };
}

app.whenReady().then(() => {
  persistPath = join(app.getPath("userData"), "app.config.json");
  const userLoaded = loadAppConfig(ROOT, app.getPath("userData"));
  if (userLoaded.source !== "defaults") {
    configState = userLoaded;
  }

  const fullWindow = { ...configState.config.window };
  const startSize = croppedWindowSize(fullWindow, parseDisplayPreset(configState.config.displayPreset));
  const win = createPetWindow({
    width: startSize.width,
    height: startSize.height,
    preload: preloadPath(),
    page: rendererHtml(),
    preview,
  });

  applyClickThrough(win, configState.config.clickThrough);

  const lockedSize = { ...startSize };
  let applyingPreset = false;
  let menuOpen = false;
  let hudOn = false;
  let dragging = false;
  let dragOffset = { x: 0, y: 0 };

  const cropSize = () => croppedWindowSize(fullWindow, parseDisplayPreset(configState.config.displayPreset));

  const applyWindowChrome = () => {
    if (win.isDestroyed()) return;
    const crop = cropSize();
    const useFull = hudOn || menuOpen;
    lockedSize.width = fullWindow.width;
    lockedSize.height = useFull ? fullWindow.height : crop.height;
    applyingPreset = true;
    const bounds = win.getBounds();
    win.setBounds(applyLockedSize(bounds, lockedSize));
    applyingPreset = false;
  };


  const restoreClickThrough = () => {
    if (win.isDestroyed()) return;
    if (menuOpen) {
      applyClickThrough(win, false);
      return;
    }
    applyClickThrough(win, configState.config.clickThrough);
  };

  win.on("will-resize", (event) => {
    if (!applyingPreset) event.preventDefault();
  });

  win.on("resized", () => {
    if (win.isDestroyed() || applyingPreset || dragging) return;
    const bounds = win.getBounds();
    if (!sameSize(bounds, lockedSize)) {
      win.setBounds({ x: bounds.x, y: bounds.y, width: lockedSize.width, height: lockedSize.height });
    }
  });

  createTray(ROOT, {
    idle: () => sendCommand("idle"),
    random: () => sendCommand("random"),
    toggleHud: () => sendCommand("toggle-hud"),
    toggleClickThrough: () => sendCommand("toggle-click-through"),
    quit: () => app.quit(),
  });

  ipcMain.handle("nori:bootstrap", () => bootstrapPayload());

  ipcMain.handle("nori:save-config", (_event, patch: Partial<AppConfig>) => {
    const next = { ...configState.config, ...patch, window: fullWindow };
    if (patch.displayPreset) next.displayPreset = parseDisplayPreset(patch.displayPreset);
    configState = { config: next, source: persistPath };
    saveAppConfig(persistPath, configState.config);
    return configState.config;
  });

  ipcMain.handle("nori:set-display-preset", (_event, raw: DisplayPresetId) => {
    const preset = parseDisplayPreset(raw);
    configState = {
      config: { ...configState.config, displayPreset: preset, window: fullWindow },
      source: persistPath,
    };
    saveAppConfig(persistPath, configState.config);
    applyWindowChrome();
    return { ...lockedSize, displayPreset: preset };
  });

  ipcMain.handle("nori:set-ui-chrome", (_event, state: { hudOn?: boolean; menuOpen?: boolean }) => {
    if (typeof state?.hudOn === "boolean") hudOn = state.hudOn;
    if (typeof state?.menuOpen === "boolean") menuOpen = state.menuOpen;
    applyWindowChrome();
    return { ...lockedSize, hudOn, menuOpen };
  });

  ipcMain.handle("nori:click-through", (_event, on: boolean) => {
    configState.config.clickThrough = on;
    restoreClickThrough();
    saveAppConfig(persistPath, configState.config);
  });

  // Legacy incremental move (kept for compatibility); prefer drag-start/move/end.
  ipcMain.on("nori:move-by", (_event, dx: number, dy: number) => {
    if (win.isDestroyed() || dragging) return;
    const [x, y] = win.getPosition();
    win.setBounds(movedBounds({ x, y, width: lockedSize.width, height: lockedSize.height }, dx, dy, lockedSize));
  });

  ipcMain.on("nori:drag-start", () => {
    if (win.isDestroyed()) return;
    const point = screen.getCursorScreenPoint();
    const [x, y] = win.getPosition();
    dragOffset = { x: point.x - x, y: point.y - y };
    dragging = true;
  });

  ipcMain.on("nori:drag-move", () => {
    if (win.isDestroyed() || !dragging) return;
    const point = screen.getCursorScreenPoint();
    win.setBounds(placeAt(point.x - dragOffset.x, point.y - dragOffset.y, lockedSize));
  });

  ipcMain.on("nori:drag-end", () => {
    dragging = false;
  });

  ipcMain.on("nori:hover-opaque", (_event, opaque: boolean) => {
    if (menuOpen) {
      applyClickThrough(win, false);
      return;
    }
    if (configState.config.clickThrough) {
      applyClickThrough(win, true);
      return;
    }
    applyClickThrough(win, !opaque);
  });

  ipcMain.on("nori:menu-open", (_event, open: boolean) => {
    menuOpen = Boolean(open);
    restoreClickThrough();
    applyWindowChrome();
  });

  ipcMain.handle("nori:cursor-local", () => {
    if (win.isDestroyed()) return null;
    const point = screen.getCursorScreenPoint();
    const bounds = win.getContentBounds();
    const x = point.x - bounds.x;
    const y = point.y - bounds.y;
    const inWindow = x >= 0 && y >= 0 && x <= bounds.width && y <= bounds.height;
    const margin = 80;
    const near =
      x >= -margin &&
      y >= -margin &&
      x <= bounds.width + margin &&
      y <= bounds.height + margin;
    return { x, y, inWindow, near };
  });

  ipcMain.on("nori:quit", () => app.quit());
});

app.on("window-all-closed", () => {
  app.quit();
});
