import { Application, Graphics } from "pixi.js";
import { MotionDirector } from "../emotion/director";
import { intentFromChatReply } from "../interaction/chat-stub";
import {
  PAT_RELEASE_IDLE_MS,
  patFaceBoost,
  patStrokeAmount,
  resolvePointerGesture,
  type PointerGesture,
} from "../interaction/head-pat";
import { isHeadZone } from "../interaction/hit-zones";
import { createLookState, gazeFromPointer, settleLook, updateLook } from "../interaction/mouse-follow";
import { routeInteraction } from "../interaction/router";
import {
  intentFromAgentRequest,
  isAgentIntentCommand,
  summarizePlayed,
} from "../shared/agent-control";
import type { DisplayPresetId, EmotionIntent, InteractionKind } from "../shared/types";
import { pacedDurationSec } from "../shared/motion-pace";
import type { PetActor } from "./actor";
import { getBootstrap, getBridge } from "./bridge";
import { bindChatBubble, ensureChatRoot } from "./chat-bubble";
import { applyPreviewStageCrop, applyStageCrop, parseDisplayPreset } from "./display-crop";
import { lerpParams, motionOffsets, paramsForClip, type ExpressionParams } from "./expression";
import { FallbackActor } from "./fallback-actor";
import { hudSnapshot, renderHud } from "./hud";
import { loadCubismCore, loadLive2DModel } from "./live2d-actor";
import { SCALE_MAX, SCALE_MIN, bindContextMenu, bodyMotionsForMenu } from "./menu";
import { croppedWindowSize, displayWindowSize } from "../shared/display-preset";
import { faceSafeRect } from "../shared/ui-chrome";
import { TipBubbleController } from "../tips/message-center";
import type { TipsConfig } from "../tips/schema";
import { tipForInteraction } from "../tips/triggers";
import { bindTipBubble } from "./tip-bubble";

const HOVER_DWELL_MS = 1200;
const DOUBLE_MS = 320;

