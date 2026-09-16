export interface TipGroup {
  priority: number;
  timeoutMs: number;
  override?: boolean;
  text: string[];
}

export interface IdleConfig {
  text: string[];
  firstIdleSec: number;
  repeatEverySec: number;
  timeoutMs: number;
  priority: number;
}

export type ReactionKey =
  | "head-click"
  | "head-pat"
  | "body-click"
  | "hover-dwell"
  | "double-click"
  | "capture-ok"
  | "capture-fail"
  | "agent";

export interface TipsConfig {
  schemaVersion: 1;
  quietHours: string[];
  idle: IdleConfig;
  time: { hour: string; text: string[] }[];
  seasons: { date: string; text: string[] }[];
  welcome: string[];
  reactions: Record<ReactionKey, TipGroup[]>;
}

export type ParseTipsResult = { ok: true; value: TipsConfig } | { ok: false; error: string };

const HOUR_RE = /^\d{1,2}(-\d{1,2})?$/;
const DATE_RE = /^\d{2}\/\d{2}-\d{2}\/\d{2}$/;
const QUIET_RE = /^\d{1,2}-\d{1,2}$/;

const REACTION_KEYS: readonly ReactionKey[] = [
  "head-click",
  "head-pat",
  "body-click",
  "hover-dwell",
  "double-click",
  "capture-ok",
  "capture-fail",
  "agent",
];

const IDLE_DEFAULTS = {
  firstIdleSec: 300,
  repeatEverySec: 1800,
  timeoutMs: 6000,
  priority: 9,
} as const;

function emptyReactions(): Record<ReactionKey, TipGroup[]> {
  return {
    "head-click": [],
    "head-pat": [],
    "body-click": [],
    "hover-dwell": [],
    "double-click": [],
    "capture-ok": [],
    "capture-fail": [],
    agent: [],
  };
}

function defaultReaction(text: string[], extra?: Partial<TipGroup>): TipGroup[] {
  return [{ priority: 9, timeoutMs: 4000, ...extra, text }];
}

/** 代码内置兜底表（§4.2），文件缺失/不可用时使用。 */
export const DEFAULT_TIPS: TipsConfig = {
  schemaVersion: 1,
  quietHours: ["23-7"],
  idle: {
    text: ["要休息一下吗？", "我在这儿，慢慢来。"],
    firstIdleSec: IDLE_DEFAULTS.firstIdleSec,
    repeatEverySec: IDLE_DEFAULTS.repeatEverySec,
    timeoutMs: IDLE_DEFAULTS.timeoutMs,
    priority: IDLE_DEFAULTS.priority,
  },
  time: [],
  seasons: [],
  welcome: ["今天也在这里。"],
  reactions: {
    "head-click": defaultReaction(["嗯？"]),
    "head-pat": defaultReaction(["头发要被摸乱啦。"]),
    "body-click": defaultReaction(["怎么了？"]),
    "hover-dwell": defaultReaction(["在看什么？"], { priority: 8, override: false }),
    "double-click": defaultReaction(["哇，吓我一跳。"], { timeoutMs: 3000, priority: 10 }),
    "capture-ok": defaultReaction(["已保存截图。"]),
    "capture-fail": defaultReaction(["截图保存失败。"]),
    agent: [],
  },
};

function asTextList(raw: unknown): string[] {
  const items = typeof raw === "string" ? [raw] : Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  for (const item of items) {
    if (typeof item !== "string") continue;
    if (item.trim() === "") continue;
    out.push(item);
  }
  return out;
}

function clampTimeoutMs(raw: unknown, fallback: number): number {
  const value = Number(raw);
  const base = Number.isFinite(value) ? value : fallback;
  return Math.max(1000, Math.min(10000, Math.round(base)));
}

