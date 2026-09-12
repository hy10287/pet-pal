import { describe, expect, it } from "vitest";
import { parseAppConfig } from "../src/main/config";
import {
  DEFAULT_CHAT_CONFIG,
  DEFAULT_CHAT_TIMEOUT_MS,
  DEFAULT_GROK_BOT_URL,
  chatEnabledLabel,
  chatEmptyHint,
  chatProviderLabel,
  parseChatConfig,
  parseChatProvider,
} from "../src/shared/chat-config";

describe("parseChatConfig", () => {
  it("fills defaults when chat is missing or junk", () => {
    expect(parseChatConfig(undefined)).toEqual(DEFAULT_CHAT_CONFIG);
    expect(parseChatConfig(null)).toEqual(DEFAULT_CHAT_CONFIG);
    expect(parseChatConfig("yes")).toEqual(DEFAULT_CHAT_CONFIG);
    expect(parseChatConfig([])).toEqual(DEFAULT_CHAT_CONFIG);
  });

  it("accepts the documented knobs", () => {
    expect(
      parseChatConfig({
        enabled: true,
        provider: "grokbot",
        grokBotUrl: "http://127.0.0.1:3937/nori-chat",
        timeoutMs: 8000,
        systemPromptHint: "keep it short",
        maxChars: 80,
      }),
    ).toEqual({
      enabled: true,
      provider: "grokbot",
      grokBotUrl: "http://127.0.0.1:3937/nori-chat",
      timeoutMs: 8000,
      systemPromptHint: "keep it short",
      maxChars: 80,
    });
  });

  it("rejects bad provider / url / timeout and keeps the rest", () => {
    const parsed = parseChatConfig({
      enabled: "true",
      provider: "openai",
      grokBotUrl: "ftp://evil",
      timeoutMs: -3,
    });
    expect(parsed.enabled).toBe(true);
    expect(parsed.provider).toBe("stub");
    expect(parsed.grokBotUrl).toBe(DEFAULT_GROK_BOT_URL);
    expect(parsed.timeoutMs).toBe(DEFAULT_CHAT_TIMEOUT_MS);
  });

  it("clamps timeout and maxChars", () => {
    expect(parseChatConfig({ timeoutMs: 999999 }).timeoutMs).toBe(120_000);
    expect(parseChatConfig({ timeoutMs: "12000" }).timeoutMs).toBe(12_000);
    expect(parseChatConfig({ maxChars: 0 }).maxChars).toBeUndefined();
    expect(parseChatConfig({ maxChars: 9000 }).maxChars).toBe(2000);
  });

  it("parseChatProvider only allows stub | grokbot", () => {
    expect(parseChatProvider("grokbot")).toBe("grokbot");
    expect(parseChatProvider("stub")).toBe("stub");
    expect(parseChatProvider("GrokBot")).toBe("stub");
  });
});

describe("parseAppConfig chat", () => {
  it("always yields a valid chat object", () => {
    const config = parseAppConfig({ scale: 1.2 });
    expect(config.chat).toEqual(DEFAULT_CHAT_CONFIG);
    expect(config.scale).toBe(1.2);
  });

  it("merges a partial chat block over defaults", () => {
    const config = parseAppConfig({
      chat: { enabled: true, provider: "grokbot" },
    });
    expect(config.chat.enabled).toBe(true);
    expect(config.chat.provider).toBe("grokbot");
    expect(config.chat.grokBotUrl).toBe(DEFAULT_GROK_BOT_URL);
    expect(config.chat.timeoutMs).toBe(DEFAULT_CHAT_TIMEOUT_MS);
  });
});

describe("chat menu copy", () => {
  it("uses the 开/关 and Grok Bot / stub labels", () => {
    expect(chatEnabledLabel(true)).toBe("对话：开");
    expect(chatEnabledLabel(false)).toBe("对话：关");
    expect(chatProviderLabel("grokbot")).toBe("Grok Bot");
    expect(chatProviderLabel("stub")).toBe("本地 stub");
    expect(chatEmptyHint("stub")).toContain("本地 stub");
    expect(chatEmptyHint("grokbot")).toContain("Grok Bot");
  });
});
