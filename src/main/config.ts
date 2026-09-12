import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import type { AppConfig, MotionCatalog } from "../shared/types";
import { parseDisplayPreset } from "../shared/display-preset";
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
  window: { width: 420, height: 560 },
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
  return {
    ...DEFAULT_CONFIG,
    ...data,
    window: { ...DEFAULT_CONFIG.window, ...(data.window ?? {}) },
    scale: Math.max(0.6, Math.min(1.8, Number(data.scale) || 1)),
    displayPreset: parseDisplayPreset(data.displayPreset),
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
