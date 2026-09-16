import { describe, expect, it } from "vitest";
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
