import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
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

/** Local Live2D folder used for placeholder/model tests on this Windows machine. */
export const LOCAL_TEST_MODEL_DIR = "C:/Users/33166/Desktop/新建文件夹 (3)";

export function resolveRepoPath(root: string, value: string): string {
  if (!value) return "";
  return isAbsolute(value) ? value : join(root, value);
}

/** Pick a Cubism 4 `.model3.json` — `path` may be the file or a containing folder. */
export function findModel3Json(path: string, depth = 0): string {
  if (!path || !existsSync(path) || depth > 4) return "";
  let st;
  try {
    st = statSync(path);
  } catch {
    return "";
  }
  if (st.isFile()) {
    return path.toLowerCase().endsWith(".model3.json") ? path : "";
  }
  if (!st.isDirectory()) return "";
  let names: string[] = [];
  try {
    names = readdirSync(path);
  } catch {
    return "";
  }
  const direct = names.filter((name) => name.toLowerCase().endsWith(".model3.json")).sort();
  if (direct[0]) return join(path, direct[0]);
  for (const name of names.sort()) {
    if (name.startsWith(".")) continue;
    const child = join(path, name);
    const found = findModel3Json(child, depth + 1);
    if (found) return found;
  }
  return "";
}

/**
 * Resolve the Live2D model file: config path, NORI_MODEL_PATH, or the local test folder
 * if it exists. A directory is scanned for `.model3.json`.
 */
export function resolveLive2DModelFile(root: string, configuredPath: string): string {
  const fromEnv = (process.env.NORI_MODEL_PATH ?? "").trim();
  const inputs = [configuredPath, fromEnv, LOCAL_TEST_MODEL_DIR];
  for (const item of inputs) {
    const resolved = resolveRepoPath(root, item);
    const found = findModel3Json(resolved);
    if (found) return found;
  }
  return "";
}

export function loadJson(path: string): unknown {
  const raw = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function mergeConfig(raw: unknown): AppConfig {
  const data = (raw ?? {}) as Partial<AppConfig>;
  const port = parseControlPort(data.agentControlPort, DEFAULT_AGENT_CONTROL_PORT);
  return {
    ...DEFAULT_CONFIG,
    ...data,
    window: resolveFullWindow({ ...DEFAULT_CONFIG.window, ...(data.window ?? {}) }),
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
