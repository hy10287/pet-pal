import { describe, expect, it } from "vitest";
import { DEFAULT_FULL_WINDOW } from "../src/shared/display-preset";
import { faceSafeRect, petPopupLayout, placePopupAwayFromFace, rectsOverlap } from "../src/shared/ui-chrome";

describe("petPopupLayout", () => {
  it("keeps the stage crop when the menu is closed — no persistent rail", () => {
    for (const id of ["compact", "balanced", "standard", "full"] as const) {
      const layout = petPopupLayout(DEFAULT_FULL_WINDOW, id, false);
      expect(layout.window).toEqual({
        width: 420,
        height: layout.stage.height,
      });
      expect(layout.popup).toBeNull();
    }
  });

  it("overlays the right-click popup inside the crop so the window can sit on screen edges", () => {
    for (const id of ["compact", "balanced", "standard", "full"] as const) {
      const layout = petPopupLayout(DEFAULT_FULL_WINDOW, id, true);
      expect(layout.window.width).toBe(420);
      expect(layout.window.height).toBe(layout.stage.height);
      expect(layout.popup).not.toBeNull();
      const popup = layout.popup!;
      expect(popup.x).toBeGreaterThanOrEqual(0);
      expect(popup.y).toBeGreaterThanOrEqual(0);
      expect(popup.x + popup.width).toBeLessThanOrEqual(layout.window.width);
      expect(popup.y + popup.height).toBeLessThanOrEqual(layout.window.height);
    }
  });
});

describe("placePopupAwayFromFace", () => {
  it("prefers the strip to the right of the face when the viewport is wide enough", () => {
    const face = faceSafeRect({ width: 420, height: 246 });
    const pos = placePopupAwayFromFace(face, { width: 232, height: 200 }, { width: 660, height: 246 });
    expect(pos.x).toBeGreaterThanOrEqual(face.x + face.width);
    expect(rectsOverlap({ ...pos, width: 232, height: 200 }, face)).toBe(false);
  });

  it("places the core face in the upper center of the stage", () => {
    const face = faceSafeRect({ width: 420, height: 246 });
    expect(face.x).toBeGreaterThan(40);
    expect(face.x + face.width).toBeLessThan(380);
    expect(face.y).toBe(0);
  });
});
