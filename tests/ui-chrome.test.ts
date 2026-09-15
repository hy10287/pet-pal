import { describe, expect, it } from "vitest";
import { DEFAULT_FULL_WINDOW, SETTINGS_POPUP_WIDTH } from "../src/shared/display-preset";
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

  it("parks the right-click popup beside the face, not over it", () => {
    const layout = petPopupLayout(DEFAULT_FULL_WINDOW, "balanced", true);
    expect(layout.stage).toEqual({ x: 0, y: 0, width: 420, height: 246 });
    expect(layout.window.width).toBe(420 + SETTINGS_POPUP_WIDTH);
    expect(layout.window.height).toBe(246);
    expect(layout.popup).not.toBeNull();
    expect(layout.popup && rectsOverlap(layout.popup, layout.face)).toBe(false);
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