function parsePriority(raw: unknown, fallback = 9): number {
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function parsePositiveInt(raw: unknown, fallback: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return fallback;
  return Math.round(value);
}

function hourPartsValid(range: string): boolean {
  if (!HOUR_RE.test(range)) return false;
  return range.split("-").every((part) => {
    const n = Number(part);
    return Number.isInteger(n) && n >= 0 && n <= 23;
  });
}

function dateRangeValid(range: string): boolean {
  if (!DATE_RE.test(range)) return false;
  const [start, end] = range.split("-");
  return [start, end].every((token) => {
    const [mm, dd] = (token ?? "").split("/").map(Number);
    return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31;
  });
}

function quietRangeValid(range: string): boolean {
  if (!QUIET_RE.test(range)) return false;
  return range.split("-").every((part) => {
    const n = Number(part);
    return Number.isInteger(n) && n >= 0 && n <= 23;
  });
}

function parseTipGroups(raw: unknown): TipGroup[] {
  if (!Array.isArray(raw)) return [];
  const groups: TipGroup[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const text = asTextList(row.text);
    if (text.length === 0) continue;
    const group: TipGroup = {
      priority: parsePriority(row.priority),
      timeoutMs: clampTimeoutMs(row.timeoutMs, 4000),
      text,
    };
    if (typeof row.override === "boolean") group.override = row.override;
    groups.push(group);
  }
  return groups;
}

function parseIdle(raw: unknown): IdleConfig {
  const data = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const text = asTextList(data.text);
  return {
    text: text.length > 0 ? text : [...DEFAULT_TIPS.idle.text],
    firstIdleSec: parsePositiveInt(data.firstIdleSec, IDLE_DEFAULTS.firstIdleSec),
    repeatEverySec: parsePositiveInt(data.repeatEverySec, IDLE_DEFAULTS.repeatEverySec),
    timeoutMs: clampTimeoutMs(data.timeoutMs, IDLE_DEFAULTS.timeoutMs),
    priority: parsePriority(data.priority, IDLE_DEFAULTS.priority),
  };
}

function parseTimeSlots(raw: unknown): ParseTipsResult | { hour: string; text: string[] }[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return { ok: false, error: "time must be an array" };
  const slots: { hour: string; text: string[] }[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, error: "time entries must be objects" };
    }
    const hour = String((item as { hour?: unknown }).hour ?? "");
    if (!hourPartsValid(hour)) return { ok: false, error: `invalid time hour: ${hour}` };
    slots.push({ hour, text: asTextList((item as { text?: unknown }).text) });
  }
  return slots;
}

function parseSeasons(raw: unknown): ParseTipsResult | { date: string; text: string[] }[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return { ok: false, error: "seasons must be an array" };
  const slots: { date: string; text: string[] }[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, error: "seasons entries must be objects" };
    }
    const date = String((item as { date?: unknown }).date ?? "");
    if (!dateRangeValid(date)) return { ok: false, error: `invalid seasons date: ${date}` };
    slots.push({ date, text: asTextList((item as { text?: unknown }).text) });
  }
  return slots;
}

/** 解析 + 校验；失败返回 { ok:false, error }，调用方保留上一次成功的表。 */
export function parseTips(raw: unknown): ParseTipsResult {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "tips must be a JSON object" };
  }
  const data = raw as Record<string, unknown>;
  if (data.schemaVersion !== 1) {
    return { ok: false, error: "unsupported schemaVersion" };
  }

  const time = parseTimeSlots(data.time);
  if (!Array.isArray(time)) return time;
  const seasons = parseSeasons(data.seasons);
  if (!Array.isArray(seasons)) return seasons;

  const quietRaw = data.quietHours;
  let quietHours: string[];
  if (quietRaw == null) {
    quietHours = [...DEFAULT_TIPS.quietHours];
  } else if (!Array.isArray(quietRaw)) {
    quietHours = [...DEFAULT_TIPS.quietHours];
  } else {
    quietHours = quietRaw.filter((item): item is string => typeof item === "string" && quietRangeValid(item));
  }

  const reactions = emptyReactions();
  if (data.reactions && typeof data.reactions === "object" && !Array.isArray(data.reactions)) {
    for (const [key, value] of Object.entries(data.reactions as Record<string, unknown>)) {
      if (!(REACTION_KEYS as readonly string[]).includes(key)) continue;
      reactions[key as ReactionKey] = parseTipGroups(value);
    }
  }

  return {
    ok: true,
    value: {
      schemaVersion: 1,
      quietHours,
      idle: parseIdle(data.idle),
      time,
      seasons,
      welcome: asTextList(data.welcome),
      reactions,
    },
  };
}
