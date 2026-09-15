import { describe, expect, it } from "vitest";
import { DEFAULT_FULL_WINDOW, SETTINGS_SIDEBAR_WIDTH } from "../src/shared/display-preset";
import { dockTabRect, faceSafeRect, petChromeLayout, rectsOverlap } from "../src/shared/ui-chrome";

describe("petChromeLayout", () => {
  it("keeps the stage crop and puts settings beside the face, not over it", () => {
    const layout = petChromeLayout(DEFAULT_FULL_WINDOW, "balanced", true);
    expect(layout.stage).toEqual({ x: 0, y: 0, width: 420, height: 246 });
    expect(layout.sidebar).toEqual({
      x: 420,
      y: 0,
      width: SETTINGS_SIDEBAR_WIDTH,
      height: 246,
    });
    expect(layout.window.width).toBe(420 + SETTINGS_SIDEBAR_WIDTH);
    expect(layout.window.height).toBe(246);
    expect(layout.sidebar && rectsOverlap(layout.sidebar, layout.face)).toBe(false);
  });

  it("does not cover the face with the dock tab", () => {
    for (const id of ["compact", "balanced", "standard", "full"] as const) {
      const layout = petChromeLayout(DEFAULT_FULL_WINDOW, id, false);
      expect(rectsOverlap(layout.dockTab, layout.face)).toBe(false);
      expect(layout.sidebar).toBeNull();
    }
  });
});

describe("faceSafeRect / dockTabRect", () => {
  it("places the core face in the upper center of the stage", () => {
    const face = faceSafeRect({ width: 420, height: 246 });
    expect(face.x).toBeGreaterThan(40);
    expect(face.x + face.width).toBeLessThan(380);
    expect(face.y).toBe(0);
    const tab = dockTabRect({ width: 420, height: 246 });
    expect(tab.x).toBe(420 - tab.width);
    expect(rectsOverlap(face, tab)).toBe(false);
  });
});
