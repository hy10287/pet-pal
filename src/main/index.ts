import { BrowserWindow, app, dialog, ipcMain, screen } from "electron";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AppConfig, BootstrapPayload, DisplayPresetId } from "../shared/types";
import {
  type AgentControlRequest,
  type AgentPlayedSummary,
  isAgentControlEnabled,
} from "../shared/agent-control";
import { displayWindowSize, parseDisplayPreset, resolveFullWindow } from "../shared/display-preset";
import { EDGE_SNAP_PX, snapRectToEdges } from "../shared/edge-snap";
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
import { applyTrayMenu, createTray } from "./tray";
import { applyLockedSize, movedBounds, placeAt, sameSize } from "./window-move";
import { startIdleWatcher } from "./idle-watcher";
import { getTips, loadTips, startTipsWatcher } from "./tips-store";
import { startupGreeting } from "../tips/triggers";
import { renderTemplate } from "../tips/message-center";

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
let stopTipsRuntime: (() => void) | null = null;

function hiddenUntilPath(): string {
  return join(app.getPath("userData"), "hidden-until.json");
}

function readHiddenUntil(): number {
  try {
    const raw = JSON.parse(readFileSync(hiddenUntilPath(), "utf8")) as { until?: unknown };
    const until = Number(raw.until);
    return Number.isFinite(until) ? until : 0;
  } catch {
    return 0;
  }
}

function writeHiddenUntil(until: number): void {
  writeFileSync(hiddenUntilPath(), `${JSON.stringify({ until })}\n`, "utf8");
}

const pendingIntents = new Map<string, (played?: AgentPlayedSummary) => void>();

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
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingIntents.delete(requestId);
      resolve(undefined);
    }, 4000);
    pendingIntents.set(requestId, (played) => {
      clearTimeout(timer);
      pendingIntents.delete(requestId);
      resolve(played);
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
  loadTips(ROOT);

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
    const size = displayWindowSize(fullWindow, parseDisplayPreset(configState.config.displayPreset), {
      hudOn,
      menuOpen,
      menuHeight,
    });
    lockedSize.width = size.width;
    lockedSize.height = size.height;
    const next = applyLockedSize(win.getBounds(), lockedSize);
    const end = beginApply();
    commitPetWindowSize(win, lockedSize, next);
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

  const sendCaptureTip = (ok: boolean) => {
    if (win.isDestroyed()) return;
    const key = ok ? "capture-ok" : "capture-fail";
    const raw = getTips().reactions[key][0]?.text[0];
    if (!raw) return;
    win.webContents.send("nori:tip", {
      text: renderTemplate(raw, tipVars()),
      timeoutMs: 4000,
      priority: 9,
      passive: false,
    });
  };

  const capturePet = async () => {
    try {
      const png = (await win.webContents.capturePage()).toPNG();
      const pictures = app.getPath("pictures");
      const result = await dialog.showSaveDialog(win, {
        defaultPath: join(pictures, `nori-${Date.now()}.png`),
      });
      if (result.canceled || !result.filePath) return;
      writeFileSync(result.filePath, png);
      sendCaptureTip(true);
    } catch {
      sendCaptureTip(false);
    }
  };

  const hideForDay = () => {
    writeHiddenUntil(Date.now() + 86_400_000);
    if (!win.isDestroyed()) win.hide();
    applyTrayMenu(tray, trayActions, true);
  };

  const showPet = () => {
    writeHiddenUntil(0);
    if (!win.isDestroyed()) {
      win.show();
      win.moveTop();
    }
    applyTrayMenu(tray, trayActions, false);
  };

  const trayActions = {
    idle: () => sendCommand("idle"),
    random: () => sendCommand("random"),
    toggleHud: () => sendCommand("toggle-hud"),
    toggleClickThrough: () => sendCommand("toggle-click-through"),
    quit: () => app.quit(),
    capture: () => {
      void capturePet();
    },
    hideForDay,
    showPet,
  };

  const tray = createTray(ROOT, trayActions, readHiddenUntil() > Date.now());

  const tipVars = (): Record<string, string> => {
    const now = new Date();
    const file = (configState.config.modelPath || "").replace(/\\/g, "/").split("/").pop() ?? "";
    const model = file.replace(/\.[^.]+$/, "") || "nori";
    return {
      hour: String(now.getHours()),
      year: String(now.getFullYear()),
      model,
    };
  };
  const stopWatch = startTipsWatcher(ROOT, win);
  const stopIdle = startIdleWatcher(win, getTips, tipVars);
  stopTipsRuntime = () => {
    stopWatch();
    stopIdle();
  };
  win.webContents.on("did-finish-load", () => {
    setTimeout(() => {
      if (win.isDestroyed()) return;
      const now = new Date();
      const greet = startupGreeting(
        getTips(),
        { month: now.getMonth() + 1, day: now.getDate(), hour: now.getHours(), year: now.getFullYear() },
        tipVars(),
      );
      if (greet) win.webContents.send("nori:tip", greet);
    }, 300);
  });
  win.on("ready-to-show", () => {
    if (readHiddenUntil() > Date.now() && !win.isDestroyed()) win.hide();
  });

  ipcMain.handle("nori:bootstrap", () => bootstrapPayload());
  ipcMain.handle("nori:tips:get", () => getTips());
  ipcMain.handle("nori:capture", () => capturePet());
  ipcMain.handle("nori:hide-for-day", () => {
    hideForDay();
  });

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

  ipcMain.on("nori:menu-open", (_event, open: boolean, height?: number) => {
    menuOpen = Boolean(open);
    if (typeof height === "number" && height > 0) menuHeight = height;
    if (!menuOpen) menuHeight = 0;
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

  ipcMain.on("nori:intent-result", (_event, requestId: string, played: AgentPlayedSummary) => {
    pendingIntents.get(requestId)?.(played);
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
  stopTipsRuntime?.();
  stopTipsRuntime = null;
  const handle = agentControl;
  agentControl = null;
  if (handle) void handle.close();
});

app.on("window-all-closed", () => {
  app.quit();
});
