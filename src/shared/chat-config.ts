import type { ChatConfig, ChatProvider } from "./types";

export const DEFAULT_GROK_BOT_URL = "http://127.0.0.1:3937/nori-chat";
/** Poll grace for GET /nori-chat/result/:id — not the POST block time. */
export const DEFAULT_CHAT_TIMEOUT_MS = 180_000;
export const CHAT_TIMEOUT_MIN_MS = 1;
export const CHAT_TIMEOUT_MAX_MS = 300_000;
export const CHAT_MAX_CHARS_CAP = 2_000;

export const DEFAULT_CHAT_CONFIG: ChatConfig = {
  enabled: false,
  provider: "stub",
  grokBotUrl: DEFAULT_GROK_BOT_URL,
  timeoutMs: DEFAULT_CHAT_TIMEOUT_MS,
};

export function parseChatProvider(value: unknown): ChatProvider {
  return value === "grokbot" ? "grokbot" : "stub";
}

export function parseEnabledFlag(value: unknown): boolean {
  return value === true || value === "true" || value === 1;
}

export function parseGrokBotUrl(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_GROK_BOT_URL;
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return DEFAULT_GROK_BOT_URL;
  return trimmed;
}

export function parseChatTimeoutMs(value: unknown): number {
  if (value == null || value === "") return DEFAULT_CHAT_TIMEOUT_MS;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n < CHAT_TIMEOUT_MIN_MS) return DEFAULT_CHAT_TIMEOUT_MS;
  return Math.min(Math.floor(n), CHAT_TIMEOUT_MAX_MS);
}

export function parseOptionalMaxChars(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n < 1) return undefined;
  return Math.min(Math.floor(n), CHAT_MAX_CHARS_CAP);
}

export function parseChatConfig(raw: unknown): ChatConfig {
  const data = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const maxChars = parseOptionalMaxChars(data.maxChars);
  const hint = typeof data.systemPromptHint === "string" ? data.systemPromptHint.trim() : "";
  const config: ChatConfig = {
    enabled: parseEnabledFlag(data.enabled),
    provider: parseChatProvider(data.provider),
    grokBotUrl: parseGrokBotUrl(data.grokBotUrl),
    timeoutMs: parseChatTimeoutMs(data.timeoutMs),
  };
  if (hint) config.systemPromptHint = hint;
  if (maxChars != null) config.maxChars = maxChars;
  return config;
}

export function chatEnabledLabel(enabled: boolean): string {
  return enabled ? "对话：开" : "对话：关";
}

export function chatProviderLabel(provider: ChatProvider): string {
  return provider === "grokbot" ? "Grok Bot" : "本地 stub";
}

export function chatEmptyHint(provider: ChatProvider): string {
  return provider === "grokbot" ? "Grok Bot · 说点什么" : "本地 stub · 不会联网";
}
