import type { EmotionIntent } from "../shared/types";

/**
 * Local chat stub — extension point for a future Grok Bot / nori-api.
 *
 * Swap the handler with `setChatHandler` (or replace `defaultOnUserChat`)
 * without rewriting the bubble UI. The contract is:
 *
 *   onUserChat(text) => Promise<{ say?, emotion?, intensity?, motionHint? }>
 *
 * This file must stay offline: no fetch, no LLM, no network API.
 */

export interface ChatReply {
  say?: string;
  emotion?: string;
  intensity?: number;
  motionHint?: string;
}

export type OnUserChat = (text: string) => Promise<ChatReply>;

export interface ChatTurn {
  role: "user" | "pet";
  text: string;
}

export async function defaultOnUserChat(text: string): Promise<ChatReply> {
  const say = text.trim();
  return {
    say,
    emotion: "acknowledge",
    intensity: 0.55,
    motionHint: "nod",
  };
}

let handler: OnUserChat = defaultOnUserChat;

export function setChatHandler(next: OnUserChat | null): void {
  handler = next ?? defaultOnUserChat;
}

export function getChatHandler(): OnUserChat {
  return handler;
}

export async function onUserChat(text: string): Promise<ChatReply> {
  return handler(text);
}

export function intentFromChatReply(reply: ChatReply): EmotionIntent {
  const intensity = Number(reply.intensity);
  return {
    emotion: reply.emotion?.trim() || "acknowledge",
    variant: reply.motionHint?.trim() || "nod",
    intensity: Number.isFinite(intensity) ? Math.max(0, Math.min(1, intensity)) : 0.55,
    contextTags: ["chat", "local-stub"],
    styleHint: "quiet",
  };
}

export function appendHistory(history: ChatTurn[], userText: string, reply: ChatReply): ChatTurn[] {
  const next: ChatTurn[] = [...history, { role: "user", text: userText }];
  if (reply.say?.trim()) {
    next.push({ role: "pet", text: reply.say.trim() });
  }
  return next.slice(-16);
}

export function canSendChat(text: string): boolean {
  return text.trim().length > 0;
}
