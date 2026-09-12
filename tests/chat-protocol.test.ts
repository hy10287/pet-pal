import { describe, expect, it } from "vitest";
import {
  buildGrokBotRequest,
  parseGrokBotRequest,
  parseGrokBotResponse,
} from "../src/interaction/chat-protocol";
import { intentFromChatReply, defaultOnUserChat, canSendChat } from "../src/interaction/chat-stub";
import {
  CHAT_ERROR_NETWORK,
  CHAT_ERROR_TIMEOUT,
  requestGrokBot,
} from "../src/interaction/grokbot-client";

describe("parseGrokBotRequest", () => {
  it("requires non-empty text and keeps sessionId", () => {
    expect(parseGrokBotRequest({ text: "  你好  ", sessionId: "nori-1" })).toEqual({
      text: "你好",
      sessionId: "nori-1",
    });
    expect(parseGrokBotRequest({ text: "   " })).toBeNull();
    expect(parseGrokBotRequest({ text: 1 })).toBeNull();
    expect(parseGrokBotRequest(null)).toBeNull();
    expect(parseGrokBotRequest(["hi"])).toBeNull();
  });

  it("buildGrokBotRequest honors maxChars", () => {
    expect(buildGrokBotRequest("abcdef", "s", 3)).toEqual({ text: "abc", sessionId: "s" });
    expect(buildGrokBotRequest("   ", "s")).toBeNull();
  });
});

describe("parseGrokBotResponse", () => {
  it("accepts the documented optional fields", () => {
    expect(
      parseGrokBotResponse({
        say: "嗯！",
        emotion: "happy",
        intensity: 0.7,
        motionHint: "wave",
        variant: "grin",
        extra: "ignored",
      }),
    ).toEqual({
      say: "嗯！",
      emotion: "happy",
      intensity: 0.7,
      motionHint: "wave",
      variant: "grin",
    });
  });

  it("accepts an empty object and clamps intensity", () => {
    expect(parseGrokBotResponse({})).toEqual({});
    expect(parseGrokBotResponse({ intensity: 4 })).toEqual({ intensity: 1 });
    expect(parseGrokBotResponse({ intensity: "-1" })).toEqual({ intensity: 0 });
    expect(parseGrokBotResponse({ intensity: "0.4" })).toEqual({ intensity: 0.4 });
  });

  it("rejects non-objects", () => {
    expect(parseGrokBotResponse(null)).toBeNull();
    expect(parseGrokBotResponse("ok")).toBeNull();
    expect(parseGrokBotResponse([{ say: "x" }])).toBeNull();
  });
});

describe("intentFromChatReply", () => {
  it("maps emotion / intensity / motionHint onto the play path", () => {
    const intent = intentFromChatReply(
      { emotion: "happy", intensity: 0.8, motionHint: "wave" },
      "grokbot",
    );
    expect(intent.emotion).toBe("happy");
    expect(intent.variant).toBe("wave");
    expect(intent.intensity).toBe(0.8);
    expect(intent.contextTags).toEqual(["chat", "grokbot"]);
  });

  it("prefers variant over motionHint and fills defaults", () => {
    const intent = intentFromChatReply({ variant: "nod", motionHint: "wave" });
    expect(intent.variant).toBe("nod");
    expect(intent.emotion).toBe("acknowledge");
    expect(intent.contextTags).toContain("local-stub");
  });
});

describe("chat stub", () => {
  it("echoes text without touching the network", async () => {
    expect(canSendChat("  hi ")).toBe(true);
    expect(canSendChat("   ")).toBe(false);
    const reply = await defaultOnUserChat("  ping ");
    expect(reply.say).toBe("ping");
    expect(reply.emotion).toBe("acknowledge");
  });
});

describe("requestGrokBot", () => {
  const cfg = { grokBotUrl: "http://127.0.0.1:3937/nori-chat", timeoutMs: 50 };

  it("POSTs JSON and returns a validated reply", async () => {
    const fetchImpl = async (url: string, init?: RequestInit) => {
      expect(url).toBe(cfg.grokBotUrl);
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({ text: "你好", sessionId: "sess" });
      return {
        ok: true,
        json: async () => ({ say: "嗯", emotion: "acknowledge", intensity: 0.5, motionHint: "nod" }),
      } as Response;
    };
    const reply = await requestGrokBot(cfg, "你好", "sess", fetchImpl);
    expect(reply).toEqual({
      say: "嗯",
      emotion: "acknowledge",
      intensity: 0.5,
      motionHint: "nod",
    });
    expect(reply.error).toBeUndefined();
  });

  it("returns a short Chinese error on HTTP / parse failure and does not throw", async () => {
    await expect(
      requestGrokBot(cfg, "hi", undefined, async () => ({ ok: false, json: async () => ({}) }) as Response),
    ).resolves.toEqual({ say: CHAT_ERROR_NETWORK, error: true });

    await expect(
      requestGrokBot(cfg, "hi", undefined, async () => {
        throw Object.assign(new Error("aborted"), { name: "AbortError" });
      }),
    ).resolves.toEqual({ say: CHAT_ERROR_TIMEOUT, error: true });

    await expect(
      requestGrokBot(cfg, "hi", undefined, async () => ({
        ok: true,
        json: async () => "not-an-object",
      }) as Response),
    ).resolves.toEqual({ say: CHAT_ERROR_NETWORK, error: true });
  });
});
