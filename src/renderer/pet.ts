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
import { applyPreviewStageCrop, croppedWindowSize, parseDisplayPreset } from "./display-crop";
import { lerpParams, motionOffsets, paramsForClip, type ExpressionParams } from "./expression";
import { FallbackActor } from "./fallback-actor";
import { hudSnapshot, renderHud } from "./hud";
import { loadCubismCore, loadLive2DModel } from "./live2d-actor";
import { SCALE_MAX, SCALE_MIN, bindContextMenu, bodyMotionsForMenu } from "./menu";

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
  
  const syncStageCrop = () => {
    const stage = document.getElementById("stage");
    if (!stage) return;
    const size = croppedWindowSize(fullWindow, displayPreset);
    stage.style.width = `${size.width}px`;
    stage.style.height = `${size.height}px`;
    stage.style.overflow = "hidden";
    // Pixi layout follows stage/client size via resize listener.
  };

  if (preview) {
    applyPreviewStageCrop(fullWindow, displayPreset);
  }

  let actor: PetActor = new FallbackActor();
  app.stage.addChild(actor.view);
  actor.setBaseline(fullWindow.width, fullWindow.height);
  syncStageCrop();
  actor.layout(app.screen.width, app.screen.height);
  actor.setScale(boot.config.scale);

  if (boot.cubismCoreUrl && boot.modelUrl) {
    try {
      await loadCubismCore(boot.cubismCoreUrl);
      const live = await loadLive2DModel(boot.modelUrl, boot.motionsBaseUrl);
      app.stage.removeChild(actor.view);
      actor = live;
      app.stage.addChild(actor.view);
      actor.setBaseline(fullWindow.width, fullWindow.height);
      syncStageCrop();
      actor.layout(app.screen.width, app.screen.height);
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
    actor.layout(app.screen.width, app.screen.height);
  });

  const director = new MotionDirector(boot.catalog);
  const look = createLookState();
  let scale = boot.config.scale;
  let clickThrough = boot.config.clickThrough;
  let hudOn = boot.config.debugHud || preview;
  void bridge.setUiChrome?.({ hudOn });
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
    syncStageCrop();
    void bridge.setDisplayPreset(id).then(() => {
      actor.layout(app.screen.width, app.screen.height);
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

  const syncOverlay = () => {
    const overlay = !menuEl.hidden || chat.isOpen();
    bridge.setMenuOpen(overlay);
    if (overlay) bridge.setHoverOpaque(true);
  };

  const chat = bindChatBubble(chatEl, {
    onOpen: syncOverlay,
    onClose: syncOverlay,
    onReply: (_text, reply) => {
      beginPlay(intentFromChatReply(reply), "chat");
    },
  });

  bindContextMenu(
    document.body,
    menuEl,
    (command) => {
      if (command.type === "idle") play("menu-idle");
      if (command.type === "random") play("random");
      // chat UI disabled for now — keep stub for future Grok Bot
      // if (command.type === "chat") chat.open();
      if (command.type === "motion") playBodyId(command.id);
      if (command.type === "scale") applyScale(command.value, true);
      if (command.type === "display-preset") applyPreset(command.id);
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
        displayPreset,
        motions: bodyMotionsForMenu(boot.catalog.items),
      }),
      onOpen: () => {
        chat.close();
        bridge.setHoverOpaque(true);
        syncOverlay();
      },
      onClose: syncOverlay,
    },
  );

  bridge.onCommand((command) => {
    if (isAgentIntentCommand(command)) {
      const pair = beginPlay(intentFromAgentRequest(command), "agent");
      if (command.say) {
        console.info("[nori] agent say (chat UI deferred):", command.say);
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
    if (menuEl.hidden && !chat.isOpen()) bridge.setHoverOpaque(pointer.over);
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

  canvas.addEventListener("pointerleave", () => {
    pointer.over = false;
    if (!clickThrough) {
      pointer.x = -240;
      pointer.y = -240;
    }
    hoverSince = null;
    hoverFired = false;
    if (menuEl.hidden) bridge.setHoverOpaque(false);
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
    actor.layout(app.screen.width, app.screen.height);
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
