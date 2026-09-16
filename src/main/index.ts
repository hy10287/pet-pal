import { app, BrowserWindow, ipcMain, screen, type Tray } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AppConfig, BootstrapPayload, DisplayPresetId } from "../shared/types";
import {
  type AgentControlRequest,
  type AgentPlayedSummary,
  isAgentControlEnabled,
} from "../shared/agent-control";
import { displayWindowSize, parseDisplayPreset, resolveFullWindow, croppedWindowSize } from "../shared/display-preset";
import { EDGE_SNAP_PX, snapRectToEdges } from "../shared/edge-snap";
import { popupWindowBounds, type PopupSide } from "../shared/ui-chrome";
import {
  fileUrlIfExists,
  loadAppConfig,
  loadMotionCatalog,
  pathToFileUrl,
  resolveRepoPath,
  saveAppConfig,
} from "./config";
import { startAgentControlServer, type AgentControlHandle, newIntentRequestId } from "./agent-control-server";
import { applyClickThrough, commitPetWindowSize, createPetWindow, preloadPath, rendererHtml } from "./window";
import { createTray } from "./tray";
import { applyLockedSize, movedBounds, placeAt, sameSize } from "./window-move";

process.on("uncaughtException", (error) => {
  console.error("[nori] uncaught exception:", error);
});
process.on("unhandledRejection", (reason) => {
  console.error("[nori] unhandled rejection:", reason);
});

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
let agentControl: AgentControlHandle | null = null;
let tray: Tray | null = null;

const pendingIntents = new Map<
  string,
  { resolve: (played?: AgentPlayedSummary) => void; reject: (error: Error) => void }
>();

function sendCommand(command: string | { type: "intent"; requestId: string } & AgentControlRequest): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    win.webContents.send("nori:command", command);
  }
}

