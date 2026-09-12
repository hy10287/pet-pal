import type { ChatConfig } from "../shared/types";
import { parseGrokBotRequest, parseGrokBotResponse } from "./chat-protocol";
import type { ChatReply } from "./chat-stub";

export const CHAT_ERROR_TIMEOUT = "对话超时，稍后再试。";
export const CHAT_ERROR_NETWORK = "对话暂时连不上，稍后再试。";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

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

/**
 * POST JSON to grokBotUrl. Never throws — timeout/network/parse failures
 * become a short Chinese `say` so the bubble can stay up.
 */
export async function requestGrokBot(
  config: Pick<ChatConfig, "grokBotUrl" | "timeoutMs" | "maxChars">,
  text: string,
  sessionId?: string,
  fetchImpl: FetchLike = fetch,
): Promise<ChatReply> {
  const body = parseGrokBotRequest({
    text: config.maxChars != null && config.maxChars > 0 ? text.slice(0, config.maxChars) : text,
    sessionId,
  });
  if (!body) return errorReply(CHAT_ERROR_NETWORK);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
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
    return parsed;
  } catch (error) {
    return errorReply(isAbortError(error) ? CHAT_ERROR_TIMEOUT : CHAT_ERROR_NETWORK);
  } finally {
    clearTimeout(timer);
  }
}

export function createGrokBotHandler(
  config: Pick<ChatConfig, "grokBotUrl" | "timeoutMs" | "maxChars">,
  sessionId?: string,
  fetchImpl?: FetchLike,
): (text: string) => Promise<ChatReply> {
  return (text) => requestGrokBot(config, text, sessionId, fetchImpl ?? fetch);
}
