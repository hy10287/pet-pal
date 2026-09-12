import { describe, expect, it } from "vitest";
import {
  buildGrokBotRequest,
  grokBotResultUrl,
  parseGrokBotRequest,
  parseGrokBotResponse,
} from "../src/interaction/chat-protocol";
import {
  beginChatTurn,
  canSendChat,
  defaultOnUserChat,
  intentFromChatReply,
  replaceLastPetText,
} from "../src/interaction/chat-stub";
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

  it("keeps pending + id for the async poll", () => {
    expect(parseGrokBotResponse({ id: "abc", pending: true, say: "……" })).toEqual({
      id: "abc",
      pending: true,
      say: "……",
    });
    expect(parseGrokBotResponse({ id: "abc", pending: false })).toEqual({ id: "abc" });
    expect(grokBotResultUrl("http://127.0.0.1:3937/nori-chat/", "a b")).toBe(
      "http://127.0.0.1:3937/nori-chat/result/a%20b",
    );
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

  it("updates the same pet bubble in place", () => {
    const started = beginChatTurn([], "你好");
    expect(started).toEqual([
      { role: "user", text: "你好" },
      { role: "pet", text: "……" },
    ]);
    expect(replaceLastPetText(started, { say: "嗯！" })).toEqual([
      { role: "user", text: "你好" },
      { role: "pet", text: "嗯！" },
    ]);
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

  it("shows the POST placeholder then polls GET /result/:id", async () => {
    let posts = 0;
    let gets = 0;
    const fetchImpl = async (url: string, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "POST") {
        posts += 1;
        expect(url).toBe(cfg.grokBotUrl);
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: "turn-1", pending: true, say: "……", emotion: "shy", intensity: 0.35 }),
        } as Response;
      }
      expect(url).toBe("http://127.0.0.1:3937/nori-chat/result/turn-1");
      gets += 1;
      if (gets < 3) {
        return { ok: true, status: 200, json: async () => ({ id: "turn-1", pending: true }) } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ say: "嗯", emotion: "happy", intensity: 0.7, motionHint: "wave" }),
      } as Response;
    };
    const partials: Array<{ pending?: boolean; say?: string }> = [];
    const reply = await requestGrokBot(cfg, "你好", "sess", fetchImpl, {
      onPartial: (partial) => partials.push(partial),
      pollIntervalMs: 1,
    });
    expect(posts).toBe(1);
    expect(gets).toBe(3);
    expect(partials[0]).toMatchObject({ id: "turn-1", pending: true, say: "……", emotion: "shy" });
    expect(reply).toEqual({
      say: "嗯",
      emotion: "happy",
      intensity: 0.7,
      motionHint: "wave",
    });
  });

  it("fails once after poll grace if outbox never appears", async () => {
    const fetchImpl = async (_url: string, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: "late", pending: true, say: "……" }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ id: "late", pending: true }) } as Response;
    };
    const reply = await requestGrokBot({ ...cfg, timeoutMs: 25 }, "hi", undefined, fetchImpl, {
      pollIntervalMs: 5,
    });
    expect(reply).toEqual({ say: CHAT_ERROR_TIMEOUT, error: true });
  });
});