async function main(): Promise<void> {
  const boot = await getBootstrap();
  const bridge = getBridge();
  const stageEl = document.getElementById("stage") as HTMLElement;
  const hudEl = document.getElementById("hud") as HTMLElement;
  const menuEl = document.getElementById("menu") as HTMLElement;
  const chatEl = ensureChatRoot(document.getElementById("chat"));
  const noticeEl = document.getElementById("notice") as HTMLElement;
  const tipEl = document.getElementById("tip") as HTMLElement;
  const preview = boot.preview || !boot.isElectron;

  document.body.classList.toggle("preview", preview);

  const app = new Application({
    resizeTo: stageEl,
    backgroundAlpha: preview ? 1 : 0,
    backgroundColor: 0x1a2230,
    antialias: true,
    resolution: Math.min(2, window.devicePixelRatio || 1),
    autoDensity: true,
  });
  stageEl.appendChild(app.view as HTMLCanvasElement);

  if (preview) {
    drawDesk(app);
  }

  const fullWindow = {
    width: boot.config.window.width,
    height: boot.config.window.height,
  };
  let displayPreset: DisplayPresetId = parseDisplayPreset(boot.config.displayPreset);

  if (preview) {
    applyPreviewStageCrop(fullWindow, displayPreset);
  }

  let actor: PetActor = new FallbackActor();

  const layoutToCrop = () => {
    const size = applyStageCrop(stageEl, fullWindow, displayPreset);
    if (preview) {
      document.body.style.width = `${size.width}px`;
      document.body.style.height = `${size.height}px`;
    }
    if (
      Math.abs(app.screen.width - size.width) > 0.5 ||
      Math.abs(app.screen.height - size.height) > 0.5
    ) {
      app.renderer.resize(size.width, size.height);
    }
    actor.layout(size.width, size.height);
  };

  app.stage.addChild(actor.view);
  actor.setBaseline(fullWindow.width, fullWindow.height);
  layoutToCrop();
  actor.setScale(boot.config.scale);

  if (boot.cubismCoreUrl && boot.modelUrl) {
    try {
      await loadCubismCore(boot.cubismCoreUrl);
      const live = await loadLive2DModel(boot.modelUrl, boot.motionsBaseUrl);
      app.stage.removeChild(actor.view);
      actor = live;
      app.stage.addChild(actor.view);
      actor.setBaseline(fullWindow.width, fullWindow.height);
      layoutToCrop();
      actor.setScale(boot.config.scale);
      noticeEl.hidden = true;
    } catch (error) {
      console.warn("[nori] Live2D load failed, using fallback actor", error);
      noticeEl.textContent = "Live2D 未就绪：已使用内置占位角色。请按 README 放置 Cubism Core 与官方 Sample 模型。";
      noticeEl.hidden = false;
    }
  } else {
    noticeEl.textContent = preview
      ? "预览模式 · 内置占位角色（未捆绑版权模型）。配置 Cubism Core + Hiyori 等官方 Sample 后即可切换 Live2D。"
      : "未找到 Cubism Core 或模型路径。当前为占位角色，交互与 retrieve() 仍可用。";
    noticeEl.hidden = false;
  }

  requestAnimationFrame(() => {
    layoutToCrop();
  });

  const director = new MotionDirector(boot.catalog);
  const look = createLookState();
  let scale = boot.config.scale;
  let clickThrough = boot.config.clickThrough;
  let edgeSnap = boot.config.edgeSnap === true;
  let hudOn = boot.config.debugHud || preview;
  let settingsOpen = false;
  document.body.classList.toggle("hud-on", hudOn);
  void bridge.setUiChrome?.({ hudOn });

  const tipsRef: { current: TipsConfig } = { current: await bridge.getTips() };
  bridge.onTipsChanged((next) => {
    tipsRef.current = next;
  });
  const currentVars = (): Record<string, string> => {
    const now = new Date();
    const file = (boot.config.modelPath || "").replace(/\\/g, "/").split("/").pop() ?? "";
    const model = file.replace(/\.[^.]+$/, "") || "nori";
    return {
      hour: String(now.getHours()),
      year: String(now.getFullYear()),
      model,
    };
  };
  const tipUi = bindTipBubble(tipEl);
  const tipController = new TipBubbleController(
    { show: (text, timeoutMs) => tipUi.show(text, timeoutMs), hide: () => tipUi.hide() },
    () => tipsRef.current.quietHours,
  );
  bridge.onTip((msg) => {
    tipController.push(msg, currentVars());
  });
  const syncTipSuppress = () => {
    tipUi.setSuppressed(settingsOpen || menuEl.hidden === false);
  };
  let currentParams: ExpressionParams = paramsForClip(null, null);
  let targetParams: ExpressionParams = currentParams;
  let playStartedAt = 0;
  let playDuration = 1;
  let lastMotion = motionOffsets(null, 0);
  let pointer = { x: app.screen.width / 2, y: app.screen.height / 2, over: false };
  let hoverSince: number | null = null;
  let hoverFired = false;
  let gesture: PointerGesture = "none";
  let downButton = 0;
  let downZone: "head" | "face" | "body" | "empty" = "empty";
  let dragOrigin = { x: 0, y: 0 };
  let dragActive = false;
  let patStroke = 0;
  let patPlayed = false;
  let patIdleTimer: number | undefined;
  let lastClickAt = 0;
  let lastHud = "";
  let saveScaleTimer: number | undefined;

  const hudState = () => director.debug(scale, clickThrough, actor.kind, actor.lastMotionSource());
  const syncHud = (force = false) => {
    const next = hudSnapshot(hudState());
    if (!force && next === lastHud && !hudEl.hidden === hudOn) return;
    lastHud = next;
    renderHud(hudEl, hudState(), hudOn);
    document.body.classList.toggle("hud-on", hudOn);
  };

  const applyScale = (next: number, persist: boolean) => {
    const clamped = Math.max(SCALE_MIN, Math.min(SCALE_MAX, next));
    if (clamped === scale && persist) return;
    scale = clamped;
    actor.setScale(scale);
    syncHud(true);
    if (!persist) return;
    window.clearTimeout(saveScaleTimer);
    saveScaleTimer = window.setTimeout(() => {
      void bridge.saveConfig({ scale });
    }, 180);
  };

  const applyPreset = (id: DisplayPresetId) => {
    displayPreset = id;
    layoutToCrop();
    void bridge.setDisplayPreset(id).then(() => {
      layoutToCrop();
      syncChrome();
    });
  };

  const beginPlay = (intent: EmotionIntent, kind: InteractionKind) => {
    const pair = director.play(intent, kind);
    targetParams = paramsForClip(pair.face ?? pair.body, intent);
    playStartedAt = performance.now();
    playDuration = pacedDurationSec(Math.max(pair.face?.duration ?? 0, pair.body?.duration ?? 0, 1.2)) * 1000;
    lastMotion = motionOffsets(pair.body ?? pair.face, 0);
    void actor.playClips(pair.face, pair.body).then(() => syncHud(true));
    syncHud(true);
    if (
      kind === "head-click" ||
      kind === "head-pat" ||
      kind === "body-click" ||
      kind === "hover-dwell" ||
      kind === "double-click"
    ) {
      if (kind === "hover-dwell" && clickThrough) return pair;
      const msg = tipForInteraction(tipsRef.current, kind, currentVars());
      if (msg) tipController.push(msg, currentVars());
    }
    return pair;
  };

  const play = (kind: InteractionKind) => {
    beginPlay(routeInteraction(kind), kind);
  };

  const playBodyId = (id: string) => {
    const body = boot.catalog.items.find((item) => item.id === id && item.layer === "body");
    if (!body) return;
    const pair = director.playChosenBody(body, "menu-motion");
    targetParams = paramsForClip(pair.face ?? pair.body, pair.intent);
    playStartedAt = performance.now();
    playDuration = pacedDurationSec(Math.max(pair.face?.duration ?? 0, pair.body?.duration ?? 0, 1.2)) * 1000;
    lastMotion = motionOffsets(pair.body, 0);
    void actor.playClips(pair.face, pair.body).then(() => syncHud(true));
    syncHud(true);
  };

  play("idle");

  const chat = bindChatBubble(chatEl, {
    onOpen: () => {
      bridge.setHoverOpaque(true);
      bridge.setMenuOpen(settingsOpen);
    },
    onClose: () => syncChrome(),
    onReply: (_text, reply) => {
      beginPlay(intentFromChatReply(reply), "chat");
    },
  });

  const syncChrome = () => {
    if (preview) {
      const size = displayWindowSize(fullWindow, displayPreset, { menuOpen: settingsOpen });
      document.body.style.width = `${size.width}px`;
      document.body.style.height = `${size.height}px`;
    }
    bridge.setMenuOpen(settingsOpen);
    if (settingsOpen || chat.isOpen()) bridge.setHoverOpaque(true);
  };

  const settings = bindContextMenu(
    document.body,
    menuEl,
    (command) => {
      if (command.type === "idle") play("menu-idle");
      if (command.type === "random") play("random");
      // chat UI disabled — do not restore Grok Bot
      if (command.type === "motion") playBodyId(command.id);
      if (command.type === "scale") applyScale(command.value, true);
      if (command.type === "display-preset") applyPreset(command.id);
      if (command.type === "toggle-edge-snap") {
        edgeSnap = !edgeSnap;
        void bridge.saveConfig({ edgeSnap });
      }
      if (command.type === "capture") void bridge.capture();
      if (command.type === "hide-for-day") void bridge.hideForDay();
      if (command.type === "toggle-hud") {
        hudOn = !hudOn;
        void bridge.setUiChrome?.({ hudOn });
        void bridge.saveConfig({ debugHud: hudOn });
        syncHud(true);
      }
      if (command.type === "toggle-click-through") {
        clickThrough = !clickThrough;
        void bridge.setClickThrough(clickThrough);
        void bridge.saveConfig({ clickThrough });
        syncHud(true);
      }
      if (command.type === "quit") bridge.quit();
    },
    {
      getState: () => ({
        scale,
        hudOn,
        clickThrough,
        edgeSnap,
        displayPreset,
        motions: bodyMotionsForMenu(boot.catalog.items),
      }),
      faceRect: () => faceSafeRect(croppedWindowSize(fullWindow, displayPreset)),
      isBusy: () => dragActive,
      onOpen: () => {
        settingsOpen = true;
        chat.close();
        syncChrome();
        syncTipSuppress();
      },
      onClose: () => {
        settingsOpen = false;
        syncChrome();
        syncTipSuppress();
      },
    },
  );

  menuEl.addEventListener("pointerenter", () => bridge.setHoverOpaque(true));
  menuEl.addEventListener("pointerleave", () => {
    if (!settingsOpen) bridge.setHoverOpaque(false);
  });
  syncChrome();

  bridge.onCommand((command) => {
    if (isAgentIntentCommand(command)) {
      const pair = beginPlay(intentFromAgentRequest(command), "agent");
      if (command.say) {
        tipController.push(
          { text: command.say, priority: 10, timeoutMs: 6000, passive: false },
          currentVars(),
        );
      }
      bridge.reportIntent(command.requestId, summarizePlayed(pair, command.say));
      return;
    }
    if (command === "idle") play("menu-idle");
    if (command === "random") play("random");
    if (command === "toggle-hud") {
      hudOn = !hudOn;
      void bridge.setUiChrome?.({ hudOn });
      void bridge.saveConfig({ debugHud: hudOn });
      syncHud(true);
    }
    if (command === "toggle-click-through") {
      clickThrough = !clickThrough;
      void bridge.setClickThrough(clickThrough);
      syncHud(true);
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "h" || event.key === "H") {
      hudOn = !hudOn;
      void bridge.setUiChrome?.({ hudOn });
      void bridge.saveConfig({ debugHud: hudOn });
      syncHud(true);
    }
  });

  const canvas = app.view as HTMLCanvasElement;
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 && event.button !== 1) return;
    gesture = "none";
    dragActive = false;
    patPlayed = false;
    patStroke = 0;
    downButton = event.button;
    downZone = actor.hitTest(event.clientX, event.clientY);
    dragOrigin = { x: event.screenX, y: event.screenY };
    window.clearTimeout(patIdleTimer);
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    pointer = { x: event.clientX, y: event.clientY, over: actor.contains(event.clientX, event.clientY) };
    if (!settingsOpen && !chat.isOpen()) bridge.setHoverOpaque(pointer.over);
    const held = downButton === 1 ? (event.buttons & 4) === 4 : (event.buttons & 1) === 1;
    if (held) {
      const dx = event.screenX - dragOrigin.x;
      const dy = event.screenY - dragOrigin.y;
      gesture = resolvePointerGesture({
        button: downButton,
        downZone,
        dx,
        dy,
        decided: gesture,
      });
      if (gesture === "head-pat") {
        patStroke = Math.max(patStroke, patStrokeAmount(dx));
        if (!patPlayed) {
          patPlayed = true;
          play("head-pat");
        }
      } else if (gesture === "window-drag") {
        if (!dragActive) {
          dragActive = true;
          bridge.dragStart?.();
        }
        bridge.dragMove?.();
        dragOrigin = { x: event.screenX, y: event.screenY };
      }
    }
    if (pointer.over) {
      if (hoverSince == null) hoverSince = performance.now();
    } else {
      hoverSince = null;
      hoverFired = false;
    }
  });

  canvas.addEventListener("pointerup", (event) => {
    if (event.button !== 0 && event.button !== 1) return;
    const ended = gesture;
    gesture = "none";
    if (ended === "window-drag" || dragActive) {
      dragActive = false;
      bridge.dragEnd?.();
      return;
    }
    if (performance.now() - settings.lastClosedAt() < 400) {
      return;
    }
    if (ended === "head-pat") {
      patIdleTimer = window.setTimeout(() => {
        play("idle");
      }, PAT_RELEASE_IDLE_MS);
      patStroke = 0;
      return;
    }
    if (event.button !== 0) return;
    const zone = downZone !== "empty" ? downZone : actor.hitTest(event.clientX, event.clientY);
    if (zone === "empty") return;
    hoverFired = true;
    hoverSince = performance.now();
    const now = performance.now();
    if (now - lastClickAt < DOUBLE_MS) {
      play("double-click");
      lastClickAt = 0;
      return;
    }
    lastClickAt = now;
    if (!isHeadZone(zone)) {
      play("body-click"); // chat disabled
      return;
    }
    window.setTimeout(() => {
      if (lastClickAt !== now) return;
      play("head-click");
    }, DOUBLE_MS);
  });

  canvas.addEventListener("pointercancel", () => {
    if (dragActive) {
      dragActive = false;
      bridge.dragEnd?.();
    }
    gesture = "none";
  });

  canvas.addEventListener("pointerleave", (event) => {
    pointer.over = false;
    if (!clickThrough) {
      pointer.x = -240;
      pointer.y = -240;
    }
    hoverSince = null;
    hoverFired = false;
    const to = event.relatedTarget as Node | null;
    if (menuEl.contains(to)) return;
    if (!settingsOpen && !chat.isOpen()) bridge.setHoverOpaque(false);
  });

  // Wheel zoom is intentionally not restored.

  let cursorPollAt = 0;
  app.ticker.add(() => {
    const dt = app.ticker.deltaMS / 1000;
    const now = performance.now();
    if (clickThrough && now - cursorPollAt > 32) {
      cursorPollAt = now;
      void bridge.getCursorLocal().then((cursor) => {
        if (!cursor?.near) {
          pointer = { x: -400, y: -400, over: false };
          return;
        }
        pointer = { x: cursor.x, y: cursor.y, over: actor.contains(cursor.x, cursor.y) };
      });
    }
    const gaze = gazeFromPointer(pointer.x, pointer.y, app.screen.width, app.screen.height);
    if (gaze) updateLook(look, gaze, dt);
    else settleLook(look, dt);

    if (
      pointer.over &&
      hoverSince != null &&
      !hoverFired &&
      gesture === "none" &&
      now - hoverSince >= HOVER_DWELL_MS &&
      !director.isBusy()
    ) {
      hoverFired = true;
      play("hover-dwell");
    }

    if (director.shouldIdle()) {
      play("idle");
    }

    const t = Math.min(1, (now - playStartedAt) / Math.max(1, playDuration));
    const ease = t < 1 ? 1 - Math.pow(1 - t, 2) : 1;
    const toward = t < 0.82 ? targetParams : paramsForClip(null, null);
    currentParams = lerpParams(currentParams, toward, Math.min(1, dt / 0.22) * (t < 0.82 ? 1 : 0.55));
    const shown = { ...currentParams };
    if (gesture === "head-pat") {
      for (const [key, value] of Object.entries(patFaceBoost(patStroke))) {
        shown[key] = (shown[key] ?? 0) + value;
      }
    }
    const pair = director.playing;
    lastMotion = motionOffsets(pair?.body ?? pair?.face ?? null, ease);
    actor.update(dt, look, shown, lastMotion);
    syncHud();
  });

  window.addEventListener("resize", () => {
    if (gesture === "window-drag") return;
    layoutToCrop();
  });
}

function drawDesk(app: Application): void {
  const g = new Graphics();
  const paint = () => {
    g.clear();
    g.beginFill(0x1a2230);
    g.drawRect(0, 0, app.screen.width, app.screen.height);
    g.endFill();
    g.beginFill(0x243044);
    g.drawRect(0, app.screen.height * 0.72, app.screen.width, app.screen.height);
    g.endFill();
    g.lineStyle(1, 0x2f3d55, 0.45);
    for (let x = 0; x < app.screen.width; x += 28) {
      g.moveTo(x, 0);
      g.lineTo(x, app.screen.height);
    }
    for (let y = 0; y < app.screen.height; y += 28) {
      g.moveTo(0, y);
      g.lineTo(app.screen.width, y);
    }
  };
  paint();
  app.stage.addChildAt(g, 0);
  window.addEventListener("resize", paint);
}

void main().catch((error) => {
  console.error(error);
});
