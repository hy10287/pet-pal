import { existsSync, readFileSync, unwatchFile, watchFile } from "node:fs";
import { join } from "node:path";
import type { BrowserWindow } from "electron";
import { DEFAULT_TIPS, parseTips, type TipsConfig } from "../tips/schema";

let cache: TipsConfig = DEFAULT_TIPS;
let lastWarnedMtime = -1;

function tipsFile(root: string): string {
  return join(root, "config", "tips.json");
}

function parseTipsFile(path: string): TipsConfig | null {
  try {
    const raw = JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
    const parsed = parseTips(raw);
    return parsed.ok ? parsed.value : null;
  } catch {
    return null;
  }
}

export function loadTips(root: string): TipsConfig {
  const path = tipsFile(root);
  if (!existsSync(path)) {
    cache = DEFAULT_TIPS;
    return cache;
  }
  const next = parseTipsFile(path);
  if (next) {
    cache = next;
    return cache;
  }
  cache = DEFAULT_TIPS;
  console.warn("[nori] tips.json parse failed; using DEFAULT_TIPS");
  return cache;
}

export function getTips(): TipsConfig {
  return cache;
}

export function startTipsWatcher(root: string, win: BrowserWindow): () => void {
  const path = tipsFile(root);
  const onChange = (curr: { mtimeMs: number }, prev: { mtimeMs: number }) => {
    if (curr.mtimeMs === prev.mtimeMs) return;
    if (!existsSync(path)) {
      cache = DEFAULT_TIPS;
      if (!win.isDestroyed()) win.webContents.send("nori:tips-changed", cache);
      return;
    }
    const next = parseTipsFile(path);
    if (next) {
      cache = next;
      lastWarnedMtime = -1;
      if (!win.isDestroyed()) win.webContents.send("nori:tips-changed", cache);
      return;
    }
    if (curr.mtimeMs !== lastWarnedMtime) {
      lastWarnedMtime = curr.mtimeMs;
      console.warn("[nori] tips.json parse failed; keeping previous table");
    }
  };
  watchFile(path, { interval: 5000 }, onChange);
  return () => unwatchFile(path, onChange);
}
