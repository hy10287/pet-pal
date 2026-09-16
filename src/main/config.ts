import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import type { AppConfig, MotionCatalog } from "../shared/types";
import { parseDisplayPreset, resolveFullWindow, clampUserScale } from "../shared/display-preset";
import { DEFAULT_AGENT_CONTROL_PORT, parseControlPort } from "../shared/agent-control";
import { parseCatalog } from "../emotion/catalog";

export const DEFAULT_CONFIG: AppConfig = {
  modelPath: "",
  cubismCorePath: "vendor/live2dcubismcore.min.js",
  motionsTagsPath: "fixtures/motions.tags.sample.json",
  motionsDir: "",
  scale: 1,
  clickThrough: false,
  debugHud: false,
  displayPreset: "balanced",
  edgeSnap: false,
  window: { width: 420, height: 560 },
  agentControlPort: DEFAULT_AGENT_CONTROL_PORT,
};


export function resolveRepoPath(root: string, value: string): string {
  if (!value) return "";
  return isAbsolute(value) ? value : join(root, value);
}

export function loadJson(path: string): unknown {
  const raw = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function mergeConfig(raw: unknown): AppConfig {
  const data = (raw ?? {}) as Partial<AppConfig>;
  const port = parseControlPort(data.agentControlPort, DEFAULT_AGENT_CONTROL_PORT);
  // 只有缺少 displayPreset 的旧配置才需要从"看起来像裁切高度"的值里恢复全身基线
  const legacyNoPreset = typeof data.displayPreset !== "string";
  return {
    ...DEFAULT_CONFIG,
    ...data,
    window: legacyNoPreset
      ? resolveFullWindow({ ...DEFAULT_CONFIG.window, ...(data.window ?? {}) })
      : { ...DEFAULT_CONFIG.window, ...(data.window ?? {}) },
    scale: clampUserScale(Number(data.scale) || 1),
    displayPreset: parseDisplayPreset(data.displayPreset),
    edgeSnap: data.edgeSnap === true,
    agentControlPort: port.ok ? port.value : DEFAULT_AGENT_CONTROL_PORT,
  };
}

export function loadAppConfig(root: string, userData?: string): { config: AppConfig; source: string } {
  const candidates = [
    userData ? join(userData, "app.config.json") : "",
    join(root, "config", "local.json"),
    join(root, "config", "app.config.json"),
  ].filter(Boolean);

  for (const source of candidates) {
    if (!existsSync(source)) continue;
    return { config: mergeConfig(loadJson(source)), source };
  }
  return { config: { ...DEFAULT_CONFIG }, source: "defaults" };
}

export function saveAppConfig(target: string, config: AppConfig): void {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export function loadMotionCatalog(root: string, config: AppConfig): MotionCatalog {
  const catalogPath = resolveRepoPath(root, config.motionsTagsPath);
  if (!catalogPath || !existsSync(catalogPath)) {
    throw new Error(`motions.tags.json not found: ${catalogPath || "(empty path)"}`);
  }
  return parseCatalog(loadJson(catalogPath));
}

export function fileUrlIfExists(path: string): string | null {
  if (!path || !existsSync(path)) return null;
  return pathToFileUrl(path);
}

export function pathToFileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  if (/^[A-Za-z]:/.test(normalized)) {
    return `file:///${normalized}`;
  }
  return `file://${normalized.startsWith("/") ? "" : "/"}${normalized}`;
}
