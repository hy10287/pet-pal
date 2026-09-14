import {
  beginChatTurn,
  canSendChat,
  onUserChat,
  replaceLastPetText,
  type ChatReply,
  type ChatTurn,
} from "../interaction/chat-stub";
import { chatEmptyHint } from "../shared/chat-config";
import type { ChatProvider } from "../shared/types";

export interface ChatBubbleHooks {
  onOpen?: () => void;
  onClose?: () => void;
  onReply?: (text: string, reply: ChatReply) => void;
  getProvider?: () => ChatProvider;
  getMaxChars?: () => number | undefined;
}

export interface ChatBubbleController {
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
}

const OPEN_GRACE_MS = 320;

export function ensureChatRoot(existing?: HTMLElement | null): HTMLElement {
  if (existing) return existing;
  const found = document.getElementById("chat");
  if (found) return found;
  const created = document.createElement("div");
  created.id = "chat";
  created.hidden = true;
  document.body.appendChild(created);
  return created;
}

export function bindChatBubble(root: HTMLElement, hooks: ChatBubbleHooks = {}): ChatBubbleController {
  let open = false;
  let openedAt = 0;
  let history: ChatTurn[] = [];
  let sending = false;

  const hide = () => {
    if (!open) return;
    open = false;
    root.hidden = true;
    hooks.onClose?.();
  };

  const show = () => {
    open = true;
    openedAt = performance.now();
    root.hidden = false;
    render();
    hooks.onOpen?.();
    requestAnimationFrame(() => {
      const input = root.querySelector("input");
      input?.focus();
    });
  };

  const submit = async () => {
    const input = root.querySelector("input");
    const text = input?.value ?? "";
    if (!canSendChat(text) || sending) return;
    sending = true;
    const trimmed = text.trim();
    if (input) input.value = "";
    const grok = hooks.getProvider?.() === "grokbot";
    if (grok) {
      history = beginChatTurn(history, trimmed);
      render();
      hooks.onReply?.(trimmed, { say: "……", emotion: "shy", intensity: 0.35, pending: true });
    } else {
      history = [...history, { role: "user", text: trimmed }];
      render();
    }
    try {
      let pendingApplied = grok;
      const reply = await onUserChat(trimmed, (partial) => {
        history = replaceLastPetText(history, partial);
        render();
        if (partial.error) return;
        if (partial.pending) {
          if (!pendingApplied) {
            pendingApplied = true;
            hooks.onReply?.(trimmed, partial);
          }
          return;
        }
        hooks.onReply?.(trimmed, partial);
      });
      history = replaceLastPetText(history, reply);
      render();
      if (!reply.error) hooks.onReply?.(trimmed, reply);
      const next = root.querySelector("input");
      next?.focus();
    } catch {
      const reply: ChatReply = { say: "对话出错了，稍后再试。", error: true };
      history = replaceLastPetText(history, reply);
      render();
    } finally {
      sending = false;
    }
  };

  const render = () => {
    root.replaceChildren();
    root.classList.add("nori-chat");

    const log = document.createElement("div");
    log.className = "chat-log";
    const recent = history.slice(-4);
    if (!recent.length) {
      const empty = document.createElement("p");
      empty.className = "chat-empty";
      empty.textContent = chatEmptyHint(hooks.getProvider?.() ?? "stub");
      log.append(empty);
    } else {
      for (const turn of recent) {
        const line = document.createElement("p");
        line.className = turn.role === "user" ? "chat-user" : "chat-pet";
        line.textContent = turn.role === "user" ? `你：${turn.text}` : `Nori：${turn.text}`;
        log.append(line);
      }
    }

    const form = document.createElement("form");
    form.className = "chat-form";
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void submit();
    });

    const input = document.createElement("input");
    input.type = "text";
    const maxChars = hooks.getMaxChars?.();
    input.maxLength = maxChars != null && maxChars > 0 ? maxChars : 160;
    input.autocomplete = "off";
    input.placeholder = "跟 Nori 说点什么…";
    input.setAttribute("aria-label", "对话输入");
    input.addEventListener("pointerdown", (event) => event.stopPropagation());
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        hide();
      }
    });

    const hint = document.createElement("div");
    hint.className = "chat-hint";
    hint.textContent = "回车发送 · Esc 关闭";

    form.append(input, hint);
    root.append(log, form);
  };

  root.addEventListener("pointerdown", (event) => event.stopPropagation());

  window.addEventListener(
    "pointerdown",
    (event) => {
      if (!open) return;
      if (performance.now() - openedAt < OPEN_GRACE_MS) return;
      if (root.contains(event.target as Node)) return;
      hide();
    },
    true,
  );

  window.addEventListener("keydown", (event) => {
    if (!open) return;
    if (event.key === "Escape") hide();
  });

  return {
    open: show,
    close: hide,
    isOpen: () => open,
  };
}
