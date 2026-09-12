import { describe, expect, it } from "vitest";
import { chatEnabledLabel, chatProviderLabel } from "../src/shared/chat-config";
import { shouldDismissMenu } from "../src/renderer/menu";

describe("shouldDismissMenu", () => {
  it("does not dismiss clicks that belong to the menu", () => {
    expect(shouldDismissMenu(0, 1000, true)).toBe(false);
  });

  it("ignores the right-click that just opened the menu", () => {
    expect(shouldDismissMenu(1000, 1100, false, 280)).toBe(false);
  });

  it("dismisses a later click outside the menu", () => {
    expect(shouldDismissMenu(1000, 1400, false, 280)).toBe(true);
  });
});

describe("chat menu labels", () => {
  it("shows 对话 开/关 and Grok Bot / stub", () => {
    expect(chatEnabledLabel(false)).toBe("对话：关");
    expect(chatEnabledLabel(true)).toBe("对话：开");
    expect(chatProviderLabel("stub")).toBe("本地 stub");
    expect(chatProviderLabel("grokbot")).toBe("Grok Bot");
  });
});
