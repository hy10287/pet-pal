import type { EmotionIntent } from "./types";

/** Loopback-only agent bridge. Never bind 0.0.0.0 / ::. */
export const AGENT_CONTROL_HOST = "127.0.0.1" as const;
export const DEFAULT_AGENT_CONTROL_PORT = 3927;
export const AGENT_CONTROL_BODY_LIMIT = 16 * 1024;

export interface AgentControlRequest {
  emotion: string;
  intensity: number;
  say?: string;
  motionHint?: string;
  variant?: string;
  source?: string;
}

export interface AgentIntentCommand extends AgentControlRequest {
  type: "intent";
  requestId: string;
}

export interface AgentPlayedSummary {
  emotion: string;
  intensity: number;
  variant?: string;
  faceId: string | null;
  bodyId: string | null;
  reason: string;
  source: string;
  sayDeferred?: boolean;
}

export interface AgentControlOk {
  ok: true;
  played?: AgentPlayedSummary;
}

export interface AgentControlErr {
  ok: false;
  error: string;
}

export type AgentControlResponse = AgentControlOk | AgentControlErr;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const EMOTION_MAX = 64;
const HINT_MAX = 128;
const SOURCE_MAX = 64;
const SAY_MAX = 2000;

function asOptionalString(raw: unknown, field: string, max: number): ParseResult<string | undefined> {
  if (raw == null) return { ok: true, value: undefined };
  if (typeof raw !== "string") return { ok: false, error: `${field} must be a string` };
  const value = raw.trim();
  if (!value) return { ok: true, value: undefined };
  if (value.length > max) return { ok: false, error: `${field} is too long` };
  return { ok: true, value };
}

function parseIntensity(raw: unknown): ParseResult<number> {
  let value: number | null = null;
  if (typeof raw === "number" && Number.isFinite(raw)) value = raw;
  else if (typeof raw === "string" && raw.trim() !== "" && Number.isFinite(Number(raw))) {
    value = Number(raw);
  }
  if (value == null) return { ok: false, error: "intensity must be a number between 0 and 1" };
  if (value < 0 || value > 1) return { ok: false, error: "intensity must be a number between 0 and 1" };
  return { ok: true, value };
}

export function parseAgentControlRequest(raw: unknown): ParseResult<AgentControlRequest> {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "body must be a JSON object" };
  }
  const data = raw as Record<string, unknown>;
  if (typeof data.emotion !== "string" || !data.emotion.trim()) {
    return { ok: false, error: "emotion must be a non-empty string" };
  }
  const emotion = data.emotion.trim();
  if (emotion.length > EMOTION_MAX) return { ok: false, error: "emotion is too long" };

  const intensity = parseIntensity(data.intensity);
  if (!intensity.ok) return intensity;

  const say = asOptionalString(data.say, "say", SAY_MAX);
  if (!say.ok) return say;
  const motionHint = asOptionalString(data.motionHint, "motionHint", HINT_MAX);
  if (!motionHint.ok) return motionHint;
  const variant = asOptionalString(data.variant, "variant", HINT_MAX);
  if (!variant.ok) return variant;
  const source = asOptionalString(data.source, "source", SOURCE_MAX);
  if (!source.ok) return source;

  const value: AgentControlRequest = {
    emotion,
    intensity: intensity.value,
  };
  if (say.value) value.say = say.value;
  if (motionHint.value) value.motionHint = motionHint.value;
  if (variant.value) value.variant = variant.value;
  if (source.value) value.source = source.value;
  return { ok: true, value };
}

/**
 * Port helper for tests and bind setup.
 * `0` is allowed (ephemeral listen) so unit tests do not fight a fixed port.
 */
export function parseControlPort(
  raw: unknown,
  fallback = DEFAULT_AGENT_CONTROL_PORT,
): ParseResult<number> {
  if (raw == null || raw === "") return { ok: true, value: fallback };
  const value = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isInteger(value) || value < 0 || value > 65535) {
    return { ok: false, error: `invalid control port: ${String(raw)}` };
  }
  return { ok: true, value };
}

export function resolveControlBind(
  input: { port?: unknown; host?: unknown; env?: NodeJS.ProcessEnv } = {},
): { host: typeof AGENT_CONTROL_HOST; port: number } {
  const env = input.env ?? {};
  const preferred =
    env.NORI_CONTROL_PORT != null && String(env.NORI_CONTROL_PORT).trim() !== ""
      ? env.NORI_CONTROL_PORT
      : input.port;
  const parsed = parseControlPort(preferred);
  return {
    host: AGENT_CONTROL_HOST,
    port: parsed.ok ? parsed.value : DEFAULT_AGENT_CONTROL_PORT,
  };
}

export function isAgentControlEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.NORI_CONTROL_DISABLED;
  if (raw == null || String(raw).trim() === "") return true;
  return !/^(1|true|yes|on)$/i.test(String(raw).trim());
}

export function isLoopbackRemoteAddress(address?: string | null): boolean {
  if (!address) return false;
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

/** 浏览器跨站攻击面（WebSocket 不受 CORS 约束），必须白名单。 */
export function isAllowedOrigin(origin?: string | string[]): boolean {
  const raw = Array.isArray(origin) ? origin[0] : origin;
  if (raw == null) return true;
  const value = String(raw).trim();
  if (value === "") return true;
  const lower = value.toLowerCase();
  if (lower === "null") return true;
  if (lower.startsWith("file://")) return true;
  try {
    const url = new URL(value);
    const proto = url.protocol.toLowerCase();
    const host = url.hostname.toLowerCase();
    if (proto !== "http:" && proto !== "https:") return false;
    return host === "127.0.0.1" || host === "localhost";
  } catch {
    return false;
  }
}

/** NORI_CONTROL_TOKEN 未设置或为空 => 恒 true；否则 header 或 query 之一严格相等才 true。 */
export function hasValidControlToken(
  headerValue: string | string[] | undefined,
  queryValue: string | null,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const expected = env.NORI_CONTROL_TOKEN;
  if (expected == null || String(expected) === "") return true;
  const header = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  return header === expected || queryValue === expected;
}

export function intentFromAgentRequest(req: AgentControlRequest): EmotionIntent {
  const variant = req.variant || req.motionHint;
  return {
    emotion: req.emotion,
    variant,
    intensity: req.intensity,
    contextTags: req.source ? ["agent", req.source] : ["agent"],
    styleHint: req.motionHint,
  };
}

export function summarizePlayed(
  pair: {
    intent: { emotion: string; intensity: number; variant?: string };
    face: { id: string } | null;
    body: { id: string } | null;
    reason: string;
    source: string;
  },
  say?: string,
): AgentPlayedSummary {
  const summary: AgentPlayedSummary = {
    emotion: pair.intent.emotion,
    intensity: pair.intent.intensity,
    faceId: pair.face?.id ?? null,
    bodyId: pair.body?.id ?? null,
    reason: pair.reason,
    source: pair.source,
  };
  if (pair.intent.variant) summary.variant = pair.intent.variant;
  if (say?.trim()) summary.sayDeferred = true;
  return summary;
}

export function isAgentIntentCommand(command: unknown): command is AgentIntentCommand {
  return Boolean(
    command &&
      typeof command === "object" &&
      !Array.isArray(command) &&
      (command as { type?: unknown }).type === "intent" &&
      typeof (command as { requestId?: unknown }).requestId === "string" &&
      typeof (command as { emotion?: unknown }).emotion === "string",
  );
}
