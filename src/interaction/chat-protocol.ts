/**
 * Nori ↔ Grok Bot / New Bot JSON contract.
 *
 * POST { grokBotUrl }
 *   { "text": string, "sessionId"?: string }
 *
 * Response
 *   { "say"?: string, "emotion"?: string, "intensity"?: number,
 *     "motionHint"?: string, "variant"?: string }
 */

export interface GrokBotRequest {
  text: string;
  sessionId?: string;
}

export interface GrokBotResponse {
  say?: string;
  emotion?: string;
  intensity?: number;
  motionHint?: string;
  variant?: string;
}

const TEXT_MAX = 2000;
const OPTIONAL_MAX = 2000;
const ID_MAX = 128;

function asOptionalString(raw: unknown, max: number): string | undefined {
  if (typeof raw !== "string") return undefined;
  const value = raw.trim();
  if (!value) return undefined;
  return value.length > max ? value.slice(0, max) : value;
}

function asIntensity(raw: unknown): number | undefined {
  let value: number | null = null;
  if (typeof raw === "number" && Number.isFinite(raw)) value = raw;
  else if (typeof raw === "string" && raw.trim() !== "" && Number.isFinite(Number(raw))) {
    value = Number(raw);
  }
  if (value == null) return undefined;
  return Math.max(0, Math.min(1, value));
}

export function parseGrokBotRequest(raw: unknown): GrokBotRequest | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;
  if (typeof data.text !== "string") return null;
  const text = data.text.trim();
  if (!text) return null;
  const request: GrokBotRequest = { text: text.length > TEXT_MAX ? text.slice(0, TEXT_MAX) : text };
  const sessionId = asOptionalString(data.sessionId, ID_MAX);
  if (sessionId) request.sessionId = sessionId;
  return request;
}

export function parseGrokBotResponse(raw: unknown): GrokBotResponse | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;
  const response: GrokBotResponse = {};
  const say = asOptionalString(data.say, OPTIONAL_MAX);
  const emotion = asOptionalString(data.emotion, 64);
  const motionHint = asOptionalString(data.motionHint, 128);
  const variant = asOptionalString(data.variant, 128);
  const intensity = asIntensity(data.intensity);
  if (say) response.say = say;
  if (emotion) response.emotion = emotion;
  if (motionHint) response.motionHint = motionHint;
  if (variant) response.variant = variant;
  if (intensity != null) response.intensity = intensity;
  return response;
}

export function buildGrokBotRequest(text: string, sessionId?: string, maxChars?: number): GrokBotRequest | null {
  const clipped = maxChars != null && maxChars > 0 ? text.slice(0, maxChars) : text;
  return parseGrokBotRequest({ text: clipped, sessionId });
}
