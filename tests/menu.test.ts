import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { overlayViewport, shouldDismissMenu } from "../src/renderer/menu";

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

describe("overlayViewport", () => {
  it("uses the stage crop, not a larger browser window", () => {
    expect(
      overlayViewport({ clientWidth: 420, clientHeight: 246 }, { innerWidth: 1920, innerHeight: 1080 }),
    ).toEqual({ width: 420, height: 246 });
  });

  it("falls back to the window when the stage has no size yet", () => {
    expect(overlayViewport(null, { innerWidth: 420, innerHeight: 560 })).toEqual({ width: 420, height: 560 });
    expect(overlayViewport({ clientWidth: 0, clientHeight: 0 }, { innerWidth: 420, innerHeight: 560 })).toEqual({
      width: 420,
      height: 560,
    });
  });
});

describe("HUD toggle label", () => {
  it("refreshes the HUD button label without closing the panel", () => {
    const source = readFileSync(resolve(__dirname, "../src/renderer/menu.ts"), "utf8");
    expect(source).toContain("state.hudOn = next");
    expect(source).toContain('hudBtn.textContent = next ? "隐藏调试 HUD" : "显示调试 HUD"');
    const start = source.indexOf("const hudBtn = actionButton");
    const hudHandler = source.slice(start, source.indexOf("menu.append(", start));
    expect(hudHandler).toContain("const hudBtn");
    expect(hudHandler).not.toContain("hide()");
  });
});
