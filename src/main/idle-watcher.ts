import { powerMonitor, type BrowserWindow } from "electron";
import { pickText, renderTemplate } from "../tips/message-center";
import { nextIdleState, type IdleState } from "../tips/idle-policy";
import type { TipsConfig } from "../tips/schema";

const TICK_MS = 10_000;

export function startIdleWatcher(
  win: BrowserWindow,
  getTips: () => TipsConfig,
  getVars: () => Record<string, string>,
): () => void {
  let state: IdleState = { firedCount: 0, lastFiredAtMs: null };
  const tick = () => {
    if (win.isDestroyed()) return;
    const tips = getTips();
    const idleSec = powerMonitor.getSystemIdleTime();
    const nowMs = Date.now();
    const next = nextIdleState(tips.idle, state, idleSec, nowMs);
    state = next.state;
    if (!next.fire) return;
    const text = pickText(tips.idle.text);
    if (!text) return;
    win.webContents.send("nori:tip", {
      text: renderTemplate(text, { ...getVars(), idle: String(idleSec) }),
      timeoutMs: tips.idle.timeoutMs,
      priority: tips.idle.priority,
      override: true,
      passive: true,
    });
  };
  const timer = setInterval(tick, TICK_MS);
  return () => clearInterval(timer);
}
