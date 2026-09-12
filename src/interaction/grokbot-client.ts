import type { ChatConfig } from "../shared/types";
import { grokBotResultUrl, parseGrokBotRequest, parseGrokBotResponse } from "./chat-protocol";
import type { GrokBotResponse } from "./chat-protocol";
import type { ChatPartialFn, ChatReply } from "./chat-stub";

export const CHAT_ERROR_TIMEOUT = "好像没等到回复，稍后再试。";
export const CHAT_ERROR_NETWORK = "对话暂时连不上，稍后再试。";
/** POST must return quickly; never use timeoutMs (poll grace) here. */
export const CHAT_POST_TIMEOUT_MS = 8_000;
export const CHAT_POLL_INTERVAL_MS = 500;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface RequestGrokBotOptions {
  onPartial?: ChatPartialFn;
  /** Override the short POST abort. Tests only. */
  postTimeoutMs?: number;
  pollIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

function isAbortError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "name" in error &&
      ((error as { name?: string }).name === "AbortError" ||
        (error as { name?: string }).name === "TimeoutError"),
  );
}

function errorReply(message: string): ChatReply {
  return { say: message, error: true };
}

function toReply(parsed: GrokBotResponse): ChatReply {
  const reply: ChatReply = {};
  if (parsed.id) reply.id = parsed.id;
  if (parsed.pending) reply.pending = true;
  if (parsed.say) reply.say = parsed.say;
  if (parsed.emotion) reply.emotion = parsed.emotion;
  if (parsed.intensity != null) reply.intensity = parsed.intensity;
  if (parsed.motionHint) reply.motionHint = parsed.motionHint;
  if (parsed.variant) reply.variant = parsed.variant;
  return reply;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * POST JSON to grokBotUrl (short timeout), then if `pending` + `id`,
 * poll GET `{url}/result/{id}` until a final payload or `timeoutMs` grace.
 * Never throws — timeout/network/parse failures become a short Chinese `say`.
 */
export async function requestGrokBot(
  config: Pick<ChatConfig, "grokBotUrl" | "timeoutMs" | "maxChars">,
  text: string,
  sessionId?: string,
  fetchImpl: FetchLike = fetch,
  options: RequestGrokBotOptions = {},
): Promise<ChatReply> {
  const body = parseGrokBotRequest({
    text: config.maxChars != null && config.maxChars > 0 ? text.slice(0, config.maxChars) : text,
    sessionId,
  });
  if (!body) return errorReply(CHAT_ERROR_NETWORK);

  const postTimeout = Math.max(1, options.postTimeoutMs ?? CHAT_POST_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), postTimeout);
  let first: ChatReply;
  try {
    const res = await fetchImpl(config.grokBotUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return errorReply(CHAT_ERROR_NETWORK);
    let raw: unknown;
    try {
      raw = await res.json();
    } catch {
      return errorReply(CHAT_ERROR_NETWORK);
    }
    const parsed = parseGrokBotResponse(raw);
    if (!parsed) return errorReply(CHAT_ERROR_NETWORK);
    first = toReply(parsed);
  } catch (error) {
    return errorReply(isAbortError(error) ? CHAT_ERROR_TIMEOUT : CHAT_ERROR_NETWORK);
  } finally {
    clearTimeout(timer);
  }

  if (!first.pending) return first;
  if (!first.id) return errorReply(CHAT_ERROR_NETWORK);

  options.onPartial?.(first);

  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? sleepMs;
  const deadline = now() + config.timeoutMs;
  const interval = Math.max(1, options.pollIntervalMs ?? CHAT_POLL_INTERVAL_MS);
  const resultUrl = grokBotResultUrl(config.grokBotUrl, first.id);

  while (now() < deadline) {
    try {
      const remaining = Math.max(1, deadline - now());
      const res = await fetchImpl(resultUrl, {
        method: "GET",
        signal: AbortSignal.timeout(Math.min(5_000, remaining)),
      });
      if (res.status === 204) {
        await sleep(interval);
        continue;
      }
      if (!res.ok) {
        await sleep(interval);
        continue;
      }
      let raw: unknown;
      try {
        raw = await res.json();
      } catch {
        await sleep(interval);
        continue;
      }
      const parsed = parseGrokBotResponse(raw);
      if (!parsed) {
        await sleep(interval);
        continue;
      }
      const reply = toReply(parsed);
      if (reply.pending) {
        await sleep(interval);
        continue;
      }
      return reply;
    } catch {
      await sleep(interval);
    }
  }

  return errorReply(CHAT_ERROR_TIMEOUT);
}

export function createGrokBotHandler(
  config: Pick<ChatConfig, "grokBotUrl" | "timeoutMs" | "maxChars">,
  sessionId?: string,
  fetchImpl?: FetchLike,
): (text: string, onPartial?: ChatPartialFn) => Promise<ChatReply> {
  return (text, onPartial) => requestGrokBot(config, text, sessionId, fetchImpl ?? fetch, { onPartial });
}
