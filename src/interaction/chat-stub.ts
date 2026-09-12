import type { ChatProvider, EmotionIntent } from "../shared/types";

/**
 * Local chat stub — no network. Swap the handler with `setChatHandler`
 * (Grok Bot HTTP lives in grokbot-client.ts). The contract is:
 *
 *   onUserChat(text, onPartial?) => Promise<{ say?, emotion?, intensity?, motionHint?, variant? }>
 *   Grok Bot may call onPartial with a pending placeholder, then resolve the final reply.
 *
 * This file must stay offline: no fetch, no LLM, no network API.
 */

export interface ChatReply {
  id?: string;
  pending?: boolean;
  say?: string;
  emotion?: string;
  intensity?: number;
  motionHint?: string;
  variant?: string;
  /** Local flag: timeout/network — show say, do not play motion. */
  error?: boolean;
}

export type ChatPartialFn = (reply: ChatReply) => void;
export type OnUserChat = (text: string, onPartial?: ChatPartialFn) => Promise<ChatReply>;

export interface ChatTurn {
  role: "user" | "pet";
  text: string;
}

export async function defaultOnUserChat(text: string, _onPartial?: ChatPartialFn): Promise<ChatReply> {
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

export async function onUserChat(text: string, onPartial?: ChatPartialFn): Promise<ChatReply> {
  return handler(text, onPartial);
}

export const CHAT_PENDING_SAY = "……";

export function beginChatTurn(history: ChatTurn[], userText: string, pendingSay = CHAT_PENDING_SAY): ChatTurn[] {
  const started: ChatTurn[] = [
    ...history,
    { role: "user", text: userText },
    { role: "pet", text: pendingSay },
  ];
  return started.slice(-16);
}

/** Update the open pet bubble in place (or append if the user turn is last). */
export function replaceLastPetText(history: ChatTurn[], reply: ChatReply): ChatTurn[] {
  const next = history.map((turn) => ({ ...turn }));
  const last = next[next.length - 1];
  const say = reply.say?.trim();
  if (last?.role === "pet") {
    if (say) last.text = say;
    return next;
  }
  if (say) next.push({ role: "pet", text: say });
  return next.slice(-16);
}

export function intentFromChatReply(reply: ChatReply, provider: ChatProvider = "stub"): EmotionIntent {
  const intensity = Number(reply.intensity);
  return {
    emotion: reply.emotion?.trim() || "acknowledge",
    variant: reply.variant?.trim() || reply.motionHint?.trim() || "nod",
    intensity: Number.isFinite(intensity) ? Math.max(0, Math.min(1, intensity)) : 0.55,
    contextTags: ["chat", provider === "grokbot" ? "grokbot" : "local-stub"],
    styleHint: reply.motionHint?.trim() || "quiet",
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