function forwardAgentIntent(req: AgentControlRequest): Promise<AgentPlayedSummary | undefined> {
  const windows = BrowserWindow.getAllWindows().filter((win) => !win.isDestroyed());
  if (windows.length === 0) {
    return Promise.reject(new Error("renderer not ready"));
  }
  const requestId = newIntentRequestId();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingIntents.delete(requestId);
      reject(new Error("renderer timeout"));
    }, 4000);
    pendingIntents.set(requestId, {
      resolve: (played) => {
        clearTimeout(timer);
        pendingIntents.delete(requestId);
        resolve(played);
      },
      reject,
    });
    sendCommand({ type: "intent", requestId, ...req });
  });
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

  const fullWindow = resolveFullWindow(configState.config.window);
  if (fullWindow.width !== configState.config.window.width || fullWindow.height !== configState.config.window.height) {
    configState = {
      config: { ...configState.config, window: fullWindow },
      source: persistPath,
    };
    saveAppConfig(persistPath, configState.config);
  }
  const startSize = displayWindowSize(fullWindow, parseDisplayPreset(configState.config.displayPreset));
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
  let applyGen = 0;
  let menuOpen = false;
  let menuHeight = 0;
  let hudOn = false;
  let dragging = false;
  let dragOffset = { x: 0, y: 0 };
  let popupSide: PopupSide = "right";
  let stageBoundsBeforePopup: Electron.Rectangle | null = null;

  const beginApply = () => {
    applyingPreset = true;
    const gen = ++applyGen;
    return () => {
      setImmediate(() => {
        if (gen === applyGen) applyingPreset = false;
      });
    };
  };

  const applyWindowChrome = () => {
    if (win.isDestroyed() || dragging) return;
    const crop = croppedWindowSize(fullWindow, parseDisplayPreset(configState.config.displayPreset));
    let size = { width: crop.width, height: crop.height };
    let position: { x: number; y: number } | undefined;
    if (menuOpen) {
      const base = stageBoundsBeforePopup ?? { ...win.getBounds(), width: crop.width, height: crop.height };
      const stage = { ...base, width: crop.width, height: crop.height };
      stageBoundsBeforePopup = stage;
      const { bounds, side } = popupWindowBounds(stage, screen.getDisplayMatching(stage).workArea);
      size = { width: bounds.width, height: bounds.height };
      position = { x: bounds.x, y: bounds.y };
      popupSide = side;
    } else if (stageBoundsBeforePopup) {
      position = { x: stageBoundsBeforePopup.x, y: stageBoundsBeforePopup.y };
      stageBoundsBeforePopup = null;
    }
    lockedSize.width = size.width;
    lockedSize.height = size.height;
    const end = beginApply();
    commitPetWindowSize(win, lockedSize, position);
    end();
  };

  const restoreClickThrough = () => {
    if (win.isDestroyed()) return;
    if (menuOpen) {
      applyClickThrough(win, false);
      return;
    }
    applyClickThrough(win, configState.config.clickThrough);
  };

  win.on("will-resize", (event, newBounds) => {
    if (applyingPreset || sameSize(newBounds, lockedSize)) return;
    event.preventDefault();
  });

  win.on("resized", () => {
    if (win.isDestroyed() || applyingPreset || dragging) return;
    const bounds = win.getBounds();
    if (!sameSize(bounds, lockedSize)) {
      const end = beginApply();
      commitPetWindowSize(win, lockedSize);
      end();
    }
  });

  tray = createTray(ROOT, {
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
    if (patch && "edgeSnap" in patch) next.edgeSnap = patch.edgeSnap === true;
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

  ipcMain.handle(
    "nori:set-ui-chrome",
    (_event, state: { hudOn?: boolean; menuOpen?: boolean; menuHeight?: number }) => {
      if (typeof state?.hudOn === "boolean") hudOn = state.hudOn;
      if (typeof state?.menuOpen === "boolean") menuOpen = state.menuOpen;
      if (typeof state?.menuHeight === "number" && state.menuHeight > 0) menuHeight = state.menuHeight;
      applyWindowChrome();
      return { ...lockedSize, hudOn, menuOpen, menuHeight };
    },
  );

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
    if (win.isDestroyed()) return;
    if (configState.config.edgeSnap) {
      const bounds = win.getBounds();
      const snapped = snapRectToEdges(
        bounds,
        screen.getDisplayMatching(bounds).workArea,
        true,
        EDGE_SNAP_PX,
      );
      if (snapped.x !== bounds.x || snapped.y !== bounds.y) {
        const end = beginApply();
        win.setBounds(placeAt(snapped.x, snapped.y, lockedSize));
        end();
      }
    }
    applyWindowChrome();
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

  ipcMain.handle("nori:menu-open", (_e, open: boolean) => {
    menuOpen = Boolean(open);
    restoreClickThrough();
    applyWindowChrome();
    const crop = croppedWindowSize(fullWindow, parseDisplayPreset(configState.config.displayPreset));
    return {
      menuOpen,
      side: popupSide,
      width: lockedSize.width,
      height: lockedSize.height,
      stage: { width: crop.width, height: crop.height },
    };
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

  ipcMain.on("nori:intent-result", (_event, requestId: string, played: AgentPlayedSummary) => {
    pendingIntents.get(requestId)?.resolve(played);
  });

  if (isAgentControlEnabled()) {
    void startAgentControlServer({
      port: configState.config.agentControlPort,
      onIntent: forwardAgentIntent,
    })
      .then((handle) => {
        agentControl = handle;
        console.log(
          `[nori] agent control: ${handle.url} (127.0.0.1 only, no auth — local processes can drive motions)`,
        );
      })
      .catch((error) => {
        console.warn("[nori] agent control server failed to start", error);
      });
  }
});

app.on("before-quit", () => {
  tray?.destroy();
  tray = null;
  const handle = agentControl;
  agentControl = null;
  if (handle) void handle.close();
});

app.on("window-all-closed", () => {
  app.quit();
});
